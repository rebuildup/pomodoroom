import type { ShortcutBindings } from "./shortcuts";

export interface PomodoroSettings {
	workDuration: number;
	shortBreakDuration: number;
	longBreakDuration: number;
	sessionsUntilLongBreak: number;
	notificationSound: boolean;
	notificationVolume: number;
	customNotificationSound?: string; // Path to custom sound file
	vibration: boolean;
	theme: "light" | "dark";
	autoPlayOnFocusSession?: boolean;
	pauseOnBreak?: boolean;
	youtubeDefaultVolume?: number;
	stickyWidgetSize?: number;
	youtubeWidgetWidth?: number;
	youtubeLoop?: boolean;
	highlightColor?: string;
	keyboardShortcuts?: ShortcutBindings;
}

export const DEFAULT_HIGHLIGHT_COLOR = "#3b82f6";

export type PomodoroSessionType = "work" | "shortBreak" | "longBreak" | "focus" | "break";

export interface PomodoroSession {
	id: string;
	type: PomodoroSessionType;
	duration: number;
	completedAt: string | Date;
	startTime?: string;
	endTime?: string;
	completed?: boolean;
	project?: string; // Project name for tracking project-wise stats
	task?: string; // Task name for tracking task completion
	interrupted?: boolean; // Whether the session was interrupted
	plannedDuration?: number; // Originally planned duration in minutes
}

export interface PomodoroStats {
	totalSessions: number;
	totalWorkTime: number;
	totalBreakTime: number;
	completedPomodoros: number;
	currentStreak: number;
	longestStreak: number;
	todaysSessions: number;
}

// Database stats from Rust backend (matches pomodoroom-core::storage::database::Stats)
export interface DatabaseStats {
	total_sessions: number;
	total_focus_min: number;
	total_break_min: number;
	completed_pomodoros: number;
	today_sessions: number;
	today_focus_min: number;
}

// Session record from database (matches pomodoroom-core::storage::database::SessionRecord)
export interface DatabaseSessionRecord {
	id: number;
	step_type: string; // "focus" | "break"
	step_label: string;
	duration_min: number;
	started_at: string; // ISO 8601
	completed_at: string; // ISO 8601
	task_id: string | null;
	project_id: string | null;
}

export type TimerState = "idle" | "running" | "paused" | "completed";
export type SessionType = "work" | "shortBreak" | "longBreak";

export const PROGRESSIVE_WORK_DURATIONS = [15, 30, 45, 60, 75];
export const PROGRESSIVE_BREAK_DURATIONS = [5, 5, 5, 5, 30];

export interface TimerDisplay {
	minutes: number;
	seconds: number;
	progress: number;
}

