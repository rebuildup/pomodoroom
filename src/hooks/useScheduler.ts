/**
 * Hook for schedule generation using backend AutoScheduler.
 *
 * Provides functions to:
 * - Generate schedule for a specific day
 * - Auto-fill available time slots
 * - Manage schedule state and loading
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScheduleBlock, Task } from "@/types/schedule";

export interface ScheduleResult {
	blocks: ScheduleBlock[];
	tasks: Task[];
}

export interface UseSchedulerReturn {
	/** Current schedule blocks */
	blocks: ScheduleBlock[];
	/** Whether schedule is being generated */
	isLoading: boolean;
	/** Last error message */
	error: string | null;
	/** Generate schedule for a specific day */
	generateSchedule: (dateIso: string, calendarEvents?: ScheduleBlock[]) => Promise<void>;
	/** Auto-fill available time slots */
	autoFill: (dateIso: string, calendarEvents?: ScheduleBlock[]) => Promise<void>;
	/** Clear current schedule */
	clearSchedule: () => void;
}

/**
 * Hook for using the backend AutoScheduler.
 *
 * @example
 * ```tsx
 * const { blocks, isLoading, generateSchedule } = useScheduler();
 *
 * // Generate today's schedule
 * await generateSchedule("2024-01-15");
 * ```
 */
export function useScheduler(): UseSchedulerReturn {
	const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Generate schedule for a specific day using backend AutoScheduler.
	 *
	 * @param dateIso - Target date in ISO format (YYYY-MM-DD)
	 * @param calendarEvents - Optional array of calendar events to avoid
	 */
	const generateSchedule = useCallback(async (dateIso: string, calendarEvents?: ScheduleBlock[]) => {
		setIsLoading(true);
		setError(null);

		try {
			// Convert ScheduleBlock to CalendarEvent format expected by backend
			const calendarEventsJson = calendarEvents?.map(event => ({
				id: event.id,
				title: event.label || event.blockType,
				start_time: event.startTime,
				end_time: event.endTime,
			}));

			// Call backend command
			const scheduledBlocks = await invoke<any[]>("cmd_schedule_generate", {
				dateIso,
				calendarEventsJson: calendarEventsJson || null,
			});

			// Convert backend response to ScheduleBlock format
			const convertedBlocks: ScheduleBlock[] = scheduledBlocks.map(block => ({
				id: block.id,
				blockType: "focus", // Backend doesn't distinguish, default to focus
				taskId: block.task_id,
				startTime: block.start_time,
				endTime: block.end_time,
				locked: false,
				label: block.task_title,
				lane: 0,
			}));

			setBlocks(convertedBlocks);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(`Failed to generate schedule: ${message}`);
			console.error("Schedule generation error:", err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	/**
	 * Auto-fill available time slots with top priority tasks.
	 *
	 * Simpler version that just fills gaps without complex optimization.
	 *
	 * @param dateIso - Target date in ISO format (YYYY-MM-DD)
	 * @param calendarEvents - Optional array of calendar events to avoid
	 */
	const autoFill = useCallback(async (dateIso: string, calendarEvents?: ScheduleBlock[]) => {
		setIsLoading(true);
		setError(null);

		try {
			// Convert ScheduleBlock to CalendarEvent format
			const calendarEventsJson = calendarEvents?.map(event => ({
				id: event.id,
				title: event.label || event.blockType,
				start_time: event.startTime,
				end_time: event.endTime,
			}));

			// Call backend command
			const scheduledBlocks = await invoke<any[]>("cmd_schedule_auto_fill", {
				dateIso,
				calendarEventsJson: calendarEventsJson || null,
			});

			// Convert backend response to ScheduleBlock format
			const convertedBlocks: ScheduleBlock[] = scheduledBlocks.map(block => ({
				id: block.id,
				blockType: "focus",
				taskId: block.task_id,
				startTime: block.start_time,
				endTime: block.end_time,
				locked: false,
				label: block.task_title,
				lane: 0,
			}));

			setBlocks(convertedBlocks);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(`Failed to auto-fill: ${message}`);
			console.error("Auto-fill error:", err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	/**
	 * Clear the current schedule.
	 */
	const clearSchedule = useCallback(() => {
		setBlocks([]);
		setError(null);
	}, []);

	return {
		blocks,
		isLoading,
		error,
		generateSchedule,
		autoFill,
		clearSchedule,
	};
}

/**
 * Get today's date in ISO format (YYYY-MM-DD).
 */
export function getTodayIso(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}
