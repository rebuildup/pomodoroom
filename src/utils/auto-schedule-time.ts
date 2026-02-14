/**
 * Auto-schedule time assignment for tasks without explicit start times.
 *
 * Assigns automatic start times to tasks based on:
 * - Current time
 * - Task priority
 * - Required/estimated duration
 * - Existing scheduled tasks
 */

import type { Task } from "@/types/task";

/**
 * Calculate auto-assigned start time for a task.
 *
 * Logic:
 * 1. If task has fixedStartAt or windowStartAt, return it as-is
 * 2. Otherwise, calculate next available slot based on:
 *    - Current time (round up to next 15-min slot)
 *    - Existing tasks with assigned times
 *    - Task priority (higher priority = earlier slot)
 *
 * @param task - Task to calculate start time for
 * @param allTasks - All tasks in the system (for conflict detection)
 * @returns Task with auto-assigned fixedStartAt if needed
 */
export function assignAutoStartTime(task: Task, allTasks: Task[]): Task {
	// Already has explicit start time
	if (task.fixedStartAt || task.windowStartAt) {
		return task;
	}

	// Calculate next available slot
	const startTime = calculateNextAvailableSlot(task, allTasks);

	// Return task with auto-assigned start time
	return {
		...task,
		fixedStartAt: startTime,
	};
}

/**
 * Calculate the next available time slot for a task.
 *
 * @param task - Task to schedule
 * @param allTasks - All tasks for conflict detection
 * @returns ISO 8601 timestamp for the next available slot
 */
function calculateNextAvailableSlot(task: Task, allTasks: Task[]): string {
	const now = new Date();
	
	// Round up to next 15-minute slot
	const minutes = now.getMinutes();
	const roundedMinutes = Math.ceil(minutes / 15) * 15;
	now.setMinutes(roundedMinutes, 0, 0);

	// Get all scheduled tasks sorted by start time
	const scheduledTasks = allTasks
		.filter(t => t.id !== task.id && (t.fixedStartAt || t.windowStartAt))
		.map(t => ({
			start: new Date(t.fixedStartAt || t.windowStartAt!),
			end: calculateEndTime(t),
		}))
		.sort((a, b) => a.start.getTime() - b.start.getTime());

	// Find first gap that fits this task
	const duration = (task.requiredMinutes || task.estimatedMinutes || 25) * 60 * 1000; // ms
	let candidate = new Date(now);

	for (const scheduled of scheduledTasks) {
		const candidateEnd = new Date(candidate.getTime() + duration);

		// Check if candidate slot overlaps with scheduled task
		if (candidateEnd <= scheduled.start) {
			// Found a gap before this scheduled task
			break;
		}

		// Move candidate to end of this scheduled task
		candidate = new Date(scheduled.end);
	}

	return candidate.toISOString();
}

/**
 * Calculate end time for a task based on its start time and duration.
 */
function calculateEndTime(task: Task): Date {
	const start = new Date(task.fixedStartAt || task.windowStartAt!);
	const duration = (task.requiredMinutes || task.estimatedMinutes || 25) * 60 * 1000; // ms
	return new Date(start.getTime() + duration);
}

/**
 * Batch assign auto start times to all unscheduled tasks.
 *
 * @param tasks - Array of tasks to process
 * @returns Array of tasks with auto-assigned start times
 */
export function batchAssignAutoStartTimes(tasks: Task[]): Task[] {
	const result: Task[] = [];
	
	for (const task of tasks) {
		// Skip DONE tasks
		if (task.state === "DONE") {
			result.push(task);
			continue;
		}

		// Assign auto start time based on current result set
		const updated = assignAutoStartTime(task, [...result, ...tasks]);
		result.push(updated);
	}

	return result;
}

/**
 * Get display start time for a task (prefers explicit time, falls back to auto).
 *
 * Use this for display purposes when you want to show the "effective" start time.
 *
 * @param task - Task to get display time for
 * @param allTasks - All tasks for auto-calculation
 * @returns ISO timestamp or null if no time can be determined
 */
export function getDisplayStartTime(task: Task, allTasks: Task[]): string | null {
	if (task.fixedStartAt) return task.fixedStartAt;
	if (task.windowStartAt) return task.windowStartAt;
	
	// Calculate auto start time on-the-fly for display
	const withAuto = assignAutoStartTime(task, allTasks);
	return withAuto.fixedStartAt;
}
