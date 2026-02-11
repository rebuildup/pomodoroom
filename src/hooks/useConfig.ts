/**
 * useConfig - Hook for managing TOML-based configuration.
 *
 * Provides a unified interface for settings that are persisted to
 * ~/.pomodoroom/config.toml via Tauri IPC commands.
 *
 * Falls back to localStorage in non-Tauri environments (e.g., web preview).
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";

// Check if running in Tauri environment
const isTauri = () => {
	try {
		return window.__TAURI__ !== undefined;
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

// Invert map for TOML key -> frontend key lookups
const TOML_TO_FRONTEND_MAP: Record<string, ConfigKey> = Object.entries(
	CONFIG_KEY_MAP,
).reduce((acc, [frontendKey, tomlKey]) => {
	acc[tomlKey] = frontendKey as ConfigKey;
	return acc;
}, {} as Record<string, ConfigKey>);

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

	// Load all config from TOML on mount
	useEffect(() => {
		const loadConfig = async () => {
			if (!isTauri()) {
				// Fallback to localStorage in non-Tauri environment
				loadFromLocalStorage();
				setLoading(false);
				return;
			}

			try {
				const tomlConfig = await invoke<TomlConfig>("cmd_config_list");
				const parsedConfig = parseTomlConfig(tomlConfig);
				setConfigState(parsedConfig);

				// Also save to localStorage as backup
				saveToLocalStorage(parsedConfig);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error("[useConfig] Failed to load config from TOML:", errorMsg);
				setError(errorMsg);

				// Fallback to localStorage
				loadFromLocalStorage();
			} finally {
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
				saveToLocalStorage(newConfig);
				return;
			}

			try {
				const tomlKey = CONFIG_KEY_MAP[key];
				await invoke("cmd_config_set", {
					key: tomlKey,
					value: String(value),
				});
				// Also update localStorage as backup
				saveToLocalStorage(newConfig);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error(`[useConfig] Failed to save config key "${key}":`, errorMsg);
				setError(errorMsg);
				// Still save to localStorage as fallback
				saveToLocalStorage(newConfig);
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
				saveToLocalStorage(newConfig);
				return;
			}

			// Set each key individually
			const promises = Object.entries(updates).map(([key, value]) => {
				const tomlKey = CONFIG_KEY_MAP[key as ConfigKey];
				return invoke("cmd_config_set", {
					key: tomlKey,
					value: String(value),
				});
			});

			try {
				await Promise.all(promises);
				saveToLocalStorage(newConfig);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				console.error("[useConfig] Failed to save config updates:", errorMsg);
				setError(errorMsg);
				saveToLocalStorage(newConfig);
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
				return setConfigValue(arg1, arg2!);
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

/**
 * Save config to localStorage as backup
 */
function saveToLocalStorage(config: PomodoroSettings) {
	try {
		localStorage.setItem("pomodoroom-settings", JSON.stringify(config));
	} catch (err) {
		console.error("[useConfig] Failed to save to localStorage:", err);
	}
}

/**
 * Load config from localStorage (fallback)
 */
function loadFromLocalStorage() {
	try {
		const stored = localStorage.getItem("pomodoroom-settings");
		if (stored) {
			const parsed = JSON.parse(stored);
			return { ...DEFAULT_SETTINGS, ...parsed };
		}
	} catch (err) {
		console.error("[useConfig] Failed to load from localStorage:", err);
	}
	return DEFAULT_SETTINGS;
}

/**
 * Migration utility: migrate localStorage settings to TOML
 *
 * Call this on app startup to migrate existing localStorage settings
 * to the TOML config system.
 */
export async function migrateLocalStorageToToml(): Promise<void> {
	if (!isTauri()) return;

	try {
		const stored = localStorage.getItem("pomodoroom-settings");
		if (!stored) return;

		const parsed = JSON.parse(stored) as Partial<PomodoroSettings>;

		// Migrate each key to TOML
		const promises = Object.entries(parsed).map(([key, value]) => {
			if (value === undefined) return Promise.resolve();
			const tomlKey = CONFIG_KEY_MAP[key as ConfigKey];
			if (!tomlKey) return Promise.resolve();
			return invoke("cmd_config_set", {
				key: tomlKey,
				value: String(value),
			});
		});

		await Promise.all(promises);

		// Mark migration as complete
		localStorage.setItem("pomodoroom-migrated-to-toml", "true");
		console.log("[useConfig] Migration from localStorage to TOML complete");
	} catch (err) {
		console.error("[useConfig] Migration failed:", err);
	}
}
