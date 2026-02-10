/**
 * TaskStream types — TaskShoot方式のタスク管理.
 *
 * ステータスフロー:
 *   plan → doing → log (完了)
 *   doing → interrupted → plan (中断して再投入)
 *   routine: 毎日繰り返すルーティン
 *   defer: 先送り（明日以降に再投入）
 *
 * データ形式はMarkdownチェックリスト互換:
 *   - [ ] タスク名 @project #tag ~25m
 *   - [x] 完了タスク 10:00-10:25
 *
 * References:
 *   - TaskShoot methodology (Plan→Do→Log→Routine→Defer)
 *   - Sociomedia HIG (object-based UI, direct manipulation, modelessness)
 */

// ─── TaskShoot Status ───────────────────────────────────────────────────────

export type TaskStreamStatus =
	| "plan"         // 予定（未着手）
	| "doing"        // 実行中
	| "log"          // 完了ログ
	| "interrupted"  // 中断（ログ + 再plan）
	| "routine"      // 定期ルーティン
	| "defer";       // 先送り

// ─── TaskStream Item ────────────────────────────────────────────────────────

// Import TaskState for state transition management
import type { TaskState } from "./task-state";

/**
 * Mapping between TaskStreamStatus (legacy) and TaskState (new).
 */
export const STATUS_TO_STATE_MAP: Readonly<Record<TaskStreamStatus, TaskState>> = {
	plan: "READY",
	doing: "RUNNING",
	log: "DONE",
	interrupted: "PAUSED",
	routine: "READY",
	defer: "READY",
} as const;

/**
 * Mapping between TaskState and TaskStreamStatus (reverse mapping).
 * Note: One-to-many mapping exists (e.g., READY can be plan, routine, or defer).
 */
export const STATE_TO_STATUS_MAP: Readonly<Record<TaskState, TaskStreamStatus>> = {
	READY: "plan",
	RUNNING: "doing",
	PAUSED: "interrupted",
	DONE: "log",
} as const;

export interface TaskStreamItem {
	id: string;
	title: string;
	/** Legacy status for TaskShoot compatibility */
	status: TaskStreamStatus;
	/** New state for state transition management */
	state: TaskState;
	/** Markdown本文（タスクの詳細メモ） */
	markdown?: string;
	/** 見積もり時間（分） */
	estimatedMinutes: number;
	/** 実績時間（分） — doing開始からの累積 */
	actualMinutes: number;
	/** 開始時刻（ISO） */
	startedAt?: string;
	/** 完了時刻（ISO） */
	completedAt?: string;
	/** 中断回数 */
	interruptCount: number;
	/** プロジェクトID */
	projectId?: string;
	/** タグ */
	tags: string[];
	/** ルーティンの場合: 繰り返し曜日 (0=Sun…6=Sat) */
	routineDays?: number[];
	/** 作成日時 */
	createdAt: string;
	/** ソート順（上から順に実行） */
	order: number;
}

// ─── Action Log Entry ───────────────────────────────────────────────────────

export type ActionType =
	| "start"       // plan → doing
	| "complete"    // doing → log
	| "interrupt"   // doing → interrupted
	| "defer"       // plan → defer
	| "replan"      // interrupted/defer → plan
	| "add"         // 新規追加
	| "delete";     // 削除

// StreamAction for UI components (subset of ActionType without add/delete for UI operations)
export type StreamAction =
	| "start"       // plan → doing
	| "complete"    // doing → log
	| "interrupt"   // doing → interrupted
	| "defer"       // plan → defer
	| "replan"      // defer/interrupted → plan
	| "delete";     // 削除

export interface ActionLogEntry {
	id: string;
	taskId: string;
	action: ActionType;
	timestamp: string; // ISO
	/** 中断の理由など */
	note?: string;
}

// ─── Dashboard Quick Settings ───────────────────────────────────────────────

export interface QuickSettings {
	compactMode: boolean;
	notificationsEnabled: boolean;
	soundEnabled: boolean;
}

export const DEFAULT_QUICK_SETTINGS: QuickSettings = {
	compactMode: false,
	notificationsEnabled: true,
	soundEnabled: true,
};

// ─── Status Colors ───────────────────────────────────────────────────────────────

/**
 * Status color palette for TaskStream UI.
 *
 * Uses Tailwind utility classes that work in both dark and light themes:
 * - gray: neutral/default status
 * - blue: active/doing state
 * - green: completed/log state
 * - orange: warning/interrupted state
 * - purple: recurring/special states (routine, defer)
 */
export const TASK_STATUS_COLORS: Record<TaskStreamStatus, { bg: string; text: string; border: string }> = {
	plan: {
		bg: "bg-gray-500/10",
		text: "text-gray-400",
		border: "border-gray-500/30",
	},
	doing: {
		bg: "bg-blue-500/10",
		text: "text-blue-400",
		border: "border-blue-500/30",
	},
	log: {
		bg: "bg-green-500/10",
		text: "text-green-400",
		border: "border-green-500/30",
	},
	interrupted: {
		bg: "bg-orange-500/10",
		text: "text-orange-400",
		border: "border-orange-500/30",
	},
	routine: {
		bg: "bg-purple-500/10",
		text: "text-purple-400",
		border: "border-purple-500/30",
	},
	defer: {
		bg: "bg-purple-500/10",
		text: "text-purple-400",
		border: "border-purple-500/30",
	},
};

/**
 * Get status color classes for a given status.
 * Simple accessor for consistency.
 */
