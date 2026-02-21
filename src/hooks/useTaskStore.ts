/**
 * useTaskStore - Single source of truth for task data.
 *
 * Provides CRUD operations and Anchor/Ambient derivation.
 * Persists to SQLite via Tauri IPC (database-only architecture).
 * State transitions are delegated to useTaskStateMap.
 */

import { useCallback, useMemo, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTaskStateMap } from "./useTaskState";
import type { Task } from "../types/task";
import type { TaskState } from "../types/task-state";
import { recalculateEstimatedStarts } from "@/utils/auto-schedule-time";
import { findRecurringDuplicateTaskIds } from "@/utils/recurring-auto-generation";
import { clearProjectedTasksCache } from "@/utils/next-board-tasks";
import { estimateTaskDuration } from "@/utils/task-duration-estimation";

/**
 * Check if running in Tauri environment.
 */
function isTauriEnvironment(): boolean {
	if (typeof window === "undefined") return false;
	const w = window as any;
	const result = w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined;
	console.log("[useTaskStore] isTauriEnvironment check:", result);
	return result;
}

function dispatchTasksRefresh(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent("tasks:refresh"));
}

function applyEstimatedStartRecalc(tasks: Task[]): Task[] {
	// Clear the projected tasks cache since task data has changed
	clearProjectedTasksCache();
	return recalculateEstimatedStarts(tasks);
}

/**
 * Helper to check migration status.
 * Database-only architecture - always returns true.
 */
function getIsMigrated(): boolean {
	return true;
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
		kind: (json.kind as Task["kind"]) ?? "duration_only",
		requiredMinutes: (json.required_minutes as number | null) ?? (json.requiredMinutes as number | null) ?? (json.estimated_minutes as number | null) ?? null,
		fixedStartAt: (json.fixed_start_at as string | null) ?? (json.fixedStartAt as string | null) ?? null,
		fixedEndAt: (json.fixed_end_at as string | null) ?? (json.fixedEndAt as string | null) ?? null,
		windowStartAt: (json.window_start_at as string | null) ?? (json.windowStartAt as string | null) ?? null,
		windowEndAt: (json.window_end_at as string | null) ?? (json.windowEndAt as string | null) ?? null,
		estimatedStartAt: (json.estimated_start_at as string | null) ?? (json.estimatedStartAt as string | null) ?? null,
		tags: (json.tags as string[]) ?? [],
		estimatedPomodoros: Number(json.estimated_pomodoros ?? 1),
		completedPomodoros: Number(json.completed_pomodoros ?? 0),
		completed: Boolean(json.completed),
		category: (json.category as any) ?? "active",
		createdAt: String(json.created_at ?? json.createdAt ?? new Date().toISOString()),
		projectIds: (json.project_ids as string[]) ?? (json.projectIds as string[]) ?? [],
		groupIds: (json.group_ids as string[]) ?? (json.groupIds as string[]) ?? [],
		estimatedMinutes: (json.estimated_minutes as number | null) ?? null,
		// Extended fields
		elapsedMinutes: Number(json.elapsed_minutes ?? 0),
		energy: (json.energy as "low" | "medium" | "high") ?? "medium",
		group: (json.group as string | null) ?? null,
		updatedAt: String(json.updated_at ?? json.updatedAt ?? new Date().toISOString()),
		completedAt: (json.completed_at as string | null) ?? null,
		pausedAt: (json.paused_at as string | null) ?? null,
	};
}

export type CreateTaskInput = {
	title: string;
	description?: string;
	tags?: string[];
	project?: string | null;
	group?: string | null;
	energy?: Task["energy"];
	kind?: Task["kind"];
	requiredMinutes?: number | null;
	fixedStartAt?: string | null;
	fixedEndAt?: string | null;
	windowStartAt?: string | null;
	windowEndAt?: string | null;
	estimatedStartAt?: string | null;
	state?: TaskState;
	priority?: number | null;
	allowSplit?: boolean;
};

/**
 * useTaskStore return value.
 */
export interface UseTaskStoreReturn {
	// CRUD operations
	tasks: Task[];
	createTask: (props: CreateTaskInput) => void;
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
	const [useTauri, setUseTauri] = useState(() => isTauriEnvironment());
	// Database-only architecture - no localStorage
	const [tasks, setTasks] = useState<Task[]>([]);
	const [isMigrated, setIsMigrated] = useState(() => {
		if (!useTauri) return true;
		return getIsMigrated();
	});

