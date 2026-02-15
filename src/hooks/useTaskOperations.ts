/**
 * useTaskOperations - Centralized task operation hook.
 *
 * Provides unified task operations across all M3 components:
 * - Board, Stream, Anchor components use the same operations
 * - State transition validation with undo support
 * - Timer integration for extend operation
 * - Tauri IPC bridge to Rust backend
 * - Fallback mode for development/testing (deprecated)
 *
 * ## Fallback Mode Policy
 *
 * **DEPRECATED**: The in-memory fallback store is deprecated and will be removed in v2.0.
 *
 * ### Current Fallback Usage Conditions
 * 1. **Development mode** (not in Tauri environment)
 * 2. **Explicitly enabled** via `enableFallback: true` in config
 *
 * ### Migration Strategy
 * - Phase 1 (Current): Deprecate fallback, add warnings
 * - Phase 2: Make fallback opt-in (requires explicit enable)
 * - Phase 3: Remove fallback entirely, use mock backend for testing
 *
 * ### Recommended Testing Approach
 * Instead of relying on fallback:
 * - Use `@tauri-apps/plugin-mocks` for Tauri API mocking
 * - Create integration tests with test database
 * - Use backend test endpoints for state validation
 *
 * State transitions:
 * - Start task: READY → RUNNING (auto-starts timer)
 * - Complete task: RUNNING → DONE (resets timer)
 * - Extend session: RUNNING → RUNNING (with timer reset)
 * - Postpone task: RUNNING/PAUSED → READY (with lower priority, resets timer)
 * - Pause/Resume: RUNNING ↔ PAUSED (also pauses/resumes timer)
 */

import { useCallback, useRef, useEffect, useState } from "react";
import type { TaskState } from "../types/task-state";
import { isValidTransition, InvalidTransitionError } from "../types/task-state";

// ─── Environment Detection ─────────────────────────────────────────────────────────

/**
 * Check if running in Tauri environment.
 */
async function isTauriEnvironment(): Promise<boolean> {
	try {
		await import("@tauri-apps/api/core");
		return true;
	} catch {
		return false;
	}
}

/**
 * Internal helper to invoke Tauri commands.
 * Defined outside the hook to avoid dynamic import issues in React Compiler.
 */
async function invokeTauri<T>(command: string, args?: any): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return await invoke<T>(command, args);
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
	/**
	 * **DEPRECATED**: Enable in-memory fallback store for non-Tauri environments.
	 * @deprecated Use mock backend for testing instead. Will be removed in v2.0.
	 *
	 * When false (default): Operations will fail gracefully in non-Tauri environments.
	 * When true: Uses in-memory store for development/testing (not production-safe).
	 *
	 * Migration: Replace fallback with proper backend mocking or integration tests.
	 */
	enableFallback?: boolean;
	/**
	 * **DEPRECATED**: Suppress fallback deprecation warnings.
	 * @default false
	 *
	 * Set to true to acknowledge deprecation and suppress warnings during migration.
	 */
	suppressFallbackWarning?: boolean;
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

// ─── In-Memory Task Store (Non-Tauri Fallback - DEPRECATED) ────────────────────────────

