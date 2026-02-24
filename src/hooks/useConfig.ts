/**
 * useConfig - Hook for managing TOML-based configuration.
 *
 * Provides a unified interface for settings that are persisted to
 * ~/.pomodoroom/config.toml via Tauri IPC commands.
 *
 * Database-only architecture: no localStorage persistence.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { isTauriEnvironment } from "@/lib/tauriEnv";

// Check if running in Tauri environment
const isTauri = () => {
	try {
		return isTauriEnvironment();
	} catch {
		return false;
	}
};

// TOML config key mapping (frontend key -> TOML key)
const CONFIG_KEY_MAP: Record<keyof PomodoroSettings, string> = {
	workDuration: "schedule.focus_duration",
	shortBreakDuration: "schedule.short_break",
	longBreakDuration: "schedule.long_break",
	sessionsUntilLongBreak: "schedule.pomodoros_before_long_break",
	notificationSound: "notifications.enabled",
	notificationVolume: "notifications.volume",
	customNotificationSound: "notifications.custom_sound",
	vibration: "notifications.vibration",
	theme: "ui.dark_mode",
	autoPlayOnFocusSession: "youtube.autoplay_on_focus",
	pauseOnBreak: "youtube.pause_on_break",
	youtubeDefaultVolume: "youtube.default_volume",
	stickyWidgetSize: "ui.sticky_widget_size",
	youtubeWidgetWidth: "ui.youtube_widget_width",
	youtubeLoop: "youtube.loop_enabled",
	highlightColor: "ui.highlight_color",
	keyboardShortcuts: "shortcuts.bindings",
} as const;

// Type-safe config keys
type ConfigKey = keyof PomodoroSettings;

/**
 * Result from cmd_config_list - nested TOML config structure
 */
interface UiConfig {
	dark_mode: boolean;
	highlight_color: string;
	sticky_widget_size: number;
	youtube_widget_width: number;
}

interface NotificationsConfig {
	enabled: boolean;
	volume: number;
	vibration: boolean;
	custom_sound?: string;
}

interface YouTubeConfig {
	autoplay_on_focus: boolean;
	pause_on_break: boolean;
	default_volume: number;
	loop_enabled: boolean;
}

interface ScheduleConfig {
	focus_duration: number;
	short_break: number;
	long_break: number;
	pomodoros_before_long_break: number;
}

interface TomlConfig {
	ui: UiConfig;
	notifications: NotificationsConfig;
	youtube: YouTubeConfig;
	schedule: ScheduleConfig;
	shortcuts: { bindings: Record<string, string> };
	window_pinned: boolean;
	window_float: boolean;
	tray_enabled: boolean;
	auto_advance: boolean;
}

/**
 * Hook for TOML-based configuration management.
 *
 * Usage:
 * ```tsx
 * const [config, setConfig, loading, error] = useConfig();
 *
 * // Get a value
 * const theme = config.theme;
 *
 * // Update a value (persists immediately to TOML)
 * setConfig("theme", "light");
 *
 * // Update multiple values
 * setConfig({ theme: "light", highlightColor: "#ec4899" });
 * ```
 */
export function useConfig() {
	const [config, setConfigState] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load all config from TOML on mount (DB only, no localStorage fallback)
	useEffect(() => {
		const loadConfig = async () => {
			if (!isTauri()) {
				// Web dev: use DEFAULT_SETTINGS only (no localStorage persistence)
				setLoading(false);
				return;
			}

			try {
				const tomlConfig = await invoke<TomlConfig>("cmd_config_list");
				const parsedConfig = parseTomlConfig(tomlConfig);
				setConfigState(parsedConfig);
				setLoading(false);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error("[useConfig] Failed to load config from TOML:", errorMsg);
				setError(errorMsg);
				// No fallback to localStorage - use DEFAULT_SETTINGS
				setLoading(false);
			}
		};

		loadConfig();
	}, []);

	// Set a single config value
	const setConfigValue = useCallback(
		async (key: ConfigKey, value: PomodoroSettings[ConfigKey]) => {
			const newConfig = { ...config, [key]: value };
			setConfigState(newConfig);

			if (!isTauri()) {
				// Web dev: just update state, no persistence
				return;
			}

			try {
				const tomlKey = CONFIG_KEY_MAP[key];
				await invoke("cmd_config_set", {
					key: tomlKey,
					value: serializeConfigValue(key, value),
				});
				// No localStorage backup
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error(`[useConfig] Failed to save config key "${key}":`, errorMsg);
				setError(errorMsg);
			}
		},
		[config],
	);

	// Set multiple config values at once
	const setConfigMultiple = useCallback(
		async (updates: Partial<PomodoroSettings>) => {
			const newConfig = { ...config, ...updates };
			setConfigState(newConfig);

			if (!isTauri()) {
				// Web dev: just update state, no persistence
				return;
			}

			// Set each key individually
			const promises = Object.entries(updates).map(([key, value]) => {
				const tomlKey = CONFIG_KEY_MAP[key as ConfigKey];
				if (!tomlKey || value === undefined) return Promise.resolve();
				return invoke("cmd_config_set", {
					key: tomlKey,
					value: serializeConfigValue(key as ConfigKey, value),
				});
			});

			try {
				await Promise.all(promises);
				// No localStorage backup
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error("[useConfig] Failed to save config updates:", errorMsg);
				setError(errorMsg);
			}
		},
		[config],
	);

	// Unified setter - can handle single key or object updates
	const setConfig = useCallback(
		(
			arg1:
				| ConfigKey
				| Partial<PomodoroSettings>
				| ((prev: PomodoroSettings) => Partial<PomodoroSettings>),
			arg2?: PomodoroSettings[ConfigKey],
		) => {
			if (typeof arg1 === "string") {
				// Single key: setConfig(key, value)
				if (arg2 === undefined) {
					throw new Error(`setConfig: value is required when setting key "${arg1}"`);
				}
				return setConfigValue(arg1, arg2);
			} else if (typeof arg1 === "function") {
				// Function: setConfig(prev => ({ ... }))
				const updates = arg1(config);
				return setConfigMultiple(updates);
			} else {
				// Object: setConfig({ key: value })
				return setConfigMultiple(arg1);
			}
		},
		[config, setConfigValue, setConfigMultiple],
	);

	return [config, setConfig, loading, error] as const;
}

