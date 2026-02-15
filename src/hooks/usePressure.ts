/**
 * Hook for pressure calculation and mode determination.
 *
 * Supports two calculation modes:
 * 1. Backlog Pressure (absolute value in minutes)
 *    Formula: remaining_work - remaining_capacity
 *
 * 2. UI Pressure (relative value 0-100)
 *    Formula: baseline + time_pressure + ready_tasks - completed_tasks
 *
 * @example
 * ```tsx
 * const { state, calculate, calculateUIPressure } = usePressure();
 *
 * // Backlog Pressure (absolute)
 * calculate(tasks);
 *
 * // UI Pressure (relative 0-100)
 * calculateUIPressure(tasks, timerState);
 *
 * // Get current mode
 * console.log(state.mode); // "normal" | "pressure" | "overload"
 * ```
 */

import { useState, useCallback } from "react";
import type {
	PressureState,
	PressureMode,
	WorkItem,
	PressureOptions,
	CapacityParams,
} from "@/types/pressure";
import {
	DEFAULT_OVERLOAD_THRESHOLD,
	DEFAULT_BREAK_BUFFER,
} from "@/types/pressure";
import type { GoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import { getPressureThresholdCalibration } from "@/utils/pressure-threshold-calibration";

/**
 * Timer display state for UI pressure calculation.
 * Derived from useTauriTimer hook return values.
 */
export interface TimerDisplayStateForPressure {
	/** Remaining time in milliseconds */
	remainingMs: number;
	/** Total duration in milliseconds */
	totalMs: number;
	/** Whether timer is currently active */
	isActive: boolean;
}

export interface UsePressureReturn {
	/** Current pressure state */
	state: PressureState;
	/** Calculate backlog pressure from work items (absolute value) */
	calculate: (items: WorkItem[], options?: PressureOptions) => void;
	/** Calculate UI pressure from tasks and timer state (relative 0-100) */
	calculateUIPressure: (items: WorkItem[], timerState: TimerDisplayStateForPressure) => void;
	/** Reset to initial state */
	reset: () => void;
}

/**
 * Calculate remaining capacity for today.
 *
 * @param params - Capacity calculation parameters
 * @returns Remaining capacity in minutes
 */
function calculateRemainingCapacity(params: CapacityParams): number {
	const now = params.now ?? new Date();
	const wakeUpTime = parseTime(params.wakeUp);
	const sleepTime = parseTime(params.sleep);

	// Create wake and sleep datetime objects for today
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);

	const wakeDateTime = new Date(today);
	wakeDateTime.setHours(wakeUpTime.hours, wakeUpTime.minutes, 0, 0);

	const sleepDateTime = new Date(today);
	sleepDateTime.setHours(sleepTime.hours, sleepTime.minutes, 0, 0);

	// Handle case where sleep time is next day (e.g., 00:30)
	if (sleepDateTime < wakeDateTime) {
		sleepDateTime.setDate(sleepDateTime.getDate() + 1);
	}

	// If before wake time, no capacity yet
	if (now < wakeDateTime) {
		return 0;
	}

	// If after sleep time, no capacity remaining
	if (now >= sleepDateTime) {
		return 0;
	}

	// Calculate total day length and remaining time
	const totalDayMinutes = (sleepDateTime.getTime() - wakeDateTime.getTime()) / (1000 * 60);
	const elapsedMinutes = (now.getTime() - wakeDateTime.getTime()) / (1000 * 60);
	const remainingRawMinutes = totalDayMinutes - elapsedMinutes;

	// Subtract fixed events and break buffer
	return Math.max(0, remainingRawMinutes - params.fixedEventMinutes - params.breakBufferMinutes);
}

/**
 * Parse time string (HH:mm) to hours and minutes.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
	const parts = timeStr.split(":").map(Number);
	const hours = parts[0] ?? 0;
	const minutes = parts[1] ?? 0;
	return { hours, minutes };
}

/**
 * Calculate total duration of calendar events for a specific date.
 *
 * @param events - Google Calendar events
 * @param date - Target date
 * @returns Total duration in minutes
 */
export function calculateCalendarEventMinutes(
	events: GoogleCalendarEvent[],
	date: Date
): number {
	const targetDateStr = date.toISOString().slice(0, 10);

	return events
		.filter((event) => {
			const eventStart = event.start.dateTime ?? event.start.date;
			if (!eventStart) return false;
			return eventStart.startsWith(targetDateStr);
		})
		.reduce((total, event) => {
			const startDateTime = event.start.dateTime ?? event.start.date;
			const endDateTime = event.end.dateTime ?? event.end.date;

			if (!startDateTime || !endDateTime) {
				return total;
			}

			const start = new Date(startDateTime);
			const end = new Date(endDateTime);
			const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

			return total + duration;
		}, 0);
}

/**
 * Create capacity params with calendar events included.
 *
 * @param baseParams - Base capacity parameters
 * @param calendarEvents - Google Calendar events
 * @param date - Target date
 * @returns Capacity params with calendar event duration added to fixed events
 */
