import type { YouTubeSource } from "./types";

export const parseYouTubeUrl = (url: string): YouTubeSource | null => {
	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname;

		let videoId: string | undefined;
		let playlistId: string | undefined;
		let index: number | undefined;

		if (hostname.includes("youtube.com")) {
			videoId = urlObj.searchParams.get("v") || undefined;
			playlistId = urlObj.searchParams.get("list") || undefined;
			const indexParam = urlObj.searchParams.get("index");
			if (indexParam) {
				index = Number.parseInt(indexParam, 10);
			}
		} else if (hostname.includes("youtu.be")) {
			videoId = urlObj.pathname.slice(1);
			playlistId = urlObj.searchParams.get("list") || undefined;
			const indexParam = urlObj.searchParams.get("index");
			if (indexParam) {
				index = Number.parseInt(indexParam, 10);
			}
		}

		if (!videoId && !playlistId) return null;

		let type: "video" | "playlist" | "mixed" = "video";
		if (videoId && playlistId) type = "mixed";
		else if (playlistId) type = "playlist";

		return { type, videoId, playlistId, index, rawUrl: url };
	} catch {
		return null;
	}
};
