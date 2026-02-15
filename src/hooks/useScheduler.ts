/**
 * Hook for schedule generation using backend AutoScheduler.
 *
 * Provides functions to:
 * - Generate schedule for a specific day
 * - Auto-fill available time slots
 * - Manage schedule state and loading
 *
 * **DEPRECATED**: Mock mode for non-Tauri environments is deprecated.
 * Will be removed in v2.0. Use feature flags and test with real backend.
 *
 * Migration:
 * - Use POMODOROOM_USE_MOCK_SCHEDULER=0 to disable mock mode
 * - Use @tauri-apps/plugin-mocks for Tauri API mocking in tests
 * - Feature flag: set useMockScheduler option explicitly
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

/**
 * Check if mock scheduler should be used via environment variable.
 * Reads POMODOROOM_USE_MOCK_SCHEDULER (0 = disabled, 1 = enabled).
 * Default: auto-detect based on Tauri environment.
 */
function shouldUseMockScheduler(): boolean | null {
	if (typeof window === "undefined") return null;

	const envValue = process.env.POMODOROOM_USE_MOCK_SCHEDULER;
	if (envValue !== undefined) {
		return envValue === "1" || envValue.toLowerCase() === "true";
	}
	return null; // Auto-detect
}

// Warning state to avoid duplicate warnings
let hasShownMockWarning = false;

export interface ScheduleResult {
	blocks: ScheduleBlock[];
	tasks: Task[];
}

/**
 * Configuration options for useScheduler hook.
 */
export interface UseSchedulerConfig {
	/**
	 * **DEPRECATED**: Force mock mode on/off.
	 * @deprecated Will be removed in v2.0. Use environment variable or proper test setup.
	 *
	 * - undefined: Auto-detect based on environment and POMODOROOM_USE_MOCK_SCHEDULER
	 * - true: Force mock mode (not recommended for production)
	 * - false: Force real backend mode (requires Tauri or test setup)
	 */
	useMockMode?: boolean;
	/**
	 * Suppress deprecation warnings about mock mode.
	 * @default false
	 *
	 * Set to true to acknowledge deprecation and suppress warnings during migration.
	 */
	suppressMockWarning?: boolean;
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
 * In browser/dev mode, uses mock scheduler for UI development (DEPRECATED).
 *
 * @param config - Optional configuration for mock mode behavior
 *
 * @example
 * ```tsx
 * // Default behavior (auto-detect)
 * const { blocks, isLoading, isMockMode, generateSchedule } = useScheduler();
 *
 * // Force real backend mode (for testing with mocked Tauri APIs)
 * const { blocks, isLoading, generateSchedule } = useScheduler({ useMockMode: false });
 *
 * // Generate today's schedule
 * await generateSchedule("2024-01-15");
 * ```
 */
export function useScheduler(config?: UseSchedulerConfig): UseSchedulerReturn {
	const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Determine mock mode based on config, environment, and env var
	const [isMockMode, setIsMockMode] = useState(() => {
		// Check explicit config first
		if (config?.useMockMode !== undefined) {
			return config.useMockMode;
		}

		// Check environment variable
		const envMockMode = shouldUseMockScheduler();
		if (envMockMode !== null) {
			return envMockMode;
		}

		// Default: auto-detect based on Tauri environment
		return !isTauriEnvironment();
	});

	// Show deprecation warning if using mock mode
	if (isMockMode && !config?.suppressMockWarning && !hasShownMockWarning) {
		console.warn(
			"[useScheduler] DEPRECATED: Using mock scheduler mode. " +
			"This mode will be removed in v2.0. " +
			"Use POMODOROOM_USE_MOCK_SCHEDULER=0 to disable. " +
			"For testing, use @tauri-apps/plugin-mocks instead. " +
			"Set suppressMockWarning: true to hide this message during migration."
		);
		hasShownMockWarning = true;
	}

	/**
	 * Generate schedule for a specific day using backend AutoScheduler.
	 *
	 * @param dateIso - Target date in ISO format (YYYY-MM-DD)
	 * @param calendarEvents - Optional array of calendar events to avoid
	 */
	const generateSchedule = useCallback(async (dateIso: string, calendarEvents?: ScheduleBlock[]) => {
		setIsLoading(true);
		setError(null);

		if (isMockMode) {
			// Mock mode for UI development - DEPRECATED
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
				blockType: "focus", // Backend doesn't distinguish, default to focus
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
	}, [isMockMode]);

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

		if (isMockMode) {
			// Mock mode for UI development - DEPRECATED
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
				blockType: "focus",
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
	}, [isMockMode]);

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
			if (isMockMode) {
				// Mock mode - DEPRECATED
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
	}, [isMockMode]);

	/**
	 * Clear the current schedule.
	 */
	const clearSchedule = useCallback(() => {
		setBlocks([]);
		setError(null);
	}, [isMockMode]);

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
