/**
 * useTaskStore - Single source of truth for task data.
 *
 * Provides CRUD operations and Anchor/Ambient derivation.
 * Persists to SQLite via Tauri IPC (desktop) or localStorage (web dev).
 * State transitions are delegated to useTaskStateMap.
 */

import { useCallback, useMemo, useEffect, useState } from "react";
import { useTaskStateMap } from "./useTaskState";
import { useLocalStorage } from "./useLocalStorage";
import type { Task } from "../types/task";
import type { TaskState } from "../types/task-state";

const STORAGE_KEY = "pomodoroom-tasks";
const MIGRATION_KEY = "pomodoroom-tasks-migrated";

/**
 * Check if running in Tauri environment.
 */
function isTauriEnvironment(): boolean {
	return typeof window !== "undefined" && window.__TAURI__ !== undefined;
}

/**
 * Convert frontend Task to JSON format for Rust IPC.
 * Handles null values and snake_case conversion.
 */
function taskToJson(task: Task): Record<string, unknown> {
	return {
		id: task.id,
		title: task.title,
		description: task.description ?? null,
		state: task.state,
		priority: task.priority ?? 50,
		project_id: task.project ?? null,
		tags: task.tags ?? [],
		estimated_pomodoros: task.estimatedPomodoros,
		completed_pomodoros: task.completedPomodoros,
		completed: task.completed,
		category: task.category ?? "active",
		created_at: task.createdAt,
		// Extended fields
		estimated_minutes: task.estimatedMinutes,
		elapsed_minutes: task.elapsedMinutes,
		energy: task.energy ?? "medium",
		group: task.group ?? null,
		updated_at: task.updatedAt,
		completed_at: task.completedAt,
		paused_at: task.pausedAt,
	};
}

/**
 * Convert JSON from Rust IPC to frontend Task.
 */
function jsonToTask(json: Record<string, unknown>): Task {
	return {
		id: String(json.id),
		title: String(json.title),
		description: (json.description as string | null) ?? null,
		state: json.state as TaskState,
		priority: (json.priority as number | null) ?? 50,
		project: (json.project_id as string | null) ?? (json.project as string | null) ?? null,
		tags: (json.tags as string[]) ?? [],
		estimatedPomodoros: Number(json.estimated_pomodoros ?? 1),
		completedPomodoros: Number(json.completed_pomodoros ?? 0),
		completed: Boolean(json.completed),
		category: (json.category as string) ?? "active",
		createdAt: String(json.created_at ?? json.createdAt ?? new Date().toISOString()),
		// Extended fields
		estimatedMinutes: (json.estimated_minutes as number | null) ?? null,
		elapsedMinutes: Number(json.elapsed_minutes ?? 0),
		energy: (json.energy as "low" | "medium" | "high") ?? "medium",
		group: (json.group as string | null) ?? null,
		updatedAt: String(json.updated_at ?? json.updatedAt ?? new Date().toISOString()),
		completedAt: (json.completed_at as string | null) ?? null,
		pausedAt: (json.paused_at as string | null) ?? null,
	};
}

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

	// Migration (exposed for testing/manual trigger)
	migrate: () => Promise<void>;
	isMigrated: boolean;
}

/**
 * React hook for task store.
 *
 * @example
 * ```tsx
 * const { anchorTask, readyTasks, transition } = useTaskStore();
 *
 * const handleStart = (taskId: string) => {
 *   transition(taskId, "RUNNING");
 * };
 * ```
 */
