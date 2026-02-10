/**
 * Material 3 Session Card Component
 *
 * Displays a focus session with timer and progress.
 * Shows task context, pomodoro counter, and session stats.
 *
 * @example
 * ```tsx
 * <SessionCard
 *   session={{ type: "focus", remaining: 1500, total: 1500 }}
 *   task={{ title: "Implement feature", project: "Pomodoroom" }}
 *   pomodoroCount={{ completed: 3, total: 4 }}
 *   onPress={() => {}}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SessionType = "focus" | "shortBreak" | "longBreak";

export interface SessionData {
	/** Session type */
	type: SessionType;
	/** Remaining seconds */
	remaining: number;
	/** Total seconds for this session */
	total: number;
	/** Whether the session is active */
	isActive?: boolean;
	/** Whether the session is paused */
	isPaused?: boolean;
}

export interface TaskContext {
	/** Task title */
	title: string;
	/** Project name (optional) */
	project?: string;
	/** Task tags */
	tags?: string[];
}

export interface PomodoroCount {
	/** Completed pomodoros in current cycle */
	completed: number;
	/** Total pomodoros until long break */
	total: number;
}

export interface SessionStats {
	/** Today's completed sessions */
	todaySessions: number;
	/** Total focus time today in minutes */
	todayFocusMinutes: number;
	/** Current streak */
	streak?: number;
}

export interface SessionCardProps {
	/** Session data */
	session: SessionData;
	/** Task context (optional) */
	task?: TaskContext | null;
	/** Pomodoro counter (optional) */
	pomodoroCount?: PomodoroCount;
	/** Session stats (optional) */
	stats?: SessionStats;
	/** Click handler */
	onPress?: () => void;
	/** Custom className for styling */
	className?: string;
	/** Size variant */
	size?: "compact" | "medium" | "large";
	/** Show full details (task, stats) */
	showDetails?: boolean;
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
 * Format minutes as human readable
 */
function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const rem = minutes % 60;
	return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Get session type label
 */
function getSessionLabel(type: SessionType): string {
	switch (type) {
		case "focus":
			return "Focus";
		case "shortBreak":
			return "Short Break";
		case "longBreak":
			return "Long Break";
	}
}

/**
 * Get session type color classes
 */
function getSessionColors(type: SessionType): {
	bg: string;
	text: string;
	border: string;
	icon: string;
} {
	switch (type) {
		case "focus":
			return {
				bg: "bg-[var(--md-ref-color-primary-container)]",
				text: "text-[var(--md-ref-color-on-primary-container)]",
				border: "border-[var(--md-ref-color-outline)]",
				icon: "timer",
			};
		case "shortBreak":
			return {
				bg: "bg-[var(--md-ref-color-secondary-container)]",
				text: "text-[var(--md-ref-color-on-secondary-container)]",
				border: "border-[var(--md-ref-color-outline)]",
				icon: "coffee",
			};
		case "longBreak":
			return {
				bg: "bg-[var(--md-ref-color-tertiary-container)]",
				text: "text-[var(--md-ref-color-on-tertiary-container)]",
				border: "border-[var(--md-ref-color-outline)]",
				icon: "spa",
			};
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Material 3 Session Card.
 *
 * Displays a focus session with timer, progress, and optional task context.
 */
export const SessionCard: React.FC<SessionCardProps> = ({
	session,
	task,
	pomodoroCount,
	stats,
	onPress,
	className = "",
	size = "medium",
	showDetails = true,
}) => {
	const { remaining, total, isActive, isPaused, type } = session;
	const colors = getSessionColors(type);

	// Progress calculation
	const progress = total > 0 ? (total - remaining) / total : 0;
	const progressPercent = Math.round(progress * 100);

	// Size variants
	const sizeClasses = {
		compact: {
			timer: "text-2xl",
			padding: "p-3",
			gap: "gap-2",
		},
		medium: {
			timer: "text-3xl",
			padding: "p-4",
			gap: "gap-3",
		},
		large: {
			timer: "text-4xl",
			padding: "p-5",
			gap: "gap-4",
		},
	}[size];

	const baseClasses = [
		"rounded-xl",
		"border",
		"transition-all",
		"duration-200",
		colors.bg,
		colors.border,
		onPress ? "cursor-pointer hover:shadow-md active:scale-[0.98]" : "",
		sizeClasses.padding,
		sizeClasses.gap,
		className,
	].filter(Boolean).join(" ");

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.key === 'Enter' || e.key === ' ') && onPress) {
			e.preventDefault();
			onPress();
		}
	};

