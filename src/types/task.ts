/**
 * Task types for v2 redesign.
 *
 * Extends schedule.Task with additional properties for
 * Anchor/Ambient model and Pressure calculation.
 */

import type { TaskState } from "./task-state";

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
 */
export interface Task {
	id: string;
	title: string;
	description?: string;
	state: TaskState;
	estimatedMinutes: number | null;
	elapsedMinutes: number;
	project: string | null;
	group: string | null;
	tags: string[];
	energy: EnergyLevel;
	priority: number; // 0 = flat, negative = deferred
	createdAt: string; // ISO 8601
	updatedAt: string;
	completedAt: string | null;
	pausedAt: string | null; // For ambient display

	// Legacy fields for schedule.Task compatibility
	estimatedPomodoros: number;
	completedPomodoros: number;
	completed: boolean;
	projectId?: string;
	category: "active" | "someday";
}

/**
 * Create a new task with default values.
 */
export function createTask(props: Omit<Task, "id" | "state" | "elapsedMinutes" | "priority" | "createdAt" | "updatedAt" | "completedAt" | "pausedAt" | "estimatedPomodoros" | "completedPomodoros" | "completed" | "category">): Task {
	const now = new Date().toISOString();
	const estimatedMins = props.estimatedMinutes ?? 25;

	return {
		...props,
		id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		state: "READY",
		elapsedMinutes: 0,
		priority: 0,
		createdAt: now,
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
		// Legacy fields
		estimatedPomodoros: Math.ceil(estimatedMins / 25),
		completedPomodoros: 0,
		completed: false,
		category: "active",
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
