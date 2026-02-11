import { useEffect, useMemo, useState } from "react";
import { ElasticSlider } from "@/components/PomodoroElasticSlider";
import { Icon } from "@/components/m3/Icon";
import {
	DEFAULT_YOUTUBE_SETTINGS,
	type YouTubePlaybackState,
	type YouTubeSettings,
} from "./types";
import { parseYouTubeUrl } from "./utils";

// YouTube API Types
interface YouTubePlayerEvent {
	target: YouTubePlayer;
	data: number;
}

interface YouTubePlayer {
	getPlayerState(): number;
	playVideo(): void;
	pauseVideo(): void;
	setVolume(volume: number): void;
	isMuted(): boolean;
	mute(): void;
	unMute(): void;
	nextVideo(): void;
	previousVideo(): void;
	destroy(): void;
}

interface YouTubePlayerOptions {
	height: string | number;
	width: string | number;
	videoId?: string;
	playerVars?: {
		autoplay?: number;
		controls?: number;
		modestbranding?: number;
		rel?: number;
		loop?: number;
		listType?: string;
		list?: string;
		index?: number;
	};
	events?: {
		onReady?: (event: { target: YouTubePlayer }) => void;
		onStateChange?: (event: YouTubePlayerEvent) => void;
		onError?: (event: YouTubePlayerEvent) => void;
	};
}

