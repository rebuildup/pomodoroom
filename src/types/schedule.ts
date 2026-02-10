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
	estimatedPomodoros: number;
	completedPomodoros: number;
	completed: boolean;
	/** Task state for state transition management (READY | RUNNING | PAUSED | DONE) */
	state: TaskState;
	projectId?: string;
	tags: string[];
	priority?: number; // 0-100
	category: TaskCategory;
	createdAt: string;
}

export interface Project {
	id: string;
	name: string;
	deadline?: string; // ISO
	tasks: Task[];
	createdAt: string;
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
