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
		.filter((t) => t.state === "READY" || t.state === "PAUSED" || t.state === "DONE")
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
		.filter((t) => (t.state === "READY" || t.state === "PAUSED" || t.state === "DONE"))
		.map((t) => ({ task: t, startMs: toStartMs(t) }))
		.filter((x) => x.startMs !== Number.MAX_SAFE_INTEGER && x.startMs <= nowMs)
		.sort((a, b) => a.startMs - b.startMs);

	return candidates[0]?.task ?? null;
}

export function selectNextBoardTasks(tasks: Task[], limit = 3): Task[] {
	const nowMs = Date.now();
	const candidates = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED" || t.state === "DONE");

	// Use cached projected tasks for better performance
	const projected = getCachedProjectedTasks(candidates);

	return [...projected]
		.sort((a, b) => {
			const aMs = toStartMs(a);
			const bMs = toStartMs(b);
			const aPast = aMs < nowMs ? 1 : 0;
			const bPast = bMs < nowMs ? 1 : 0;
			if (aPast !== bPast) return aPast - bPast;
			if (aMs !== bMs) return aMs - bMs;
			const aPriority = a.priority ?? 50;
			const bPriority = b.priority ?? 50;
			if (aPriority !== bPriority) return bPriority - aPriority;
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		})
		.slice(0, limit);
}
