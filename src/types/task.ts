/**
 * Task types for v2 redesign.
 *
 * Extends schedule.Task with additional properties for
 * Anchor/Ambient model and Pressure calculation.
 */

import type { Task as ScheduleTask } from "./schedule";

/**
 * Energy level for task scheduling.
 */
export type EnergyLevel = "low" | "medium" | "high";
export type TaskKind = "fixed_event" | "flex_window" | "duration_only" | "break";

/**
 * Transition action for task state changes.
 * Maps to state transitions defined in task-state.ts.
 */
export type TransitionAction =
	| "start"    // READY → RUNNING
	| "complete" // RUNNING → DONE
	| "extend"   // RUNNING → RUNNING (timer reset)
	| "pause"    // RUNNING → PAUSED
	| "resume"   // PAUSED → RUNNING
	| "defer";   // READY → READY (priority down)

/**
 * Task for v2 redesign with Anchor/Ambient support.
 *
 * Extends schedule.Task with:
 * - requiredMinutes / elapsedMinutes (time tracking)
 * - energy (for scheduling)
 * - updatedAt / completedAt / pausedAt (timestamps)
 * - project / group as string | null (vs projectId)
 * - projectIds / groupIds for multiple associations
 */
export interface Task extends Omit<ScheduleTask, "priority" | "projectId"> {
	/** Immutable kind selected at creation time */
	kind: TaskKind;
	/** Required minutes for scheduling */
	requiredMinutes: number | null;
	/** Absolute fixed start/end (for fixed_event) */
	fixedStartAt: string | null;
	fixedEndAt: string | null;
	/** Flexible window bounds (for flex_window) */
	windowStartAt: string | null;
	windowEndAt: string | null;
	/** Estimated start time (ISO 8601, null if not set) */
	estimatedStartAt: string | null;
	/** Elapsed time in minutes */
	elapsedMinutes: number;
	/** Single project ID (legacy, for backward compatibility) */
	projectId?: string;
	/** Project name (null if not set) - for display */
	project: string | null;
	/** Display name for the project */
	projectName?: string | null;
	/** Multiple project IDs */
	projectIds: string[];
	/** Group name for task grouping */
	group: string | null;
	/** Multiple group IDs */
	groupIds: string[];
	/** Energy level for scheduling */
	energy: EnergyLevel;
	/** Priority value (0-100, null for default priority, negative for deferred) */
	priority: number | null; // null = default (50), 0 = flat, negative = deferred
	/** Last update timestamp (ISO 8601) */
	updatedAt: string;
	/** Completion timestamp (ISO 8601, null if not completed) */
	completedAt: string | null;
	/** Pause timestamp (ISO 8601, null if not paused) - for ambient display */
	pausedAt: string | null;
	/** Parent task ID if this task is a split segment */
	parentTaskId?: string | null;
	/** Segment order within parent chain */
	segmentOrder?: number | null;
	/** Whether auto-split is allowed for this task (default: true for non-break tasks) */
	allowSplit?: boolean;
}

/**
 * Create a new task with default values.
 *
 * Note: Since Task extends ScheduleTask, we need to provide all ScheduleTask fields.
 * The estimatedPomodoros is calculated from requiredMinutes (1 pomodoro = 25 min).
 */
export function createTask(
	props: Omit<Task, "id" | "state" | "elapsedMinutes" | "priority" | "createdAt" | "updatedAt" | "completedAt" | "pausedAt" | "estimatedPomodoros" | "completedPomodoros" | "completed" | "category"> & {
		kind?: TaskKind;
		requiredMinutes?: number | null;
		fixedStartAt?: string | null;
		fixedEndAt?: string | null;
		windowStartAt?: string | null;
		windowEndAt?: string | null;
		projectId?: string;
		projectName?: string | null;
		projectIds?: string[];
		groupIds?: string[];
		parentTaskId?: string | null;
		segmentOrder?: number | null;
		allowSplit?: boolean;
	}
): Task {
	const now = new Date().toISOString();
	const estimatedMins = props.requiredMinutes ?? 25;
	const estimatedPomodoros = Math.ceil(estimatedMins / 25);
	const taskKind = props.kind ?? "duration_only";

	return {
		kind: taskKind,
		requiredMinutes: props.requiredMinutes ?? null,
		fixedStartAt: props.fixedStartAt ?? null,
		fixedEndAt: props.fixedEndAt ?? null,
		windowStartAt: props.windowStartAt ?? null,
		windowEndAt: props.windowEndAt ?? null,
		// Schedule.Task fields (required by base interface)
		id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		title: props.title,
		description: props.description,
		estimatedPomodoros,
		completedPomodoros: 0,
		completed: false,
		state: "READY",
		tags: props.tags ?? [],
		priority: null, // Default priority (null = use default of 50)
		category: "active",
		createdAt: now,
		projectIds: props.projectIds ?? [],
		groupIds: props.groupIds ?? [],
		estimatedMinutes: null,
		// Task-specific fields
		estimatedStartAt: props.estimatedStartAt ?? null,
		elapsedMinutes: 0,
		projectId: props.projectId,
		project: props.project ?? null,
		projectName: props.projectName ?? null,
		group: props.group ?? null,
		energy: props.energy ?? "medium",
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
		parentTaskId: props.parentTaskId ?? null,
		segmentOrder: props.segmentOrder ?? null,
		// Break tasks should not be split by default
		allowSplit: props.allowSplit ?? (taskKind !== "break"),
	};
}

