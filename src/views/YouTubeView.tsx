/**
 * YouTubeView -- Standalone YouTube player window.
 *
 * Shares youtube URL and settings via localStorage.
 * Timer state comes from the Rust backend.
 */
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import TitleBar from "@/components/TitleBar";
import YouTubePlayer from "@/components/youtube/YouTubePlayer";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	shortBreakDuration: 5,
	longBreakDuration: 30,
	sessionsUntilLongBreak: 4,
	notificationSound: true,
	notificationVolume: 50,
	vibration: true,
	theme: "dark",
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
};

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

	const theme = settings.theme;
	const isActive = timer.snapshot?.state === "running" || timer.snapshot?.state === "paused";
	const pomodoroState = {
		isActive,
		sessionType:
			timer.stepType === "focus"
				? ("work" as const)
				: ("shortBreak" as const),
	};

	// Right-click drag
	const rightDragRef = useRef<{
		startX: number;
		startY: number;
		winX: number;
		winY: number;
		scale: number;
	} | null>(null);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = rightDragRef.current;
			if (!d) return;
			const dx = (e.screenX - d.startX) * d.scale;
			const dy = (e.screenY - d.startY) * d.scale;
			getCurrentWindow().setPosition(
				new PhysicalPosition(d.winX + dx, d.winY + dy),
			);
		};
		const onUp = () => {
			rightDragRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	const handleRightDown = useCallback(async (e: React.MouseEvent) => {
		if (e.button !== 2) return;
		e.preventDefault();
		try {
			const win = getCurrentWindow();
			const [pos, scale] = await Promise.all([
				win.outerPosition(),
				win.scaleFactor(),
			]);
			rightDragRef.current = {
				startX: e.screenX,
				startY: e.screenY,
				winX: pos.x,
				winY: pos.y,
				scale,
			};
		} catch {
			// Not in Tauri
		}
	}, []);

	return (
		<div
			className={`w-screen h-screen overflow-hidden select-none ${
				theme === "dark"
					? "bg-gray-900 text-white"
					: "bg-white text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar theme={theme} title="YouTube" showMinMax={false} />

			<div className="pt-8 h-[calc(100vh-2rem)]">
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
		</div>
	);
}
