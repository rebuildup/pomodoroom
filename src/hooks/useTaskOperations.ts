/**
 * useTaskOperations - Centralized task operation hook.
 *
 * Provides unified task operations across all M3 components:
 * - Board, Stream, Anchor components use the same operations
 * - State transition validation with undo support
 * - Timer integration for extend operation
 *
 * State transitions:
 * - Start task: READY → RUNNING
 * - Complete task: RUNNING → DONE
 * - Extend session: RUNNING → RUNNING (with timer reset)
 * - Postpone task: READY → READY (with lower priority)
 * - Pause/Resume: RUNNING ↔ PAUSED
 */

import { useCallback, useRef } from "react";
import type { TaskState } from "../types/task-state";
import { isValidTransition, InvalidTransitionError } from "../types/task-state";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Task data required for operations.
 */
export interface TaskData {
	/** Unique task identifier */
	id: string;
	/** Current task state */
	state: TaskState;
	/** Task priority (0-100, null for default) */
	priority: number | null;
	/** Estimated duration in minutes */
	estimatedMinutes?: number;
}

/**
 * Operation result with undo support.
 */
export interface OperationResult {
	success: boolean;
	taskId: string;
	previousState: TaskState;
	previousPriority?: number;
	newState: TaskState;
	newPriority?: number;
	error?: string;
}

/**
 * Operation handler callback type.
 */
export type OperationHandler = (result: OperationResult) => void;

/**
 * Task operations configuration.
 */
export interface TaskOperationsConfig {
	/** Callback when operation succeeds */
	onOperationComplete?: OperationHandler;
	/** Callback when operation fails */
	onOperationError?: (error: Error, taskId: string) => void;
	/** Whether to enable undo for critical operations */
	enableUndo?: boolean;
}

/**
 * Timer operations for extend operation.
 */
export interface TimerOperations {
	/** Reset timer to initial duration */
	reset: () => Promise<void>;
	/** Check if timer is running */
	isRunning: () => boolean;
}

// ─── Undo Stack ───────────────────────────────────────────────────────────────

interface UndoEntry {
	taskId: string;
	previousState: TaskState;
	previousPriority?: number;
	timestamp: Date;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * React hook for task operations.
 *
 * @example
 * ```tsx
 * const { startTask, completeTask, extendTask, postponeTask, pauseTask, resumeTask, undo } = useTaskOperations({
 *   onOperationComplete: (result) => console.log('Operation complete:', result),
 * });
 *
 * // Start a task
 * startTask(task, (newState) => updateTaskState(task.id, newState));
 * ```
 */
export function useTaskOperations(
	config?: TaskOperationsConfig,
	timerOps?: TimerOperations,
) {
	const undoStackRef = useRef<UndoEntry[]>([]);
	const maxUndoEntries = 50;

	/**
	 * Push entry to undo stack.
	 */
	const pushUndo = useCallback((entry: UndoEntry) => {
		if (!config?.enableUndo) return;
		undoStackRef.current = [...undoStackRef.current.slice(-maxUndoEntries + 1), entry];
	}, [config?.enableUndo]);

	/**
	 * Validate state transition.
	 */
	const validateTransition = useCallback((from: TaskState, to: TaskState): void => {
		if (!isValidTransition(from, to)) {
			throw new InvalidTransitionError(from, to);
		}
	}, []);

	/**
	 * Common operation handler with validation and undo support.
	 */
	const executeOperation = useCallback((
		task: TaskData,
		targetState: TaskState,
		operationName: string,
		stateUpdater: (taskId: string, newState: TaskState) => void,
		priorityAdjustment?: number,
	): OperationResult => {
		const previousState = task.state;
		const previousPriority = task.priority;

		try {
			// Validate transition
			validateTransition(previousState, targetState);

			// Update state via callback
			stateUpdater(task.id, targetState);

			const result: OperationResult = {
				success: true,
				taskId: task.id,
				previousState,
				previousPriority,
				newState: targetState,
				newPriority: priorityAdjustment !== undefined
					? Math.max(0, Math.min(100, (previousPriority ?? 50) + priorityAdjustment))
					: previousPriority,
			};

			// Push to undo stack for critical operations
			if (config?.enableUndo && ["complete", "delete"].includes(operationName)) {
				pushUndo({
					taskId: task.id,
					previousState,
					previousPriority,
					timestamp: new Date(),
				});
			}

			config?.onOperationComplete?.(result);
			return result;

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, task.id);
			return {
				success: false,
				taskId: task.id,
				previousState,
				previousPriority,
				newState: previousState,
				error: err.message,
			};
		}
	}, [validateTransition, config, pushUndo]);

