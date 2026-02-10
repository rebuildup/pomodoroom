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
import type { TaskState } from "@/types/task-state";

export interface NowHubProps {
	/** Remaining time in milliseconds */
	remainingMs: number;
	/** Total duration in milliseconds */
	totalMs: number;
	/** Whether timer is currently running */
	isActive: boolean;
	/** Current step type (focus or break) */
	stepType: "focus" | "break";
	/** Current task title (Anchor task) */
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
	/** Current task state for task operation buttons */
	currentTaskState?: TaskState;
	/** Complete task button click handler (RUNNING -> DONE) */
	onComplete?: () => void;
	/** Extend task button click handler (RUNNING -> RUNNING with timer reset) */
	onExtend?: () => void;
	/** Pause task button click handler (RUNNING -> PAUSED) */
	onPause?: () => void;
	/** Resume task button click handler (PAUSED -> RUNNING) */
	onResume?: () => void;
	/** Whether this is an Anchor task (single RUNNING task) */
	isAnchor?: boolean;
	/** Anchor task ID for task operations */
	anchorTaskId?: string | null;
}

/**
 * Get step label text
 */
function getStepLabel(stepType: "focus" | "break"): string {
	return stepType === "focus" ? "Focus" : "Break";
}

/**
 * Task operation button component
 * Material 3 styled button for task state transitions
 */
interface TaskOperationButtonProps {
	icon: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	variant?: "primary" | "secondary" | "success" | "warning";
}

const TaskOperationButton: React.FC<TaskOperationButtonProps> = ({
	icon,
	label,
	onClick,
	disabled = false,
	variant = "secondary",
}) => {
	const variantStyles = {
		primary: "bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] hover:opacity-90",
		secondary: "bg-white/10 backdrop-blur text-white hover:bg-white/20",
		success: "bg-green-500/80 backdrop-blur text-white hover:bg-green-500/90",
		warning: "bg-amber-500/80 backdrop-blur text-white hover:bg-amber-500/90",
	};

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className={`flex items-center gap-2 px-4 py-2 rounded-full ${variantStyles[variant]} ${disabled ? "opacity-30 cursor-not-allowed" : "active:scale-95"} transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30`}
		>
			<Icon name={icon as any} size={20} />
			<span className="text-sm font-medium">{label}</span>
		</button>
	);
};

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
	currentTaskState,
	onComplete,
	onExtend,
	onPause,
	onResume,
	isAnchor = false,
	anchorTaskId = null,
}) => {
	const stepLabel = getStepLabel(stepType);

	// Calculate progress percentage for aria-valuenow
	const progressPercent = Math.round(((totalMs - remainingMs) / totalMs) * 100);

	return (
		<div className={`flex flex-col items-center justify-center ${className}`} role="timer" aria-live="polite" aria-atomic="true">
			{/* Step Label */}
			<div className="text-sm tracking-[0.4em] uppercase font-bold opacity-30 pointer-events-none text-white mb-4" aria-hidden="true">
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

			{/* Current Task Title - Anchor gets special visual treatment */}
			{currentTask && (
				<div
					className={`mb-6 flex items-center gap-2 ${isAnchor ? "px-6 py-3 rounded-xl bg-white/10 border-2 border-white/20 shadow-lg" : ""}`}
					role="status"
					aria-label={`Current task: ${currentTask}${isAnchor ? " (Anchor task)" : ""}`}
				>
					{isAnchor && (
						<div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-md" aria-hidden="true">
							<Icon name="anchor" size={16} filled className="text-white" />
						</div>
					)}
					{!isAnchor && <Icon name="flag" size={16} className="text-white/50" aria-hidden="true" />}
					<div className="flex flex-col">
						<span className={`${isAnchor ? "text-white text-base font-semibold" : "text-white/70 text-sm font-medium"} truncate max-w-md`}>
							{currentTask}
						</span>
						{isAnchor && (
							<span className="text-xs text-blue-300/70 font-medium tracking-wide uppercase">
								Anchor
							</span>
						)}
					</div>
				</div>
			)}

			{/* Timer Controls */}
			<TimerControls
				isActive={isActive}
				onPlayPause={onPlayPause}
				onSkip={onSkip}
				size="lg"
			/>

			{/* Task Operation Buttons */}
			{currentTaskState && (
				<div className="mt-4 flex items-center gap-2 flex-wrap justify-center" role="group" aria-label="Task operations">
					{currentTaskState === "RUNNING" && (
						<>
							<TaskOperationButton
								icon="done_all"
								label="Complete"
								onClick={onComplete || (() => {})}
								variant="success"
								disabled={!onComplete}
							/>
							<TaskOperationButton
								icon="update"
								label="Extend"
								onClick={onExtend || (() => {})}
								variant="primary"
								disabled={!onExtend}
							/>
							<TaskOperationButton
								icon="pause"
								label="Pause"
								onClick={onPause || (() => {})}
								variant="warning"
								disabled={!onPause}
							/>
						</>
					)}
					{currentTaskState === "PAUSED" && (
						<TaskOperationButton
							icon="play_arrow"
							label="Resume"
							onClick={onResume || (() => {})}
							variant="success"
							disabled={!onResume}
						/>
					)}
				</div>
			)}

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
