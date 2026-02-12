/**
 * useTaskStore - Single source of truth for task data.
 *
 * Provides CRUD operations and Anchor/Ambient derivation.
 * Persists to SQLite via Tauri IPC (desktop) or localStorage (web dev).
 * State transitions are delegated to useTaskStateMap.
 */

import { useCallback, useMemo, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
	return typeof window !== "undefined" && (window as any).__TAURI__ !== undefined;
}

/**
 * Helper to check migration status from localStorage safely.
 */
function getIsMigrated(): boolean {
	try {
		return localStorage.getItem(MIGRATION_KEY) === "true";
	} catch {
		return false;
	}
}

/**
 * Internal helper to migrate tasks sequentially.
 * Extracted to avoid React Compiler issues with loops in try/catch.
 */
async function performTaskMigration(tasks: Task[]): Promise<void> {
	for (const task of tasks) {
		await invoke("cmd_task_create", {
			taskJson: taskToJson(task),
		});
	}
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
		description: (json.description as string | null) ?? undefined,
		state: json.state as TaskState,
		priority: (json.priority as number | null) ?? 50,
		project: (json.project_id as string | null) ?? (json.project as string | null) ?? null,
		tags: (json.tags as string[]) ?? [],
		estimatedPomodoros: Number(json.estimated_pomodoros ?? 1),
		completedPomodoros: Number(json.completed_pomodoros ?? 0),
		completed: Boolean(json.completed),
		category: (json.category as any) ?? "active",
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

	// Calendar import
	importCalendarEvent: (event: {
		id: string;
		summary?: string | undefined;
		description?: string;
		start?: { dateTime?: string } | undefined;
		end?: { dateTime?: string } | undefined;
	}) => Promise<void>;

	// Google Todo import
	importTodoTask: (task: {
		id: string;
		title: string;
		notes?: string;
		status: "needsAction" | "completed";
		due?: string;
	}) => Promise<void>;

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
		if (!useTauri) return true;
		return getIsMigrated();
	});

	// State machines for transition validation
	const stateMachines = useTaskStateMap();

	/**
	 * Import Google Calendar event as a task.
	 * Creates a task from calendar event with proper conversion.
	 */
	const importCalendarEvent = useCallback(
		async (
			event: {
				id: string;
				summary?: string | undefined;
				description?: string;
				start?: { dateTime?: string } | undefined;
				end?: { dateTime?: string } | undefined;
			}
		): Promise<void> => {
			// Calculate duration from event
			let estimatedMinutes: number | null = null;
			if (event.start?.dateTime && event.end?.dateTime) {
				const startTime = new Date(event.start.dateTime);
				const endTime = new Date(event.end.dateTime);
				const durationMs = endTime.getTime() - startTime.getTime();
				estimatedMinutes = Math.round(durationMs / (1000 * 60));
			}

			// Store calendar event ID for deduplication in description
			const calendarIdMarker = `[calendar:${event.id}]`;
			const baseDescription = event.description ?? `Google Calendar: ${event.summary ?? "Event"}`;
			const descriptionWithCalendarId = `${calendarIdMarker} ${baseDescription}`;

			console.log('[useTaskStore] Importing calendar event as task:', event.id);

			// Create task directly
			const now = new Date().toISOString();
			const estimatedMins = estimatedMinutes ?? 60;
			const estimatedPomodoros = Math.ceil(estimatedMins / 25);

			const newTask: Task = {
				// Schedule.Task fields
				id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				title: event.summary ?? "Calendar Event",
				description: descriptionWithCalendarId,
				estimatedPomodoros,
				completedPomodoros: 0,
				completed: false,
				state: "READY",
				tags: ["calendar"],
				priority: null,
				category: "active",
				createdAt: now,
				// Task-specific fields
				estimatedMinutes: estimatedMinutes,
				elapsedMinutes: 0,
				project: "Calendar",
				group: null,
				energy: "medium",
				updatedAt: now,
				completedAt: null,
				pausedAt: null,
			};

			console.log('[useTaskStore] About to add task to state:', {
				id: newTask.id,
				title: newTask.title,
				useTauri,
			});

			// Optimistic update
			setTasks(prev => {
				const updated = [...prev, newTask];
				console.log('[useTaskStore] Task added to state. New task count:', updated.length);
				return updated;
			});

			if (!useTauri) {
				// Web dev: localStorage
				console.log('[useTaskStore] Web dev mode: updating localStorage');
				setStoredTasks(prev => [...prev, newTask]);
				return;
			}

			// Tauri: SQLite with rollback on error
			console.log('[useTaskStore] Tauri mode: calling cmd_task_create');
			try {
				await invoke("cmd_task_create", { taskJson: taskToJson(newTask) });
				console.log('[useTaskStore] cmd_task_create succeeded for task:', newTask.id);
			} catch (error) {
				console.error("[useTaskStore] importCalendarEvent failed:", error);
				// Rollback optimistic update
				setTasks(prev => prev.filter(t => t.id !== newTask.id));
			}
		},
		[useTauri, setStoredTasks]
	);

	/**
	 * Import Google Todo Task as a Pomodoroom task.
	 * Creates a task from Google Task with proper conversion.
	 */
	const importTodoTask = useCallback(
		async (
			task: {
				id: string;
				title: string;
				notes?: string;
				status: "needsAction" | "completed";
				due?: string;
			}
		): Promise<void> => {
			// Calculate estimated minutes from due date (if available)
			let estimatedMinutes: number | null = null;
			if (task.due) {
				const now = new Date();
				const dueDate = new Date(task.due);
				const diffMs = dueDate.getTime() - now.getTime();
				// If due is in future, use that as estimate; otherwise default to 60 min
				if (diffMs > 0) {
					estimatedMinutes = Math.round(diffMs / (1000 * 60));
				} else {
					estimatedMinutes = 60; // Overdue task, default to 60 min
				}
			} else {
				estimatedMinutes = 60; // No due date, default to 60 min
			}

			// Determine task state based on Google Task status
			const taskState = task.status === "completed" ? "DONE" : "READY";

			// Store Google Todo ID for deduplication in description
			const todoIdMarker = `[gtodo:${task.id}]`;
			const baseDescription = task.notes ?? `Google Tasks: ${task.title}`;
			const descriptionWithTodoId = `${todoIdMarker} ${baseDescription}`;

			console.log('[useTaskStore] Importing Google Todo as task:', task.id);

			// Create task directly
			const now = new Date().toISOString();
			const estimatedMins = estimatedMinutes ?? 60;
			const estimatedPomodoros = Math.ceil(estimatedMins / 25);

			const newTask: Task = {
				// Schedule.Task fields
				id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				title: task.title,
				description: descriptionWithTodoId,
				estimatedPomodoros,
				completedPomodoros: 0,
				completed: task.status === "completed",
				state: taskState,
				tags: ["gtodo"],
				priority: null,
				category: "active",
				createdAt: now,
				// Task-specific fields
				estimatedMinutes: estimatedMinutes,
				elapsedMinutes: 0,
				project: "Gtasks",
				group: null,
				energy: "medium",
				updatedAt: now,
				completedAt: null,
				pausedAt: null,
			};

			console.log('[useTaskStore] About to add todo task to state:', {
				id: newTask.id,
				title: newTask.title,
				useTauri,
			});

			// Optimistic update
			setTasks(prev => {
				const updated = [...prev, newTask];
				console.log('[useTaskStore] Todo task added to state. New task count:', updated.length);
				return updated;
			});

			if (!useTauri) {
				// Web dev: localStorage
				console.log('[useTaskStore] Web dev mode: updating localStorage');
				setStoredTasks(prev => [...prev, newTask]);
				return;
			}

			// Tauri: SQLite with rollback on error
			console.log('[useTaskStore] Tauri mode: calling cmd_task_create');
			try {
				await invoke("cmd_task_create", { taskJson: taskToJson(newTask) });
				console.log('[useTaskStore] cmd_task_create succeeded for todo task:', newTask.id);
			} catch (error) {
				console.error("[useTaskStore] importTodoTask failed:", error);
				// Rollback optimistic update
				setTasks(prev => prev.filter(t => t.id !== newTask.id));
			}
		},
		[useTauri, setStoredTasks]
	);

	/**
	 * Load all tasks from SQLite.
	 */
	const loadTasksFromSqlite = useCallback(async (): Promise<void> => {
		try {
			const tasksJson = await invoke<any[]>("cmd_task_list");
			const loadedTasks = tasksJson.map(jsonToTask);
			setTasks(loadedTasks);
			setStoredTasks(loadedTasks); // Keep localStorage in sync for fallback
		} catch (error) {
			console.error("[useTaskStore] Failed to load tasks from SQLite:", error);
			// Fallback to localStorage on error
			setTasks(storedTasks);
		}
	}, [storedTasks, setTasks, setStoredTasks]);

	/**
	 * Migrate localStorage tasks to SQLite (one-time).
	 */
	const migrateLocalStorageToSqlite = useCallback(async (): Promise<void> => {
		if (!useTauri || isMigrated) return;

		const localTasks = storedTasks;
		if (localTasks.length === 0) {
			setIsMigrated(true);
			localStorage.setItem(MIGRATION_KEY, "true");
			return;
		}

		try {
			await performTaskMigration(localTasks);

			setIsMigrated(true);
			localStorage.setItem(MIGRATION_KEY, "true");
			console.log(`[useTaskStore] Migrated ${localTasks.length} tasks from localStorage to SQLite`);
		} catch (error) {
			console.error("[useTaskStore] Migration failed:", error);
		}
	}, [useTauri, isMigrated, storedTasks]);

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
	}, [useTauri, loadTasksFromSqlite, storedTasks]);

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
		const running: (Task & { createdAtTimestamp: number; pausedAtTimestamp: number })[] = [];
		const paused: (Task & { createdAtTimestamp: number; pausedAtTimestamp: number })[] = [];
		const ready: (Task & { createdAtTimestamp: number; pausedAtTimestamp: number })[] = [];
		const done: (Task & { createdAtTimestamp: number; pausedAtTimestamp: number })[] = [];

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
		const sortByPriority = (
			a: Task & { createdAtTimestamp: number },
			b: Task & { createdAtTimestamp: number }
		) => {
			const aPriority = a.priority ?? 50;
			const bPriority = b.priority ?? 50;
			if (aPriority !== bPriority) {
				return bPriority - aPriority; // Higher priority first
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

		// Debug log
		console.log('[useTaskStore] createTask called with:', {
			props: {
				...props,
				estimatedMinutes: props.estimatedMinutes ?? '(not provided, will use default 25)',
			},
			createdTask: {
				id: newTask.id,
				title: newTask.title,
				estimatedMinutes: newTask.estimatedMinutes,
			},
		});

		// Optimistic update
		setTasks(prev => [...prev, newTask]);

		if (!useTauri) {
			// Web dev: localStorage
			setStoredTasks(prev => [...prev, newTask]);
			return;
		}

		// Tauri: SQLite with rollback on error
		invoke("cmd_task_create", { taskJson: taskToJson(newTask) })
			.catch((error) => {
				console.error("[useTaskStore] createTask failed:", error);
				// Rollback optimistic update
				setTasks(prev => prev.filter(t => t.id !== newTask.id));
			});
	}, [useTauri, setStoredTasks]);

	const updateTask = useCallback((id: string, updates: Partial<Task>) => {
		let previousTask: Task | undefined;
		let updatedTask: Task | undefined;

		// Optimistic update - compute values inside setter
		setTasks(prev => {
			const task = prev.find(t => t.id === id);
			if (!task) return prev;

			previousTask = task;
			updatedTask = {
				...task,
				...updates,
				updatedAt: new Date().toISOString(),
			};

			return prev.map(t => (t.id === id ? updatedTask! : t));
		});

		if (!updatedTask || !previousTask) return;

		if (!useTauri) {
			// Web dev: localStorage
			setStoredTasks(prev => prev.map(t => (t.id === id ? updatedTask! : t)));
			return;
		}

		// Tauri: SQLite with rollback on error
		const capturedPreviousTask = previousTask;
		invoke("cmd_task_update", {
			id,
			taskJson: taskToJson(updatedTask),
		}).catch(error => {
			console.error("[useTaskStore] updateTask failed:", error);
			// Rollback to previous state
			setTasks(prev => prev.map(t => (t.id === id ? capturedPreviousTask : t)));
		});
	}, [useTauri, setStoredTasks]);

	const deleteTask = useCallback((id: string) => {
		let previousTask: Task | undefined;

		// Optimistic update - capture task before deletion
		setTasks(prev => {
			previousTask = prev.find(t => t.id === id);
			if (!previousTask) return prev;
			return prev.filter(t => t.id !== id);
		});

		if (!previousTask) return;

		if (!useTauri) {
			// Web dev: localStorage
			setStoredTasks(prev => prev.filter(t => t.id !== id));
			return;
		}

		// Tauri: SQLite with rollback on error
		const capturedPreviousTask = previousTask;
		invoke("cmd_task_delete", { id }).catch(error => {
			console.error("[useTaskStore] deleteTask failed:", error);
			// Rollback optimistic update
			setTasks(prev => [...prev, capturedPreviousTask]);
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

		// Calendar import
		importCalendarEvent,

		// Google Todo import
		importTodoTask,

		// Migration helper (exposed for manual trigger if needed)
		migrate: migrateLocalStorageToSqlite,
		isMigrated,
	};
}
