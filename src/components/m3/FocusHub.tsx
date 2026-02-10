/**
 * Material 3 Focus Hub Component
 *
 * Focus session management with timer, break controls,
 * session stats, and task context display.
 *
 * This is the M3 version of FocusHub following Material 3 design principles.
 *
 * @example
 * ```tsx
 * <FocusHub
 *   timer={{ remainingSeconds: 1500, ... }}
 *   onToggle={() => {}}
 *   onSkip={() => {}}
 * />
 * ```
 */

import React, { useCallback, useMemo } from "react";
import { Icon } from "./Icon";
import { SessionCard, type SessionData, type TaskContext, type PomodoroCount, type SessionStats } from "./SessionCard";
import { PressureBadge } from "./PressureBadge";
import type { PressureMode } from "@/types/pressure";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TimerState {
	/** Remaining seconds in current session */
	remainingSeconds: number;
	/** Total seconds for current session */
	totalSeconds: number;
	/** Progress percentage (0-1) */
	progress: number;
	/** Whether timer is currently running */
	isActive: boolean;
	/** Whether timer is paused */
	isPaused: boolean;
	/** Whether timer is idle */
	isIdle: boolean;
	/** Current step type */
	stepType: "focus" | "break";
	/** Current step label */
	stepLabel: string;
	/** Current step index */
	stepIndex: number;
}

