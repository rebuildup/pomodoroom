/**
 * Pressure types — Backlog Pressure concept for task management.
 *
 * Pressure represents the gap between remaining work and remaining capacity.
 *
 * Formula:
 *   Backlog Pressure = remaining_work - remaining_capacity
 *
 * Mode transitions (automatic):
 *   Pressure ≤ 0 → Normal Mode (green, capacity sufficient)
 *   Pressure > 0 → Pressure Mode (yellow, workload exceeds capacity)
 *   Pressure >> threshold → Overload Mode (red, system breakdown)
 *
 * Reference: docs/ui-redesign-strategy.md section 4
 */

// ─── Pressure Mode ─────────────────────────────────────────────────────────────

export type PressureMode = "normal" | "pressure" | "overload";

// ─── Pressure State ─────────────────────────────────────────────────────────────

/**
 * Current pressure state with calculated values.
 */
export interface PressureState {
	/** Current pressure mode */
	mode: PressureMode;
	/** Pressure value (negative = surplus capacity) */
	value: number;
	/** Remaining work in minutes */
	remainingWork: number;
	/** Remaining capacity in minutes */
	remainingCapacity: number;
	/** Pressure threshold for overload mode */
	overloadThreshold: number;
}

// ─── Pressure Metrics ──────────────────────────────────────────────────────────

/**
 * Work item for pressure calculation.
 * Can be a Task from schedule.ts or TaskStreamItem from taskstream.ts.
 */
export interface WorkItem {
	/** Estimated minutes remaining */
	estimatedMinutes: number;
	/** Whether the item is completed */
	completed?: boolean;
	/** Status for TaskStreamItem compatibility */
	status?: string;
}

/**
 * Capacity calculation parameters.
 */
export interface CapacityParams {
	/** Day wake-up time (HH:mm) */
	wakeUp: string;
	/** Day sleep time (HH:mm) */
	sleep: string;
	/** Fixed events duration in minutes */
	fixedEventMinutes: number;
	/** Break buffer in minutes */
	breakBufferMinutes: number;
	/** Current time for remaining capacity calculation */
	now?: Date;
}

/**
 * Pressure calculation options.
 */
export interface PressureOptions {
	/** Overload threshold in minutes (default: 120) */
	overloadThreshold?: number;
	/** Custom capacity params (uses defaults if not provided) */
	capacityParams?: CapacityParams;
}

// ─── Pressure Mode Colors ──────────────────────────────────────────────────────

/**
 * Color palette for pressure modes.
 * Works in both dark and light themes.
 */
export const PRESSURE_MODE_COLORS: Record<
	PressureMode,
	{
		bg: string;
		text: string;
		border: string;
		icon: string;
	}
> = {
	normal: {
		bg: "bg-green-500/10",
		text: "text-green-400",
		border: "border-green-500/30",
		icon: "check_circle",
	},
	pressure: {
		bg: "bg-yellow-500/10",
		text: "text-yellow-400",
		border: "border-yellow-500/30",
		icon: "warning",
	},
	overload: {
		bg: "bg-red-500/10",
		text: "text-red-400",
		border: "border-red-500/30",
		icon: "error",
	},
};

/**
 * Get color classes for a pressure mode.
 */
export function getPressureColorClasses(
	mode: PressureMode,
): (typeof PRESSURE_MODE_COLORS)[PressureMode] {
	return PRESSURE_MODE_COLORS[mode];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default overload threshold (2 hours).
 * Pressure exceeding this value triggers Overload mode.
 */
export const DEFAULT_OVERLOAD_THRESHOLD = 120; // minutes

/**
 * Default break buffer (15 minutes).
 * Additional buffer time subtracted from capacity.
 */
export const DEFAULT_BREAK_BUFFER = 15; // minutes
