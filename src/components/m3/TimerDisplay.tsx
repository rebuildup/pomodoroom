/**
 * Material 3 Timer Display Component
 *
 * Large countdown timer for NowHub.
 * Shows time in XX:MM format with color coding by timer state.
 *
 * @example
 * ```tsx
 * <TimerDisplay
 *   remainingMs={150000}
 *   totalMs={1500000}
 *   isActive={true}
 *   stepType="focus"
 * />
 * ```
 */

import type React from "react";
import { useMemo } from "react";

export interface TimerDisplayProps {
	/** Remaining time in milliseconds */
	remainingMs: number;
	/** Total duration in milliseconds */
	totalMs: number;
	/** Whether timer is currently running */
	isActive: boolean;
	/** Current step type (focus or break) */
	stepType: "focus" | "break";
	/** Custom className for styling */
	className?: string;
	/** Whether to show centiseconds */
	showCentiseconds?: boolean;
}

/**
 * Format time to MM:SS string
 */
function formatTime(ms: number): { minutes: string; seconds: string; centiseconds: string } {
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
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
function getTimerColor(
	isActive: boolean,
	stepType: "focus" | "break",
): {
	text: string;
	accent: string;
} {
	if (stepType === "focus") {
		return {
			text: isActive ? "text-white" : "text-white/60",
			accent: "text-orange-400",
		};
	}
	return {
		text: isActive ? "text-white" : "text-white/60",
		accent: "text-emerald-400",
	};
}

/**
 * Material 3 Timer Display
 *
 * Large, prominent countdown timer with smooth transitions
 * and state-aware color coding.
 */
export const TimerDisplay: React.FC<TimerDisplayProps> = ({
	remainingMs,
	totalMs: _totalMs, // Reserved for future color/dynamic styling based on progress
	isActive,
	stepType,
	className = "",
	showCentiseconds = false,
}) => {
	const { minutes, seconds, centiseconds } = useMemo(() => formatTime(remainingMs), [remainingMs]);
	const colors = useMemo(() => getTimerColor(isActive, stepType), [isActive, stepType]);

	return (
		<div
			className={`flex items-baseline justify-center tabular-nums tracking-[-0.15em] select-none font-mono font-bold transition-opacity duration-300 ${colors.text} ${isActive ? "opacity-100" : "opacity-60 hover:opacity-80"} ${className}`.trim()}
			role="timer"
			aria-live={isActive ? "off" : "polite"}
			aria-atomic="true"
			aria-label={`${stepType === "focus" ? "Focus" : "Break"} timer: ${minutes} minutes ${seconds} seconds remaining${showCentiseconds ? ` ${centiseconds} centiseconds` : ""}`}
		>
			<span className="leading-none" style={{ fontSize: "min(12vmin, 72px)" }} aria-hidden="true">
				{minutes}
			</span>
			<span
				className={`leading-none -mx-[0.5vmin] ${isActive ? "animate-pulse" : "opacity-50"}`}
				style={{ fontSize: "min(12vmin, 72px)" }}
				aria-hidden="true"
			>
				:
			</span>
			<span className="leading-none" style={{ fontSize: "min(12vmin, 72px)" }} aria-hidden="true">
				{seconds}
			</span>
			{showCentiseconds && (
				<span
					className="leading-none ml-1 opacity-40 font-medium self-end mb-1"
					style={{ fontSize: "min(4vmin, 24px)" }}
					aria-hidden="true"
				>
					.{centiseconds}
				</span>
			)}
		</div>
	);
};

export default TimerDisplay;
