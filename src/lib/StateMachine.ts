/**
 * StateMachine - Generic state transition machine with validation.
 *
 * Enforces valid state transitions and tracks history.
 */

import type { TaskState } from "../types/task-state";
import { isValidTransition, InvalidTransitionError } from "../types/task-state";

/**
 * State machine configuration.
 */
export interface StateMachineConfig<T extends string> {
	initialState: T;
	isValidTransition: (from: T, to: T) => boolean;
}

/**
 * Extended state transition entry with generic state type.
 */
export interface StateTransitionEntry<T extends string> {
	from: T;
	to: T;
	at: Date;
	operation: string;
}

/**
 * State machine instance.
 */
export interface StateMachine<T extends string> {
	readonly currentState: T;
	readonly history: readonly StateTransitionEntry<T>[];
	transition: (to: T, operation?: string) => StateMachine<T>;
	canTransition: (to: T) => boolean;
	reset: () => StateMachine<T>;
}

/**
 * Create a new state machine instance.
 *
 * @example
 * ```ts
 * const machine = createStateMachine<TaskState>({
 *   initialState: "READY",
 *   isValidTransition: (from, to) => isValidTransition(from, to),
 * });
 *
 * const started = machine.transition("RUNNING", "start");
 * console.log(started.currentState); // "RUNNING"
 * ```
 */
export function createStateMachine<T extends string>(
	config: StateMachineConfig<T>,
): StateMachine<T> {
	let state: T = config.initialState;
	let history: StateTransitionEntry<T>[] = [];

	return {
		get currentState(): T {
			return state;
		},

		get history(): readonly StateTransitionEntry<T>[] {
			return history;
		},

		transition(to: T, operation: string = "transition"): StateMachine<T> {
			if (!config.isValidTransition(state, to)) {
				throw new InvalidTransitionError(state as TaskState, to as TaskState);
			}

			const entry: StateTransitionEntry<T> = {
				from: state,
				to,
				at: new Date(),
				operation,
			};

			history = [...history, entry];
			state = to;

			return this;
		},

		canTransition(to: T): boolean {
			return config.isValidTransition(state, to);
		},

		reset(): StateMachine<T> {
			state = config.initialState;
			history = [];
			return this;
		},
	};
}

/**
 * Task-specific state machine factory.
 *
 * Pre-configured for task state transitions with TaskState type.
 *
 * @param initialState - Optional initial state (default: "READY")
 * @example
 * ```ts
 * const taskMachine = createTaskStateMachine();
 * taskMachine.transition("RUNNING", "start");
 * taskMachine.transition("PAUSED", "pause");
 * taskMachine.transition("RUNNING", "resume");
 * taskMachine.transition("DONE", "complete");
 * ```
 */
export function createTaskStateMachine(initialState: TaskState = "READY"): StateMachine<TaskState> {
	return createStateMachine<TaskState>({
		initialState,
		isValidTransition,
	});
}