	// ─── Core Operations ────────────────────────────────────────────────────────

	/**
	 * Start task: READY → RUNNING
	 *
	 * @example
	 * ```tsx
	 * startTask(task, (id, state) => updateTask(id, state));
	 * ```
	 */
	const startTask = useCallback((
		task: TaskData,
		stateUpdater: (taskId: string, newState: TaskState) => void,
	): OperationResult => {
		return executeOperation(task, "RUNNING", "start", stateUpdater);
	}, [executeOperation]);

	/**
	 * Complete task: RUNNING → DONE
	 *
	 * Supports undo by default when enableUndo is true.
	 *
	 * @example
	 * ```tsx
	 * completeTask(task, (id, state) => updateTask(id, state));
	 * ```
	 */
	const completeTask = useCallback((
		task: TaskData,
		stateUpdater: (taskId: string, newState: TaskState) => void,
	): OperationResult => {
		return executeOperation(task, "DONE", "complete", stateUpdater);
	}, [executeOperation]);

	/**
	 * Extend session: RUNNING → RUNNING (with timer reset)
	 *
	 * Resets the timer to the initial duration without changing state.
	 *
	 * @example
	 * ```tsx
	 * extendTask(task, (id, state) => updateTask(id, state));
	 * ```
	 */
	const extendTask = useCallback(async (
		task: TaskData,
		stateUpdater: (taskId: string, newState: TaskState) => void,
	): Promise<OperationResult> => {
		// Extend keeps the same state but resets timer
		const result = executeOperation(task, "RUNNING", "extend", stateUpdater);

		// Reset timer if available
		if (result.success && timerOps?.reset) {
			try {
				await timerOps.reset();
			} catch (error) {
				console.error("[useTaskOperations] Timer reset failed:", error);
			}
		}

		return result;
	}, [executeOperation, timerOps]);

