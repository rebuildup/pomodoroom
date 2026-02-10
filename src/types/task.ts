/**
 * Task types for v2 redesign.
 *
 * Extends schedule.Task with additional properties for
 * Anchor/Ambient model and Pressure calculation.
 */

import type { TaskState } from "./task-state";
import type { Task as ScheduleTask } from "./schedule";

/**
 * Energy level for task scheduling.
 */
export type EnergyLevel = "low" | "medium" | "high";

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
 * - estimatedMinutes / elapsedMinutes (time tracking)
 * - energy (for scheduling)
 * - updatedAt / completedAt / pausedAt (timestamps)
 * - project / group as string | null (vs projectId)
 */
export interface Task extends Omit<ScheduleTask, "priority" | "projectId"> {
	/** Estimated duration in minutes (null if not set) */
	estimatedMinutes: number | null;
	/** Elapsed time in minutes */
	elapsedMinutes: number;
	/** Project name (null if not set) - replaces projectId from schedule.Task */
	project: string | null;
	/** Group name for task grouping */
	group: string | null;
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
}

/**
 * Create a new task with default values.
 *
 * Note: Since Task extends ScheduleTask, we need to provide all ScheduleTask fields.
 * The estimatedPomodoros is calculated from estimatedMinutes (1 pomodoro = 25 min).
 */
export function createTask(
	props: Omit<Task, "id" | "state" | "elapsedMinutes" | "priority" | "createdAt" | "updatedAt" | "completedAt" | "pausedAt" | "estimatedPomodoros" | "completedPomodoros" | "completed" | "category">
): Task {
	const now = new Date().toISOString();
	const estimatedMins = props.estimatedMinutes ?? 25;
	const estimatedPomodoros = Math.ceil(estimatedMins / 25);

	return {
		// Schedule.Task fields (required by base interface)
		id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		title: props.title,
		description: props.description,
		estimatedPomodoros,
		completedPomodoros: 0,
		completed: false,
		state: "READY",
		projectId: props.project ?? undefined,
		tags: props.tags ?? [],
		priority: null, // Default priority (null = use default of 50)
		category: "active",
		createdAt: now,
		// Task-specific fields
		estimatedMinutes: props.estimatedMinutes ?? null,
		elapsedMinutes: 0,
		project: props.project ?? null,
		group: props.group ?? null,
		energy: props.energy ?? "medium",
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
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
 * Type guard to check if a task is a v2 Task (has estimatedMinutes).
 */
export function isV2Task(task: ScheduleTask | Task): task is Task {
	return "estimatedMinutes" in task && "elapsedMinutes" in task;
}

/**
 * Convert ScheduleTask to v2 Task format.
 * Useful for backward compatibility with existing components using ScheduleTask.
 */
export function scheduleTaskToV2Task(scheduleTask: ScheduleTask): Task {
	return {
		...scheduleTask,
		// Additional v2 fields
		estimatedMinutes: scheduleTask.estimatedPomodoros * 25,
		elapsedMinutes: 0,
		project: scheduleTask.projectId ?? null,
		group: null,
		energy: "medium",
		priority: scheduleTask.priority,
		updatedAt: scheduleTask.createdAt,
		completedAt: scheduleTask.completed ? new Date().toISOString() : null,
		pausedAt: null,
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
		projectId: v2Task.project ?? undefined,
		tags: v2Task.tags,
		priority: v2Task.priority ?? 50,
		category: v2Task.category,
		createdAt: v2Task.createdAt,
	};
}
