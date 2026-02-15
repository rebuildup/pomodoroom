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
import {
	buildReplanDiff,
	calculateChurnOutsideWindow,
	detectImpactedWindowFromCalendarDelta,
	mergeLocalReplan,
	type ImpactedWindow,
	type ReplanDiffItem,
} from "@/utils/event-driven-replan";

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
	/** Build a local-horizon replan preview from calendar deltas */
	previewReplanOnCalendarUpdates: (
		dateIso: string,
		previousCalendarEvents: ScheduleBlock[],
		nextCalendarEvents: ScheduleBlock[]
	) => Promise<ScheduleReplanPreview>;
	/** Apply a previously generated replan preview */
	applyReplanPreview: (preview: ScheduleReplanPreview) => void;
	/** Clear current schedule */
	clearSchedule: () => void;
}

export interface ScheduleReplanPreview {
	impactedWindow: ImpactedWindow | null;
	proposedBlocks: ScheduleBlock[];
	diff: ReplanDiffItem[];
	churnOutsideWindow: number;
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
			setIsLoading(false);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setError(`Mock schedule generation failed: ${error.message}`);
			console.error(`[useScheduler] Mock schedule error for date "${dateIso}":`, err);
			setIsLoading(false);
		}
		return;
		}

		// Rust backend mode
		setIsMockMode(false);

		// Convert ScheduleBlock to CalendarEvent format expected by backend (outside try for React Compiler)
		const calendarEventsJson = calendarEvents?.map(event => ({
			id: event.id,
			title: event.label || event.blockType,
			start_time: event.startTime,
			end_time: event.endTime,
		}));
		const calendarEventsForInvoke = calendarEventsJson || null;

		try {
			// Call backend command
			const scheduledBlocks = await invoke<any[]>("cmd_schedule_generate", {
				dateIso,
				calendarEventsJson: calendarEventsForInvoke,
			});

			// Convert backend response to ScheduleBlock format
			const convertedBlocks: ScheduleBlock[] = scheduledBlocks.map(block => ({
				id: block.id,
				blockType: (block.block_type as ScheduleBlock["blockType"]) ?? "focus",
				taskId: block.task_id,
				startTime: block.start_time,
				endTime: block.end_time,
				locked: false,
				label: block.task_title,
				lane: block.lane ?? 0,
			}));

			setBlocks(convertedBlocks);
			setIsLoading(false);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			setError(`Failed to generate schedule: ${err.message}`);
			console.error(`[useScheduler] Schedule generation error for date "${dateIso}":`, err);
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
				setIsLoading(false);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				setError(`Mock auto-fill failed: ${error.message}`);
				console.error(`[useScheduler] Mock auto-fill error for date "${dateIso}":`, err);
				setIsLoading(false);
			}
			return;
		}

		// Rust backend mode
		setIsMockMode(false);

		// Convert ScheduleBlock to CalendarEvent format (outside try for React Compiler)
		const calendarEventsJson = calendarEvents?.map(event => ({
			id: event.id,
			title: event.label || event.blockType,
			start_time: event.startTime,
			end_time: event.endTime,
		}));
		const calendarEventsForInvoke = calendarEventsJson || null;

		try {
			// Call backend command
			const scheduledBlocks = await invoke<any[]>("cmd_schedule_auto_fill", {
				dateIso,
				calendarEventsJson: calendarEventsForInvoke,
			});

			// Convert backend response to ScheduleBlock format
			const convertedBlocks: ScheduleBlock[] = scheduledBlocks.map(block => ({
				id: block.id,
				blockType: (block.block_type as ScheduleBlock["blockType"]) ?? "focus",
				taskId: block.task_id,
				startTime: block.start_time,
				endTime: block.end_time,
				locked: false,
				label: block.task_title,
				lane: block.lane ?? 0,
			}));

			setBlocks(convertedBlocks);
			setIsLoading(false);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			setError(`Failed to auto-fill: ${err.message}`);
			console.error(`[useScheduler] Auto-fill error for date "${dateIso}":`, err);
			setIsLoading(false);
		}
	}, []);

	const previewReplanOnCalendarUpdates = useCallback(
		async (
			dateIso: string,
			previousCalendarEvents: ScheduleBlock[],
			nextCalendarEvents: ScheduleBlock[]
		): Promise<ScheduleReplanPreview> => {
			const impactedWindow = detectImpactedWindowFromCalendarDelta(
				previousCalendarEvents,
				nextCalendarEvents
			);
			if (!impactedWindow) {
				return {
					impactedWindow: null,
					proposedBlocks: blocks,
					diff: [],
					churnOutsideWindow: 0,
				};
			}

			const nextCalendarEventsJson = nextCalendarEvents.map((event) => ({
				id: event.id,
				title: event.label || event.blockType,
				start_time: event.startTime,
				end_time: event.endTime,
			}));

			let reoptimized: ScheduleBlock[] = [];
			if (!isTauriEnvironment()) {
				const { tasks } = createMockProjects();
				const template = {
					wakeUp: "07:00",
					sleep: "23:00",
					fixedEvents: [],
					maxParallelLanes: 1,
				};
				reoptimized = generateMockSchedule({
					template,
					calendarEvents: nextCalendarEvents,
					tasks,
				});
			} else {
				const scheduledBlocks = await invoke<any[]>("cmd_schedule_generate", {
					dateIso,
					calendarEventsJson: nextCalendarEventsJson,
				});
				reoptimized = scheduledBlocks.map((block) => ({
					id: block.id,
					blockType: "focus",
					taskId: block.task_id,
					startTime: block.start_time,
					endTime: block.end_time,
					locked: false,
					label: block.task_title,
					lane: block.lane ?? 0,
				}));
			}

			const proposedBlocks = mergeLocalReplan(blocks, reoptimized, impactedWindow);
			const diff = buildReplanDiff(blocks, proposedBlocks, impactedWindow);
			const churnOutsideWindow = calculateChurnOutsideWindow(
				blocks,
				proposedBlocks,
				impactedWindow
			);

			return {
				impactedWindow,
				proposedBlocks,
				diff,
				churnOutsideWindow,
			};
		},
		[blocks]
	);

	const applyReplanPreview = useCallback((preview: ScheduleReplanPreview) => {
		setBlocks(preview.proposedBlocks);
		setError(null);
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
		previewReplanOnCalendarUpdates,
		applyReplanPreview,
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
