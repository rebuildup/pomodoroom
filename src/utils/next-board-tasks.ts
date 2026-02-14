import type { Task } from "@/types/task";
import { recalculateEstimatedStarts } from "@/utils/auto-schedule-time";

function toStartMs(task: Task): number {
	const start = task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt;
	if (!start) return Number.MAX_SAFE_INTEGER;
	const parsed = Date.parse(start);
	return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export function selectDueScheduledTask(tasks: Task[], nowMs: number = Date.now()): Task | null {
	const candidates = tasks
		.filter((t) => (t.state === "READY" || t.state === "PAUSED"))
		.map((t) => ({ task: t, startMs: toStartMs(t) }))
		.filter((x) => x.startMs !== Number.MAX_SAFE_INTEGER && x.startMs <= nowMs)
		.sort((a, b) => a.startMs - b.startMs);

	return candidates[0]?.task ?? null;
}

export function selectNextBoardTasks(tasks: Task[], limit = 3): Task[] {
	const nowMs = Date.now();
	const candidates = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED");
	const recalculated = recalculateEstimatedStarts(candidates);

	return [...recalculated]
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
