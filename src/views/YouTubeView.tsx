/**
 * YouTubeView -- Standalone YouTube player window.
 *
 * Shares youtube URL and settings via localStorage.
 * Timer state comes from the Rust backend.
 */
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import TitleBar from "@/components/TitleBar";
import YouTubePlayer from "@/components/youtube/YouTubePlayer";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";

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

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

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