export function createCapacityParamsWithCalendar(
	baseParams: Omit<CapacityParams, "fixedEventMinutes">,
	calendarEvents: GoogleCalendarEvent[],
	date: Date
): CapacityParams {
	const calendarMinutes = calculateCalendarEventMinutes(calendarEvents, date);
	const baseFixedMinutes = 120;

	return {
		...baseParams,
		fixedEventMinutes: baseFixedMinutes + calendarMinutes,
	};
}

/**
 * Calculate remaining work from work items.
 *
 * @param items - Work items (tasks)
 * @returns Remaining work in minutes
 */
function calculateRemainingWork(items: WorkItem[]): number {
	return items.reduce((total, item) => {
		// Skip completed items
		if (item.completed) {
			return total;
		}

		// Skip items with completed status (TaskStreamItem compatibility)
		if (item.status === "log" || item.status === "done") {
			return total;
		}

		return total + (item.estimatedMinutes || 0);
	}, 0);
}

/**
 * Determine pressure mode from pressure value.
 *
 * @param value - Pressure value
 * @param threshold - Overload threshold
 * @returns Pressure mode
 */
function determinePressureMode(value: number, threshold: number): PressureMode {
	if (value <= 0) {
		return "normal";
	}
	if (value >= threshold) {
		return "overload";
	}
	return "pressure";
}

/**
 * Create initial pressure state.
 */
function createInitialState(): PressureState {
	return {
		mode: "normal",
		value: 0,
		remainingWork: 0,
		remainingCapacity: 0,
		overloadThreshold: DEFAULT_OVERLOAD_THRESHOLD,
	};
}

/**
 * Determine UI pressure mode from 0-100 value.
 *
 * @param value - Pressure value (0-100)
 * @returns Pressure mode
 */
function determineUIPressureMode(value: number, criticalThreshold: number): PressureMode {
	if (value >= criticalThreshold) {
		return "overload";
	}
	if (value >= 40) {
		return "pressure";
	}
	return "normal";
}

/**
 * Calculate UI pressure (relative 0-100) from tasks and timer state.
 *
 * Factors:
 * - Baseline: 50
 * - Time pressure: +20 based on timer progress
 * - Ready tasks: +3 per task
 * - Completed tasks: -5 per task
 * - Running task bonus: -10 (focused work reduces pressure)
 *
 * @param items - Work items
 * @param timerState - Current timer state
 * @returns Pressure value (0-100)
 */
function calculateUIPressureValue(
	items: WorkItem[],
	timerState: TimerDisplayStateForPressure
): number {
	let pressure = 50; // Baseline

	// Time pressure: increases as timer progresses
	if (timerState.totalMs > 0) {
		const elapsedRatio = 1 - (timerState.remainingMs / timerState.totalMs);
		pressure += elapsedRatio * 20; // Max +20 when timer completes
	}

	// Count tasks by state
	const readyCount = items.filter(item => !item.completed && item.status !== "log" && item.status !== "done").length;
	const completedCount = items.filter(item => item.completed || item.status === "log" || item.status === "done").length;
	const runningCount = items.filter(item => item.status === "doing").length;

	// Ready tasks increase pressure
	pressure += readyCount * 3;

	// Completed tasks decrease pressure
	pressure -= completedCount * 5;

	// Running task reduces pressure (focused work)
	if (runningCount > 0) {
		pressure -= 10;
	}

	// Clamp to 0-100 range
	return Math.max(0, Math.min(100, Math.round(pressure)));
}

/**
 * Hook for pressure calculation and mode determination.
 *
 * Supports both backlog pressure (absolute) and UI pressure (relative 0-100).
 */
