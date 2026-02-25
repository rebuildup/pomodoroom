/**
 * Material 3 Mini Timer Display Component
 *
 * Compact circular timer display for the Active floating component.
 * Shows time with centisecond precision and progress ring.
 *
 * @example
 * ```tsx
 * <MiniTimerDisplay
 *   remainingMs={150000}
 *   totalMs={1500000}
 *   isActive={true}
 *   stepType="focus"
 *   highlightColor="#ff6b35"
 * />
 * ```
 */

import type React from "react";
import { useMemo } from "react";

export interface MiniTimerDisplayProps {
	/** Remaining time in milliseconds */
	remainingMs: number;
	/** Total duration in milliseconds */
	totalMs: number;
	/** Whether timer is currently running */
	isActive: boolean;
	/** Current step type (focus or break) */
	stepType: "focus" | "break";
	/** Highlight color for the progress ring */
	highlightColor?: string;
	/** Custom className for styling */
	className?: string;
}

/**
 * Format time to MM:SS.CC string
 */
function formatTime(ms: number): { minutes: string; seconds: string; centiseconds: string } {
	const minutes = Math.floor(ms / 60000);
	const seconds = Math.floor((ms % 60000) / 1000);
	const centiseconds = Math.floor((ms % 1000) / 10);

	return {
		minutes: String(minutes).padStart(2, "0"),
		seconds: String(seconds).padStart(2, "0"),
		centiseconds: String(centiseconds).padStart(2, "0"),
	};
}

/**
 * Get timer color based on state and step type
 */
function getTimerColor(stepType: "focus" | "break"): string {
	if (stepType === "focus") {
		return "#ff6b35"; // Orange for focus
	}
	return "#34d399"; // Emerald for break
}

/**
 * Material 3 Mini Timer Display
 *
 * Compact circular timer with progress ring for the Active floating component.
 * Optimized for 280x280 float mode window.
 */
export const MiniTimerDisplay: React.FC<MiniTimerDisplayProps> = ({
	remainingMs,
	totalMs,
	isActive,
	stepType,
	highlightColor: propHighlightColor,
	className = "",
}) => {
	const { minutes, seconds, centiseconds } = useMemo(() => formatTime(remainingMs), [remainingMs]);
	const defaultHighlightColor = useMemo(() => getTimerColor(stepType), [stepType]);
	const highlightColor = propHighlightColor ?? defaultHighlightColor;

	// Calculate progress for the ring
	const progress = totalMs > 0 ? 1 - remainingMs / totalMs : 0;
	const circumference = 2 * Math.PI * 46;
	const dashOffset = circumference * (1 - progress);

	return (
		<div className={`relative ${className}`}>
			{/* SVG Progress Ring */}
			<svg
				viewBox="0 0 100 100"
				className="w-full h-full -rotate-90"
				aria-label="Timer progress ring"
				style={{ width: "min(85vmin, 180px)", height: "min(85vmin, 180px)" }}
			>
				<title>
					Timer progress showing {minutes}:{seconds} remaining
				</title>
				{/* Background ring */}
				<circle
					cx="50"
					cy="50"
					r="46"
					fill="none"
					stroke="rgba(255,255,255,0.15)"
					strokeWidth="3"
				/>
				{/* Progress ring */}
				<circle
					cx="50"
					cy="50"
					r="46"
					fill="none"
					stroke={highlightColor}
					strokeWidth="3"
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={dashOffset}
					className={`transition-[stroke-dashoffset] duration-200 ${isActive ? "opacity-100" : "opacity-60"}`}
				/>
			</svg>

			{/* Time display */}
			<div className="absolute inset-0 flex items-center justify-center">
				<span
					className={`font-light tabular-nums text-white ${isActive ? "opacity-100" : "opacity-60 hover:opacity-80"} transition-opacity duration-300`}
					style={{ fontSize: "min(14vmin, 32px)" }}
				>
					{minutes}:{seconds}
					<span className="opacity-60" style={{ fontSize: "min(5vmin, 12px)" }}>
						.{centiseconds}
					</span>
				</span>
			</div>
		</div>
	);
};

export default MiniTimerDisplay;