// ── Helper functions ─────────────────────────────────────────────────────────────

/**
 * Parse TOML config response to PomodoroSettings
 */
function parseTomlConfig(tomlConfig: TomlConfig): PomodoroSettings {
	const result: PomodoroSettings = { ...DEFAULT_SETTINGS };

	// UI settings
	if (tomlConfig.ui?.dark_mode !== undefined) {
		result.theme = tomlConfig.ui.dark_mode ? "dark" : "light";
	}
	if (tomlConfig.ui?.highlight_color !== undefined) {
		result.highlightColor = tomlConfig.ui.highlight_color;
	}
	if (tomlConfig.ui?.sticky_widget_size !== undefined) {
		result.stickyWidgetSize = tomlConfig.ui.sticky_widget_size;
	}
	if (tomlConfig.ui?.youtube_widget_width !== undefined) {
		result.youtubeWidgetWidth = tomlConfig.ui.youtube_widget_width;
	}

	// Schedule settings
	if (tomlConfig.schedule?.focus_duration !== undefined) {
		result.workDuration = tomlConfig.schedule.focus_duration;
	}
	if (tomlConfig.schedule?.short_break !== undefined) {
		result.shortBreakDuration = tomlConfig.schedule.short_break;
	}
	if (tomlConfig.schedule?.long_break !== undefined) {
		result.longBreakDuration = tomlConfig.schedule.long_break;
	}
	if (tomlConfig.schedule?.pomodoros_before_long_break !== undefined) {
		result.sessionsUntilLongBreak = tomlConfig.schedule.pomodoros_before_long_break;
	}

	// Notifications
	if (tomlConfig.notifications?.enabled !== undefined) {
		result.notificationSound = tomlConfig.notifications.enabled;
	}
	if (tomlConfig.notifications?.volume !== undefined) {
		result.notificationVolume = tomlConfig.notifications.volume;
	}
	if (tomlConfig.notifications?.vibration !== undefined) {
		result.vibration = tomlConfig.notifications.vibration;
	}
	if (tomlConfig.notifications?.custom_sound !== undefined) {
		result.customNotificationSound = tomlConfig.notifications.custom_sound;
	}

	// YouTube settings
	if (tomlConfig.youtube?.autoplay_on_focus !== undefined) {
		result.autoPlayOnFocusSession = tomlConfig.youtube.autoplay_on_focus;
	}
	if (tomlConfig.youtube?.pause_on_break !== undefined) {
		result.pauseOnBreak = tomlConfig.youtube.pause_on_break;
	}
	if (tomlConfig.youtube?.default_volume !== undefined) {
		result.youtubeDefaultVolume = tomlConfig.youtube.default_volume;
	}
	if (tomlConfig.youtube?.loop_enabled !== undefined) {
		result.youtubeLoop = tomlConfig.youtube.loop_enabled;
	}

	return result;
}

// localStorage functions removed - config is now database-only

function serializeConfigValue(key: ConfigKey, value: PomodoroSettings[ConfigKey]): string {
	if (key === "theme") {
		return value === "dark" ? "true" : "false";
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "object" && value !== null) {
		return JSON.stringify(value);
	}
	return String(value);
}

// Migration function removed - no longer needed for database-only architecture
