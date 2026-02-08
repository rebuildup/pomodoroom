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