	// Retry Tauri environment detection after a short delay
	// This is needed for separate windows where Tauri globals may load asynchronously
	useEffect(() => {
		if (useTauri) return; // Already detected

		const timeoutId = setTimeout(() => {
			const detected = isTauriEnvironment();
			if (detected && !useTauri) {
				console.log("[useTaskStore] Tauri environment detected after delay");
				setUseTauri(true);
			}
		}, 100);

		return () => clearTimeout(timeoutId);
	}, [useTauri]);

	// State machines for transition validation
	const stateMachines = useTaskStateMap();

	/**
	 * Import Google Calendar event as a task.
	 * Creates a task from calendar event with proper conversion.
	 * If the event has already ended, marks the task as DONE.
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
			let requiredMinutes: number | null = null;
			let isFinished = false;
			if (event.start?.dateTime && event.end?.dateTime) {
				const startTime = new Date(event.start.dateTime);
				const endTime = new Date(event.end.dateTime);
				const durationMs = endTime.getTime() - startTime.getTime();
				requiredMinutes = Math.round(durationMs / (1000 * 60));
				// Mark as DONE if the event has already ended
				isFinished = endTime < new Date();
			}

			// Store calendar event ID for deduplication in description
			const calendarIdMarker = `[calendar:${event.id}]`;
			const baseDescription = event.description ?? `Google Calendar: ${event.summary ?? "Event"}`;
			const descriptionWithCalendarId = `${calendarIdMarker} ${baseDescription}`;

			console.log('[useTaskStore] Importing calendar event as task:', event.id, isFinished ? '(already finished)' : '');

			// Create task directly
			const now = new Date().toISOString();
			const estimatedMins = requiredMinutes ?? 60;
			const estimatedPomodoros = Math.ceil(estimatedMins / 25);

			const newTask: Task = {
				// Schedule.Task fields
				id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
				title: event.summary ?? "Calendar Event",
				description: descriptionWithCalendarId,
				estimatedPomodoros,
				completedPomodoros: 0,
				completed: isFinished,
				state: isFinished ? "DONE" : "READY",
				tags: ["calendar"],
				priority: null,
				category: "active",
				createdAt: now,
				projectIds: [],
				groupIds: [],
				estimatedMinutes: null,
				// Task-specific fields
				estimatedStartAt: null,
				elapsedMinutes: 0,
				project: "Calendar",
				group: null,
				energy: "medium",
				kind: "fixed_event",
				requiredMinutes,
				fixedStartAt: event.start?.dateTime ?? null,
				fixedEndAt: event.end?.dateTime ?? null,
				windowStartAt: null,
				windowEndAt: null,
				updatedAt: now,
				completedAt: isFinished ? now : null,
				pausedAt: null,
			};

			console.log('[useTaskStore] About to add task to state:', {
				id: newTask.id,
				title: newTask.title,
				useTauri,
			});

			// Optimistic update
			setTasks(prev => {
				const updated = applyEstimatedStartRecalc([...prev, newTask]);
				console.log('[useTaskStore] Task added to state. New task count:', updated.length);
				return updated;
			});

			// Database-only architecture - Tauri only
			console.log('[useTaskStore] Calling cmd_task_create');
			const descriptionValue = newTask.description ?? null;
			const projectIdValue = newTask.project ?? null;
			const tagsValue = newTask.tags ?? [];
			const priorityValue = newTask.priority ?? null;
			const categoryValue = newTask.category ?? "active";
			try {
				await invoke("cmd_task_create", {
					title: newTask.title,
					description: descriptionValue,
					projectId: projectIdValue,
					tags: tagsValue,
					estimatedPomodoros: newTask.estimatedPomodoros,
					priority: priorityValue,
					category: categoryValue,
					kind: newTask.kind,
					requiredMinutes: newTask.requiredMinutes,
					fixedStartAt: newTask.fixedStartAt,
					fixedEndAt: newTask.fixedEndAt,
					windowStartAt: newTask.windowStartAt,
					windowEndAt: newTask.windowEndAt,
				});
				console.log('[useTaskStore] cmd_task_create succeeded for task:', newTask.id);
				dispatchTasksRefresh();
			} catch (error) {
				console.error("[useTaskStore] importCalendarEvent failed:", error);
				// Rollback optimistic update
				setTasks(prev => applyEstimatedStartRecalc(prev.filter(t => t.id !== newTask.id)));
			}
		},
		[useTauri]
	);

	/**
	 * Import Google Todo Task as a Pomodoroom task.
	 * Creates a task from Google Task with proper conversion.
	 * Duration is estimated from title, notes, and tags.
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
			// Google Tasks does not provide duration; keep a stable default estimate.
			// Estimate required minutes from title and notes
		const requiredMinutes = estimateTaskDuration(task.title, task.notes);

		// Determine task state based on Google Task status
			const taskState = task.status === "completed" ? "DONE" : "READY";

			// Store Google Todo ID for deduplication in description
			const todoIdMarker = `[gtodo:${task.id}]`;
			const baseDescription = task.notes ?? `Google Tasks: ${task.title}`;
			const descriptionWithTodoId = `${todoIdMarker} ${baseDescription}`;

			console.log('[useTaskStore] Importing Google Todo as task:', task.id);

			// Create task directly
			const now = new Date().toISOString();
			const estimatedMins = requiredMinutes ?? 60;
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
				projectIds: [],
				groupIds: [],
				estimatedMinutes: null,
				// Task-specific fields
				estimatedStartAt: null,
				elapsedMinutes: 0,
				project: "Gtasks",
				group: null,
				energy: "medium",
				kind: "duration_only",
				requiredMinutes,
				fixedStartAt: null,
				fixedEndAt: null,
				windowStartAt: null,
				windowEndAt: task.due ?? null,
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
				const updated = applyEstimatedStartRecalc([...prev, newTask]);
				console.log('[useTaskStore] Todo task added to state. New task count:', updated.length);
				return updated;
			});

			// Database-only architecture - Tauri only
			console.log('[useTaskStore] Tauri mode: calling cmd_task_create');
			const descValue = newTask.description ?? null;
			const projValue = newTask.project ?? null;
			const tagsArray = newTask.tags ?? [];
			const priorityVal = newTask.priority ?? null;
			const categoryVal = newTask.category ?? "active";
			try {
				await invoke("cmd_task_create", {
					title: newTask.title,
					description: descValue,
					projectId: projValue,
					tags: tagsArray,
					estimatedPomodoros: newTask.estimatedPomodoros,
					priority: priorityVal,
					category: categoryVal,
					kind: newTask.kind,
					requiredMinutes: newTask.requiredMinutes,
					fixedStartAt: newTask.fixedStartAt,
					fixedEndAt: newTask.fixedEndAt,
					windowStartAt: newTask.windowStartAt,
					windowEndAt: newTask.windowEndAt,
				});
				console.log('[useTaskStore] cmd_task_create succeeded for todo task:', newTask.id);
				dispatchTasksRefresh();
			} catch (error) {
				console.error("[useTaskStore] importTodoTask failed:", error);
				// Rollback optimistic update
				setTasks(prev => applyEstimatedStartRecalc(prev.filter(t => t.id !== newTask.id)));
			}
		},
		[useTauri]
	);

	/**
	 * Load all tasks from SQLite.
	 */
	const loadTasksFromSqlite = useCallback(async (): Promise<void> => {
		console.log("[useTaskStore] loadTasksFromSqlite called");
		let tasksJson: any[];
		try {
			tasksJson = await invoke<any[]>("cmd_task_list");
		} catch (error) {
			console.error("[useTaskStore] Failed to load tasks from SQLite:", error);
			setTasks([]);
			return;
		}
		const taskCount = tasksJson?.length !== null && tasksJson?.length !== undefined ? tasksJson.length : 0;
		console.log("[useTaskStore] Loaded tasks from SQLite:", taskCount, "tasks");
		const loadedTasks = applyEstimatedStartRecalc(tasksJson.map(jsonToTask));
		const duplicateIds = findRecurringDuplicateTaskIds(loadedTasks);
		if (duplicateIds.length > 0) {
			const duplicateSet = new Set(duplicateIds);
			const dedupedTasks = loadedTasks.filter((task) => !duplicateSet.has(task.id));
			setTasks(dedupedTasks);
			console.log("[useTaskStore] Removed duplicates, final count:", dedupedTasks.length);
			// localStorage sync removed - database-only architecture

			await Promise.all(
				duplicateIds.map((id) =>
					invoke("cmd_task_delete", { id }).catch((error) => {
						let message: string;
						if (error instanceof Error) {
							message = error.message;
						} else if (error !== null && error !== undefined) {
							message = String(error);
						} else {
							message = "";
						}
						if (!message.includes("Task not found")) {
							console.warn("[useTaskStore] duplicate cleanup failed:", id, message);
						}
					})
				)
			);
			return;
		}

		setTasks(loadedTasks);
		console.log("[useTaskStore] Tasks loaded successfully, count:", loadedTasks.length);
	}, [setTasks]);