interface YouTubeStatic {
	Player: new (elementId: string, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
	interface Window {
		onYouTubeIframeAPIReady: () => void;
		YT?: YouTubeStatic;
	}
}

interface YouTubePlayerProps {
	pomodoroState: {
		isActive: boolean;
		sessionType: "work" | "shortBreak" | "longBreak";
	};
	theme: "light" | "dark";
	url: string;
	onUrlChange: (url: string) => void;
	onToggleMinimize?: (isMinimized: boolean) => void;
	autoPlayOnFocusSession: boolean;
	pauseOnBreak: boolean;
	defaultVolume: number;
	loopEnabled: boolean;
}

export default function YouTubePlayer({
	pomodoroState,
	theme,
	url,
	onUrlChange,
	onToggleMinimize,
	autoPlayOnFocusSession,
	pauseOnBreak,
	defaultVolume,
	loopEnabled,
}: YouTubePlayerProps) {
	const [settings, setSettings] = useState<YouTubeSettings>(
		DEFAULT_YOUTUBE_SETTINGS,
	);

	useEffect(() => {
		setSettings((prev) => ({ ...prev, loop: loopEnabled }));
	}, [loopEnabled]);

	const source = useMemo(() => parseYouTubeUrl(url), [url]);

	const [playbackState, setPlaybackState] =
		useState<YouTubePlaybackState>("idle");
	const [player, setPlayer] = useState<YouTubePlayer | null>(null);
	const [isApiReady, setIsApiReady] = useState(false);
	const [inputUrl, setInputUrl] = useState(url);
	const [error, setError] = useState<string | null>(null);
	const [volume, setVolume] = useState(defaultVolume);
	const [isMuted, setIsMuted] = useState(false);
	const [showSettings, setShowSettings] = useState(false);

	const [uniqueId, setUniqueId] = useState("");

	useEffect(() => {
		setUniqueId(`youtube-player-${Math.random().toString(36).substr(2, 9)}`);
	}, []);

	useEffect(() => {
		setVolume(defaultVolume);
		if (player?.setVolume) {
			player.setVolume(defaultVolume);
		}
	}, [defaultVolume, player]);

	useEffect(() => {
		if (!window.YT) {
			const tag = document.createElement("script");
			tag.src = "https://www.youtube.com/iframe_api";
			const firstScriptTag = document.getElementsByTagName("script")[0];
			if (firstScriptTag && firstScriptTag.parentNode) {
				firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
			} else {
				document.head.appendChild(tag);
			}
			window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
		} else {
			setIsApiReady(true);
		}
	}, []);

	useEffect(() => {
		if (isApiReady && source && !player && window.YT) {
			const newPlayer = new window.YT.Player(uniqueId, {
				height: "100%",
				width: "100%",
				videoId:
					source.type === "video" || source.type === "mixed"
						? source.videoId
						: undefined,
				playerVars: {
					listType:
						source.type === "playlist" || source.type === "mixed"
							? "playlist"
							: undefined,
					list:
						source.type === "playlist" || source.type === "mixed"
							? source.playlistId
							: settings.loop && source.videoId
								? source.videoId
								: undefined,
					index: source.index,
					autoplay: 0,
					controls: 1,
					modestbranding: 1,
					rel: 0,
					loop: settings.loop ? 1 : 0,
				},
				events: {
					onReady: (event: { target: YouTubePlayer }) => {
						event.target.setVolume(volume);
						setPlaybackState("idle");
					},
					onStateChange: (event: YouTubePlayerEvent) => {
						if (event.data === 1) setPlaybackState("playing");
						if (event.data === 2) setPlaybackState("paused");
						if (event.data === 0 && settings.loop) {
							event.target.playVideo();
						}
					},
					onError: (event: YouTubePlayerEvent) => {
						setPlaybackState("error");
						console.error("YouTube Player Error:", event.data);
						let msg = "Playback error occurred.";
						if (event.data === 150 || event.data === 101) {
							msg = "This video does not allow embedded playback.";
						}
						setError(msg);
					},
				},
			});
			setPlayer(newPlayer);
		}
	}, [isApiReady, source, player, uniqueId, settings.loop, volume]);

	const handleSaveUrl = () => {
		const newSource = parseYouTubeUrl(inputUrl);
		if (newSource) {
			onUrlChange(inputUrl);
			setError(null);
			if (player) {
				player.destroy();
				setPlayer(null);
			}
		} else {
			setError("Invalid URL format.");
		}
	};

	useEffect(() => {
		if (player) {
			player.destroy();
			setPlayer(null);
		}
	}, [settings.loop, source, player]);

	useEffect(() => {
		if (!player?.playVideo) return;
		if (pomodoroState.isActive && pomodoroState.sessionType === "work") {
			if (autoPlayOnFocusSession) player.playVideo();
		} else if (
			pomodoroState.isActive &&
			(pomodoroState.sessionType === "shortBreak" ||
				pomodoroState.sessionType === "longBreak")
		) {
			if (pauseOnBreak) player.pauseVideo();
		}
	}, [
		pomodoroState.isActive,
		pomodoroState.sessionType,
		autoPlayOnFocusSession,
		pauseOnBreak,
		player,
	]);

	const handleVolumeChangeForSlider = (v: number) => {
		setVolume(v);
		if (player?.setVolume) player.setVolume(v);
	};

	const toggleMute = () => {
		if (player?.isMuted) {
			if (player.isMuted()) {
				player.unMute();
				setIsMuted(false);
			} else {
				player.mute();
				setIsMuted(true);
			}
		}
	};

	const togglePlay = () => {
		if (player?.getPlayerState) {
			const state = player.getPlayerState();
			if (state === 1) player.pauseVideo();
			else player.playVideo();
		}
	};

	const handleNext = () => player?.nextVideo?.();
	const handlePrevious = () => player?.previousVideo?.();

	const isMinimized = settings.isMinimized;
	const isPlaylist = source?.type === "playlist" || source?.type === "mixed";

	return (
		<div
			className={`flex flex-col w-full h-full overflow-hidden ${
				theme === "dark" ? "text-white" : "text-gray-900"
			}`}
		>
			<div
				className={`flex items-center justify-between p-2 border-b ${
					theme === "dark" ? "border-white/10" : "border-black/5"
				}`}
			>
				<div className="flex items-center gap-2">
					<span className="text-xs font-bold uppercase tracking-wider opacity-70">
						YouTube Player
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => {
							const newState = !isMinimized;
							setSettings({ ...settings, isMinimized: newState });
							onToggleMinimize?.(newState);
						}}
						className="p-1.5 rounded hover:bg-gray-500/20 transition-colors"
					>
						{isMinimized ? <Icon name="fullscreen" size={14} /> : <Icon name="fullscreen_exit" size={14} />}
					</button>
					<button
						type="button"
						onClick={() => setShowSettings(!showSettings)}
						className={`p-1.5 rounded hover:bg-gray-500/20 transition-colors ${showSettings ? "bg-gray-500/20" : ""}`}
					>
						<Icon name="settings" size={14} />
					</button>
				</div>
			</div>

			<div className="flex-1 relative bg-black">
				{!source ? (
					<div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs p-4 text-center">
						Please set a URL
					</div>
				) : uniqueId ? (
					<>
						<div id={uniqueId} className="w-full h-full" />
						{/* Error display */}
						{error && (
							<div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-400 text-xs p-4 text-center z-10">
								{error}
							</div>
						)}
					</>
				) : null}
			</div>

			{!isMinimized && (
				<div className="p-3 space-y-3 bg-transparent">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{isPlaylist && (
								<button
									type="button"
									onClick={handlePrevious}
									className={`p-2 rounded-full ${
										theme === "dark"
											? "hover:bg-gray-800 text-gray-300"
											: "hover:bg-gray-200 text-gray-700"
									}`}
								>
									<Icon name="skip_previous" size={16} filled />
								</button>
							)}
							<button
								type="button"
								onClick={togglePlay}
								className={`p-2 rounded-full ${
									theme === "dark"
										? "bg-white text-black hover:bg-gray-200"
										: "bg-black text-white hover:bg-gray-800"
								}`}
							>
								{playbackState === "playing" ? (
									<Icon name="pause" size={16} filled />
								) : (
									<Icon name="play_arrow" size={16} filled />
								)}
							</button>
							{isPlaylist && (
								<button
									type="button"
									onClick={handleNext}
									className={`p-2 rounded-full ${
										theme === "dark"
											? "hover:bg-gray-800 text-gray-300"
											: "hover:bg-gray-200 text-gray-700"
									}`}
								>
									<Icon name="skip_next" size={16} filled />
								</button>
							)}
						</div>

						<div className="flex items-center gap-2 flex-1 mx-4">
							<button type="button" onClick={toggleMute} className="text-gray-500 hover:text-gray-300">
								{isMuted || volume === 0 ? (
									<Icon name="volume_off" size={16} />
								) : (
									<Icon name="volume_up" size={16} />
								)}
							</button>
							<div className="flex-1">
								<ElasticSlider
									min={0}
									max={100}
									value={volume}
									onChange={handleVolumeChangeForSlider}
									accentColor="#3b82f6"
									ariaLabel="YouTube volume"
								/>
							</div>
						</div>
					</div>

					{showSettings && (
						<div
							className={`pt-3 border-t space-y-3 ${
								theme === "dark" ? "border-white/10" : "border-black/5"
							}`}
						>
							<div className="flex gap-2">
								<input
									type="text"
									value={inputUrl}
									onChange={(e) => setInputUrl(e.target.value)}
									placeholder="YouTube URL..."
									className={`flex-1 px-2 py-1.5 text-xs rounded border bg-transparent outline-none ${
										theme === "dark"
											? "border-white/20 focus:border-white/50"
											: "border-black/20 focus:border-black/50"
									}`}
								/>
								<button
									type="button"
									onClick={handleSaveUrl}
									className={`p-1.5 rounded border ${
										theme === "dark"
											? "border-white/20 hover:bg-white/10"
											: "border-black/20 hover:bg-black/5"
									}`}
								>
									<Icon name="save" size={14} />
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
