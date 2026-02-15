import type { Task } from "@/types/task";

const STORAGE_KEY = "pomodoroom-focus-ramp-adaptation";

export type FocusRampResetPolicy = "daily" | "never";

export interface FocusRampState {
	stageOffset: number;
	lastUpdatedDate: string;
	resetPolicy: FocusRampResetPolicy;
}

interface FocusRampBandOptions {
	upshiftThreshold?: number;
	downshiftThreshold?: number;
	minOffset?: number;
	maxOffset?: number;
}

interface AdaptiveStageOptions {
	enabled?: boolean;
	resetPolicy?: FocusRampResetPolicy;
	baseStageIndex: number;
	maxStageIndex: number;
	sampleSize?: number;
	todayDate?: string;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function nowDateKey(): string {
	return new Date().toISOString().slice(0, 10);
}

function isFocusCandidate(task: Task): boolean {
	if (task.kind === "break") return false;
	if (task.kind === "fixed_event") return false;
	return true;
}

function toSortTimestamp(task: Task): number {
	const raw =
		task.completedAt ??
		task.fixedStartAt ??
		task.windowStartAt ??
		task.estimatedStartAt ??
		task.updatedAt ??
		task.createdAt;
	if (!raw) return 0;
	const parsed = Date.parse(raw);
	return Number.isNaN(parsed) ? 0 : parsed;
}

export function deriveRecentCompletionRate(tasks: Task[], sampleSize = 10): number | null {
	const recent = [...tasks]
		.filter(isFocusCandidate)
		.sort((a, b) => toSortTimestamp(b) - toSortTimestamp(a))
		.slice(0, sampleSize);

	if (recent.length === 0) return null;
	const completedCount = recent.filter((task) => task.state === "DONE" || task.completed).length;
	return completedCount / recent.length;
}

export function applyCompletionRateToStageOffset(
	currentOffset: number,
	completionRate: number,
	options: FocusRampBandOptions = {},
): number {
	const upshiftThreshold = options.upshiftThreshold ?? 0.8;
	const downshiftThreshold = options.downshiftThreshold ?? 0.5;
	const minOffset = options.minOffset ?? -4;
	const maxOffset = options.maxOffset ?? 4;

	if (completionRate >= upshiftThreshold) {
		return clamp(currentOffset + 1, minOffset, maxOffset);
	}
	if (completionRate <= downshiftThreshold) {
		return clamp(currentOffset - 1, minOffset, maxOffset);
	}
	return clamp(currentOffset, minOffset, maxOffset);
}

export function loadFocusRampState(
	resetPolicy: FocusRampResetPolicy,
	todayDate: string = nowDateKey(),
): FocusRampState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return { stageOffset: 0, lastUpdatedDate: todayDate, resetPolicy };
		}
		const parsed = JSON.parse(raw) as Partial<FocusRampState>;
		const state: FocusRampState = {
			stageOffset: Number(parsed.stageOffset ?? 0),
			lastUpdatedDate: parsed.lastUpdatedDate ?? todayDate,
			resetPolicy: (parsed.resetPolicy as FocusRampResetPolicy) ?? resetPolicy,
		};

		if (resetPolicy === "daily" && state.lastUpdatedDate !== todayDate) {
			return { stageOffset: 0, lastUpdatedDate: todayDate, resetPolicy };
		}
		return state;
	} catch {
		return { stageOffset: 0, lastUpdatedDate: todayDate, resetPolicy };
	}
}

export function saveFocusRampState(state: FocusRampState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage failures in private mode / restricted environments.
	}
}

export function getAdaptiveFocusStageIndex(
	tasks: Task[],
	options: AdaptiveStageOptions,
): number {
	const enabled = options.enabled ?? true;
	if (!enabled) return clamp(options.baseStageIndex, 0, options.maxStageIndex);

	const resetPolicy = options.resetPolicy ?? "daily";
	const todayDate = options.todayDate ?? nowDateKey();
	const sampleSize = options.sampleSize ?? 10;

	const state = loadFocusRampState(resetPolicy, todayDate);
	const completionRate = deriveRecentCompletionRate(tasks, sampleSize);
	const nextOffset =
		completionRate === null
			? state.stageOffset
			: applyCompletionRateToStageOffset(state.stageOffset, completionRate, {
				minOffset: -options.maxStageIndex,
				maxOffset: options.maxStageIndex,
			});

	saveFocusRampState({
		stageOffset: nextOffset,
		lastUpdatedDate: todayDate,
		resetPolicy,
	});

	return clamp(options.baseStageIndex + nextOffset, 0, options.maxStageIndex);
}