export interface NotificationOptions {
	title: string;
	body: string;
	icon?: string;
	requireInteraction?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline & Task Types
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineItemSource = "google" | "notion" | "linear" | "github" | "manual" | "local";

export type TimelineItemType = "event" | "task" | "session" | "gap";

export interface TimelineItem {
	id: string;
	type: TimelineItemType;
	source: TimelineItemSource;
	title: string;
	description?: string;
	startTime: string; // ISO string
	endTime: string; // ISO string
	completed?: boolean;
	priority: number | null; // 0-100 for tasks, null for default
	deadline?: string; // ISO string
	tags?: string[];
	url?: string;
	metadata?: Record<string, unknown>;
}

export interface TimeGap {
	startTime: string;
	endTime: string;
	duration: number; // in minutes
	size: "small" | "medium" | "large"; // 15min, 30min, 60min+
}

export interface TaskProposal {
	gap: TimeGap;
	task: TimelineItem;
	reason: string; // Why this task is recommended
	confidence: number; // 0-100
}

export interface TimelineViewProps {
	items: TimelineItem[];
	currentTime: Date;
	date?: Date;
	onItemClick?: (item: TimelineItem) => void;
	onItemMove?: (itemId: string, newStartTime: string, newEndTime: string) => void;
	onTaskSelect?: (task: TimelineItem) => void;
	onProposalAccept?: (proposal: TaskProposal) => void;
	onProposalReject?: (proposal: TaskProposal) => void;
}

// Re-export schedule types
export type {
	BlockType,
	ScheduleBlock,
	TaskCategory,
	Task as ScheduleTask,
	Project,
	FixedEvent,
	DailyTemplate,
	BoardRow,
	BoardRowStatus,
} from "./schedule";

export { DEFAULT_DAILY_TEMPLATE, MAX_PARALLEL_LANES } from "./schedule";

// ─────────────────────────────────────────────────────────────────────────────
// Integration Types
// ─────────────────────────────────────────────────────────────────────────────

export type IntegrationService =
	| "google_calendar"
	| "google_tasks"
	| "notion"
	| "linear"
	| "github"
	| "discord"
	| "slack";

export interface IntegrationConfig {
	service: IntegrationService;
	connected: boolean;
	accountId?: string;
	accountName?: string;
	lastSyncAt?: string; // ISO timestamp
	config?: Record<string, unknown>;
}

export interface IntegrationsConfig {
	[key: string]: IntegrationConfig;
}

export const INTEGRATION_SERVICES: {
	id: IntegrationService;
	name: string;
	icon: string;
	description: string;
	priority: number;
}[] = [
	{
		id: "google_calendar",
		name: "Google Calendar",
		icon: "📅",
		description: "Sync events and calendar",
		priority: 1,
	},
	{
		id: "google_tasks",
		name: "Google Tasks",
		icon: "✅",
		description: "Sync tasks and to-do lists",
		priority: 2,
	},
	{
		id: "notion",
		name: "Notion",
		icon: "📝",
		description: "Sync tasks and databases",
		priority: 3,
	},
	{
		id: "linear",
		name: "Linear",
		icon: "🚀",
		description: "Sync issues and projects",
		priority: 4,
	},
	{
		id: "github",
		name: "GitHub",
		icon: "🐙",
		description: "Sync issues and pull requests",
		priority: 5,
	},
	{
		id: "discord",
		name: "Discord",
		icon: "💬",
		description: "Post status updates",
		priority: 6,
	},
	{
		id: "slack",
		name: "Slack",
		icon: "💼",
		description: "Post status updates",
		priority: 7,
	},
];

// Re-export shortcut types
export type {
	ShortcutBinding,
	ShortcutCommand,
	ShortcutCommandDef,
	ShortcutBindings,
	Command,
} from "./shortcuts";

// Re-export task state types
export type {
	TaskState,
	StateTransitionEntry,
} from "./task-state";
export {
	VALID_TRANSITIONS,
	TRANSITION_LABELS,
	isValidTransition,
	getTransitionLabel,
	InvalidTransitionError,
} from "./task-state";

// Re-export pressure types
export type {
	PressureMode,
	PressureState,
	WorkItem,
	CapacityParams,
	PressureOptions,
} from "./pressure";
export {
	PRESSURE_MODE_COLORS,
	getPressureColorClasses,
	DEFAULT_OVERLOAD_THRESHOLD,
	DEFAULT_BREAK_BUFFER,
} from "./pressure";

// Re-export v2 task types
export type {
	Task,
	TransitionAction,
	EnergyLevel,
} from "./task";
export {
	createTask,
	getEnergyColor,
	isV2Task,
	scheduleTaskToV2Task,
	v2TaskToScheduleTask,
	effectiveCategory,
	isActive,
	isWaiting,
	isFloating,
} from "./task";

// ─────────────────────────────────────────────────────────────────────────────
// Integration Sync Diff Types
// ─────────────────────────────────────────────────────────────────────────────

export type DiffType = "added" | "updated" | "deleted" | "skipped";

export interface SyncDiffItem {
	id: string;
	type: DiffType;
	entityType: "task" | "event" | "project" | "calendar";
	title: string;
	description?: string;
	before?: Record<string, unknown>;
	after?: Record<string, unknown>;
	conflicts?: Array<{
		field: string;
		local: unknown;
		remote: unknown;
	}>;
}

export interface SyncDiffResult {
	service: IntegrationService;
	totalChanges: number;
	diffs: SyncDiffItem[];
	syncedAt: string;
	errors?: Array<{
		item: string;
		message: string;
	}>;
}

export interface DiffPreviewProps {
	diffResult: SyncDiffResult;
	onConfirm?: () => void;
	onCancel?: () => void;
	onResolveConflict?: (
		item: SyncDiffItem,
		resolution: "keep_local" | "keep_remote" | "merge",
	) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// JIT (Just-In-Time) Task Engine Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
	JitContext,
	TaskSummary,
	EnergyLevel as JitEnergyLevel,
	SuggestionReason,
	TaskSuggestion,
	JitCommands,
} from "./jit";
export {
	getSuggestionReasonLabel,
	getSuggestionReasonIcon,
} from "./jit";

// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar Sync Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
	SyncStatus,
	SyncResult,
	SyncEventType,
	SyncEvent,
} from "./sync";
