import type { Task } from "@/types/task";

function toStartMs(task: Task): number | null {
	const value = task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt;
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

export function getNextTaskStartMs(tasks: Task[], nowMs: number = Date.now()): number | null {
	const candidates = tasks
		.filter((task) => task.state === "READY" || task.state === "PAUSED")
		.map(toStartMs)
		.filter((ms): ms is number => ms !== null);

	if (candidates.length === 0) return null;

	const upcoming = candidates.filter((ms) => ms >= nowMs).sort((a, b) => a - b);
	if (upcoming.length > 0) return upcoming[0] ?? null;

	return candidates.sort((a, b) => a - b)[0] ?? null;
}

export function getNextTaskCountdownMs(tasks: Task[], nowMs: number = Date.now()): number {
	const nextStartMs = getNextTaskStartMs(tasks, nowMs);
	if (nextStartMs === null) return 0;
	return Math.max(0, nextStartMs - nowMs);
}

