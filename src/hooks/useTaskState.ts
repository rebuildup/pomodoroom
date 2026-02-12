/**
 * useTaskState - React hook for task state management.
 *
 * Provides task state transition operations with validation
 * and history tracking.
 */

import { useMemo, useState } from "react";
import type {
	TaskState,
	StateTransitionEntry as TaskStateTransitionEntry,
} from "../types/task-state";
import { createTaskStateMachine } from "../lib/StateMachine";

/**
 * Task state with metadata.
 */
export interface TaskStateWithMeta {
	currentState: TaskState;
	history: readonly TaskStateTransitionEntry[];
}

/**
 * Hook return value.
 */
export interface UseTaskStateReturn {
	state: TaskStateWithMeta;
	transition: (to: TaskState, operation?: string) => void;
	canTransition: (to: TaskState) => boolean;
	reset: () => void;
	// Derived convenience states
	isReady: boolean;
	isRunning: boolean;
	isPaused: boolean;
	isDone: boolean;
}

// Store machines in a module-level WeakMap to persist across renders
// without using refs during render
const machineStore = new WeakMap<object, ReturnType<typeof createTaskStateMachine>>();

/**
 * React hook for task state management.
 *
 * @example
 * ```tsx
 * const { state, transition, canTransition, isRunning } = useTaskState();
 *
 * const handleStart = () => {
 *   if (canTransition("RUNNING")) {
 *     transition("RUNNING", "start");
 *   }
 * };
 * ```
 */
export function useTaskState(initialState: TaskState = "READY"): UseTaskStateReturn {
	// Use a stable key for this hook instance
	const [stableKey] = useState(() => ({}));
	
	// Initialize machine in module store if not exists
	const [machine] = useState(() => {
		if (!machineStore.has(stableKey)) {
			machineStore.set(stableKey, createTaskStateMachine(initialState));
		}
		return machineStore.get(stableKey)!;
	});
	
	// Force re-render when state changes
	const [, setRenderVersion] = useState(0);

	// Read current state from machine
	const currentState = machine.currentState;
	const history = machine.history;

	// Note: Not using useCallback to let React Compiler optimize
	const transition = (to: TaskState, operation?: string) => {
		machine.transition(to, operation);
		setRenderVersion(v => v + 1);
	};

	// Note: Not using useCallback to let React Compiler optimize
	const canTransition = (to: TaskState): boolean => {
		return machine.canTransition(to);
	};

	// Note: Not using useCallback to let React Compiler optimize
	const reset = () => {
		machine.reset();
		setRenderVersion(v => v + 1);
	};

	// Memoize state object
	const state = useMemo(() => ({
		currentState,
		history,
	}), [currentState, history]);

	// Memoize derived boolean states
	const isReady = useMemo(() => currentState === "READY", [currentState]);
	const isRunning = useMemo(() => currentState === "RUNNING", [currentState]);
	const isPaused = useMemo(() => currentState === "PAUSED", [currentState]);
	const isDone = useMemo(() => currentState === "DONE", [currentState]);

	return {
		state,
		transition,
		canTransition,
		reset,
		isReady,
		isRunning,
		isPaused,
		isDone,
	};
}

/**
 * Hook for managing multiple task states by ID.
 *
 * @example
 * ```tsx
 * const { getState, transition, canTransition } = useTaskStateMap();
 *
 * transition("task-1", "RUNNING", "start");
 * const state = getState("task-1");
 * ```
 */
export function useTaskStateMap() {
	const [machines, setMachines] = useState<Record<string, TaskState>>(() => ({}));
	
	// Module-level store for multi-task machines
	const [machineMap] = useState(() => new Map<string, ReturnType<typeof createTaskStateMachine>>());

	// Note: Not using useCallback to let React Compiler optimize
	const getMachine = (taskId: string) => {
		if (!machineMap.has(taskId)) {
			machineMap.set(taskId, createTaskStateMachine());
		}
		return machineMap.get(taskId)!;
	};

	// Note: Not using useCallback to let React Compiler optimize
	const getState = (taskId: string): TaskState | null => {
		const machine = machineMap.get(taskId);
		if (!machine) return null;
		return machine.currentState;
	};

	// Note: Not using useCallback to let React Compiler optimize
	const transition = (taskId: string, to: TaskState, operation?: string) => {
		const machine = getMachine(taskId);
		machine.transition(to, operation);
		setMachines((prev) => ({
			...prev,
			[taskId]: machine.currentState,
		}));
	};

	// Note: Not using useCallback to let React Compiler optimize
	const canTransition = (taskId: string, to: TaskState): boolean => {
		const machine = getMachine(taskId);
		return machine.canTransition(to);
	};

	// Note: Not using useCallback to let React Compiler optimize
	const reset = (taskId: string) => {
		const machine = machineMap.get(taskId);
		if (machine) {
			machine.reset();
			setMachines((prev) => {
				const next = { ...prev };
				delete next[taskId];
				return next;
			});
		}
	};

	return {
		getState,
		transition,
		canTransition,
		reset,
	};
}
