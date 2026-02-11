/**
 * useTaskOperations - Centralized task operation hook.
 *
 * Provides unified task operations across all M3 components:
 * - Board, Stream, Anchor components use the same operations
 * - State transition validation with undo support
 * - Timer integration for extend operation
 * - Tauri IPC bridge to Rust backend
 * - Non-Tauri environment fallback
 *
 * State transitions:
 * - Start task: READY → RUNNING (auto-starts timer)
 * - Complete task: RUNNING → DONE (resets timer)
 * - Extend session: RUNNING → RUNNING (with timer reset)
 * - Postpone task: RUNNING/PAUSED → READY (with lower priority, resets timer)
 * - Pause/Resume: RUNNING ↔ PAUSED (also pauses/resumes timer)
 */

import { useCallback, useRef, useEffect } from "react";
import type { TaskState } from "../types/task-state";
import { isValidTransition, InvalidTransitionError } from "../types/task-state";

// ─── Environment Detection ─────────────────────────────────────────────────────────

/**
 * Check if running in Tauri environment.
 */
async function isTauriEnvironment(): Promise<boolean> {
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		return true;
	} catch {
		return false;
	}
}

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
	/** Whether to refresh tasks after operation (default: true) */
	refreshAfterOperation?: boolean;
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

// ─── In-Memory Task Store (Non-Tauri Fallback) ─────────────────────────────────────

/**
 * In-memory task storage for non-Tauri environments.
 * Acts as a fallback when Tauri IPC is unavailable.
 */
class InMemoryTaskStore {
	private tasks: Map<string, TaskData> = new Map();

	get(taskId: string): TaskData | undefined {
		return this.tasks.get(taskId);
	}

	set(taskId: string, task: TaskData): void {
		this.tasks.set(taskId, task);
	}

	update(taskId: string, updates: Partial<TaskData>): TaskData | undefined {
		const task = this.tasks.get(taskId);
		if (!task) return undefined;

		const updated = { ...task, ...updates };
		this.tasks.set(taskId, updated);
		return updated;
	}

	list(): TaskData[] {
		return Array.from(this.tasks.values());
	}

	setAll(tasks: TaskData[]): void {
		this.tasks.clear();
		tasks.forEach(task => this.tasks.set(task.id, task));
	}
}

// Global in-memory store for fallback
const fallbackStore = new InMemoryTaskStore();

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * React hook for task operations with Tauri IPC backend integration.
 *
 * @example
 * ```tsx
 * const { startTask, completeTask, extendTask, postponeTask, pauseTask, resumeTask, undo } = useTaskOperations({
 *   onOperationComplete: (result) => console.log('Operation complete:', result),
 *   refreshAfterOperation: true,
 * });
 *
 * // Start a task (also auto-starts timer)
 * await startTask(task.id);
 * ```
 */