	return (
		<div
			className={baseClasses}
			onClick={onPress}
			onKeyDown={handleKeyDown}
			role={onPress ? "button" : "article"}
			tabIndex={onPress ? 0 : undefined}
			aria-label={`${getSessionLabel(type)} session. ${isActive ? 'Active' : ''}${isPaused ? 'Paused' : ''} ${formatTime(remaining)} remaining`}
			aria-live={isActive ? "off" : "polite"}
		>
			{/* Header: Type label + status indicator */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Icon
						name={colors.icon as any}
						size={16}
						className={colors.text}
						aria-hidden="true"
					/>
					<span
						className={`text-xs font-bold tracking-wider uppercase ${colors.text} opacity-80`}
						aria-hidden="true"
					>
						{getSessionLabel(type)}
					</span>
				</div>

				{/* Status indicator */}
				{isActive && (
					<div
						className={`w-2 h-2 rounded-full ${colors.text} animate-pulse`}
						aria-label="Session is active"
						role="status"
					/>
				)}
				{isPaused && (
					<Icon name="pause" size={14} className={colors.text} opacity={0.6} aria-label="Session is paused" />
				)}
			</div>

			{/* Timer display */}
			<div
				className={`font-mono font-bold tabular-nums tracking-tight ${colors.text} ${sizeClasses.timer}`}
				role="timer"
				aria-live="polite"
				aria-atomic="true"
			>
				{formatTime(remaining)}
			</div>

			{/* Progress bar */}
			<div
				className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden"
				role="progressbar"
				aria-valuenow={progressPercent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={`${progressPercent}% complete`}
			>
				<div
					className={`h-full transition-all duration-300 ${colors.text}`}
					style={{ width: `${progressPercent}%` }}
					aria-hidden="true"
				/>
			</div>

			{/* Task context (when details shown) */}
			{showDetails && task && (
				<div className="pt-1 border-t border-black/10 dark:border-white/10">
					<div className={`font-medium truncate ${colors.text}`} role="heading" aria-level={3}>
						{task.title}
					</div>
					{(task.project || (task.tags && task.tags.length > 0)) && (
						<div className={`text-xs truncate ${colors.text} opacity-70}`}>
							{task.project || task.tags?.[0]}
						</div>
					)}
				</div>
			)}

			{/* Pomodoro counter (when shown) */}
			{showDetails && pomodoroCount && (
				<div className="flex items-center gap-1.5" role="group" aria-label={`Pomodoro progress: ${pomodoroCount.completed} of ${pomodoroCount.total} completed`}>
					{Array.from({ length: pomodoroCount.total }, (_, i) => (
						<div
							key={i}
							className={`w-1.5 h-1.5 rounded-full transition-colors ${
								i < pomodoroCount.completed
									? colors.text
									: "bg-black/10 dark:bg-white/10"
							}`}
							role="img"
							aria-label={i < pomodoroCount.completed ? "Completed pomodoro" : "Incomplete pomodoro"}
						/>
					))}
					<span className={`text-xs font-mono tabular-nums ${colors.text} opacity-70`}>
						{pomodoroCount.completed}/{pomodoroCount.total}
					</span>
				</div>
			)}

			{/* Session stats (when shown) */}
			{showDetails && stats && (
				<div className={`flex items-center gap-3 text-xs ${colors.text} opacity-70`} role="group" aria-label="Session statistics">
					<div className="flex items-center gap-1">
						<Icon name="today" size={12} aria-hidden="true" />
						<span className="font-mono tabular-nums" aria-label={`${stats.todaySessions} sessions today`}>
							{stats.todaySessions}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<Icon name="schedule" size={12} aria-hidden="true" />
						<span className="font-mono tabular-nums" aria-label={`${formatMinutes(stats.todayFocusMinutes)} focus time today`}>
							{formatMinutes(stats.todayFocusMinutes)}
						</span>
					</div>
					{stats.streak !== undefined && stats.streak > 0 && (
						<div className="flex items-center gap-1">
							<Icon name="local_fire_department" size={12} aria-hidden="true" />
							<span className="font-mono tabular-nums" aria-label={`${stats.streak} day streak`}>
								{stats.streak}
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default SessionCard;
