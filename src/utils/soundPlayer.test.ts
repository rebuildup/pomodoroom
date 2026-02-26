import { describe, expect, it, vi } from "vitest";
import { playCustomSound } from "@/utils/soundPlayer";

describe("playCustomSound", () => {
	it("rejects with a load error when audio fails to load", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const OriginalAudio = globalThis.Audio;

		class MockAudio {
			public volume = 1;
			public onended: (() => void) | null = null;
			public onerror: ((event: Event) => void) | null = null;

			play(): Promise<void> {
				this.onerror?.(new Event("error"));
				return Promise.resolve();
			}
		}

		vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);

		try {
			await expect(playCustomSound("C:/tmp/missing.mp3", 0.5)).rejects.toThrow(
				"Failed to load audio file: C:/tmp/missing.mp3",
			);
		} finally {
			warnSpy.mockRestore();
			vi.unstubAllGlobals();
			globalThis.Audio = OriginalAudio;
		}
	});
});
