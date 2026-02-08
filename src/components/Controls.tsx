import { Play, Pause, RotateCcw, SkipForward } from "lucide-react";
import type { TimerMode, TimerStatus } from "@/types";
import { MODE_COLORS } from "@/types";
import { playClickSound } from "@/lib/audio";

interface ControlsProps {
  status: TimerStatus;
  mode: TimerMode;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSkip: () => void;
}

export function Controls({
  status,
  mode,
  onStart,
  onPause,
  onReset,
  onSkip,
}: ControlsProps) {
  const accentColor = MODE_COLORS[mode];

  const handleAction = (action: () => void) => {
    playClickSound();
    action();
  };

  return (
    <div className="flex items-center gap-5">
      <button
        type="button"
        onClick={() => handleAction(onReset)}
        className="control-btn control-btn-secondary"
        title="Reset"
        disabled={status === "idle"}
      >
        <RotateCcw size={20} />
      </button>

      <button
        type="button"
        onClick={() =>
          handleAction(status === "running" ? onPause : onStart)
        }
        className="control-btn control-btn-primary"
        style={{
          backgroundColor: accentColor,
          boxShadow: `0 4px 24px color-mix(in srgb, ${accentColor} 40%, transparent)`,
        }}
        title={status === "running" ? "Pause" : "Start"}
      >
        {status === "running" ? (
          <Pause size={28} fill="currentColor" />
        ) : (
          <Play size={28} fill="currentColor" className="ml-0.5" />
        )}
      </button>

      <button
        type="button"
        onClick={() => handleAction(onSkip)}
        className="control-btn control-btn-secondary"
        title="Skip"
      >
        <SkipForward size={20} />
      </button>
    </div>
  );
}