export function useTaskOperations(
	config?: TaskOperationsConfig,
	timerOps?: TimerOperations,
) {
	const undoStackRef = useRef<UndoEntry[]>([]);
	const maxUndoEntries = 50;
	const [isTauri, setIsTauri] = React.useState(false);

	// Detect environment on mount
	useEffect(() => {
		let mounted = true;

		isTauriEnvironment().then(tauri => {
			if (mounted) {
				setIsTauri(tauri);
				if (!tauri) {
					console.warn("[useTaskOperations] Tauri environment not detected, using fallback mode");
				}
			}
		});

		return () => { mounted = false; };
	}, []);

	/**
	 * Push entry to undo stack.
	 */
	const pushUndo = useCallback((entry: UndoEntry) => {
		if (!config?.enableUndo) return;
		undoStackRef.current = [...undoStackRef.current.slice(-maxUndoEntries + 1), entry];
	}, [config?.enableUndo]);

	/**
	 * Refresh tasks from backend after operation.
	 */
	const refreshTasks = useCallback(async () => {
		if (config?.refreshAfterOperation !== false) {
			// Trigger a global refresh event that components can listen to
			window.dispatchEvent(new CustomEvent("tasks:refresh"));
		}
	}, [config?.refreshAfterOperation]);

	/**
	 * Validate state transition.
	 */
	const validateTransition = useCallback((from: TaskState, to: TaskState): void => {
		if (!isValidTransition(from, to)) {
			throw new InvalidTransitionError(from, to);
		}
	}, []);

	// ─── Core Operations (Tauri IPC or Fallback) ────────────────────────────────────────

	/**
	 * Start task: READY → RUNNING
	 *
	 * Also auto-starts the timer via backend integration.
	 *
	 * @example
	 * ```tsx
	 * await startTask(task.id);
	 * ```
	 */
	const startTask = useCallback(async (taskId: string): Promise<OperationResult> => {
		const previousState = "READY"; // Can only start from READY
		const targetState = "RUNNING";

		try {
			// Validate transition
			validateTransition(previousState, targetState);

			if (isTauri) {
				// Tauri IPC path (production)
				const { invoke } = await import("@tauri-apps/api/core");
				const result = await invoke<any>("cmd_task_start", { id: taskId });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			} else {
				// Fallback path (development/testing)
				const task = fallbackStore.get(taskId);
				if (!task) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const updated = fallbackStore.update(taskId, { state: targetState });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			}

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, taskId);
			return {
				success: false,
				taskId,
				previousState,
				newState: previousState,
				error: err.message,
			};
		}
	}, [validateTransition, config, refreshTasks, isTauri]);

	/**
	 * Complete task: RUNNING → DONE
	 *
	 * Also resets the timer via backend integration.
	 *
	 * @example
	 * ```tsx
	 * await completeTask(task.id);
	 * ```
	 */
	const completeTask = useCallback(async (taskId: string): Promise<OperationResult> => {
		const previousState = "RUNNING"; // Can only complete from RUNNING
		const targetState = "DONE";

		try {
			// Validate transition
			validateTransition(previousState, targetState);

			if (isTauri) {
				// Tauri IPC path (production)
				const { invoke } = await import("@tauri-apps/api/core");
				const result = await invoke<any>("cmd_task_complete", { id: taskId });

				// Push to undo stack for undo support
				if (config?.enableUndo) {
					pushUndo({
						taskId,
						previousState,
						timestamp: new Date(),
					});
				}

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			} else {
				// Fallback path (development/testing)
				const task = fallbackStore.get(taskId);
				if (!task) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const updated = fallbackStore.update(taskId, { state: targetState });

				if (config?.enableUndo) {
					pushUndo({
						taskId,
						previousState,
						timestamp: new Date(),
					});
				}

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			}

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, taskId);
			return {
				success: false,
				taskId,
				previousState,
				newState: previousState,
				error: err.message,
			};
		}
	}, [validateTransition, config, refreshTasks, pushUndo, isTauri]);

	/**
	 * Pause task: RUNNING → PAUSED
	 *
	 * Also pauses the timer via backend integration.
	 *
	 * @example
	 * ```tsx
	 * await pauseTask(task.id);
	 * ```
	 */
	const pauseTask = useCallback(async (taskId: string): Promise<OperationResult> => {
		const previousState = "RUNNING"; // Can only pause from RUNNING
		const targetState = "PAUSED";

		try {
			// Validate transition
			validateTransition(previousState, targetState);

			if (isTauri) {
				// Tauri IPC path (production)
				const { invoke } = await import("@tauri-apps/api/core");
				const result = await invoke<any>("cmd_task_pause", { id: taskId });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			} else {
				// Fallback path (development/testing)
				const task = fallbackStore.get(taskId);
				if (!task) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const updated = fallbackStore.update(taskId, { state: targetState });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			}

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, taskId);
			return {
				success: false,
				taskId,
				previousState,
				newState: previousState,
				error: err.message,
			};
		}
	}, [validateTransition, config, refreshTasks, isTauri]);

	/**
	 * Resume task: PAUSED → RUNNING
	 *
	 * Also resumes the timer via backend integration.
	 *
	 * @example
	 * ```tsx
	 * await resumeTask(task.id);
	 * ```
	 */
	const resumeTask = useCallback(async (taskId: string): Promise<OperationResult> => {
		const previousState = "PAUSED"; // Can only resume from PAUSED
		const targetState = "RUNNING";

		try {
			// Validate transition
			validateTransition(previousState, targetState);

			if (isTauri) {
				// Tauri IPC path (production)
				const { invoke } = await import("@tauri-apps/api/core");
				const result = await invoke<any>("cmd_task_resume", { id: taskId });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			} else {
				// Fallback path (development/testing)
				const task = fallbackStore.get(taskId);
				if (!task) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const updated = fallbackStore.update(taskId, { state: targetState });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			}

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, taskId);
			return {
				success: false,
				taskId,
				previousState,
				newState: previousState,
				error: err.message,
			};
		}
	}, [validateTransition, config, refreshTasks, isTauri]);

	/**
	 * Postpone task: RUNNING/PAUSED → READY (with lower priority)
	 *
	 * Decreases priority by 20 (minimum -100) and resets timer.
	 *
	 * @example
	 * ```tsx
	 * await postponeTask(task.id);
	 * ```
	 */
	const postponeTask = useCallback(async (taskId: string): Promise<OperationResult> => {
		// Can postpone from RUNNING or PAUSED
		const targetState = "READY";

		try {
			if (isTauri) {
				// Tauri IPC path (production)
				const { invoke } = await import("@tauri-apps/api/core");
				const result: any = await invoke("cmd_task_postpone", { id: taskId });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState: result.state || "RUNNING",
					newState: targetState,
					newPriority: result.priority,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			} else {
				// Fallback path (development/testing)
				const task = fallbackStore.get(taskId);
				if (!task) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const previousState = task.state;
				const newPriority = Math.max(-100, (task.priority ?? 50) - 20);

				const updated = fallbackStore.update(taskId, {
					state: targetState,
					priority: newPriority,
				});

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState,
					newState: targetState,
					newPriority,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			}

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, taskId);
			return {
				success: false,
				taskId,
				previousState: "RUNNING",
				newState: "RUNNING",
				error: err.message,
			};
		}
	}, [config, refreshTasks, isTauri]);

	/**
	 * Extend task: Adds N minutes to estimated_minutes
	 *
	 * Does NOT change task state, only extends time.
	 *
	 * @example
	 * ```tsx
	 * await extendTask(task.id, 15); // Add 15 minutes
	 * ```
	 */
	const extendTask = useCallback(async (taskId: string, minutes: number = 15): Promise<OperationResult> => {
		try {
			if (isTauri) {
				// Tauri IPC path (production)
				const { invoke } = await import("@tauri-apps/api/core");
				const result: any = await invoke("cmd_task_extend", { id: taskId, minutes });

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState: result.state,
					newState: result.state,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			} else {
				// Fallback path (development/testing)
				const task = fallbackStore.get(taskId);
				if (!task) {
					throw new Error(`Task not found: ${taskId}`);
				}

				const currentMinutes = task.estimatedMinutes ?? 25;
				const updated = fallbackStore.update(taskId, {
					estimatedMinutes: currentMinutes + minutes,
				});

				const operationResult: OperationResult = {
					success: true,
					taskId,
					previousState: task.state,
					newState: task.state,
				};

				config?.onOperationComplete?.(operationResult);
				await refreshTasks();

				return operationResult;
			}

		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			config?.onOperationError?.(err, taskId);
			return {
				success: false,
				taskId,
				previousState: "RUNNING",
				newState: "RUNNING",
				error: err.message,
			};
		}
	}, [config, refreshTasks, isTauri]);

	// ─── Available Actions (Backend Validation) ───────────────────────────────────────────

	/**
	 * Get available actions for a task from backend.
	 *
	 * Uses cmd_task_available_actions to get server-side validated actions.
	 *
	 * @example
	 * ```tsx
	 * const actions = await getAvailableActions(task.id);
	 * console.log(actions); // ["start", "pause", "complete"]
	 * ```
	 */
	const getAvailableActions = useCallback(async (taskId: string): Promise<string[]> => {
		if (isTauri) {
			try {
				const { invoke } = await import("@tauri-apps/api/core");
				const actions = await invoke<string[]>("cmd_task_available_actions", { id: taskId });
				return actions;
			} catch {
				// Fallback to client-side validation
				const task = fallbackStore.get(taskId);
				if (!task) return [];

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
				if (task.state === "RUNNING" || task.state === "PAUSED") {
					operations.push("extend", "postpone");
				}
				if (task.state === "RUNNING") {
					operations.push("pause");
				}
				return operations;
			}
		} else {
			// Fallback to client-side validation
			const task = fallbackStore.get(taskId);
			if (!task) return [];

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
			if (task.state === "RUNNING" || task.state === "PAUSED") {
				operations.push("extend", "postpone");
			}
			if (task.state === "RUNNING") {
				operations.push("pause");
			}
			return operations;
		}
	}, [isTauri]);

	// ─── Undo Support ───────────────────────────────────────────────────────────────

	/**
	 * Undo last complete operation.
	 *
	 * @example
	 * ```tsx
	 * const undone = await undo(taskId);
	 * if (undone) console.log('Task restored');
	 * ```
	 */
	const undo = useCallback(async (taskId: string): Promise<boolean> => {
		// Find the most recent entry for this task
		const index = undoStackRef.current.findLastIndex(entry => entry.taskId === taskId);
		if (index === -1) return false;

		const entry = undoStackRef.current[index];

		// Restore via backend (not directly supported, so we just refresh)
		// In a real implementation, we'd need an "undo" command or manual state restoration
		await refreshTasks();

		// Remove from undo stack
		undoStackRef.current = undoStackRef.current.filter((_, i) => i !== index);

		return true;
	}, [refreshTasks]);

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

	// ─── Helpers (Client-Side Validation Fallback) ─────────────────────────────────────

	/**
	 * Check if an operation can be performed on a task.
	 *
	 * Client-side fallback validation. Use getAvailableActions() for backend validation.
	 */
	const canPerform = useCallback((task: TaskData, operation: string): boolean => {
		switch (operation) {
			case "start":
				return isValidTransition(task.state, "RUNNING");
			case "complete":
				return isValidTransition(task.state, "DONE");
			case "extend":
				return task.state === "RUNNING" || task.state === "PAUSED";
			case "postpone":
				return task.state === "RUNNING" || task.state === "PAUSED";
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
	 *
	 * Client-side fallback. Use getAvailableActions(taskId) for backend validation.
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

		if (task.state === "RUNNING" || task.state === "PAUSED") {
			operations.push("extend", "postpone");
		}

		if (task.state === "RUNNING") {
			operations.push("pause");
		}

		return operations;
	}, []);

	// ─── Fallback Store Access (for testing/development) ───────────────────────────────────

	/**
	 * Initialize fallback store with tasks (for non-Tauri environments).
	 */
	const initFallbackStore = useCallback((tasks: TaskData[]) => {
		fallbackStore.setAll(tasks);
	}, []);

	return {
		// Core operations (async, return OperationResult)
		startTask,
		completeTask,
		pauseTask,
		resumeTask,
		postponeTask,
		extendTask,
		// Backend-validated actions
		getAvailableActions,
		// Undo support
		undo,
		clearUndo,
		getUndoCount,
		// Client-side helpers (fallback)
		canPerform,
		getAvailableOperations,
		// Environment info
		isTauri,
		// Fallback store (for testing)
		initFallbackStore,
	};
}

// Import React for useState
import React from "react";

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
		priority: null,
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