export function usePressure(): UsePressureReturn {
	const [state, setState] = useState<PressureState>(createInitialState);

	/**
	 * Calculate backlog pressure from work items (absolute value in minutes).
	 *
	 * @param items - Work items to calculate pressure from
	 * @param options - Optional calculation parameters
	 */
	const calculate = useCallback((items: WorkItem[], options?: PressureOptions) => {
		const threshold = options?.overloadThreshold ?? DEFAULT_OVERLOAD_THRESHOLD;

		// Calculate remaining work
		const remainingWork = calculateRemainingWork(items);

		// Calculate remaining capacity (use provided params or defaults)
		const capacityParams: CapacityParams = options?.capacityParams ?? {
			wakeUp: "07:00",
			sleep: "23:00",
			fixedEventMinutes: 120, // Default 2 hours for lunch/dinner
			breakBufferMinutes: DEFAULT_BREAK_BUFFER,
			now: new Date(),
		};

		const remainingCapacity = calculateRemainingCapacity(capacityParams);

		// Calculate pressure value
		const value = remainingWork - remainingCapacity;

		// Determine mode
		const mode = determinePressureMode(value, threshold);

		setState({
			mode,
			value,
			remainingWork,
			remainingCapacity,
			overloadThreshold: threshold,
		});
	}, []);

	/**
	 * Calculate UI pressure from tasks and timer state (relative 0-100).
	 * Throttled to avoid excessive recalculations during timer updates.
	 *
	 * @param items - Work items to calculate pressure from
	 * @param timerState - Current timer state
	 */
	const calculateUIPressure = useCallback((
		items: WorkItem[],
		timerState: TimerDisplayStateForPressure
	) => {
		const calibration = getPressureThresholdCalibration();
		const value = calculateUIPressureValue(items, timerState);
		const mode = determineUIPressureMode(value, calibration.criticalThreshold);

		// Calculate work/capacity for display (normalized for UI)
		const readyCount = items.filter(item => !item.completed && item.status !== "log" && item.status !== "done").length;
		const completedCount = items.filter(item => item.completed || item.status === "log" || item.status === "done").length;

		setState(prev => {
			// Only update if value changed significantly (more than 1 unit)
			// This prevents unnecessary re-renders from timer tick updates
			if (Math.abs(prev.value - value) <= 1 && prev.mode === mode) {
				return prev;
			}
			return {
				mode,
				value,
				remainingWork: readyCount,
				remainingCapacity: completedCount,
				overloadThreshold: calibration.criticalThreshold,
			};
		});
	}, []);

	/**
	 * Reset pressure state to initial values.
	 */
	const reset = useCallback(() => {
		setState(createInitialState());
	}, []);

	return {
		state,
		calculate,
		calculateUIPressure,
		reset,
	};
}

/**
 * Calculate pressure from task list synchronously.
 * Useful for non-react contexts or one-off calculations.
 *
 * @param items - Work items
 * @param options - Calculation options
 * @returns Pressure state
 */
export function calculatePressure(
	items: WorkItem[],
	options?: PressureOptions
): PressureState {
	const threshold = options?.overloadThreshold ?? DEFAULT_OVERLOAD_THRESHOLD;
	const remainingWork = calculateRemainingWork(items);

	const capacityParams: CapacityParams = options?.capacityParams ?? {
		wakeUp: "07:00",
		sleep: "23:00",
		fixedEventMinutes: 120,
		breakBufferMinutes: DEFAULT_BREAK_BUFFER,
		now: new Date(),
	};

	const remainingCapacity = calculateRemainingCapacity(capacityParams);
	const value = remainingWork - remainingCapacity;
	const mode = determinePressureMode(value, threshold);

	return {
		mode,
		value,
		remainingWork,
		remainingCapacity,
		overloadThreshold: threshold,
	};
}

/**
 * Hook for pressure with automatic daily template integration.
 * Extends usePressure with schedule/daily template awareness.
 *
 * @example
 * ```tsx
 * const { state, calculateFromSchedule } = usePressureWithSchedule();
 *
 * // Calculate from schedule blocks
 * calculateFromSchedule(blocks, tasks, dailyTemplate);
 * ```
 */
export interface UsePressureWithScheduleReturn extends UsePressureReturn {
	/** Calculate pressure from schedule blocks */
	calculateFromSchedule: (
		blocks: Array<{ taskId?: string }>,
		tasks: Map<string, WorkItem>,
		template?: {
			wakeUp: string;
			sleep: string;
			fixedEvents: Array<{ durationMinutes: number; enabled: boolean }>;
		}
	) => void;
}

export function usePressureWithSchedule(): UsePressureWithScheduleReturn {
	const { state, calculate, reset, calculateUIPressure } = usePressure();

	/**
	 * Calculate pressure from schedule blocks and tasks.
	 *
	 * @param blocks - Schedule blocks
	 * @param tasks - Task map
	 * @param template - Daily template for capacity calculation
	 */
	const calculateFromSchedule = useCallback((
		blocks: Array<{ taskId?: string }>,
		tasks: Map<string, WorkItem>,
		template?: {
			wakeUp: string;
			sleep: string;
			fixedEvents: Array<{ durationMinutes: number; enabled: boolean }>;
		}
	) => {
		// Extract work items from scheduled tasks
		const scheduledTaskIds = new Set(
			blocks
				.map((b) => b.taskId)
				.filter((id): id is string => id !== undefined)
		);

		const workItems: WorkItem[] = [];
		for (const taskId of scheduledTaskIds) {
			const task = tasks.get(taskId);
			if (task) {
				workItems.push(task);
			}
		}

		// Calculate fixed event duration from template
		const fixedEventMinutes = template?.fixedEvents
			?.filter((e) => e.enabled)
			.reduce((sum, e) => sum + e.durationMinutes, 0) ?? 120;

		// Calculate with template-aware capacity params
		calculate(workItems, {
			capacityParams: {
				wakeUp: template?.wakeUp ?? "07:00",
				sleep: template?.sleep ?? "23:00",
				fixedEventMinutes,
				breakBufferMinutes: DEFAULT_BREAK_BUFFER,
				now: new Date(),
			},
		});
	}, [calculate]);

	return {
		state,
		calculate,
		calculateUIPressure,
		reset,
		calculateFromSchedule,
	};
}
