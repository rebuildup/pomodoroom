/**
 * TaskTimeRemaining — Display time information for task.
 *
 * Shows scheduled time or auto-calculated start time.
 */

import { useMemo } from "react";
import type { Task } from "@/types/task";
import { getDisplayStartTime } from "@/utils/auto-schedule-time";

interface TaskTimeRemainingProps {
	task: Task;
	/** All tasks for auto-schedule calculation */
	allTasks?: Task[];
	className?: string;
}

/**
 * Format datetime with relative labels for today/tomorrow.
 *
 * Today: time only (e.g., "14:30")
 * Tomorrow: "明日 14:30"
 * Other: "MM/DD HH:mm"
 */
function formatDateTime(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

	const timeStr = date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

	if (targetDate.getTime() === today.getTime()) {
		return timeStr; // Today: time only
	}
	if (targetDate.getTime() === tomorrow.getTime()) {
		return `明日 ${timeStr}`; // Tomorrow
	}
	const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
	return `${dateStr} ${timeStr}`; // Other days
}

/**
 * Calculate remaining minutes for a task.
 */
function calculateRemainingMinutes(task: Task): number | null {
	if (!task.estimatedMinutes) return null;
	const elapsed = task.elapsedMinutes || 0;
	const remaining = task.estimatedMinutes - elapsed;
	return Math.max(0, remaining);
}

/**
 * Format remaining time as human-readable string.
 */
function formatRemainingTime(minutes: number): string {
	if (minutes < 60) {
		return `${minutes}分残り`;
	}
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (mins === 0) {
		return `${hours}時間残り`;
	}
	return `${hours}時間${mins}分残り`;
}

/**
 * TaskTimeRemaining component.
 *
 * Displays scheduled start time based on available data.
 * Priority: fixedStartAt > windowStartAt > auto-calculated time
 * Format: Today = time only, Tomorrow = "明日 時間", Other = "MM/DD HH:mm"
 */
export function TaskTimeRemaining({ task, allTasks = [], className }: TaskTimeRemainingProps) {
	const timeDisplay = useMemo(() => {
		// Get display start time (explicit or auto-calculated)
		const startTime = getDisplayStartTime(task, allTasks);
		
		if (!startTime) {
			return null;
		}

		return formatDateTime(startTime);
	}, [task, allTasks]);

	if (!timeDisplay) {
		return null;
	}

	const isAutoCalculated = !task.fixedStartAt && !task.windowStartAt;

	return (
		<div
			className={`text-[11px] text-[var(--md-ref-color-on-surface-variant)] ${
				isAutoCalculated ? "opacity-60" : ""
			} ${className || ""}`}
			aria-label={`タスク時間: ${task.title}`}
			title={isAutoCalculated ? "自動計算された開始時間" : undefined}
		>
			{timeDisplay}
		</div>
	);
}
