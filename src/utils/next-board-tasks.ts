import type { Task } from "@/types/task";

function toStartMs(task: Task): number {
	const start = task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt;
	if (!start) return Number.MAX_SAFE_INTEGER;
	const parsed = Date.parse(start);
	return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function toEndMs(task: Task): number | null {
	const explicitEnd = task.fixedEndAt ?? task.windowEndAt;
	if (explicitEnd) {
		const parsed = Date.parse(explicitEnd);
		return Number.isNaN(parsed) ? null : parsed;
	}

	const start = task.fixedStartAt ?? task.windowStartAt;
	if (!start) return null;
	const startMs = Date.parse(start);
	if (Number.isNaN(startMs)) return null;
	const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;
	return startMs + durationMs;
}

/**
 * Check if a task is a synthetic split segment (focus blocks split for scheduling).
 * Returns true ONLY for auto-split-focus segments, NOT for breaks.
 * Breaks should be visible in the task board as they represent real scheduled time.
 */
function isSyntheticGuidanceTask(task: Task): boolean {
	// Only filter out auto-split focus segments
	// Breaks (kind === "break") should be shown as they are real scheduled activities
	return task.tags.includes("auto-split-focus");
}

function isExpiredScheduledTask(task: Task, nowMs: number): boolean {
	const hasExplicitSchedule = Boolean(task.fixedStartAt || task.windowStartAt);
	if (!hasExplicitSchedule) return false;

	const endMs = toEndMs(task);
	return endMs !== null && endMs < nowMs;
}

/**
 * Create a stable cache key for task scheduling data.
 * Only includes properties that affect scheduling calculation.
 */
export function createSchedulingCacheKey(tasks: Task[]): string {
	// Extract only scheduling-relevant properties for cache key
	const schedulingProps = tasks
		.filter((t) => t.state === "READY" || t.state === "PAUSED")
		.map((t) => ({
			id: t.id,
			state: t.state,
			fixedStartAt: t.fixedStartAt,
			fixedEndAt: t.fixedEndAt,
			windowStartAt: t.windowStartAt,
			windowEndAt: t.windowEndAt,
			estimatedStartAt: t.estimatedStartAt,
			requiredMinutes: t.requiredMinutes,
			kind: t.kind,
			priority: t.priority,
			tags: t.tags.slice().sort(),
		}));

	// Create a simple hash of the sorted array
	const json = JSON.stringify(schedulingProps);
	let hash = 0;
	for (let i = 0; i < json.length; i++) {
		const char = json.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return String(hash);
}

/**
 * Clear the projected tasks cache.
 * Call this when tasks are modified to force recalculation.
 */
export function clearProjectedTasksCache(): void {
	// No-op - cache removed
}

export function selectDueScheduledTask(tasks: Task[], nowMs: number = Date.now()): Task | null {
	const candidates = tasks
		.filter((t) => t.state === "READY" || t.state === "PAUSED")
		.filter((t) => !isExpiredScheduledTask(t, nowMs))
		.map((t) => ({ task: t, startMs: toStartMs(t) }))
		.filter((x) => x.startMs !== Number.MAX_SAFE_INTEGER && x.startMs <= nowMs)
		.sort((a, b) => a.startMs - b.startMs);

	return candidates[0]?.task ?? null;
}

export function selectNextBoardTasks(tasks: Task[], limit = 5): Task[] {
	const nowMs = Date.now();
	const candidates = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED");

	// If no candidates at all, return empty
	if (candidates.length === 0) {
		return [];
	}

	// Use raw candidates (same as notification timer) for consistent scheduling
	// Filter out synthetic tasks and expired scheduled tasks
	const sourceTasks = candidates
		.filter((task) => !isSyntheticGuidanceTask(task))
		.filter((task) => !isExpiredScheduledTask(task, nowMs));

	// Sort to show future tasks first, then past/overdue tasks
	return [...sourceTasks]
		.sort((a, b) => {
			const aMs = toStartMs(a);
			const bMs = toStartMs(b);
			const aIsFuture = aMs >= nowMs;
			const bIsFuture = bMs >= nowMs;

			// Future tasks come before past tasks
			if (aIsFuture && !bIsFuture) return -1;
			if (!aIsFuture && bIsFuture) return 1;

			// Within same group (both future or both past), sort by time
			return aMs - bMs;
		})
		.slice(0, limit);
}

/**
 * Get the start time of the next upcoming task from the raw task list.
 * Unified with notification timer logic - uses same filtering as selectNextBoardTasks.
 */
export function getNextProjectedTaskStartMs(
	tasks: Task[],
	nowMs: number = Date.now(),
): number | null {
	const candidates = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED");

	// Find the earliest future task (same logic as notification timer)
	for (const task of candidates) {
		if (isSyntheticGuidanceTask(task) || isExpiredScheduledTask(task, nowMs)) {
			continue;
		}
		const startMs = toStartMs(task);
		if (startMs !== Number.MAX_SAFE_INTEGER && startMs > nowMs) {
			return startMs;
		}
	}

	return null;
}
