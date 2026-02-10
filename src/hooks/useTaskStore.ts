/**
 * useTaskStore - Single source of truth for task data.
 *
 * Provides CRUD operations and Anchor/Ambient derivation.
 * Persists to localStorage via useLocalStorage.
 * State transitions are delegated to useTaskStateMap.
 */

import { useCallback, useMemo } from "react";
import { useTaskStateMap } from "./useTaskState";
import { useLocalStorage } from "./useLocalStorage";
import type { Task } from "../types/task";
import type { TaskState } from "../types/task-state";

const STORAGE_KEY = "pomodoroom-tasks";

/**
 * useTaskStore return value.
 */
export interface UseTaskStoreReturn {
	// CRUD operations
	tasks: Task[];
	createTask: (props: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
	updateTask: (id: string, updates: Partial<Task>) => void;
	deleteTask: (id: string) => void;
	getTask: (id: string) => Task | undefined;
	getAllTasks: () => Task[];
	getTasksByState: (state: TaskState) => Task[];

	// State transitions (from useTaskStateMap)
	getState: (taskId: string) => TaskState | null;
	transition: (taskId: string, to: TaskState, operation?: string) => void;
	canTransition: (taskId: string, to: TaskState) => boolean;
	reset: (taskId: string) => void;

	// Anchor/Ambient derivation
	anchorTask: Task | null;
	ambientTasks: Task[];
	readyTasks: Task[];
	doneTasks: Task[];

	// Computed
	totalCount: number;
	runningCount: number;
	completedCount: number;
}

/**
 * React hook for task store.
 *
 * @example
 * ```tsx
 * const { anchorTask, readyTasks, transitionTask } = useTaskStore();
 *
 * const handleStart = (taskId: string) => {
 *   transitionTask(taskId, "start");
 * };
 * ```
 */
export function useTaskStore(): UseTaskStoreReturn {
	const [storedTasks, setStoredTasks] = useLocalStorage<Task[]>(STORAGE_KEY, []);

	// State machines for transition validation
	const stateMachines = useTaskStateMap();

	// Derive Anchor/Ambient/Ready/Done tasks
	const { anchorTask, ambientTasks, readyTasks, doneTasks } = useMemo(() => {
		const running: Task[] = [];
		const paused: Task[] = [];
		const ready: Task[] = [];
		const done: Task[] = [];

		for (const task of storedTasks) {
			switch (task.state) {
				case "RUNNING":
					running.push(task);
					break;
				case "PAUSED":
					paused.push(task);
					break;
				case "READY":
					ready.push(task);
					break;
				case "DONE":
					done.push(task);
					break;
			}
		}

		// Sort by priority (descending) and createdAt (ascending)
		const sortByPriority = (a: Task, b: Task) => {
			if (a.priority !== b.priority) {
				return b.priority - a.priority; // Higher priority first
			}
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		};

		ready.sort(sortByPriority);
		paused.sort((a, b) => {
			// Sort by pausedAt (most recently paused first)
			const aTime = a.pausedAt ? new Date(a.pausedAt).getTime() : 0;
			const bTime = b.pausedAt ? new Date(b.pausedAt).getTime() : 0;
			return bTime - aTime;
		});

		return {
			anchorTask: running[0] ?? null,
			ambientTasks: paused,
			readyTasks: ready,
			doneTasks: done,
		};
	}, [storedTasks]);

	// CRUD operations
	const getTask = useCallback((id: string): Task | undefined => {
		return storedTasks.find(t => t.id === id);
	}, [storedTasks]);

	const getAllTasks = useCallback((): Task[] => {
		return [...storedTasks];
	}, [storedTasks]);

	const getTasksByState = useCallback((state: TaskState): Task[] => {
		return storedTasks.filter(t => t.state === state);
	}, [storedTasks]);

	const createTask = useCallback((
		props: Omit<Task, "id" | "createdAt" | "updatedAt">
	) => {
		const now = new Date().toISOString();
		const newTask: Task = {
			...props,
			id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			state: props.state ?? "READY",
			createdAt: now,
			updatedAt: now,
			// Default values for extended fields
			elapsedMinutes: 0,
			priority: props.priority ?? 0,
			completedAt: null,
			pausedAt: null,
			estimatedPomodoros: Math.ceil((props.estimatedMinutes ?? 25) / 25),
			completedPomodoros: 0,
			completed: props.state === "DONE",
			category: "active",
		};
		setStoredTasks(prev => [...prev, newTask]);
	}, [setStoredTasks]);

	const updateTask = useCallback((id: string, updates: Partial<Task>) => {
		setStoredTasks(prev => prev.map(task => {
			if (task.id === id) {
				return {
					...task,
					...updates,
					updatedAt: new Date().toISOString(),
				};
			}
			return task;
		}));
	}, [setStoredTasks]);

	const deleteTask = useCallback((id: string) => {
		setStoredTasks(prev => prev.filter(t => t.id !== id));
	}, [setStoredTasks]);

	// Computed values
	const totalCount = storedTasks.length;
	const runningCount = storedTasks.filter(t => t.state === "RUNNING").length;
	const completedCount = storedTasks.filter(t => t.state === "DONE").length;

	return {
		// CRUD
		tasks: storedTasks,
		createTask,
		updateTask,
		deleteTask,
		getTask,
		getAllTasks,
		getTasksByState,

		// State transitions (from useTaskStateMap)
		getState: stateMachines.getState,
		transition: stateMachines.transition,
		canTransition: stateMachines.canTransition,
		reset: stateMachines.reset,

		// Anchor/Ambient
		anchorTask,
		ambientTasks,
		readyTasks,
		doneTasks,

		// Computed
		totalCount,
		runningCount,
		completedCount,
	};
}
