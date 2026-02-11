/**
 * Hook for schedule generation using backend AutoScheduler.
 *
 * Provides functions to:
 * - Generate schedule for a specific day
 * - Auto-fill available time slots
 * - Manage schedule state and loading
 *
 * Falls back to mock scheduler in non-Tauri environments for UI development.
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScheduleBlock, Task } from "@/types/schedule";
import { generateMockSchedule, createMockProjects } from "@/utils/dev-mock-scheduler";

/**
 * Check if running in Tauri environment
 */
function isTauriEnvironment(): boolean {
	return typeof window !== "undefined" && window.__TAURI__ !== undefined;
}

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
	/** Whether using mock mode (non-Tauri environment) */
	isMockMode: boolean;
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
 * In Tauri environment, uses Rust AutoScheduler via IPC.
 * In browser/dev mode, uses mock scheduler for UI development.
 *
 * @example
 * ```tsx
 * const { blocks, isLoading, isMockMode, generateSchedule } = useScheduler();
 *
 * // Generate today's schedule
 * await generateSchedule("2024-01-15");
 * ```
 */
export function useScheduler(): UseSchedulerReturn {
	const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isMockMode, setIsMockMode] = useState(!isTauriEnvironment());

	/**
	 * Generate schedule for a specific day using backend AutoScheduler.
	 *
	 * @param dateIso - Target date in ISO format (YYYY-MM-DD)
	 * @param calendarEvents - Optional array of calendar events to avoid
	 */
	const generateSchedule = useCallback(async (dateIso: string, calendarEvents?: ScheduleBlock[]) => {
		setIsLoading(true);
		setError(null);

		if (!isTauriEnvironment()) {
			// Mock mode for UI development
			setIsMockMode(true);
			try {
				// Simulate network delay
				await new Promise(resolve => setTimeout(resolve, 300));

				const { tasks } = createMockProjects();
				const template = {
					wakeUp: "07:00",
					sleep: "23:00",
					fixedEvents: [],
					maxParallelLanes: 1,
				};

				const mockBlocks = generateMockSchedule({
					template,
					calendarEvents,
					tasks,
				});

				setBlocks(mockBlocks);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				setError(`Mock schedule generation failed: ${error.message}`);
				console.error(`[useScheduler] Mock schedule error for date "${dateIso}":`, err);
			} finally {
				setIsLoading(false);
			}
			return;
		}

		// Rust backend mode
		setIsMockMode(false);
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
				lane: block.lane ?? 0,
			}));

			setBlocks(convertedBlocks);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			setError(`Failed to generate schedule: ${err.message}`);
			console.error(`[useScheduler] Schedule generation error for date "${dateIso}":`, err);
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

		if (!isTauriEnvironment()) {
			// Mock mode for UI development
			setIsMockMode(true);
			try {
				await new Promise(resolve => setTimeout(resolve, 200));

				const { tasks } = createMockProjects();
				const template = {
					wakeUp: "07:00",
					sleep: "23:00",
					fixedEvents: [],
					maxParallelLanes: 1,
				};

				const mockBlocks = generateMockSchedule({
					template,
					calendarEvents,
					tasks,
				});

				setBlocks(mockBlocks);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				setError(`Mock auto-fill failed: ${error.message}`);
				console.error(`[useScheduler] Mock auto-fill error for date "${dateIso}":`, err);
			} finally {
				setIsLoading(false);
			}
			return;
		}

		// Rust backend mode
		setIsMockMode(false);
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
				lane: block.lane ?? 0,
			}));

			setBlocks(convertedBlocks);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			setError(`Failed to auto-fill: ${err.message}`);
			console.error(`[useScheduler] Auto-fill error for date "${dateIso}":`, err);
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
		isMockMode,
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
