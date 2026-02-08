let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function playAlarmSound(): void {
  const ctx = getAudioContext();
  const timings = [0, 0.25, 0.5, 0.9, 1.15, 1.4];

  for (const delay of timings) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.frequency.value = delay < 0.6 ? 880 : 1100;
    oscillator.type = "sine";

    const start = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.25, start);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);

    oscillator.start(start);
    oscillator.stop(start + 0.2);
  }
}

export function playClickSound(): void {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.frequency.value = 600;
  oscillator.type = "sine";

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  oscillator.start(now);
  oscillator.stop(now + 0.05);
}
