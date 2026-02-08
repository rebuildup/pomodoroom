import { RotateCcw } from "lucide-react";
import type { TimerMode } from "@/types";
import { MODE_COLORS } from "@/types";

interface SessionIndicatorProps {
  completedSessions: number;
  longBreakInterval: number;
  mode: TimerMode;
  onReset: () => void;
}

export function SessionIndicator({
  completedSessions,
  longBreakInterval,
  mode,
  onReset,
}: SessionIndicatorProps) {
  const accentColor = MODE_COLORS[mode];
  const currentInCycle = completedSessions % longBreakInterval;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        {Array.from({ length: longBreakInterval }).map((_, i) => (
          <div
            key={`session-${i}-${completedSessions}`}
            className="session-dot"
            style={{
              backgroundColor:
                i < currentInCycle ? accentColor : "var(--color-ring-bg)",
            }}
          />
        ))}
      </div>
      <span className="text-xs text-secondary tabular-nums">
        {completedSessions} session{completedSessions !== 1 ? "s" : ""}
      </span>
      {completedSessions > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="text-secondary hover:text-primary transition-colors"
          title="Reset sessions"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}
