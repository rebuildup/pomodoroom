import type { TimerMode } from "@/types";
import { MODE_COLORS } from "@/types";

interface CircularProgressProps {
  progress: number;
  mode: TimerMode;
  timeLeft: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({
  progress,
  mode,
  timeLeft,
  size = 280,
  strokeWidth = 6,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const accentColor = MODE_COLORS[mode];

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="timer-ring"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-ring-bg)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="timer-ring-progress"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="timer-digits"
          style={{ color: accentColor }}
        >
          {timeString}
        </span>
      </div>
    </div>
  );
}