/**
 * **DEPRECATED**: In-memory task storage for non-Tauri environments.
 *
 * @deprecated Will be removed in v2.0. Use mock backend for testing instead.
 *
 * This fallback exists for development convenience but should NOT be relied upon:
 * - Data is lost on refresh
 * - No persistence
 * - No backend validation
 * - Different behavior than production
 *
 * Migration path:
 * 1. Use `@tauri-apps/plugin-mocks` for Tauri API mocking in tests
 * 2. Create integration tests with test database
 * 3. Use backend test endpoints for state validation
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
		for (const task of tasks) {
			this.tasks.set(task.id, task);
		}
	}
}

// Global in-memory store for fallback
const fallbackStore = new InMemoryTaskStore();

// Warning state to avoid duplicate warnings
let hasShownFallbackWarning = false;

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
	_timerOps?: TimerOperations,
) {
	const undoStackRef = useRef<UndoEntry[]>([]);
	const maxUndoEntries = 50;
	const [isTauri, setIsTauri] = useState(false);
	const [useFallback, setUseFallback] = useState(false);

	// Detect environment on mount and show deprecation warning if needed
	useEffect(() => {
		let mounted = true;

		isTauriEnvironment().then(tauri => {
			if (mounted) {
				setIsTauri(tauri);

				// Determine if we should use fallback mode
				const shouldUseFallback = !tauri && config?.enableFallback !== false;
				setUseFallback(shouldUseFallback);

				// Show deprecation warning if using fallback and not suppressed
				if (shouldUseFallback && !config?.suppressFallbackWarning && !hasShownFallbackWarning) {
					console.warn(
						"[useTaskOperations] DEPRECATED: Using in-memory fallback store. " +
						"This mode will be removed in v2.0. " +
						"Use @tauri-apps/plugin-mocks for testing instead. " +
						"Set suppressFallbackWarning: true to hide this message during migration."
					);
					hasShownFallbackWarning = true;
				}

				// Show error if not in Tauri and fallback is disabled
				if (!tauri && config?.enableFallback === false) {
					console.error(
						"[useTaskOperations] Not in Tauri environment and fallback is disabled. " +
						"Operations will fail. Enable fallback or run in Tauri environment."
					);
				}
			}
		});

		return () => { mounted = false; };
	}, [config?.enableFallback, config?.suppressFallbackWarning]);

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
	 * Internal helper to handle operation errors and return a consistent result.
	 */
	const handleOperationError = useCallback((error: unknown, taskId: string, state: TaskState): OperationResult => {
		const err = error instanceof Error ? error : new Error(String(error));
		config?.onOperationError?.(err, taskId);
		return {
			success: false,
			taskId,
			previousState: state,
			newState: state,
			error: err.message,
		};
	}, [config]);

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

		// 1. Validate transition
		if (!isValidTransition(previousState, targetState)) {
			return handleOperationError(new InvalidTransitionError(previousState, targetState), taskId, previousState);
		}

		// 2. Execute operation
		let operationResult: OperationResult;

		if (isTauri) {
			try {
				// Tauri IPC path (production)
				await invokeTauri<any>("cmd_task_start", { id: taskId });
			} catch (error) {
				return handleOperationError(error, taskId, previousState);
			}

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else if (useFallback) {
			// Fallback path (development/testing) - DEPRECATED
			const task = fallbackStore.get(taskId);
			if (!task) {
				return handleOperationError(new Error(`Task not found: ${taskId}`), taskId, previousState);
			}

			fallbackStore.update(taskId, { state: targetState });

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else {
			// No valid path available
			return handleOperationError(
				new Error("Cannot start task: Not in Tauri environment and fallback is disabled"),
				taskId,
				previousState
			);
		}

		// Success logic moved out of try/catch to help React Compiler optimization
		config?.onOperationComplete?.(operationResult);
		await refreshTasks();

		return operationResult;
	}, [handleOperationError, config, refreshTasks, isTauri, useFallback]);

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

		// 1. Validate transition
		if (!isValidTransition(previousState, targetState)) {
			return handleOperationError(new InvalidTransitionError(previousState, targetState), taskId, previousState);
		}

		// 2. Execute operation
		let operationResult: OperationResult;

		if (isTauri) {
			try {
				// Tauri IPC path (production)
				await invokeTauri<any>("cmd_task_complete", { id: taskId });
			} catch (error) {
				return handleOperationError(error, taskId, previousState);
			}

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else if (useFallback) {
			// Fallback path (development/testing) - DEPRECATED
			const task = fallbackStore.get(taskId);
			if (!task) {
				return handleOperationError(new Error(`Task not found: ${taskId}`), taskId, previousState);
			}

			fallbackStore.update(taskId, { state: targetState });

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else {
			// No valid path available
			return handleOperationError(
				new Error("Cannot complete task: Not in Tauri environment and fallback is disabled"),
				taskId,
				previousState
			);
		}

		// Handle success side effects (undo, completion callback, refresh) outside of try/catch
		if (config?.enableUndo) {
			pushUndo({
				taskId,
				previousState,
				timestamp: new Date(),
			});
		}

		config?.onOperationComplete?.(operationResult);
		await refreshTasks();

		return operationResult;
	}, [handleOperationError, config, refreshTasks, pushUndo, isTauri, useFallback]);

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

		// 1. Validate transition
		if (!isValidTransition(previousState, targetState)) {
			return handleOperationError(new InvalidTransitionError(previousState, targetState), taskId, previousState);
		}

		// 2. Execute operation
		let operationResult: OperationResult;

		if (isTauri) {
			try {
				// Tauri IPC path (production)
				await invokeTauri<any>("cmd_task_pause", { id: taskId });
			} catch (error) {
				return handleOperationError(error, taskId, previousState);
			}

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else if (useFallback) {
			// Fallback path (development/testing) - DEPRECATED
			const task = fallbackStore.get(taskId);
			if (!task) {
				return handleOperationError(new Error(`Task not found: ${taskId}`), taskId, previousState);
			}

			fallbackStore.update(taskId, { state: targetState });

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else {
			// No valid path available
			return handleOperationError(
				new Error("Cannot pause task: Not in Tauri environment and fallback is disabled"),
				taskId,
				previousState
			);
		}

		config?.onOperationComplete?.(operationResult);
		await refreshTasks();

		return operationResult;
	}, [handleOperationError, config, refreshTasks, isTauri, useFallback]);

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

		// 1. Validate transition
		if (!isValidTransition(previousState, targetState)) {
			return handleOperationError(new InvalidTransitionError(previousState, targetState), taskId, previousState);
		}

		// 2. Execute operation
		let operationResult: OperationResult;

		if (isTauri) {
			try {
				// Tauri IPC path (production)
				await invokeTauri<any>("cmd_task_resume", { id: taskId });
			} catch (error) {
				return handleOperationError(error, taskId, previousState);
			}

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else if (useFallback) {
			// Fallback path (development/testing) - DEPRECATED
			const task = fallbackStore.get(taskId);
			if (!task) {
				return handleOperationError(new Error(`Task not found: ${taskId}`), taskId, previousState);
			}

			fallbackStore.update(taskId, { state: targetState });

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
			};
		} else {
			// No valid path available
			return handleOperationError(
				new Error("Cannot resume task: Not in Tauri environment and fallback is disabled"),
				taskId,
				previousState
			);
		}

		config?.onOperationComplete?.(operationResult);
		await refreshTasks();

		return operationResult;
	}, [handleOperationError, config, refreshTasks, isTauri, useFallback]);

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

		let operationResult: OperationResult;

		if (isTauri) {
			let result: any;
			try {
				// Tauri IPC path (production)
				result = await invokeTauri("cmd_task_postpone", { id: taskId });
			} catch (error) {
				return handleOperationError(error, taskId, "RUNNING");
			}

			operationResult = {
				success: true,
				taskId,
				previousState: result.state || "RUNNING",
				newState: targetState,
				newPriority: result.priority,
			};
		} else if (useFallback) {
			// Fallback path (development/testing) - DEPRECATED
			const task = fallbackStore.get(taskId);
			if (!task) {
				return handleOperationError(new Error(`Task not found: ${taskId}`), taskId, "RUNNING");
			}

			const previousState = task.state;
			const newPriority = Math.max(-100, (task.priority ?? 50) - 20);

			fallbackStore.update(taskId, {
				state: targetState,
				priority: newPriority,
			});

			operationResult = {
				success: true,
				taskId,
				previousState,
				newState: targetState,
				newPriority,
			};
		} else {
			// No valid path available
			return handleOperationError(
				new Error("Cannot postpone task: Not in Tauri environment and fallback is disabled"),
				taskId,
				"RUNNING"
			);
		}

		config?.onOperationComplete?.(operationResult);
		await refreshTasks();

		return operationResult;
	}, [handleOperationError, config, refreshTasks, isTauri, useFallback]);

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
		let operationResult: OperationResult;

		if (isTauri) {
			let result: any;
			try {
				// Tauri IPC path (production)
				result = await invokeTauri("cmd_task_extend", { id: taskId, minutes });
			} catch (error) {
				return handleOperationError(error, taskId, "RUNNING");
			}

			operationResult = {
				success: true,
				taskId,
				previousState: result.state,
				newState: result.state,
			};
		} else if (useFallback) {
			// Fallback path (development/testing) - DEPRECATED
			const task = fallbackStore.get(taskId);
			if (!task) {
				return handleOperationError(new Error(`Task not found: ${taskId}`), taskId, "RUNNING");
			}

			const currentMinutes = task.estimatedMinutes ?? 25;
			fallbackStore.update(taskId, {
				estimatedMinutes: currentMinutes + minutes,
			});

			operationResult = {
				success: true,
				taskId,
				previousState: task.state,
				newState: task.state,
			};
		} else {
			// No valid path available
			return handleOperationError(
				new Error("Cannot extend task: Not in Tauri environment and fallback is disabled"),
				taskId,
				"RUNNING"
			);
		}

		config?.onOperationComplete?.(operationResult);
		await refreshTasks();

		return operationResult;
	}, [handleOperationError, config, refreshTasks, isTauri, useFallback]);

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
				return await invokeTauri<string[]>("cmd_task_available_actions", { id: taskId });
			} catch (error) {
				console.warn("[useTaskOperations] Failed to get available actions from Tauri:", error);
			}
		}

		// Fallback to client-side validation (DEPRECATED)
		if (useFallback) {
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

		// No valid path available
		console.warn("[useTaskOperations] Cannot get available actions: Not in Tauri environment and fallback is disabled");
		return [];
	}, [isTauri, useFallback]);

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
		let index = -1;
		for (let i = undoStackRef.current.length - 1; i >= 0; i--) {
			const entry = undoStackRef.current[i];
			if (entry && entry.taskId === taskId) {
				index = i;
				break;
			}
		}

		if (index === -1) return false;

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
		// Client-side helpers (fallback - DEPRECATED)
		canPerform,
		getAvailableOperations,
		// Environment info
		isTauri,
		/** @deprecated True if using fallback mode. Will be removed in v2.0. */
		useFallback,
		// Fallback store (for testing - DEPRECATED)
		initFallbackStore,
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
