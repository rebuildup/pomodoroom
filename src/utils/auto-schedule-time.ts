/**
 * Auto-schedule time assignment for tasks without explicit start times.
 *
 * Assigns automatic estimatedStartAt to tasks based on:
 * - Current time
 * - Required duration (requiredMinutes)
 * - Existing explicit scheduled tasks (fixed/window)
 */

import type { Task } from "@/types/task";

/**
 * Returns true if the task has explicit scheduling info and must not move.
 */
function isLockedTask(task: Task): boolean {
	return Boolean(task.fixedStartAt || task.windowStartAt);
}

/**
 * Round date up to the next 15-minute boundary.
 */
function roundUpToQuarterHour(date: Date): Date {
	const rounded = new Date(date);
	const minutes = rounded.getMinutes();
	const roundedMinutes = Math.ceil(minutes / 15) * 15;
	if (roundedMinutes === 60) {
		rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
		return rounded;
	}
	rounded.setMinutes(roundedMinutes, 0, 0);
	return rounded;
}

/**
 * Calculate duration minutes for scheduling.
 */
function durationMinutes(task: Task): number {
	return Math.max(1, task.requiredMinutes ?? 25);
}

/**
 * Recalculate estimatedStartAt across all tasks.
 *
 * Rules:
 * - Locked tasks (fixed/window) never move.
 * - Only READY/PAUSED tasks are recalculated.
 * - RUNNING/DONE are preserved.
 */
export function recalculateEstimatedStarts(tasks: Task[]): Task[] {
	const anchors = tasks
		.filter((t) => isLockedTask(t))
		.map((t) => {
			const startIso = t.fixedStartAt ?? t.windowStartAt;
			if (!startIso) return null;
			const start = new Date(startIso);
			const explicitEndIso = t.fixedEndAt ?? t.windowEndAt;
			const end = explicitEndIso
				? new Date(explicitEndIso)
				: new Date(start.getTime() + durationMinutes(t) * 60_000);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
			return {
				start,
				end,
			};
		})
		.filter((v): v is { start: Date; end: Date } => v !== null)
		.sort((a, b) => a.start.getTime() - b.start.getTime());

	const updated = [...tasks];
	const now = roundUpToQuarterHour(new Date());
	let cursor = new Date(now);

	const indexById = new Map(updated.map((t, i) => [t.id, i]));

	const movable = updated.filter(
		(t) => !isLockedTask(t) && (t.state === "READY" || t.state === "PAUSED"),
	);
	for (const task of movable) {
		const minutes = durationMinutes(task);
		let candidate = new Date(cursor);

		for (const anchor of anchors) {
			const candidateEnd = new Date(candidate.getTime() + minutes * 60_000);
			if (candidateEnd <= anchor.start) {
				break;
			}
			if (candidate < anchor.end) {
				candidate = new Date(anchor.end);
			}
		}

		const idx = indexById.get(task.id);
		if (idx !== undefined) {
			updated[idx] = {
				...updated[idx],
				estimatedStartAt: candidate.toISOString(),
			};
		}
		cursor = new Date(candidate.getTime() + minutes * 60_000);
	}

	return updated;
}

/**
 * Get display start time for a task.
 *
 * Priority: fixedStartAt > windowStartAt > estimatedStartAt > on-the-fly recompute.
 */
export function getDisplayStartTime(task: Task, allTasks: Task[]): string | null {
	if (task.fixedStartAt) return task.fixedStartAt;
	if (task.windowStartAt) return task.windowStartAt;
	if (task.estimatedStartAt) return task.estimatedStartAt;

	const recalculated = recalculateEstimatedStarts(allTasks);
	return recalculated.find((t) => t.id === task.id)?.estimatedStartAt ?? null;
}

// Backward-compat alias
export const batchAssignAutoStartTimes = recalculateEstimatedStarts;
