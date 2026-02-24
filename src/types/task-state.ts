/**
 * Task state types for Pomodoroom task state transition model.
 *
 * States follow strict transitions as defined in docs/ui-redesign-strategy.md:
 *
 *   READY ─────────> RUNNING ─────────> DONE
 *     ^     先送り      |    延長(タイマーリセット)
 *     |   (優先度下げ)  |       ↓
 *     |                 +───> RUNNING
 *     |     中断
 *     |      |
 *     |      v       再開
 *     |   PAUSED ─────────> RUNNING
 *     |      |
 *     |                  |
 *     |             timeout│
 *     |                  v              (action taken)
 *     |            DRIFTING ─────────────> DONE
 *     |
 *     +----- (初期状態 / タスク作成時)
 *
 * Valid transitions:
 * - READY → RUNNING (開始/start)
 * - READY → READY (先送り/defer - priority down)
 * - RUNNING → DONE (完了/complete)
 * - RUNNING → RUNNING (延長/extend - timer reset)
 * - RUNNING → PAUSED (中断/pause)
 * - RUNNING → DRIFTING (タイマー完了後に無操作)
 * - PAUSED → RUNNING (再開/resume)
 * - PAUSED → DRIFTING (一時停止後にタイマー完了)
 * - DRIFTING → DONE (ユーザーが操作を行う)
 * - DRIFTING → RUNNING (ユーザーが延長を選択)
 * - DRIFTING → PAUSED (ユーザーが中断を選択)
 */

/**
 * Task state enumeration.
 */
export type TaskState = "READY" | "RUNNING" | "PAUSED" | "DONE" | "DRIFTING";

/**
 * Valid state transitions.
 * Maps from state to array of allowed next states.
 */
export const VALID_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
	READY: ["RUNNING", "READY"] as const,
	RUNNING: ["DONE", "RUNNING", "PAUSED", "DRIFTING"] as const,
	PAUSED: ["RUNNING", "DRIFTING"] as const,
	DONE: [] as const, // Terminal state
	DRIFTING: ["DONE", "RUNNING", "PAUSED"] as const,
} as const;

/**
 * State transition operations with labels for UI display.
 */
export const TRANSITION_LABELS: Readonly<
	Record<TaskState, Partial<Record<TaskState, { en: string; ja: string }>>>
> = {
	READY: {
		RUNNING: { en: "Start", ja: "開始" },
		READY: { en: "Defer", ja: "先送り" },
	} as Record<TaskState, { en: string; ja: string }>,
	RUNNING: {
		DONE: { en: "Complete", ja: "完了" },
		RUNNING: { en: "Extend", ja: "延長" },
		PAUSED: { en: "Pause", ja: "中断" },
		DRIFTING: { en: "Time's Up", ja: "時間切れ" },
	} as Record<TaskState, { en: string; ja: string }>,
	PAUSED: {
		RUNNING: { en: "Resume", ja: "再開" },
		DRIFTING: { en: "Time's Up", ja: "時間切れ" },
	} as Record<TaskState, { en: string; ja: string }>,
	DRIFTING: {
		DONE: { en: "Complete", ja: "完了" },
		RUNNING: { en: "Extend", ja: "延長" },
		PAUSED: { en: "Pause", ja: "中断" },
	} as Record<TaskState, { en: string; ja: string }>,
	DONE: {} as Record<TaskState, { en: string; ja: string }>,
} as const;

/**
 * Check if a transition is valid.
 */
export function isValidTransition(from: TaskState, to: TaskState): boolean {
	return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Get transition label for UI display.
 * Returns undefined if transition is invalid.
 */
export function getTransitionLabel(
	from: TaskState,
	to: TaskState,
	locale: "en" | "ja" = "en",
): string | undefined {
	return TRANSITION_LABELS[from]?.[to]?.[locale];
}

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
	constructor(
		public readonly from: TaskState,
		public readonly to: TaskState,
	) {
		super(`Invalid state transition: ${from} → ${to}`);
		this.name = "InvalidTransitionError";
	}
}

/**
 * State transition history entry.
 */
export interface StateTransitionEntry {
	from: TaskState;
	to: TaskState;
	at: Date; // ISO timestamp
	operation: string; // "start" | "defer" | "complete" | "extend" | "pause" | "resume" | "drift" | "wait"
}

/**
 * Extended state metadata for DRIFTING state.
 */
export interface DriftingStateMeta {
	sinceMs: number;
	breakDebtMs: number;
	escalationLevel: number; // 0-3 for Gatekeeper protocol
}

export type StateMeta =
	| ({ state: "DRIFTING" } & DriftingStateMeta)
	| { state: "READY" | "RUNNING" | "PAUSED" | "DONE" };
