/**
 * Schedule, Project, Task, DailyTemplate types.
 *
 * These mirror the Rust types in pomodoroom-core (see issue #92).
 * UI components consume these; data is mocked until CLI backend is ready.
 *
 * Task state management uses TaskState from task-state.ts for state transitions.
 */

// ─── Schedule Block ─────────────────────────────────────────────────────────

export type BlockType = "focus" | "break" | "routine" | "calendar";

export interface ScheduleBlock {
	id: string;
	blockType: BlockType;
	taskId?: string;
	startTime: string; // ISO
	endTime: string;   // ISO
	locked: boolean;
	label?: string;
	/** Parallel lane index (0-based). 0 = primary lane. */
	lane?: number;
}

// ─── Project & Task ─────────────────────────────────────────────────────────

export type TaskCategory = "active" | "someday";

// Import TaskState for state transition management
import type { TaskState } from "./task-state";

export interface Task {
	id: string;
	title: string;
	description?: string;
	/** Estimated number of pomodoros (1 pomodoro = 25 min) */
	estimatedPomodoros: number;
	/** Number of completed pomodoros */
	completedPomodoros: number;
	/** Whether the task is completed */
	completed: boolean;
	/** Task state for state transition management (READY | RUNNING | PAUSED | DONE | DRIFTING) */
	state: TaskState;
	/** Optional project ID (deprecated, use projectIds) */
	projectId?: string;
	/** Optional project name (for display) */
	project?: string | null;
	/** Multiple projects to which the task belongs */
	projectIds: string[];
	/** Multiple groups to which the task belongs */
	groupIds: string[];
	/** Immutable task kind selected at creation */
	kind: TaskKind;
	/** Required duration in minutes for scheduling */
	requiredMinutes: number | null;
	/** Fixed start timestamp for absolute-time events */
	fixedStartAt: string | null;
	/** Fixed end timestamp for absolute-time events */
	fixedEndAt: string | null;
	/** Flexible window start bound */
	windowStartAt: string | null;
	/** Flexible window end bound */
	windowEndAt: string | null;
	/** Tags for categorization */
	tags: string[];
	/** Priority value (0-100, null for default priority of 50) */
	priority: number | null;
	/** Task category (active/someday) */
	category: TaskCategory;
	/** Estimated duration in minutes (null if not set) */
	estimatedMinutes: number | null;
	/** Creation timestamp */
	createdAt: string;
	/** Last update timestamp */
	updatedAt: string | null;
	/** Pause timestamp (if paused) */
	pausedAt: string | null;
	/** Elapsed time in minutes for active tasks */
	elapsedMinutes: number | null;
}

export type TaskKind =
	| "duration_only"
	| "fixed_event"
	| "flex_window"
	| "break";

export interface Project {
	id: string;
	name: string;
	deadline?: string; // ISO
	tasks: Task[];
	createdAt: string;
	isPinned?: boolean;
	references?: ProjectReference[];
}

export interface ProjectReference {
	id: string;
	projectId: string;
	kind: string;
	value: string;
	label?: string;
	metaJson?: string;
	orderIndex: number;
	createdAt: string;
	updatedAt: string;
}

// ─── Daily Template ─────────────────────────────────────────────────────────

export interface FixedEvent {
	id: string;
	name: string;
	startTime: string; // HH:mm
	durationMinutes: number;
	days: number[];    // 0=Sun … 6=Sat
	enabled: boolean;
}

export interface DailyTemplate {
	wakeUp: string;  // HH:mm
	sleep: string;   // HH:mm
	fixedEvents: FixedEvent[];
	/** Max parallel focus lanes (1-5, default 1) */
	maxParallelLanes?: number;
}

// ─── Board Row (announcement board display) ─────────────────────────────────

export type BoardRowStatus = "active" | "waiting" | "done";

export interface BoardRow {
	block: ScheduleBlock;
	task?: Task;
	status: BoardRowStatus;
	remainingSeconds?: number;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const MAX_PARALLEL_LANES = 5;

export const DEFAULT_DAILY_TEMPLATE: DailyTemplate = {
	wakeUp: "07:00",
	sleep: "23:00",
	maxParallelLanes: 1,
	fixedEvents: [
		{
			id: "lunch",
			name: "昼食",
			startTime: "12:00",
			durationMinutes: 60,
			days: [0, 1, 2, 3, 4, 5, 6],
			enabled: true,
		},
		{
			id: "dinner",
			name: "夕食",
			startTime: "19:00",
			durationMinutes: 60,
			days: [0, 1, 2, 3, 4, 5, 6],
			enabled: true,
		},
	],
};
