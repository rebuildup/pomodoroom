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
 *     |      |    タイマー終了後ユーザー入力なし
 *     |      v
 *     +-------> DRIFTING (漂流状態)
 *     |      |    Gatekeeper Protocol発動
 *     |      v
 *     |    DONE (完了)
 *     |
 *     |    AI/Webhook待ち
 *     v
 *   WAITING ──> READY (完了/失敗後)
 *
 * Valid transitions:
 * - READY → RUNNING (開始/start)
 * - READY → READY (先送り/defer - priority down)
 * - RUNNING → DONE (完了/complete)
 * - RUNNING → RUNNING (延長/extend - timer reset)
 * - RUNNING → PAUSED (中断/pause)
 * - RUNNING → DRIFTING (タイマー終了、ユーザー入力なし)
 * - RUNNING → WAITING (非同期処理開始/AI task, webhook)
 * - PAUSED → RUNNING (再開/resume)
 * - DRIFTING → DONE (ユーザー完了操作)
 * - DRIFTING → PAUSED (一時停止で負債確定)
 * - WAITING → READY (非同期処理完了/失敗)
 */

/**
 * Task state enumeration.
 */
export type TaskState =
	| "READY"
	| "RUNNING"
	| "PAUSED"
	| "DONE"
	| "DRIFTING" // Timer ended, waiting for user action (Gatekeeper triggered)
	| "WAITING"; // Waiting for async operation (AI task, webhook)

/**
 * Valid state transitions.
 * Maps from state to array of allowed next states.
 */
export const VALID_TRANSITIONS: Readonly<
	Record<TaskState, readonly TaskState[]>
> = {
	READY: ["RUNNING", "READY"] as const,
	RUNNING: ["DONE", "RUNNING", "PAUSED", "DRIFTING", "WAITING"] as const,
	PAUSED: ["RUNNING"] as const,
	DONE: [] as const, // Terminal state
	DRIFTING: ["DONE", "PAUSED"] as const,
	WAITING: ["READY"] as const,
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
		DRIFTING: { en: "Drifting", ja: "漂流" },
		WAITING: { en: "Waiting", ja: "待機中" },
	} as Record<TaskState, { en: string; ja: string }>,
	PAUSED: {
		RUNNING: { en: "Resume", ja: "再開" },
	} as Record<TaskState, { en: string; ja: string }>,
	DRIFTING: {
		DONE: { en: "Complete", ja: "完了" },
		PAUSED: { en: "Pause", ja: "中断" },
	} as Record<TaskState, { en: string; ja: string }>,
	WAITING: {
		READY: { en: "Resume", ja: "再開" },
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
 * Extended state metadata for DRIFTING and WAITING states.
 */
export interface DriftingStateMeta {
	sinceMs: number;
	breakDebtMs: number;
	escalationLevel: number; // 0-3 for Gatekeeper protocol
}

export interface WaitingStateMeta {
	sinceMs: number;
	webhookId: string | null;
}

export type StateMeta =
	| { state: "DRIFTING" } & DriftingStateMeta
	| { state: "WAITING" } & WaitingStateMeta
	| { state: "READY" | "RUNNING" | "PAUSED" | "DONE" };
