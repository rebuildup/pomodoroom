import type { TimerMode } from "@/types";
import { MODE_LABELS, MODE_COLORS } from "@/types";
import { playClickSound } from "@/lib/audio";

interface ModeSelectorProps {
  mode: TimerMode;
  onModeChange: (mode: TimerMode) => void;
}

const modes: TimerMode[] = ["pomodoro", "shortBreak", "longBreak"];

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface p-1.5">
      {modes.map((m) => {
        const isActive = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => {
              if (m !== mode) {
                playClickSound();
                onModeChange(m);
              }
            }}
            className="mode-tab"
            style={
              isActive
                ? {
                    backgroundColor: `color-mix(in srgb, ${MODE_COLORS[m]} 18%, transparent)`,
                    color: MODE_COLORS[m],
                  }
                : undefined
            }
          >
            {MODE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
