import type { ScheduleBlock } from "@/types/schedule";

export interface ImpactedWindow {
	startTime: string;
	endTime: string;
}

export interface ReplanDiffItem {
	id: string;
	type: "added" | "removed" | "updated";
	before?: ScheduleBlock;
	after?: ScheduleBlock;
}

function toMs(iso: string): number {
	return new Date(iso).getTime();
}

function withPadding(ms: number, minutes: number): number {
	return ms + minutes * 60 * 1000;
}

function blockInWindow(block: ScheduleBlock, window: ImpactedWindow): boolean {
	const start = toMs(block.startTime);
	const end = toMs(block.endTime);
	const windowStart = toMs(window.startTime);
	const windowEnd = toMs(window.endTime);
	return start < windowEnd && end > windowStart;
}

function sameBlockShape(a: ScheduleBlock, b: ScheduleBlock): boolean {
	return (
		a.startTime === b.startTime &&
		a.endTime === b.endTime &&
		a.blockType === b.blockType &&
		(a.taskId ?? null) === (b.taskId ?? null) &&
		(a.label ?? null) === (b.label ?? null) &&
		(a.lane ?? 0) === (b.lane ?? 0)
	);
}

export function detectImpactedWindowFromCalendarDelta(
	previousEvents: ScheduleBlock[],
	nextEvents: ScheduleBlock[],
	paddingMinutes = 15,
): ImpactedWindow | null {
	const previousById = new Map(previousEvents.map((event) => [event.id, event]));
	const nextById = new Map(nextEvents.map((event) => [event.id, event]));
	const ids = new Set([...previousById.keys(), ...nextById.keys()]);

	let minStart = Number.POSITIVE_INFINITY;
	let maxEnd = Number.NEGATIVE_INFINITY;
	let changed = false;

	for (const id of ids) {
		const before = previousById.get(id);
		const after = nextById.get(id);
		if (!before || !after) {
			const edge = before ?? after;
			if (edge) {
				minStart = Math.min(minStart, toMs(edge.startTime));
				maxEnd = Math.max(maxEnd, toMs(edge.endTime));
				changed = true;
			}
			continue;
		}

		if (!sameBlockShape(before, after)) {
			minStart = Math.min(minStart, toMs(before.startTime), toMs(after.startTime));
			maxEnd = Math.max(maxEnd, toMs(before.endTime), toMs(after.endTime));
			changed = true;
		}
	}

	if (!changed) {
		return null;
	}

	return {
		startTime: new Date(withPadding(minStart, -paddingMinutes)).toISOString(),
		endTime: new Date(withPadding(maxEnd, paddingMinutes)).toISOString(),
	};
}

export function mergeLocalReplan(
	currentBlocks: ScheduleBlock[],
	replannedBlocks: ScheduleBlock[],
	window: ImpactedWindow,
): ScheduleBlock[] {
	const preserved = currentBlocks
		.filter((block) => !blockInWindow(block, window))
		.map((block) => ({ ...block, locked: true }));

	const localReplanned = replannedBlocks.filter((block) => blockInWindow(block, window));

	return [...preserved, ...localReplanned].sort((a, b) => toMs(a.startTime) - toMs(b.startTime));
}

export function buildReplanDiff(
	beforeBlocks: ScheduleBlock[],
	afterBlocks: ScheduleBlock[],
	window: ImpactedWindow,
): ReplanDiffItem[] {
	const beforeWindow = beforeBlocks.filter((block) => blockInWindow(block, window));
	const afterWindow = afterBlocks.filter((block) => blockInWindow(block, window));
	const beforeById = new Map(beforeWindow.map((block) => [block.id, block]));
	const afterById = new Map(afterWindow.map((block) => [block.id, block]));
	const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
	const diff: ReplanDiffItem[] = [];

	for (const id of ids) {
		const before = beforeById.get(id);
		const after = afterById.get(id);

		if (!before && after) {
			diff.push({ id, type: "added", after });
			continue;
		}
		if (before && !after) {
			diff.push({ id, type: "removed", before });
			continue;
		}
		if (before && after && !sameBlockShape(before, after)) {
			diff.push({ id, type: "updated", before, after });
		}
	}

	return diff;
}

export function calculateChurnOutsideWindow(
	beforeBlocks: ScheduleBlock[],
	afterBlocks: ScheduleBlock[],
	window: ImpactedWindow,
): number {
	const beforeOutside = beforeBlocks.filter((block) => !blockInWindow(block, window));
	const afterOutside = afterBlocks.filter((block) => !blockInWindow(block, window));
	const beforeById = new Map(beforeOutside.map((block) => [block.id, block]));
	const afterById = new Map(afterOutside.map((block) => [block.id, block]));
	const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
	let churn = 0;

	for (const id of ids) {
		const before = beforeById.get(id);
		const after = afterById.get(id);
		if (!before || !after || !sameBlockShape(before, after)) {
			churn += 1;
		}
	}

	return churn;
}
