export interface PomodoroSettings {
	workDuration: number;
	shortBreakDuration: number;
	longBreakDuration: number;
	sessionsUntilLongBreak: number;
	notificationSound: boolean;
	notificationVolume: number;
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

export type PomodoroSessionType =
	| "work"
	| "shortBreak"
	| "longBreak"
	| "focus"
	| "break";

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

export type TimelineItemSource = "google" | "notion" | "linear" | "github" | "manual";

export type TimelineItemType = "event" | "task" | "session" | "gap";

export interface TimelineItem {
	id: string;
	type: TimelineItemType;
	source: TimelineItemSource;
	title: string;
	description?: string;
	startTime: string; // ISO string
	endTime: string;   // ISO string
	completed?: boolean;
	priority?: number; // 0-100 for tasks
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
	| "google"
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
		id: "google",
		name: "Google Calendar",
		icon: "📅",
		description: "Sync events and calendar",
		priority: 1,
	},
	{
		id: "notion",
		name: "Notion",
		icon: "📝",
		description: "Sync tasks and databases",
		priority: 2,
	},
	{
		id: "linear",
		name: "Linear",
		icon: "🚀",
		description: "Sync issues and projects",
		priority: 3,
	},
	{
		id: "github",
		name: "GitHub",
		icon: "🐙",
		description: "Sync issues and pull requests",
		priority: 4,
	},
	{
		id: "discord",
		name: "Discord",
		icon: "💬",
		description: "Post status updates",
		priority: 5,
	},
	{
		id: "slack",
		name: "Slack",
		icon: "💼",
		description: "Post status updates",
		priority: 6,
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
