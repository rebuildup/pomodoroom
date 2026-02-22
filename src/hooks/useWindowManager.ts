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
		width: 240,
		height: 240,
		decorations: false,
		transparent: true,
		shadow: true,
		always_on_top: true,
		resizable: true,
	},
	note: {
		title: "Note",
		width: 320,
		height: 320,
		decorations: false,
		shadow: true,
		always_on_top: true,
		resizable: true,
	},
	timeline: {
		title: "Timeline",
		width: 480,
		height: 760,
		decorations: false,
		shadow: true,
		resizable: true,
	},
	guidance_timer: {
		title: "Guidance Timer",
		width: 460,
		height: 180,
		decorations: false,
		shadow: true,
		always_on_top: true,
		resizable: true,
	},
	guidance_board: {
		title: "Guidance Board",
		width: 1180,
		height: 160,
		decorations: false,
		shadow: true,
		always_on_top: true,
		resizable: true,
	},
	project_pins: {
		title: "Pinned Projects",
		width: 900,
		height: 620,
		decorations: false,
		shadow: true,
		resizable: true,
	},
	daily_time: {
		title: "生活時間",
		width: 900,
		height: 700,
		decorations: false,
		shadow: true,
		resizable: true,
	},
};

let noteCounter = 0;

export function useWindowManager() {
	const openWindow = useCallback(
		async (type: string, overrides?: Partial<WindowPreset>): Promise<string | undefined> => {
			console.log(`[useWindowManager] Opening window type: ${type}`);
			const preset = PRESETS[type];
			if (!preset) {
				console.error(`[useWindowManager] Unknown window type: ${type}`);
				return undefined;
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
				transparent: preset.transparent ?? true,
				shadow:
					overrides?.shadow ??
					((overrides?.transparent ?? preset.transparent ?? true) ? false : (preset.shadow ?? true)),
				resizable: preset.resizable ?? true,
				...overrides,
			};

			console.log(`[useWindowManager] Invoking cmd_open_window with:`, options);
			try {
				await invoke("cmd_open_window", { options });
				console.log(`[useWindowManager] cmd_open_window completed for: ${label}`);
				return label;
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(`[useWindowManager] cmd_open_window failed for window type "${type}" label "${label}":`, err.message);
				return undefined;
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
