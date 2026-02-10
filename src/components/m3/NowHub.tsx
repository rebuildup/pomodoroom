/**
 * Material 3 NowHub Component
 *
 * Main timer display for M2 Main Screen.
 * Central focus area with large timer, current task title, and controls.
 *
 * Features:
 * - Large countdown timer (XX:MM format)
 * - Current task title display
 * - Start/Pause/Skip controls
 * - Pressure badge integration
 * - Material 3 styling with M3 color tokens
 *
 * @example
 * ```tsx
 * <NowHub
 *   remainingMs={150000}
 *   totalMs={1500000}
 *   isActive={true}
 *   isPaused={false}
 *   stepType="focus"
 *   currentTask="Review pull requests"
 *   pressureMode="pressure"
 *   pressureValue={45}
 *   onPlayPause={() => {}}
 *   onSkip={() => {}}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";
import { PressureBadge } from "./PressureBadge";
import { TimerDisplay } from "./TimerDisplay";
import { TimerControls } from "./TimerControls";
import type { PressureMode } from "@/types/pressure";

export interface NowHubProps {
	/** Remaining time in milliseconds */
	remainingMs: number;
	/** Total duration in milliseconds */
	totalMs: number;
	/** Whether timer is currently running */
	isActive: boolean;
	/** Current step type (focus or break) */
	stepType: "focus" | "break";
	/** Current task title */
	currentTask?: string | null;
	/** Pressure mode for badge */
	pressureMode?: PressureMode;
	/** Pressure value for badge */
	pressureValue?: number;
	/** Play/Pause button click handler */
	onPlayPause: () => void;
	/** Skip button click handler */
	onSkip: () => void;
	/** Custom className for styling */
	className?: string;
	/** Whether to show centiseconds in timer */
	showCentiseconds?: boolean;
}

/**
 * Get step label text
 */
function getStepLabel(stepType: "focus" | "break"): string {
	return stepType === "focus" ? "Focus" : "Break";
}

/**
 * Material 3 NowHub
 *
 * Central timer component for the main screen.
 * Combines timer display, task title, pressure indicator, and controls.
 */
export const NowHub: React.FC<NowHubProps> = ({
	remainingMs,
	totalMs,
	isActive,
	stepType,
	currentTask = null,
	pressureMode = "normal",
	pressureValue,
	onPlayPause,
	onSkip,
	className = "",
	showCentiseconds = false,
}) => {
	const stepLabel = getStepLabel(stepType);

	return (
		<div className={`flex flex-col items-center justify-center ${className}`}>
			{/* Step Label */}
			<div className="text-sm tracking-[0.4em] uppercase font-bold opacity-30 pointer-events-none text-white mb-4">
				{stepLabel}
			</div>

			{/* Timer Display */}
			<div className="relative mb-6">
				{/* Circular Progress Ring */}
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<svg
						className="w-full h-full"
						viewBox="0 0 100 100"
						aria-hidden="true"
						style={{ transform: "rotate(90deg) scaleX(-1)", width: "min(70vmin, 420px)", height: "min(70vmin, 420px)" }}
					>
						{/* Track */}
						<circle
							cx="50"
							cy="50"
							r="45"
							stroke="rgba(255, 255, 255, 0.15)"
							strokeWidth="3"
							fill="none"
						/>
						{/* Progress */}
						<circle
							cx="50"
							cy="50"
							r="45"
							stroke={stepType === "focus" ? "rgba(255, 255, 255, 0.6)" : "rgba(14, 165, 233, 0.7)"}
							strokeWidth="3"
							fill="none"
							strokeDasharray={Math.PI * 2 * 45}
							strokeDashoffset={Math.PI * 2 * 45 * (1 - (totalMs - remainingMs) / totalMs)}
							strokeLinecap="butt"
						/>
					</svg>
				</div>

				<TimerDisplay
					remainingMs={remainingMs}
					totalMs={totalMs}
					isActive={isActive}
					stepType={stepType}
					showCentiseconds={showCentiseconds}
				/>
			</div>

			{/* Current Task Title */}
			{currentTask && (
				<div className="mb-6 flex items-center gap-2">
					<Icon name="flag" size={16} className="text-white/50" />
					<span className="text-white/70 text-sm font-medium truncate max-w-md">
						{currentTask}
					</span>
				</div>
			)}

			{/* Timer Controls */}
			<TimerControls
				isActive={isActive}
				onPlayPause={onPlayPause}
				onSkip={onSkip}
				size="lg"
			/>

			{/* Pressure Badge */}
			<div className="mt-6">
				<PressureBadge
					mode={pressureMode}
					value={pressureValue}
					size="md"
				/>
			</div>
		</div>
	);
};

export default NowHub;
