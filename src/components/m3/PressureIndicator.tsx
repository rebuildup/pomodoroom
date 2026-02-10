/**
 * Material 3 Pressure Indicator Component
 *
 * Visual gauge/progress bar showing Backlog Pressure value.
 * Color coding: green=Normal, yellow=Pressure, red=Overload
 *
 * @example
 * ```tsx
 * <PressureIndicator
 *   mode="pressure"
 *   value={45}
 *   remainingWork={180}
 *   remainingCapacity={135}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";
import type { PressureMode } from "@/types/pressure";
import { getPressureColorClasses } from "@/types/pressure";

export interface PressureIndicatorProps {
	/** Current pressure mode */
	mode: PressureMode;
	/** Pressure value (negative = surplus capacity) */
	value: number;
	/** Remaining work in minutes */
	remainingWork: number;
	/** Remaining capacity in minutes */
	remainingCapacity: number;
	/** Show detailed breakdown (default: true) */
	showDetails?: boolean;
	/** Custom className for styling */
	className?: string;
	/** Compact mode (smaller size) */
	compact?: boolean;
}

/**
 * Format minutes to human-readable duration.
 */
function formatDuration(minutes: number): string {
	if (minutes < 0) {
		return `-${formatDuration(-minutes)}`;
	}
	const hours = Math.floor(minutes / 60);
	const mins = Math.round(minutes % 60);

	if (hours === 0) {
		return `${mins}m`;
	}
	if (mins === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${mins}m`;
}

/**
 * Calculate gauge percentage based on pressure value.
 * Maps -120min to +240min range to 0-100% for visual display.
 */
function calculateGaugePercentage(value: number): number {
	const minPressure = -120; // 2 hours surplus
	const maxPressure = 240;  // 4 hours overload
	const clamped = Math.max(minPressure, Math.min(maxPressure, value));
	return ((clamped - minPressure) / (maxPressure - minPressure)) * 100;
}

/**
 * Get mode description text.
 */
function getModeDescription(mode: PressureMode): string {
	switch (mode) {
		case "normal":
			return "On track";
		case "pressure":
			return "High workload";
		case "overload":
			return "Overloaded";
	}
}

/**
 * Material 3 Pressure Indicator.
 *
 * Displays a visual gauge showing current pressure state
 * with color coding and optional detailed breakdown.
 */
export const PressureIndicator: React.FC<PressureIndicatorProps> = ({
	mode,
	value,
	remainingWork,
	remainingCapacity,
	showDetails = true,
	className = "",
	compact = false,
}) => {
	const colors = getPressureColorClasses(mode);
	const gaugePercent = calculateGaugePercentage(value);
	const modeDesc = getModeDescription(mode);

	// Container styles
	const containerSize = compact ? "text-xs" : "text-sm";
	const gaugeHeight = compact ? "h-1.5" : "h-2";

	return (
		<div className={`flex flex-col gap-2 ${containerSize} ${className}`.trim()}>
			{/* Header with icon and status */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					<Icon
						name={colors.icon as any}
						size={compact ? 16 : 18}
						className={colors.text}
					/>
					<span className={`font-medium ${colors.text}`}>
						{modeDesc}
					</span>
				</div>
				{/* Pressure value */}
				<span className={`font-medium ${colors.text}`}>
					{value > 0 ? "+" : ""}{formatDuration(value)}
				</span>
			</div>

			{/* Visual gauge */}
			<div className={`relative w-full ${gaugeHeight} bg-gray-700/30 rounded-full overflow-hidden`}>
				{/* Background track (full capacity range) */}
				<div className="absolute inset-0 bg-gray-700/30" />

				{/* Pressure fill */}
				<div
					className={`absolute left-0 top-0 bottom-0 transition-all duration-500 ease-out ${colors.border.replace("border", "bg")}`}
					style={{
						width: `${Math.max(0, Math.min(100, gaugePercent))}%`,
						marginLeft: gaugePercent < 50 ? "auto" : undefined,
						marginRight: gaugePercent >= 50 ? "auto" : undefined,
					}}
				/>

				{/* Center marker (zero pressure point) */}
				<div
					className="absolute top-0 bottom-0 w-0.5 bg-white/50"
					style={{ left: "50%" }}
				/>
			</div>

			{/* Detailed breakdown */}
			{showDetails && (
				<div className="flex items-center justify-between gap-2 text-gray-400">
					<span>Work: {formatDuration(remainingWork)}</span>
					<span>Capacity: {formatDuration(remainingCapacity)}</span>
				</div>
			)}
		</div>
	);
};

export default PressureIndicator;
