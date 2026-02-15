/**
 * Auto-schedule time assignment for tasks without explicit start times.
 *
 * Assigns automatic estimatedStartAt to tasks based on:
 * - Current time
 * - Required duration (requiredMinutes)
 * - Existing explicit scheduled tasks (fixed/window)
 */

import type { Task } from "@/types/task";
import { getAdaptiveFocusStageIndex, type FocusRampResetPolicy } from "@/utils/focus-ramp-adaptation";
import { applyOverfocusCooldown } from "@/utils/overfocus-guard";

const MIN_BREAK_MINUTES = 5;
const MAX_BREAK_MINUTES = 25;
const BREAK_RATIO = 0.2;
const STREAK_BONUS_MINUTES = 2;
const STREAK_RESET_GAP_MINUTES = 40;
const PROGRESSIVE_FOCUS_MINUTES = [15, 30, 45, 60, 75] as const;
const PROGRESSIVE_BREAK_MINUTES = [5, 5, 5, 5, 30] as const;
const RESET_TAGS = new Set([
	"reset_focus",
	"context_switch",
	"interrupt",
	"interruption",
	"meeting",
	"会議",
]);

interface BuildProjectedOptions {
	focusRamp?: {
		enabled?: boolean;
		resetPolicy?: FocusRampResetPolicy;
	};
	overfocusGuard?: {
		enabled?: boolean;
		threshold?: number;
		minCooldownMinutes?: number;
		overrideAcknowledged?: boolean;
		overrideReason?: string;
	};
}

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

function getScheduledStart(task: Task): Date | null {
	const startIso = task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt;
	if (!startIso) return null;
	const start = new Date(startIso);
	return Number.isNaN(start.getTime()) ? null : start;
}

function isResetTask(task: Task): boolean {
	if (task.kind === "fixed_event") return true;
	return task.tags.some((tag) => RESET_TAGS.has(tag.toLowerCase()));
}

function recommendBreakMinutes(task: Task, availableGapMin: number, streakLevel: number): number {
	const base = Math.max(MIN_BREAK_MINUTES, Math.round(durationMinutes(task) * BREAK_RATIO));
	const bonus = Math.max(0, streakLevel - 1) * STREAK_BONUS_MINUTES;
	return Math.min(Math.max(base + bonus, MIN_BREAK_MINUTES), MAX_BREAK_MINUTES, availableGapMin);
}

function toStartTimestamp(task: Task): number {
	const start = getScheduledStart(task);
	return start ? start.getTime() : Number.MAX_SAFE_INTEGER;
}