export function getStatusColorClasses(
	status: TaskStreamStatus,
	_priority?: number,
): { bg: string; text: string; border: string } {
	return TASK_STATUS_COLORS[status];
}

/**
 * Priority-based color intensity modifier.
 * Higher priority = darker/more saturated colors.
 * Reserved for future enhancement when priority field is added to TaskStreamItem.
 */
export function getPriorityIntensity(priority: number): "low" | "medium" | "high" {
	if (priority >= 75) return "high";
	if (priority >= 50) return "medium";
	return "low";
}

// ─── Markdown Helpers (型のみ) ──────────────────────────────────────────────

/**
 * Markdownテキスト ⇄ TaskStreamItem 変換用.
 * 形式例:
 *   - [ ] レビューPR @web #review ~30m
 *   - [x] 朝会 10:00-10:15 @team #meeting ~15m (実績: 15m)
 *   - [>] デザイン修正 → defer @design
 *   - [!] バグ修正 中断(2回) @backend ~60m (実績: 23m)
 */
export type MarkdownTaskPrefix =
	| "[ ]"   // plan
	| "[x]"   // log (完了)
	| "[>]"   // defer
	| "[!]"   // interrupted
	| "[~]"   // doing
	| "[r]";  // routine

// ─── Mock Data Generator ────────────────────────────────────────────────────

let _mockId = 1;
function mockId(): string {
	return `ts-${_mockId++}`;
}

export function createMockTaskStream(): TaskStreamItem[] {
	const now = new Date();
	const today = now.toISOString().slice(0, 10);

	return [
		// Doing
		{
			id: mockId(), title: "PR #142 レビュー", status: "doing", state: "RUNNING",
			markdown: "- フロント変更箇所チェック\n- パフォーマンス確認",
			estimatedMinutes: 25, actualMinutes: 12,
			startedAt: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
			interruptCount: 0, projectId: "p-web", tags: ["review"],
			createdAt: `${today}T08:00:00`, order: 0,
		},
		// Plan
		{
			id: mockId(), title: "API エンドポイント設計", status: "plan", state: "READY",
			estimatedMinutes: 50, actualMinutes: 0,
			interruptCount: 0, projectId: "p-api", tags: ["design"],
			createdAt: `${today}T08:00:00`, order: 1,
		},
		{
			id: mockId(), title: "Figma デザイン確認", status: "plan", state: "READY",
			estimatedMinutes: 15, actualMinutes: 0,
			interruptCount: 0, projectId: "p-web", tags: ["design"],
			createdAt: `${today}T08:00:00`, order: 2,
		},
		{
			id: mockId(), title: "テスト追加: ユーザー登録", status: "plan", state: "READY",
			estimatedMinutes: 30, actualMinutes: 0,
			interruptCount: 0, projectId: "p-api", tags: ["test"],
			createdAt: `${today}T08:00:00`, order: 3,
		},
		{
			id: mockId(), title: "ドキュメント更新", status: "plan", state: "READY",
			markdown: "## 更新箇所\n- README\n- API doc\n- CHANGELOG",
			estimatedMinutes: 20, actualMinutes: 0,
			interruptCount: 0, tags: ["docs"],
			createdAt: `${today}T08:00:00`, order: 4,
		},
		// Routine
		{
			id: mockId(), title: "朝会", status: "routine", state: "READY",
			estimatedMinutes: 15, actualMinutes: 0,
			interruptCount: 0, tags: ["meeting"],
			routineDays: [1, 2, 3, 4, 5],
			createdAt: `${today}T07:00:00`, order: 100,
		},
		{
			id: mockId(), title: "メール/Slack チェック", status: "routine", state: "READY",
			estimatedMinutes: 10, actualMinutes: 0,
			interruptCount: 0, tags: ["communication"],
			routineDays: [1, 2, 3, 4, 5],
			createdAt: `${today}T07:00:00`, order: 101,
		},
		// Log (completed)
		{
			id: mockId(), title: "朝のコードレビュー", status: "log", state: "DONE",
			estimatedMinutes: 25, actualMinutes: 22,
			startedAt: `${today}T09:00:00`,
			completedAt: `${today}T09:22:00`,
			interruptCount: 0, projectId: "p-web", tags: ["review"],
			createdAt: `${today}T08:00:00`, order: 200,
		},
		{
			id: mockId(), title: "CI パイプライン修正", status: "log", state: "DONE",
			estimatedMinutes: 30, actualMinutes: 45,
			startedAt: `${today}T09:25:00`,
			completedAt: `${today}T10:10:00`,
			interruptCount: 1, tags: ["infra"],
			createdAt: `${today}T08:00:00`, order: 201,
		},
		// Interrupted
		{
			id: mockId(), title: "DB マイグレーション", status: "interrupted", state: "PAUSED",
			markdown: "途中で本番障害対応が入った",
			estimatedMinutes: 40, actualMinutes: 15,
			startedAt: `${today}T10:15:00`,
			interruptCount: 1, projectId: "p-api", tags: ["db"],
			createdAt: `${today}T08:00:00`, order: 202,
		},
		// Defer
		{
			id: mockId(), title: "パフォーマンス計測", status: "defer", state: "READY",
			estimatedMinutes: 60, actualMinutes: 0,
			interruptCount: 0, projectId: "p-web", tags: ["performance"],
			createdAt: `${today}T08:00:00`, order: 300,
		},
	];
}
