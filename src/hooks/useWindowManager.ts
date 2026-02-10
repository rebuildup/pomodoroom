/**
 * useWindowManager -- hook for opening/closing sub-windows via Tauri IPC.
 *
 * Each sub-window loads the same React bundle. The window `label` determines
 * which view component is rendered (checked in App.tsx).
 */
import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface WindowPreset {
	label: string;
	title: string;
	width: number;
	height: number;
	always_on_top?: boolean;
	decorations?: boolean;
	transparent?: boolean;
	shadow?: boolean;
	resizable?: boolean;
}

const PRESETS: Record<string, Omit<WindowPreset, "label">> = {
	settings: {
		title: "Settings",
		width: 420,
		height: 640,
		decorations: false,
		shadow: true,
		resizable: true,
	},
	"mini-timer": {
		title: "Mini Timer",
		width: 200,
		height: 220,
		decorations: false,
		transparent: false, // Changed: Windows transparent windows can cause freezes
		shadow: true,
		always_on_top: true,
		resizable: true,
	},
	youtube: {
		title: "YouTube",
		width: 420,
		height: 360,
		decorations: false,
		shadow: true,
		resizable: true,
	},
	stats: {
		title: "Statistics",
		width: 420,
		height: 580,
		decorations: false,
		shadow: true,
		resizable: true,
	},
	note: {
		title: "Note",
		width: 280,
		height: 320,
		decorations: false,
		shadow: true,
		always_on_top: true,
		resizable: true,
	},
	timeline: {
		title: "Timeline",
		width: 600,
		height: 500,
		decorations: false,
		shadow: true,
		resizable: true,
	},
};

let noteCounter = 0;

export function useWindowManager() {
	const openWindow = useCallback(
		async (type: string, overrides?: Partial<WindowPreset>) => {
			console.log(`[useWindowManager] Opening window type: ${type}`);
			const preset = PRESETS[type];
			if (!preset) {
				console.error(`[useWindowManager] Unknown window type: ${type}`);
				return;
			}

			// For notes, generate unique labels
			let label = type;
			if (type === "note") {
				noteCounter += 1;
				label = `note-${Date.now()}-${noteCounter}`;
			}

			const options = {
				label,
				title: preset.title,
				width: preset.width,
				height: preset.height,
				always_on_top: preset.always_on_top ?? false,
				decorations: preset.decorations ?? false,
				transparent: preset.transparent ?? false,
				shadow: preset.shadow ?? true,
				resizable: preset.resizable ?? true,
				...overrides,
			};

			console.log(`[useWindowManager] Invoking cmd_open_window with:`, options);
			try {
				await invoke("cmd_open_window", { options });
				console.log(`[useWindowManager] cmd_open_window completed for: ${label}`);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(`[useWindowManager] cmd_open_window failed for window type "${type}" label "${label}":`, err.message);
			}
		},
		[],
	);

	const closeWindow = useCallback(async (label: string) => {
		try {
			await invoke("cmd_close_window", { label });
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`[useWindowManager] cmd_close_window failed for window label "${label}":`, err.message);
		}
	}, []);

	const closeCurrentWindow = useCallback(async () => {
		try {
			await getCurrentWindow().close();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useWindowManager] close current window failed:", err.message);
		}
	}, []);

	return { openWindow, closeWindow, closeCurrentWindow };
}