	/**
	 * Migration completed - database-only architecture.
	 */
	const migrateLocalStorageToSqlite = useCallback(async (): Promise<void> => {
		if (!useTauri || isMigrated) return;

		// No localStorage to migrate - database-only architecture
		setIsMigrated(true);
		console.log("[useTaskStore] Database-only architecture - no migration needed");
	}, [useTauri, isMigrated]);

	/**
	 * Initial load from SQLite (database-only architecture).
	 * Re-runs when useTauri becomes true (important for separate windows).
	 */
	useEffect(() => {
		if (!useTauri) {
			console.log("[useTaskStore] Skipping load - not in Tauri environment yet");
			return;
		}

		console.log("[useTaskStore] Loading tasks from SQLite (useTauri=true)");
		// Tauri: load from SQLite
		loadTasksFromSqlite();
	}, [useTauri, loadTasksFromSqlite]);

	// Keep multiple useTaskStore instances in sync across all windows.
	useEffect(() => {
		if (!useTauri) return;

		const unlisteners: Promise<() => void>[] = [];

		// Tauri event listeners for cross-window communication
		const unlistenRefresh = listen("tasks:refresh", () => {
			loadTasksFromSqlite();
		});
		const unlistenClear = listen("tasks:clear", () => {
			// Immediately clear tasks state - database-only architecture
			setTasks([]);
		});

		unlisteners.push(unlistenRefresh, unlistenClear);

		// Also keep local window events for backward compatibility
		const onRefresh = () => {
			loadTasksFromSqlite();
		};
		const onClear = () => {
			// Immediately clear tasks state - database-only architecture
			setTasks([]);
		};
		window.addEventListener("tasks:refresh", onRefresh);
		window.addEventListener("tasks:clear", onClear);

		return () => {
			// Clean up Tauri event listeners
			unlisteners.forEach(unlistenPromise => {
				unlistenPromise.then(unlisten => unlisten());
			});
			// Clean up window event listeners
			window.removeEventListener("tasks:refresh", onRefresh);
			window.removeEventListener("tasks:clear", onClear);
		};
	}, [useTauri, loadTasksFromSqlite]);

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
		props: CreateTaskInput
	) => {
		const now = new Date().toISOString();
		const requiredMinutes =
			props.requiredMinutes ??
			(props.kind === "fixed_event" && props.fixedStartAt && props.fixedEndAt
				? Math.max(1, Math.round((new Date(props.fixedEndAt).getTime() - new Date(props.fixedStartAt).getTime()) / (1000 * 60)))
				: 25);
		const newTask: Task = {
			id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			title: props.title,
			description: props.description,
			state: props.state ?? "READY",
			tags: props.tags ?? [],
			createdAt: now,
			updatedAt: now,
			projectIds: [],
			groupIds: [],
			estimatedMinutes: null,
			// Default values for extended fields
			elapsedMinutes: 0,
			priority: props.priority ?? 0,
			completedAt: null,
			pausedAt: null,
			estimatedPomodoros: Math.ceil((requiredMinutes ?? 25) / 25),
			completedPomodoros: 0,
			completed: props.state === "DONE",
			category: "active",
			kind: props.kind ?? "duration_only",
			requiredMinutes,
			fixedStartAt: props.fixedStartAt ?? null,
			fixedEndAt: props.fixedEndAt ?? null,
			windowStartAt: props.windowStartAt ?? null,
			windowEndAt: props.windowEndAt ?? null,
			estimatedStartAt: props.estimatedStartAt ?? null,
			project: props.project ?? null,
			group: props.group ?? null,
			energy: props.energy ?? "medium",
			allowSplit: props.allowSplit ?? (props.kind !== "fixed_event"),
		};

		// Debug log
		console.log('[useTaskStore] createTask called with:', {
			props: {
				...props,
				requiredMinutes: props.requiredMinutes ?? '(not provided, will use default 25)',
			},
			createdTask: {
				id: newTask.id,
				title: newTask.title,
				requiredMinutes: newTask.requiredMinutes,
			},
		});

		// Optimistic update
		setTasks(prev => applyEstimatedStartRecalc([...prev, newTask]));

		if (!useTauri) {
			// Web dev mode removed - database-only architecture
			return;
		}

		// Tauri: SQLite with rollback on error
		invoke("cmd_task_create", {
			title: newTask.title,
			description: newTask.description ?? null,
			projectId: newTask.project ?? null,
			group: newTask.group ?? null,
			tags: newTask.tags ?? [],
			estimatedPomodoros: newTask.estimatedPomodoros,
			priority: newTask.priority ?? null,
			category: newTask.category ?? "active",
			kind: newTask.kind,
			requiredMinutes: newTask.requiredMinutes,
			fixedStartAt: newTask.fixedStartAt,
			fixedEndAt: newTask.fixedEndAt,
			windowStartAt: newTask.windowStartAt,
			windowEndAt: newTask.windowEndAt,
			estimatedStartAt: newTask.estimatedStartAt,
		})
			.then(() => {
				dispatchTasksRefresh();
			})
			.catch((error) => {
				console.error("[useTaskStore] createTask failed:", error);
				// Rollback optimistic update
				setTasks(prev => applyEstimatedStartRecalc(prev.filter(t => t.id !== newTask.id)));
			});
	}, [useTauri]);

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

			return applyEstimatedStartRecalc(prev.map(t => (t.id === id ? updatedTask! : t)));
		});

		if (!updatedTask || !previousTask) return;

		// Web dev mode removed - database-only architecture

		// Tauri: SQLite with rollback on error
		const capturedPreviousTask = previousTask;
		invoke("cmd_task_update", {
			id,
			title: updatedTask.title,
			description: updatedTask.description ?? null,
			projectId: updatedTask.project ?? null,
			group: updatedTask.group ?? null,
			tags: updatedTask.tags ?? [],
			estimatedPomodoros: updatedTask.estimatedPomodoros,
			completedPomodoros: updatedTask.completedPomodoros,
			completed: updatedTask.completed,
			priority: updatedTask.priority ?? null,
			category: updatedTask.category ?? "active",
			requiredMinutes: updatedTask.requiredMinutes ?? null,
			fixedStartAt: updatedTask.fixedStartAt ?? null,
			fixedEndAt: updatedTask.fixedEndAt ?? null,
			windowStartAt: updatedTask.windowStartAt ?? null,
			windowEndAt: updatedTask.windowEndAt ?? null,
			estimatedStartAt: updatedTask.estimatedStartAt ?? null,
		}).then(() => {
			dispatchTasksRefresh();
		}).catch(error => {
			console.error("[useTaskStore] updateTask failed:", error);
			// Rollback to previous state
			setTasks(prev => applyEstimatedStartRecalc(prev.map(t => (t.id === id ? capturedPreviousTask : t))));
		});
	}, [useTauri]);

	const deleteTask = useCallback((id: string) => {
		let previousTask: Task | undefined;

		// Optimistic update - capture task before deletion
		setTasks(prev => {
			previousTask = prev.find(t => t.id === id);
			if (!previousTask) return prev;
			return applyEstimatedStartRecalc(prev.filter(t => t.id !== id));
		});

		if (!previousTask) return;

		// Web dev mode removed - database-only architecture

		// Tauri: SQLite with rollback on error
		const capturedPreviousTask = previousTask;
		invoke("cmd_task_delete", { id }).then(() => {
			dispatchTasksRefresh();
		}).catch(error => {
			console.error("[useTaskStore] deleteTask failed:", error);
			const errorText = error instanceof Error ? error.message : String(error ?? "");
			if (errorText.includes("Task not found")) {
				// Deletion is effectively complete from DB perspective.
				dispatchTasksRefresh();
				return;
			}
			// Rollback optimistic update
			setTasks(prev => applyEstimatedStartRecalc([...prev, capturedPreviousTask]));
		});
	}, [useTauri]);

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
