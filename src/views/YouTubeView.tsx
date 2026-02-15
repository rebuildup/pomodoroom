/**
 * YouTubeView -- Standalone YouTube player window.
 *
 * Shares youtube URL and settings via localStorage.
 * Timer state comes from the Rust backend.
 */
import { useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import YouTubePlayer from "@/components/youtube/YouTubePlayer";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTheme } from "@/hooks/useTheme";

export default function YouTubeView() {
	const timer = useTauriTimer();
	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);
	const [youtubeUrl, setYoutubeUrl] = useLocalStorage<string>(
		"pomodoroom-youtube-url",
		"",
	);
	const { theme } = useTheme();
	const isActive = timer.snapshot?.state === "running" || timer.snapshot?.state === "paused";
	const pomodoroState = {
		isActive,
		sessionType:
			timer.stepType === "focus"
				? ("work" as const)
				: ("shortBreak" as const),
	};

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger shortcuts when typing in inputs
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			// Esc closes the YouTube window
			if (e.key === "Escape") {
				getCurrentWindow().close();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<KeyboardShortcutsProvider theme={theme}>
			<DetachedWindowShell title="YouTube" showMinMax={false}>
				<div
					className="absolute inset-0 overflow-hidden select-none bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
					onMouseDown={handleRightDown}
					onContextMenu={(e) => e.preventDefault()}
				>
					<YouTubePlayer
						pomodoroState={pomodoroState}
						theme={theme}
						url={youtubeUrl}
						onUrlChange={setYoutubeUrl}
						autoPlayOnFocusSession={
							settings.autoPlayOnFocusSession ?? true
						}
						pauseOnBreak={settings.pauseOnBreak ?? true}
						defaultVolume={settings.youtubeDefaultVolume ?? 50}
						loopEnabled={settings.youtubeLoop ?? true}
					/>
				</div>
			</DetachedWindowShell>
		</KeyboardShortcutsProvider>
	);
}