export interface FocusHubProps {
	/** Timer state from useTauriTimer or similar */
	timer: TimerState;
	/** Start timer command */
	onStart: () => void | Promise<void>;
	/** Pause timer command */
	onPause: () => void | Promise<void>;
	/** Resume timer command */
	onResume: () => void | Promise<void>;
	/** Skip current step */
	onSkip: () => void | Promise<void>;
	/** Reset timer */
	onReset: () => void | Promise<void>;
	/** Current task context */
	task?: TaskContext | null;
	/** Pressure mode (optional) */
	pressureMode?: PressureMode;
	/** Pressure value for badge (optional) */
	pressureValue?: number;
	/** Session stats (optional) */
	stats?: SessionStats;
	/** Custom className for styling */
	className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format seconds as MM:SS
 */
function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Get step type as SessionType
 */
function getStepType(stepType: "focus" | "break", stepIndex: number): SessionData["type"] {
	if (stepType === "break") {
		// Determine break type based on step index (typically every 4th break is long)
		// This is a simplified heuristic - real logic should come from engine
		return stepIndex > 0 && stepIndex % 4 === 0 ? "longBreak" : "shortBreak";
	}
	return "focus";
}

/**
 * Calculate pomodoro count from step index
 */
function getPomodoroCount(stepIndex: number, totalUntilLongBreak: number = 4): PomodoroCount {
	const completed = Math.floor(stepIndex / 2); // Each focus session is one pomodoro
	return {
		completed,
		total: totalUntilLongBreak,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timer display with large countdown and controls
 */
interface TimerDisplayProps {
	timer: TimerState;
	onStart: () => void;
	onPause: () => void;
	onResume: () => void;
	onSkip: () => void;
	onReset: () => void;
	pressureMode?: PressureMode;
	pressureValue?: number;
}

function TimerDisplay({
	timer,
	onStart,
	onPause,
	onResume,
	onSkip,
	onReset,
	pressureMode,
	pressureValue,
}: TimerDisplayProps) {
	const { remainingSeconds, progress, isActive, isPaused, stepType, stepLabel } = timer;
	const isFocus = stepType === "focus";

	return (
		<div className="flex flex-col items-center justify-center gap-4 p-6 bg-[var(--md-ref-color-surface-container)] rounded-2xl">
			{/* Status header */}
			<div className="flex items-center justify-between w-full">
				<div className="flex items-center gap-2">
					<div
						className={`w-2 h-2 rounded-full ${
							isActive ? "bg-[var(--md-ref-color-primary)] animate-pulse" : "bg-[var(--md-ref-color-outline)]"
						}`}
					/>
					<span className="text-xs font-mono font-bold tracking-widest uppercase text-[var(--md-ref-color-on-surface-variant)]">
						{isActive ? (isFocus ? "Focus" : "Break") : isPaused ? "Paused" : "Ready"}
					</span>
				</div>

				{/* Pressure badge */}
				{pressureMode && (
					<PressureBadge mode={pressureMode} value={pressureValue} size="sm" />
				)}
			</div>

			{/* Large countdown */}
			<div className="text-6xl font-mono font-bold tracking-tight tabular-nums text-[var(--md-ref-color-on-surface)] leading-none">
				{formatTime(remainingSeconds)}
			</div>

			{/* Step label */}
			<div className="text-sm font-medium text-[var(--md-ref-color-on-surface-variant)]">
				{stepLabel}
			</div>

			{/* Progress bar */}
			<div className="w-full h-2 bg-[var(--md-ref-color-surface-container-highest)] rounded-full overflow-hidden">
				<div
					className="h-full transition-all duration-300 ease-out bg-[var(--md-ref-color-primary)]"
					style={{ width: `${progress * 100}%` }}
				/>
			</div>

			{/* Controls */}
			<div className="flex items-center gap-2">
				{isActive || isPaused ? (
					<>
						{/* Pause/Resume button */}
						<button
							type="button"
							onClick={isActive ? onPause : onResume}
							className="flex items-center justify-center w-14 h-14 rounded-full bg-[var(--md-ref-color-primary-container)] text-[var(--md-ref-color-on-primary-container)] hover:bg-[var(--md-ref-color-primary)] hover:text-[var(--md-ref-color-on-primary)] transition-all active:scale-95"
							title={isActive ? "Pause" : "Resume"}
						>
							<Icon name={isActive ? "pause" : "play_arrow"} size={28} filled={isActive} />
						</button>

						{/* Skip button */}
						<button
							type="button"
							onClick={onSkip}
							className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--md-ref-color-secondary-container)] text-[var(--md-ref-color-on-secondary-container)] hover:bg-[var(--md-ref-color-secondary)] hover:text-[var(--md-ref-color-on-secondary)] transition-all active:scale-95"
							title="Skip"
						>
							<Icon name="skip_next" size={24} />
						</button>

						{/* Reset button */}
						<button
							type="button"
							onClick={onReset}
							className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface)] hover:text-[var(--md-ref-color-on-surface)] transition-all active:scale-95"
							title="Reset"
						>
							<Icon name="refresh" size={20} />
						</button>
					</>
				) : (
					/* Start button */
					<button
						type="button"
						onClick={onStart}
						className="flex items-center gap-2 px-8 py-3 rounded-full bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] font-medium hover:bg-[var(--md-ref-color-primary-container)] hover:text-[var(--md-ref-color-on-primary-container)] transition-all active:scale-95"
					>
						<Icon name="play_arrow" size={24} filled />
						Start
					</button>
				)}
			</div>
		</div>
	);
}

/**
 * Task context display
 */
interface TaskContextDisplayProps {
	task?: TaskContext | null;
	pomodoroCount?: PomodoroCount;
	stepType: "focus" | "break";
	stepIndex: number;
}

