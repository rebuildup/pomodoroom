import type { Task } from "@/types/task";

function toStartMs(task: Task): number | null {
	const value = task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt;
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Get the start time of the next upcoming task.
 * Only returns tasks scheduled in the future (not past overdue tasks).
 * Overdue tasks should be shown in pressure/next sections, not as countdown targets.
 */
export function getNextTaskStartMs(tasks: Task[], nowMs: number = Date.now()): number | null {
	const hasActiveRunningTask = tasks.some(
		(task) => task.state === "RUNNING" && task.kind !== "break" && !task.completed,
	);
	if (hasActiveRunningTask) {
		return null;
	}

	const candidates = tasks
		.filter((task) => task.state === "READY" || task.state === "PAUSED")
		.map(toStartMs)
		.filter((ms): ms is number => ms !== null);

	if (candidates.length === 0) return null;

	// Only consider future tasks for countdown
	const upcoming = candidates.filter((ms) => ms >= nowMs).sort((a, b) => a - b);

	// If no future tasks, return null (no countdown needed)
	// Past tasks are "overdue" and should be shown elsewhere, not as countdown
	if (upcoming.length === 0) return null;

	return upcoming[0] ?? null;
}

export function getNextTaskCountdownMs(tasks: Task[], nowMs: number = Date.now()): number {
	const nextStartMs = getNextTaskStartMs(tasks, nowMs);
	if (nextStartMs === null) return 0;
	return Math.max(0, nextStartMs - nowMs);
}
