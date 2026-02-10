/**
 * Hook for pressure calculation and mode determination.
 *
 * Calculates Backlog Pressure from task data and determines
 * the current mode (Normal/Pressure/Overload).
 *
 * Formula:
 *   Backlog Pressure = remaining_work - remaining_capacity
 *
 * @example
 * ```tsx
 * const { state, calculate } = usePressure();
 *
 * // Calculate from task list
 * calculate(tasks);
 *
 * // Get current mode
 * console.log(state.mode); // "normal" | "pressure" | "overload"
 * ```
 */

import { useState, useCallback, useMemo } from "react";
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

export interface UsePressureReturn {
	/** Current pressure state */
	state: PressureState;
	/** Calculate pressure from work items */
	calculate: (items: WorkItem[], options?: PressureOptions) => void;
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
	const [hours, minutes] = timeStr.split(":").map(Number);
	return { hours, minutes };
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
 * Hook for pressure calculation and mode determination.
 *
 * Automatically calculates pressure based on remaining work vs capacity
 * and determines the appropriate mode.
 */
export function usePressure(): UsePressureReturn {
	const [state, setState] = useState<PressureState>(createInitialState);

	/**
	 * Calculate pressure from work items.
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
	 * Reset pressure state to initial values.
	 */
	const reset = useCallback(() => {
		setState(createInitialState());
	}, []);

	return {
		state,
		calculate,
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
	const { state, calculate, reset } = usePressure();

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
		reset,
		calculateFromSchedule,
	};
}
