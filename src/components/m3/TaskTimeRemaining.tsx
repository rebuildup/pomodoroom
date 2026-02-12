/**
 * TaskTimeRemaining — Display remaining time for task based on estimated time.
 *
 * Shows countdown/duration for tasks with estimated minutes.
 * Calculates remaining time considering already elapsed time.
 */

import { useMemo } from "react";
import type { Task } from "@/types/task";

interface TaskTimeRemainingProps {
	task: Task;
	className?: string;
}

/**
 * Calculate remaining minutes for a task.
 *
 * @returns Remaining minutes, or null if no estimate set
 */
function calculateRemainingMinutes(task: Task): number | null {
	if (!task.estimatedMinutes) return null;

	const elapsed = task.elapsedMinutes || 0;
	const remaining = task.estimatedMinutes - elapsed;
	return Math.max(0, remaining);
}

/**
 * Debug log for task calculation.
 */
function debugTaskCalculation(task: Task) {
	console.log('[TaskTimeRemaining] Task calculation:', {
		id: task.id,
		title: task.title,
		estimatedMinutes: task.estimatedMinutes,
		elapsedMinutes: task.elapsedMinutes,
		remaining: task.estimatedMinutes !== null
			? Math.max(0, task.estimatedMinutes - (task.elapsedMinutes || 0))
			: null,
	});
}

/**
 * Format remaining time as human-readable string.
 *
 * @returns Formatted string like "25分残り" or "1時間30分残り"
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
 * Get color class based on remaining time urgency.
 *
 * Green: > 60min remaining
 * Yellow: 30-60min remaining
 * Red: < 30min remaining
 */
function getRemainingTimeColor(minutes: number): string {
	if (minutes === null) return "text-gray-500";
	if (minutes > 60) return "text-green-400";
	if (minutes > 30) return "text-yellow-400";
	return "text-red-400";
}

/**
 * TaskTimeRemaining component.
 *
 * Displays a small time indicator showing remaining time based on
 * task's estimated_minutes and elapsed_minutes.
 */
export function TaskTimeRemaining({ task, className }: TaskTimeRemainingProps) {
	const remainingMinutes = useMemo(
		() => calculateRemainingMinutes(task),
		[task.estimatedMinutes, task.elapsedMinutes]
	);

	// Debug log
	useMemo(() => {
		debugTaskCalculation(task);
	}, [task]);

	const formattedTime = useMemo(
		() => remainingMinutes !== null ? formatRemainingTime(remainingMinutes) : "--",
		[remainingMinutes]
	);

	const colorClass = useMemo(
		() => remainingMinutes !== null ? getRemainingTimeColor(remainingMinutes) : "text-gray-500",
		[remainingMinutes]
	);

	if (remainingMinutes === null) {
		return null; // Don't show if no estimate
	}

	return (
		<div
			className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass} ${className || ""}`}
			aria-label={`タスク残り時間: ${task.title}`}
		>
			{formattedTime}
		</div>
	);
}
