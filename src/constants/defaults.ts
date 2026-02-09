/**
 * Shared constants used across the application.
 */
import type { PomodoroSettings } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { DEFAULT_SHORTCUT_BINDINGS } from "./shortcuts";

export const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	shortBreakDuration: 5,
	longBreakDuration: 30,
	sessionsUntilLongBreak: 4,
	notificationSound: true,
	notificationVolume: 50,
	vibration: true,
	theme: "dark",
	autoPlayOnFocusSession: true,
	pauseOnBreak: true,
	youtubeDefaultVolume: 50,
	stickyWidgetSize: 220,
	youtubeWidgetWidth: 400,
	youtubeLoop: true,
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
	keyboardShortcuts: DEFAULT_SHORTCUT_BINDINGS,
};

export const ACCENT_COLORS = [
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
	"#f97316",
	"#10b981",
	"#06b6d4",
	"#f43f5e",
] as const;

export const STICKY_NOTE_SIZE = 220;

export const TOTAL_SCHEDULE_DURATION = 250; // 15+30+45+60+75 + 5*4+30