/**
 * Get display color for energy level.
 */
export function getEnergyColor(energy: EnergyLevel): string {
	switch (energy) {
		case "low":
			return "text-red-400";
		case "medium":
			return "text-yellow-400";
		case "high":
			return "text-green-400";
	}
}

/**
 * Type guard to check if a task is a v2 Task.
 */
export function isV2Task(task: ScheduleTask | Task): task is Task {
	return "requiredMinutes" in task && "elapsedMinutes" in task;
}

/**
 * Convert ScheduleTask to v2 Task format.
 * Useful for backward compatibility with existing components using ScheduleTask.
 */
export function scheduleTaskToV2Task(scheduleTask: ScheduleTask): Task {
	return {
		...scheduleTask,
		kind: "duration_only",
		requiredMinutes: scheduleTask.estimatedPomodoros * 25,
		fixedStartAt: null,
		fixedEndAt: null,
		windowStartAt: null,
		windowEndAt: null,
		// Additional v2 fields
		estimatedStartAt: null,
		elapsedMinutes: 0,
		projectId: scheduleTask.projectId,
		project: scheduleTask.projectId ?? null,
		projectName: null,
		projectIds: scheduleTask.projectId ? [scheduleTask.projectId] : [],
		group: null,
		groupIds: [],
		energy: "medium",
		priority: scheduleTask.priority,
		updatedAt: scheduleTask.createdAt,
		completedAt: scheduleTask.completed ? new Date().toISOString() : null,
		pausedAt: null,
		parentTaskId: null,
		segmentOrder: null,
		allowSplit: true,
		estimatedMinutes: null,
	};
}

/**
 * Convert v2 Task to ScheduleTask format.
 * Useful for components that only understand ScheduleTask.
 */
export function v2TaskToScheduleTask(v2Task: Task): ScheduleTask {
	return {
		id: v2Task.id,
		title: v2Task.title,
		description: v2Task.description,
		estimatedPomodoros: v2Task.estimatedPomodoros,
		completedPomodoros: v2Task.completedPomodoros,
		completed: v2Task.completed,
		state: v2Task.state,
		projectId: v2Task.project ?? v2Task.projectId ?? undefined,
		project: v2Task.project,
		tags: v2Task.tags,
		priority: v2Task.priority ?? 50,
		category: v2Task.category,
		createdAt: v2Task.createdAt,
		projectIds: v2Task.projectIds,
		groupIds: v2Task.groupIds,
		kind: v2Task.kind,
		requiredMinutes: v2Task.requiredMinutes,
		fixedStartAt: v2Task.fixedStartAt,
		fixedEndAt: v2Task.fixedEndAt,
		windowStartAt: v2Task.windowStartAt,
		windowEndAt: v2Task.windowEndAt,
		estimatedMinutes: v2Task.estimatedMinutes,
		updatedAt: v2Task.updatedAt,
		pausedAt: v2Task.pausedAt,
		elapsedMinutes: v2Task.elapsedMinutes,
	};
}

/**
 * Check if a task has any projects associated.
 */
export function hasProjects(task: Task): boolean {
	return !!(
		task.projectId ||
		task.project ||
		task.projectName ||
		task.projectIds.length > 0
	);
}

/**
 * Check if a task has any groups associated.
 */
export function hasGroups(task: Task): boolean {
	return !!(task.group || task.groupIds.length > 0);
}

/**
 * Get display project names (combines single and multiple).
 */
export function getDisplayProjects(task: Task): string[] {
	const projects: string[] = [];

	if (task.project) {
		projects.push(task.project);
	}
	if (task.projectName) {
		projects.push(task.projectName);
	}

	// Add unique project IDs
	for (const projectId of task.projectIds) {
		if (!projects.includes(projectId)) {
			projects.push(projectId);
		}
	}

	return projects;
}

/**
 * Get display group names (combines single and multiple).
 */
export function getDisplayGroups(task: Task): string[] {
	const groups: string[] = [];

	if (task.group) {
		groups.push(task.group);
	}

	// Add unique group IDs
	for (const groupId of task.groupIds) {
		if (!groups.includes(groupId)) {
			groups.push(groupId);
		}
	}

	return groups;
}
