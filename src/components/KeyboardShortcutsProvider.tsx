import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Command } from "@/types";
import type { TimerState, SessionType } from "@/types";

interface KeyboardShortcutsContextValue {
	toggleTimer: () => void;
	skipSession: () => void;
	resetTimer: () => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);

export function useKeyboardShortcutsActions() {
	const context = useContext(KeyboardShortcutsContext);
	if (!context) {
		throw new Error("useKeyboardShortcutsActions must be used within KeyboardShortcutsProvider");
	}
	return context;
}

interface KeyboardShortcutsProviderProps {
	children: React.ReactNode;
	theme?: "light" | "dark";
	timerState?: TimerState;
	sessionType?: SessionType;
}

export function KeyboardShortcutsProvider({
	children,
	theme = "dark",
	timerState = "idle",
	sessionType: _sessionType = "work",
}: KeyboardShortcutsProviderProps) {
	const [showCommandPalette, setShowCommandPalette] = useState(false);

	// Timer actions
	const toggleTimer = useCallback(async () => {
		try {
			if (timerState === "running") {
				await invoke("cmd_timer_pause");
			} else {
				await invoke("cmd_timer_start");
			}
		} catch (error) {
			console.error("Failed to toggle timer:", error);
		}
	}, [timerState]);

	const skipSession = useCallback(async () => {
		try {
			await invoke("cmd_timer_skip");
		} catch (error) {
			console.error("Failed to skip session:", error);
		}
	}, []);

	const resetTimer = useCallback(async () => {
		try {
			await invoke("cmd_timer_reset");
		} catch (error) {
			console.error("Failed to reset timer:", error);
		}
	}, []);

	// Window actions
	const openSettings = useCallback(async () => {
		try {
			await invoke("cmd_open_window", {
				label: "settings",
				title: "Settings",
				width: 600,
				height: 700,
			});
		} catch (error) {
			console.error("Failed to open settings:", error);
		}
	}, []);

	const openYouTube = useCallback(async () => {
		try {
			await invoke("cmd_open_window", {
				label: "youtube",
				title: "YouTube",
				width: 500,
				height: 400,
			});
		} catch (error) {
			console.error("Failed to open YouTube:", error);
		}
	}, []);

	const openStats = useCallback(async () => {
		try {
			await invoke("cmd_open_window", {
				label: "stats",
				title: "Statistics",
				width: 700,
				height: 500,
			});
		} catch (error) {
			console.error("Failed to open stats:", error);
		}
	}, []);

	const openNotes = useCallback(async () => {
		try {
			await invoke("cmd_open_window", {
				label: `note-${Date.now()}`,
				title: "Notes",
				width: 400,
				height: 500,
			});
		} catch (error) {
			console.error("Failed to open notes:", error);
		}
	}, []);

	const closePanel = useCallback(async () => {
		try {
			const win = getCurrentWindow();
			await win.close();
		} catch (error) {
			console.error("Failed to close panel:", error);
		}
	}, []);

	const toggleFloatMode = useCallback(async () => {
		try {
			await invoke("cmd_toggle_float_mode");
		} catch (error) {
			console.error("Failed to toggle float mode:", error);
		}
	}, []);

	// New task action (placeholder - will be implemented with task system)
	const newTask = useCallback(() => {
		// TODO: Implement when task system is ready
		console.log("New task shortcut triggered");
	}, []);

	// Register shortcuts
	const { registerShortcut } = useKeyboardShortcuts();

	useEffect(() => {
		// Timer shortcuts
		registerShortcut({
			command: "toggleTimer",
			handler: toggleTimer,
		});
		registerShortcut({
			command: "skipSession",
			handler: skipSession,
		});
		registerShortcut({
			command: "reset",
			handler: resetTimer,
		});
		registerShortcut({
			command: "newTask",
			handler: newTask,
		});

		// Navigation shortcuts
		registerShortcut({
			command: "commandPalette",
			handler: () => setShowCommandPalette(true),
		});
		registerShortcut({
			command: "openSettings",
			handler: openSettings,
		});
		registerShortcut({
			command: "openYouTube",
			handler: openYouTube,
		});
		registerShortcut({
			command: "openStats",
			handler: openStats,
		});
		registerShortcut({
			command: "openNotes",
			handler: openNotes,
		});

		// Window shortcuts
		registerShortcut({
			command: "closePanel",
			handler: closePanel,
		});
		registerShortcut({
			command: "toggleFloatMode",
			handler: toggleFloatMode,
		});
	}, [
		registerShortcut,
		toggleTimer,
		skipSession,
		resetTimer,
		newTask,
		openSettings,
		openYouTube,
		openStats,
		openNotes,
		closePanel,
		toggleFloatMode,
	]);

	// Build command palette commands
	const commands: Command[] = [
		{
			id: "toggleTimer",
			label: timerState === "running" ? "Pause Timer" : "Start Timer",
			description: "Start or pause the current Pomodoro session",
			category: "Timer",
			action: toggleTimer,
		},
		{
			id: "skipSession",
			label: "Skip Session",
			description: "Skip to the next session",
			category: "Timer",
			action: skipSession,
		},
		{
			id: "reset",
			label: "Reset Timer",
			description: "Reset the current timer",
			category: "Timer",
			action: resetTimer,
		},
		{
			id: "openSettings",
			label: "Open Settings",
			description: "Open the settings window",
			category: "Navigation",
			action: openSettings,
		},
		{
			id: "openYouTube",
			label: "Open YouTube",
			description: "Open the YouTube music player",
			category: "Navigation",
			action: openYouTube,
		},
		{
			id: "openStats",
			label: "Open Statistics",
			description: "View your Pomodoro statistics",
			category: "Navigation",
			action: openStats,
		},
		{
			id: "openNotes",
			label: "Open Notes",
			description: "Open a new notes window",
			category: "Navigation",
			action: openNotes,
		},
		{
			id: "toggleFloatMode",
			label: "Toggle Float Mode",
			description: "Toggle always-on-top float mode",
			category: "Window",
			action: toggleFloatMode,
		},
	];

	const contextValue: KeyboardShortcutsContextValue = {
		toggleTimer,
		skipSession,
		resetTimer,
	};

	return (
		<KeyboardShortcutsContext.Provider value={contextValue}>
			{children}
			<CommandPalette
				isOpen={showCommandPalette}
				onClose={() => setShowCommandPalette(false)}
				commands={commands}
				theme={theme}
			/>
		</KeyboardShortcutsContext.Provider>
	);
}
