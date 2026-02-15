let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

export function playNotificationSound(volume: number = 0.5) {
	try {
		const ctx = getAudioContext();
		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		oscillator.frequency.value = 800;
		oscillator.type = "sine";

		gainNode.gain.setValueAtTime(0, ctx.currentTime);
		gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
		gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

		oscillator.start(ctx.currentTime);
		oscillator.stop(ctx.currentTime + 0.5);

		setTimeout(() => {
			const oscillator2 = ctx.createOscillator();
			const gainNode2 = ctx.createGain();

			oscillator2.connect(gainNode2);
			gainNode2.connect(ctx.destination);

			oscillator2.frequency.value = 600;
			oscillator2.type = "sine";

			gainNode2.gain.setValueAtTime(0, ctx.currentTime);
			gainNode2.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
			gainNode2.gain.exponentialRampToValueAtTime(
				0.01,
				ctx.currentTime + 0.5,
			);

			oscillator2.start(ctx.currentTime);
			oscillator2.stop(ctx.currentTime + 0.5);
		}, 200);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error("[soundPlayer] Error playing notification sound:", err.message);
	}
}

export function playBreakStartSound(volume: number = 0.3) {
	try {
		const ctx = getAudioContext();
		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		oscillator.frequency.value = 400;
		oscillator.type = "sine";

		gainNode.gain.setValueAtTime(0, ctx.currentTime);
		gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
		gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

		oscillator.start(ctx.currentTime);
		oscillator.stop(ctx.currentTime + 0.8);
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error("[soundPlayer] Error playing break start sound:", err.message);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Sound Playback (HTML Audio Element)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a custom sound file using HTML Audio element.
 * Supports formats: MP3, WAV, OGG, and any browser-supported format.
 */
export function playCustomSound(
	filePath: string,
	volume: number = 0.5,
): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const audio = new Audio(`file://${filePath}`);
			audio.volume = Math.max(0, Math.min(1, volume));

			audio.onended = () => resolve();
			audio.onerror = () => {
				reject(new Error(`Failed to load audio file: ${filePath}`));
			};

			audio.play().catch((playError) => {
				reject(new Error(`Failed to play audio: ${playError}`));
			});
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			reject(err);
		}
	});
}

/**
 * Unified notification sound playback.
 * Uses custom sound if provided, falls back to default electronic sound on error.
 */
export async function playNotificationSoundMaybe(
	customPath: string | undefined,
	volume: number = 0.5,
): Promise<void> {
	if (customPath) {
		try {
			await playCustomSound(customPath, volume);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.warn("[soundPlayer] Custom sound failed, falling back to default:", err.message);
			// Fallback to default electronic sound
			playNotificationSound(volume);
		}
	} else {
		// Use default electronic sound
		playNotificationSound(volume);
	}
}
