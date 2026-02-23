import type { Task } from "@/types/task";
import { buildProjectedTasksWithAutoBreaks } from "@/utils/auto-schedule-time";

function toStartMs(task: Task): number {
	const start = task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt;
	if (!start) return Number.MAX_SAFE_INTEGER;
	const parsed = Date.parse(start);
	return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
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

// Cache for projected tasks
interface CacheEntry {
	key: string;
	tasks: Task[];
	timestamp: number;
}
let projectedCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Get cached projected tasks or compute new ones.
 * Uses a simple memoization with TTL.
 */
function getCachedProjectedTasks(candidates: Task[]): Task[] {
	const key = createSchedulingCacheKey(candidates);
	const now = Date.now();

	// Return cached result if valid
	if (projectedCache && projectedCache.key === key && now - projectedCache.timestamp < CACHE_TTL_MS) {
		return projectedCache.tasks;
	}

	// Compute new result
	const projected = buildProjectedTasksWithAutoBreaks(candidates);
	projectedCache = { key, tasks: projected, timestamp: now };
	return projected;
}

/**
 * Clear the projected tasks cache.
 * Call this when tasks are modified to force recalculation.
 */
export function clearProjectedTasksCache(): void {
	projectedCache = null;
}

export function selectDueScheduledTask(tasks: Task[], nowMs: number = Date.now()): Task | null {
	const candidates = tasks
		.filter((t) => t.state === "READY" || t.state === "PAUSED")
		.map((t) => ({ task: t, startMs: toStartMs(t) }))
		.filter((x) => x.startMs !== Number.MAX_SAFE_INTEGER && x.startMs <= nowMs)
		.sort((a, b) => a.startMs - b.startMs);

	return candidates[0]?.task ?? null;
}

export function selectNextBoardTasks(tasks: Task[], limit = 3): Task[] {
	const nowMs = Date.now();
	const candidates = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED");

	// Use cached projected tasks for better performance
	// buildProjectedTasksWithAutoBreaks returns tasks sorted by time with breaks in correct order
	const projected = getCachedProjectedTasks(candidates);

	// Sort to show future tasks first, then past/overdue tasks
	// Within each group, preserve the time order (including breaks in their proper positions)
	return [...projected]
		.sort((a, b) => {
			const aMs = toStartMs(a);
			const bMs = toStartMs(b);
			const aIsFuture = aMs >= nowMs;
			const bIsFuture = bMs >= nowMs;

			// Future tasks come before past tasks
			if (aIsFuture && !bIsFuture) return -1;
			if (!aIsFuture && bIsFuture) return 1;

			// Within same group (both future or both past), sort by time
			// This preserves break order since breaks are at specific times
			return aMs - bMs;
		})
		.slice(0, limit);
}

/**
 * Get the start time of the next upcoming task from the full projected list.
 * This should be used for countdown calculations, not selectNextBoardTasks
 * which is limited to a small number for display purposes.
 */
export function getNextProjectedTaskStartMs(tasks: Task[], nowMs: number = Date.now()): number | null {
	const candidates = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED");
	const projected = getCachedProjectedTasks(candidates);

	// Find the earliest future task (including breaks)
	for (const task of projected) {
		const startMs = toStartMs(task);
		if (startMs !== Number.MAX_SAFE_INTEGER && startMs > nowMs) {
			return startMs;
		}
	}

	return null;
}
