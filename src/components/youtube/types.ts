export type YouTubeSourceType = "video" | "playlist" | "mixed";

export interface YouTubeSource {
	type: YouTubeSourceType;
	videoId?: string;
	playlistId?: string;
	index?: number;
	rawUrl: string;
}

export interface YouTubeSettings {
	isMinimized: boolean;
	loop: boolean;
}

export type YouTubePlaybackState = "idle" | "playing" | "paused" | "error";

export const DEFAULT_YOUTUBE_SETTINGS: YouTubeSettings = {
	isMinimized: false,
	loop: false,
};