function stageValue(
	sequence: readonly number[],
	stageIndex: number,
): number {
	const idx = Math.min(stageIndex, sequence.length - 1);
	return sequence[idx] ?? sequence[sequence.length - 1] ?? 25;
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
 * Build projected task list including synthetic break tasks.
 *
 * Break tasks are generated from scheduled task gaps and are not persisted.
 * They exist only for guidance board/task recommendation displays.
 * DONE tasks are included as-is without auto-split or break insertion.
 */
export function buildProjectedTasksWithAutoBreaks(tasks: Task[], options: BuildProjectedOptions = {}): Task[] {
	const recalculated = recalculateEstimatedStarts(tasks);
	const overfocusEnabled = options.overfocusGuard?.enabled ?? false;
	const overfocusThreshold = options.overfocusGuard?.threshold ?? 4;
	const overfocusMinCooldown = options.overfocusGuard?.minCooldownMinutes ?? 15;
	const overfocusOverrideAck = options.overfocusGuard?.overrideAcknowledged ?? false;
	const overfocusOverrideReason = options.overfocusGuard?.overrideReason ?? "explicit-acknowledgement";

	// Separate DONE tasks from READY/PAUSED tasks
	const doneTasks = recalculated.filter((task) => task.state === "DONE" && task.kind !== "break");
	const activeScheduled = recalculated
		.filter((task) => (task.state === "READY" || task.state === "PAUSED") && task.kind !== "break")
		.map((task) => {
			const start = getScheduledStart(task);
			if (!start) return null;
			const end = new Date(start.getTime() + durationMinutes(task) * 60_000);
			return { task, start, end };
		})
		.filter((entry): entry is { task: Task; start: Date; end: Date } => entry !== null)
		.sort((a, b) => a.start.getTime() - b.start.getTime());

	if (activeScheduled.length === 0) {
		return recalculated;
	}

	const scheduledIds = new Set(activeScheduled.map((entry) => entry.task.id));
	const unscheduled = recalculated.filter((task) => !scheduledIds.has(task.id) && task.state !== "DONE");

	const nowIso = new Date().toISOString();
	const projected: Task[] = [];
	let streakLevel = 0;
	const adaptiveBaseStageIndex = getAdaptiveFocusStageIndex(recalculated, {
		enabled: options.focusRamp?.enabled ?? true,
		resetPolicy: options.focusRamp?.resetPolicy ?? "daily",
		baseStageIndex: 0,
		maxStageIndex: PROGRESSIVE_FOCUS_MINUTES.length - 1,
	});
	let focusStageIndex = adaptiveBaseStageIndex;
	let cursor = new Date(activeScheduled[0]?.start ?? new Date());

	for (let i = 0; i < activeScheduled.length; i++) {
		const current = activeScheduled[i];
		if (!current) continue;
		const next = activeScheduled[i + 1];
		if (!next) {
			// no-op
		}

		if (current.start.getTime() > cursor.getTime()) {
			const idleGap = Math.floor((current.start.getTime() - cursor.getTime()) / 60_000);
			if (idleGap >= STREAK_RESET_GAP_MINUTES) {
				streakLevel = 0;
				focusStageIndex = adaptiveBaseStageIndex;
			}
			cursor = new Date(current.start);
		}

		if (isResetTask(current.task)) {
			streakLevel = 0;
			focusStageIndex = adaptiveBaseStageIndex;
		}

		let remaining = durationMinutes(current.task);
		let segmentIndex = 1;
		while (remaining > 0) {
			const focusTarget = stageValue(PROGRESSIVE_FOCUS_MINUTES, focusStageIndex);
			const focusMinutes = Math.min(remaining, focusTarget);
			const focusStart = new Date(cursor);
			const focusEnd = new Date(focusStart.getTime() + focusMinutes * 60_000);
			const isSplitSegment =
				segmentIndex > 1 || durationMinutes(current.task) > focusTarget;

			if (isSplitSegment) {
				projected.push({
					...current.task,
					id: `auto-split-${current.task.id}-${segmentIndex}`,
					title: `${current.task.title} (${segmentIndex})`,
					requiredMinutes: focusMinutes,
					fixedStartAt: focusStart.toISOString(),
					fixedEndAt: focusEnd.toISOString(),
					estimatedStartAt: focusStart.toISOString(),
					tags: [...current.task.tags, "auto-split-focus"],
					createdAt: nowIso,
					updatedAt: nowIso,
				});
			} else {
				projected.push({
					...current.task,
					requiredMinutes: focusMinutes,
					fixedStartAt: focusStart.toISOString(),
					fixedEndAt: focusEnd.toISOString(),
					estimatedStartAt: focusStart.toISOString(),
				});
			}

			cursor = focusEnd;
			remaining -= focusMinutes;
			streakLevel = Math.min(streakLevel + 1, 10);

			if (remaining > 0) {
				const baseBreakMinutes = stageValue(PROGRESSIVE_BREAK_MINUTES, focusStageIndex);
				const breakMinutes = overfocusEnabled
					? applyOverfocusCooldown({
						streakLevel,
						breakMinutes: baseBreakMinutes,
						threshold: overfocusThreshold,
						minCooldownMinutes: overfocusMinCooldown,
						overrideAcknowledged: overfocusOverrideAck,
						overrideReason: overfocusOverrideReason,
					})
					: baseBreakMinutes;
				const breakStart = new Date(cursor);
				const breakEnd = new Date(breakStart.getTime() + breakMinutes * 60_000);
				projected.push({
					id: `auto-break-${current.task.id}-${segmentIndex}`,
					title: `休憩 (${breakMinutes}分)`,
					description: "自動生成された休憩タスク",
					estimatedPomodoros: Math.max(1, Math.ceil(breakMinutes / 25)),
					completedPomodoros: 0,
					completed: false,
					state: "READY",
					kind: "break",
					requiredMinutes: breakMinutes,
					fixedStartAt: breakStart.toISOString(),
					fixedEndAt: breakEnd.toISOString(),
					windowStartAt: null,
					windowEndAt: null,
					estimatedStartAt: breakStart.toISOString(),
					tags: ["auto-break", "auto-split-break"],
					priority: -100,
					category: "active",
					createdAt: nowIso,
					elapsedMinutes: 0,
					project: "Break",
					group: null,
					energy: "low",
					updatedAt: nowIso,
					completedAt: null,
					pausedAt: null,
				});
				cursor = breakEnd;
			}

			if (focusStageIndex < PROGRESSIVE_FOCUS_MINUTES.length - 1) {
				focusStageIndex += 1;
			}
			segmentIndex += 1;
		}

		if (next) {
			const gapMinutes = Math.floor((next.start.getTime() - cursor.getTime()) / 60_000);
			if (gapMinutes >= MIN_BREAK_MINUTES) {
				const baseBreakMinutes = recommendBreakMinutes(current.task, gapMinutes, streakLevel);
				const breakMinutes = overfocusEnabled
					? applyOverfocusCooldown({
						streakLevel,
						breakMinutes: baseBreakMinutes,
						availableGapMinutes: gapMinutes,
						threshold: overfocusThreshold,
						minCooldownMinutes: overfocusMinCooldown,
						overrideAcknowledged: overfocusOverrideAck,
						overrideReason: overfocusOverrideReason,
					})
					: baseBreakMinutes;
				if (breakMinutes >= MIN_BREAK_MINUTES) {
					const breakStart = new Date(cursor);
					const breakEnd = new Date(breakStart.getTime() + breakMinutes * 60_000);
					projected.push({
						id: `auto-break-${current.task.id}-${next.task.id}`,
						title: `休憩 (${breakMinutes}分)`,
						description: "自動生成された休憩タスク",
						estimatedPomodoros: Math.max(1, Math.ceil(breakMinutes / 25)),
						completedPomodoros: 0,
						completed: false,
						state: "READY",
						kind: "break",
						requiredMinutes: breakMinutes,
						fixedStartAt: breakStart.toISOString(),
						fixedEndAt: breakEnd.toISOString(),
						windowStartAt: null,
						windowEndAt: null,
						estimatedStartAt: breakStart.toISOString(),
						tags: ["auto-break"],
						priority: -100,
						category: "active",
						createdAt: nowIso,
						elapsedMinutes: 0,
						project: "Break",
						group: null,
						energy: "low",
						updatedAt: nowIso,
						completedAt: null,
						pausedAt: null,
					});
					cursor = breakEnd;
				}
			}
			if (gapMinutes >= STREAK_RESET_GAP_MINUTES || isResetTask(current.task)) {
				streakLevel = 0;
				focusStageIndex = adaptiveBaseStageIndex;
			}
			if (next.start.getTime() > cursor.getTime()) {
				cursor = new Date(next.start);
			}
		}
	}

	// Include DONE tasks in the final result
	return [...doneTasks, ...unscheduled, ...projected].sort((a, b) => {
		const startDiff = toStartTimestamp(a) - toStartTimestamp(b);
		if (startDiff !== 0) return startDiff;
		if (a.kind === "break" && b.kind !== "break") return -1;
		if (a.kind !== "break" && b.kind === "break") return 1;
		return a.id.localeCompare(b.id);
	});
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