function TaskContextDisplay({ task, pomodoroCount, stepType }: TaskContextDisplayProps) {
	if (stepType !== "focus" || !task) {
		return (
			<div className="flex flex-col items-center justify-center p-6 bg-[var(--md-ref-color-surface-container)] rounded-2xl text-[var(--md-ref-color-on-surface-variant)]">
				<Icon name="schedule" size={32} className="opacity-50 mb-2" />
				<span className="text-sm">No active task</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col p-5 bg-[var(--md-ref-color-surface-container)] rounded-2xl">
			{/* Task title */}
			<div className="text-lg font-medium text-[var(--md-ref-color-on-surface)] truncate">
				{task.title}
			</div>

			{/* Task metadata */}
			{(task.project || (task.tags && task.tags.length > 0)) && (
				<div className="flex items-center gap-2 mt-1">
					{task.project && (
						<div className="flex items-center gap-1 px-2 py-0.5 bg-[var(--md-ref-color-secondary-container)] text-[var(--md-ref-color-on-secondary-container)] rounded-full text-xs">
							<Icon name="folder" size={12} />
							<span className="truncate max-w-32">{task.project}</span>
						</div>
					)}
					{task.tags && task.tags.slice(0, 2).map((tag) => (
						<div
							key={tag}
							className="px-2 py-0.5 bg-[var(--md-ref-color-tertiary-container)] text-[var(--md-ref-color-on-tertiary-container)] rounded-full text-xs truncate"
						>
							{tag}
						</div>
					))}
				</div>
			)}

			{/* Pomodoro counter */}
			{pomodoroCount && (
				<div className="flex items-center gap-2 mt-4">
					<span className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
						Session Progress
					</span>
					<div className="flex-1 h-1.5 bg-[var(--md-ref-color-surface-container-highest)] rounded-full overflow-hidden">
						<div
							className="h-full bg-[var(--md-ref-color-primary)] transition-all duration-300"
							style={{ width: `${(pomodoroCount.completed / pomodoroCount.total) * 100}%` }}
						/>
					</div>
					<span className="text-xs font-mono tabular-nums text-[var(--md-ref-color-on-surface-variant)]">
						{pomodoroCount.completed}/{pomodoroCount.total}
					</span>
				</div>
			)}

			{/* Pomodoro dots */}
			{pomodoroCount && (
				<div className="flex items-center gap-1.5 mt-3">
					{Array.from({ length: pomodoroCount.total }, (_, i) => (
						<div
							key={i}
							className={`w-2 h-2 rounded-full transition-colors ${
								i < pomodoroCount.completed
									? "bg-[var(--md-ref-color-primary)]"
									: "bg-[var(--md-ref-color-outline-variant)]"
							}`}
						/>
					))}
					<span className="text-xs text-[var(--md-ref-color-on-surface-variant)] ml-1">
						until long break
					</span>
				</div>
			)}
		</div>
	);
}

/**
 * Break controls for managing breaks
 */
interface BreakControlsProps {
	stepType: "focus" | "break";
	stepIndex: number;
	onSkip: () => void;
}

function BreakControls({ stepType, stepIndex, onSkip }: BreakControlsProps) {
	if (stepType !== "break") return null;

	const isLongBreak = stepIndex > 0 && stepIndex % 4 === 0;

	return (
		<div className="flex flex-col p-4 bg-[var(--md-ref-color-secondary-container)] rounded-2xl">
			<div className="flex items-center gap-2 mb-3">
				<Icon name="spa" size={20} className="text-[var(--md-ref-color-on-secondary-container)]" />
				<span className="text-sm font-medium text-[var(--md-ref-color-on-secondary-container)]">
					{isLongBreak ? "Long Break" : "Short Break"}
				</span>
			</div>

			<p className="text-xs text-[var(--md-ref-color-on-secondary-container)] opacity-80 mb-3">
				{isLongBreak
					? "Take a longer break to recharge. Stretch, walk, or do something relaxing."
					: "Quick break! Step away from your screen, stretch, or grab water."}
			</p>

			<button
				type="button"
				onClick={onSkip}
				className="flex items-center justify-center gap-1 w-full px-4 py-2 rounded-full bg-[var(--md-ref-color-on-secondary-container)] text-[var(--md-ref-color-secondary-container)] text-sm font-medium hover:opacity-90 transition-opacity active:scale-95"
			>
				<Icon name="skip_next" size={18} />
				Skip Break
			</button>
		</div>
	);
}

/**
 * Session stats display
 */
interface SessionStatsDisplayProps {
	stats?: SessionStats;
}

function SessionStatsDisplay({ stats }: SessionStatsDisplayProps) {
	if (!stats) return null;

	return (
		<div className="flex flex-col p-4 bg-[var(--md-ref-color-surface-container-low)] rounded-2xl">
			<span className="text-xs font-bold tracking-wider uppercase text-[var(--md-ref-color-on-surface-variant)] mb-3">
				Today's Progress
			</span>

			<div className="grid grid-cols-3 gap-3">
				{/* Sessions */}
				<div className="flex flex-col items-center">
					<span className="text-2xl font-mono font-bold tabular-nums text-[var(--md-ref-color-primary)]">
						{stats.todaySessions}
					</span>
					<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
						Sessions
					</span>
				</div>

				{/* Focus time */}
				<div className="flex flex-col items-center">
					<span className="text-2xl font-mono font-bold tabular-nums text-[var(--md-ref-color-secondary)]">
						{stats.todayFocusMinutes}m
					</span>
					<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
						Focus
					</span>
				</div>

				{/* Streak */}
				<div className="flex flex-col items-center">
					<span className="text-2xl font-mono font-bold tabular-nums text-[var(--md-ref-color-tertiary)]">
						{stats.streak ?? 0}
					</span>
					<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
						Streak
					</span>
				</div>
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Material 3 Focus Hub.
 *
 * Main focus session management component with timer display,
 * task context, break controls, and session stats.
 */
export const FocusHub: React.FC<FocusHubProps> = ({
	timer,
	onStart,
	onPause,
	onResume,
	onSkip,
	onReset,
	task,
	pressureMode,
	pressureValue,
	stats,
	className = "",
}) => {
	// Wrap async commands to handle both sync and async
	const handleStart = useCallback(() => {
		onStart();
	}, [onStart]);

	const handlePause = useCallback(() => {
		onPause();
	}, [onPause]);

	const handleResume = useCallback(() => {
		onResume();
	}, [onResume]);

	const handleSkip = useCallback(() => {
		onSkip();
	}, [onSkip]);

	const handleReset = useCallback(() => {
		onReset();
	}, [onReset]);

	// Calculate derived values
	const sessionType = useMemo(
		() => getStepType(timer.stepType, timer.stepIndex),
		[timer.stepType, timer.stepIndex],
	);

	const pomodoroCount = useMemo(
		() => getPomodoroCount(timer.stepIndex),
		[timer.stepIndex],
	);

	const sessionData: SessionData = useMemo(
		() => ({
			type: sessionType,
			remaining: timer.remainingSeconds,
			total: timer.totalSeconds,
			isActive: timer.isActive,
			isPaused: timer.isPaused,
		}),
		[sessionType, timer.remainingSeconds, timer.totalSeconds, timer.isActive, timer.isPaused],
	);

	return (
		<div
			className={`flex flex-col gap-4 bg-[var(--md-ref-color-surface)] p-4 ${className}`}
		>
			{/* Main timer display */}
			<TimerDisplay
				timer={timer}
				onStart={handleStart}
				onPause={handlePause}
				onResume={handleResume}
				onSkip={handleSkip}
				onReset={handleReset}
				pressureMode={pressureMode}
				pressureValue={pressureValue}
			/>

			{/* Two column layout for task and break info */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{/* Task context */}
				<TaskContextDisplay
					task={task}
					pomodoroCount={timer.stepType === "focus" ? pomodoroCount : undefined}
					stepType={timer.stepType}
					stepIndex={timer.stepIndex}
				/>

				{/* Break controls (during break) or session stats */}
				{timer.stepType === "break" ? (
					<BreakControls
						stepType={timer.stepType}
						stepIndex={timer.stepIndex}
						onSkip={handleSkip}
					/>
				) : (
					<SessionStatsDisplay stats={stats} />
				)}
			</div>

			{/* Compact session card (for small screens or alternate view) */}
			<div className="md:hidden">
				<SessionCard
					session={sessionData}
					task={task}
					pomodoroCount={pomodoroCount}
					stats={stats}
					size="compact"
				/>
			</div>
		</div>
	);
};

export default FocusHub;