export function useTaskStore(): UseTaskStoreReturn {
	const useTauri = isTauriEnvironment();
	const [storedTasks, setStoredTasks] = useLocalStorage<Task[]>(STORAGE_KEY, []);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [isMigrated, setIsMigrated] = useState(() => {
		// Check if migration already happened
		if (!useTauri) return true; // No migration needed for web
		try {
			return localStorage.getItem(MIGRATION_KEY) === "true";
		} catch {
			return false;
		}
	});

	// State machines for transition validation
	const stateMachines = useTaskStateMap();

	/**
	 * Initial load from SQLite (Tauri) or use localStorage (web).
	 */
	useEffect(() => {
		if (!useTauri) {
			// Web dev: use localStorage directly
			setTasks(storedTasks);
			return;
		}

		// Tauri: load from SQLite
		loadTasksFromSqlite();
	}, [useTauri]);

	/**
	 * Load all tasks from SQLite.
	 */
	async function loadTasksFromSqlite(): Promise<void> {
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const tasksJson = await invoke<any[]>("cmd_task_list");
			const loadedTasks = tasksJson.map(jsonToTask);
			setTasks(loadedTasks);
			setStoredTasks(loadedTasks); // Keep localStorage in sync for fallback
		} catch (error) {
			console.error("[useTaskStore] Failed to load tasks from SQLite:", error);
			// Fallback to localStorage on error
			setTasks(storedTasks);
		}
	}

	/**
	 * Migrate localStorage tasks to SQLite (one-time).
	 */
	async function migrateLocalStorageToSqlite(): Promise<void> {
		if (!useTauri || isMigrated) return;

		const localTasks = storedTasks;
		if (localTasks.length === 0) {
			setIsMigrated(true);
			localStorage.setItem(MIGRATION_KEY, "true");
			return;
		}

		try {
			const { invoke } = await import("@tauri-apps/api/core");

			for (const task of localTasks) {
				await invoke("cmd_task_create", {
					taskJson: taskToJson(task),
				});
			}

			setIsMigrated(true);
			localStorage.setItem(MIGRATION_KEY, "true");
			console.log(`[useTaskStore] Migrated ${localTasks.length} tasks from localStorage to SQLite`);
		} catch (error) {
			console.error("[useTaskStore] Migration failed:", error);
		}
	}

	// Pre-compute timestamps to avoid repeated Date parsing
	const tasksWithTimestamps = useMemo(() => {
		return tasks.map(task => ({
			...task,
			createdAtTimestamp: new Date(task.createdAt).getTime(),
			pausedAtTimestamp: task.pausedAt ? new Date(task.pausedAt).getTime() : 0,
		}));
	}, [tasks]);

	// Derive Anchor/Ambient/Ready/Done tasks
	const { anchorTask, ambientTasks, readyTasks, doneTasks } = useMemo(() => {
		const running: Task[] = [];
		const paused: Task[] = [];
		const ready: Task[] = [];
		const done: Task[] = [];

		for (const task of tasksWithTimestamps) {
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
		const sortByPriority = (a: Task & { createdAtTimestamp: number }, b: Task & { createdAtTimestamp: number }) => {
			if (a.priority !== b.priority) {
				return b.priority - a.priority; // Higher priority first
			}
			return a.createdAtTimestamp - b.createdAtTimestamp;
		};

		ready.sort(sortByPriority);
		paused.sort((a, b) => {
			// Sort by pausedAt (most recently paused first) using pre-computed timestamps
			return b.pausedAtTimestamp - a.pausedAtTimestamp;
		});

		return {
			anchorTask: running[0] ?? null,
			ambientTasks: paused,
			readyTasks: ready,
			doneTasks: done,
		};
	}, [tasksWithTimestamps]);

	// CRUD operations
	const getTask = useCallback((id: string): Task | undefined => {
		return tasks.find(t => t.id === id);
	}, [tasks]);

	const getAllTasks = useCallback((): Task[] => {
		return [...tasks];
	}, [tasks]);

	const getTasksByState = useCallback((state: TaskState): Task[] => {
		return tasks.filter(t => t.state === state);
	}, [tasks]);

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

		// Optimistic update
		setTasks(prev => [...prev, newTask]);

		if (!useTauri) {
			// Web dev: localStorage
			setStoredTasks(prev => [...prev, newTask]);
			return;
		}

		// Tauri: SQLite with rollback on error
		import("@tauri-apps/api/core").then(({ invoke }) => {
			invoke("cmd_task_create", { taskJson: taskToJson(newTask) })
				.catch((error) => {
					console.error("[useTaskStore] createTask failed:", error);
					// Rollback optimistic update
					setTasks(prev => prev.filter(t => t.id !== newTask.id));
				});
		});
	}, [useTauri, setStoredTasks]);

	const updateTask = useCallback((id: string, updates: Partial<Task>) => {
		let previousTask: Task | undefined;
		let updatedTask: Task;

		// Capture previous state for rollback
		setTasks(prev => {
			previousTask = prev.find(t => t.id === id);
			return prev.map(task => {
				if (task.id === id) {
					updatedTask = {
						...task,
						...updates,
						updatedAt: new Date().toISOString(),
					};
					return updatedTask;
				}
				return task;
			});
		});

		if (!useTauri) {
			// Web dev: localStorage
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
			return;
		}

		// Tauri: SQLite with rollback on error
		import("@tauri-apps/api/core").then(({ invoke }) => {
			invoke("cmd_task_update", {
				id,
				taskJson: taskToJson(updatedTask),
			}).catch((error) => {
				console.error("[useTaskStore] updateTask failed:", error);
				// Rollback to previous state
				if (previousTask) {
					setTasks(prev => prev.map(t => t.id === id ? previousTask! : t));
				}
			});
		});
	}, [useTauri, setStoredTasks]);

	const deleteTask = useCallback((id: string) => {
		let previousTask: Task | undefined;

		// Capture previous state for rollback
		setTasks(prev => {
			previousTask = prev.find(t => t.id === id);
			return prev.filter(t => t.id !== id);
		});

		if (!useTauri) {
			// Web dev: localStorage
			setStoredTasks(prev => prev.filter(t => t.id !== id));
			return;
		}

		// Tauri: SQLite with rollback on error
		import("@tauri-apps/api/core").then(({ invoke }) => {
			invoke("cmd_task_delete", { id })
				.catch((error) => {
					console.error("[useTaskStore] deleteTask failed:", error);
					// Rollback optimistic update
					if (previousTask) {
						setTasks(prev => [...prev, previousTask!]);
					}
				});
		});
	}, [useTauri, setStoredTasks]);

	// Computed values
	const totalCount = tasks.length;
	const runningCount = tasks.filter(t => t.state === "RUNNING").length;
	const completedCount = tasks.filter(t => t.state === "DONE").length;

	return {
		// CRUD
		tasks,
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

		// Migration helper (exposed for manual trigger if needed)
		migrate: migrateLocalStorageToSqlite,
		isMigrated,
	};
}
