/**
 * useTaskState - React hook for task state management.
 *
 * Provides task state transition operations with validation
 * and history tracking.
 */

import { useCallback, useRef, useState } from "react";
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
	const machineRef = useRef(createTaskStateMachine());
	const [, forceUpdate] = useState({});

	// Initialize state if different from default
	if (initialState !== "READY" && machineRef.current.currentState === "READY") {
		machineRef.current = createTaskStateMachine();
		// Direct state set for initialization (bypass validation for initial state)
		(machineRef.current as { currentState: TaskState }).currentState = initialState;
	}

	const transition = useCallback((to: TaskState, operation?: string) => {
		machineRef.current.transition(to, operation);
		forceUpdate({});
	}, []);

	const canTransition = useCallback((to: TaskState): boolean => {
		return machineRef.current.canTransition(to);
	}, []);

	const reset = useCallback(() => {
		machineRef.current.reset();
		forceUpdate({});
	}, []);

	const currentState = machineRef.current.currentState;
	const history = machineRef.current.history;

	return {
		state: {
			currentState,
			history,
		},
		transition,
		canTransition,
		reset,
		isReady: currentState === "READY",
		isRunning: currentState === "RUNNING",
		isPaused: currentState === "PAUSED",
		isDone: currentState === "DONE",
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
	const machineRefs = useRef<Map<string, ReturnType<typeof createTaskStateMachine>>>(
		new Map(),
	);

	const getMachine = useCallback((taskId: string) => {
		if (!machineRefs.current.has(taskId)) {
			machineRefs.current.set(taskId, createTaskStateMachine());
		}
		return machineRefs.current.get(taskId)!;
	}, []);

	const getState = useCallback((taskId: string): TaskState | null => {
		return machines[taskId] ?? null;
	}, [machines]);

	const transition = useCallback((taskId: string, to: TaskState, operation?: string) => {
		const machine = getMachine(taskId);
		machine.transition(to, operation);
		setMachines((prev) => ({
			...prev,
			[taskId]: machine.currentState,
		}));
	}, [getMachine]);

	const canTransition = useCallback((taskId: string, to: TaskState): boolean => {
		const machine = machineRefs.current.get(taskId);
		if (!machine) return false;
		return machine.canTransition(to);
	}, []);

	const reset = useCallback((taskId: string) => {
		const machine = machineRefs.current.get(taskId);
		if (machine) {
			machine.reset();
			setMachines((prev) => {
				const next = { ...prev };
				delete next[taskId];
				return next;
			});
		}
	}, []);

	return {
		getState,
		transition,
		canTransition,
		reset,
	};
}