	/**
	 * Postpone task: READY → READY (with lower priority)
	 *
	 * Decreases priority by 20 (minimum 0).
	 *
	 * @example
	 * ```tsx
	 * postponeTask(task, (id, state, priority) => updateTaskWithPriority(id, state, priority));
	 * ```
	 */
	const postponeTask = useCallback((
		task: TaskData,
		stateUpdater: (taskId: string, newState: TaskState, newPriority: number) => void,
		priorityDecrease: number = 20,
	): OperationResult => {
		const previousState = task.state;
		const previousPriority = task.priority ?? 50;

		try {
			// Validate transition (READY → READY is valid)
			validateTransition(previousState, "READY");

			// Calculate new priority
			const newPriority = Math.max(0, previousPriority - priorityDecrease);

			// Update state and priority
			stateUpdater(task.id, "READY", newPriority);

			const result: OperationResult = {
				success: true,
				taskId: task.id,
				previousState,
				previousPriority,
				newState: "READY",
				newPriority,
			};

			config?.onOperationComplete?.(result);
			return result;

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, task.id);
			return {
				success: false,
				taskId: task.id,
				previousState,
				previousPriority,
				newState: previousState,
				newPriority: previousPriority,
				error: err.message,
			};
		}
	}, [validateTransition, config]);

	/**
	 * Pause task: RUNNING → PAUSED
	 *
	 * @example
	 * ```tsx
	 * pauseTask(task, (id, state) => updateTask(id, state));
	 * ```
	 */
	const pauseTask = useCallback((
		task: TaskData,
		stateUpdater: (taskId: string, newState: TaskState) => void,
	): OperationResult => {
		return executeOperation(task, "PAUSED", "pause", stateUpdater);
	}, [executeOperation]);

	/**
	 * Resume task: PAUSED → RUNNING
	 *
	 * @example
	 * ```tsx
	 * resumeTask(task, (id, state) => updateTask(id, state));
	 * ```
	 */
	const resumeTask = useCallback((
		task: TaskData,
		stateUpdater: (taskId: string, newState: TaskState) => void,
	): OperationResult => {
		return executeOperation(task, "RUNNING", "resume", stateUpdater);
	}, [executeOperation]);

	/**
	 * Undo last operation.
	 *
	 * Only works for operations pushed to undo stack (complete, delete).
	 *
	 * @example
	 * ```tsx
	 * const undone = undo(taskId, (id, state) => updateTask(id, state));
	 * if (undone) console.log('Task restored');
	 * ```
	 */
	const undo = useCallback((
		taskId: string,
		stateUpdater: (taskId: string, newState: TaskState) => void,
		priorityUpdater?: (taskId: string, newPriority: number) => void,
	): boolean => {
		// Find the most recent entry for this task
		const index = undoStackRef.current.findLastIndex(entry => entry.taskId === taskId);
		if (index === -1) return false;

		const entry = undoStackRef.current[index];

		// Restore state
		stateUpdater(taskId, entry.previousState);
		if (priorityUpdater && entry.previousPriority !== undefined) {
			priorityUpdater(taskId, entry.previousPriority);
		}

		// Remove from undo stack
		undoStackRef.current = undoStackRef.current.filter((_, i) => i !== index);

		return true;
	}, []);

	/**
	 * Clear all undo history.
	 */
	const clearUndo = useCallback(() => {
		undoStackRef.current = [];
	}, []);

	/**
	 * Get undo stack size for a specific task.
	 */
	const getUndoCount = useCallback((taskId: string): number => {
		return undoStackRef.current.filter(entry => entry.taskId === taskId).length;
	}, []);

	/**
	 * Check if an operation can be performed on a task.
	 */
	const canPerform = useCallback((task: TaskData, operation: string): boolean => {
		switch (operation) {
			case "start":
				return isValidTransition(task.state, "RUNNING");
			case "complete":
				return isValidTransition(task.state, "DONE");
			case "extend":
				return task.state === "RUNNING";
			case "postpone":
				return task.state === "READY";
			case "pause":
				return isValidTransition(task.state, "PAUSED");
			case "resume":
				return isValidTransition(task.state, "RUNNING");
			default:
				return false;
		}
	}, []);

	/**
	 * Get available operations for a task based on its current state.
	 */
	const getAvailableOperations = useCallback((task: TaskData): string[] => {
		const operations: string[] = [];

		if (isValidTransition(task.state, "RUNNING")) {
			if (task.state === "READY") {
				operations.push("start");
			} else if (task.state === "PAUSED") {
				operations.push("resume");
			}
		}

		if (isValidTransition(task.state, "DONE")) {
			operations.push("complete");
		}

		if (task.state === "RUNNING") {
			operations.push("extend", "pause");
		}

		if (task.state === "READY") {
			operations.push("postpone");
		}

		return operations;
	}, []);

	return {
		// Core operations
		startTask,
		completeTask,
		extendTask,
		postponeTask,
		pauseTask,
		resumeTask,
		// Undo support
		undo,
		clearUndo,
		getUndoCount,
		// Helpers
		canPerform,
		getAvailableOperations,
	};
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Create a mock TaskData object for testing.
 */
export function createMockTaskData(
	override?: Partial<TaskData>,
): TaskData {
	return {
		id: `task-${Date.now()}`,
		state: "READY",
		priority: null, // Default priority (will be treated as 50)
		estimatedMinutes: 25,
		...override,
	};
}

/**
 * Check if two TaskData objects represent the same task.
 */
export function isSameTask(a: TaskData, b: TaskData): boolean {
	return a.id === b.id;
}

/**
 * Sort tasks by priority (descending) and state (READY first).
 */
export function sortTasksByPriority<T extends TaskData>(tasks: T[]): T[] {
	return [...tasks].sort((a, b) => {
		// State order: READY > RUNNING > PAUSED > DONE
		const stateOrder = { READY: 0, RUNNING: 1, PAUSED: 2, DONE: 3 };
		const stateDiff = stateOrder[a.state] - stateOrder[b.state];
		if (stateDiff !== 0) return stateDiff;

		// Priority descending
		const priorityDiff = (b.priority ?? 50) - (a.priority ?? 50);
		return priorityDiff;
	});
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default priority decrease for postpone operation.
 */
export const DEFAULT_POSTPONE_DECREASE = 20;

/**
 * Minimum priority value.
 */
export const MIN_PRIORITY = 0;

/**
 * Maximum priority value.
 */
export const MAX_PRIORITY = 100;

/**
 * Default task priority.
 */
export const DEFAULT_PRIORITY = 50;

/**
 * Default estimated duration in minutes.
 */
export const DEFAULT_ESTIMATED_MINUTES = 25;
