/**
 * Material 3 Pressure Badge Component
 *
 * Compact status display for headers and toolbars.
 * Shows current mode icon with small footprint.
 *
 * @example
 * ```tsx
 * <PressureBadge mode="pressure" value={45} />
 * ```
 */

import type React from "react";
import { Icon } from "./Icon";
import type { PressureMode } from "@/types/pressure";
import { getPressureColorClasses } from "@/types/pressure";

export interface PressureBadgeProps {
	/** Current pressure mode */
	mode: PressureMode;
	/** Pressure value (optional, for tooltip) */
	value?: number;
	/** Show mode label text */
	showLabel?: boolean;
	/** Custom className for styling */
	className?: string;
	/** Click handler */
	onClick?: () => void;
	/** Size variant */
	size?: "sm" | "md";
}

/**
 * Format pressure value for display.
 */
function formatValue(value: number): string {
	const abs = Math.abs(value);
	if (abs < 60) {
		return `${abs}m`;
	}
	const hours = Math.round((abs / 60) * 10) / 10;
	return `${hours}h`;
}

/**
 * Get mode label text.
 */
function getModeLabel(mode: PressureMode): string {
	switch (mode) {
		case "normal":
			return "Normal";
		case "pressure":
			return "Pressure";
		case "overload":
			return "Overload";
	}
}

/**
 * Material 3 Pressure Badge.
 *
 * Compact badge component for showing pressure status
 * in headers, navigation, and toolbar areas.
 */
export const PressureBadge: React.FC<PressureBadgeProps> = ({
	mode,
	value,
	showLabel = false,
	className = "",
	onClick,
	size = "sm",
}) => {
	const colors = getPressureColorClasses(mode);
	const sizeClasses = size === "sm" ? "px-2 py-0.5 gap-1 text-xs" : "px-2.5 py-1 gap-1.5 text-sm";

	const baseClasses = [
		"inline-flex items-center",
		"rounded-full",
		"font-medium",
		"transition-colors duration-200",
		colors.bg,
		colors.text,
		colors.border,
		"border",
		sizeClasses,
		onClick ? "cursor-pointer hover:opacity-80" : "",
		className,
	]
		.filter(Boolean)
		.join(" ");

	const iconSize = size === "sm" ? 14 : 16;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.key === "Enter" || e.key === " ") && onClick) {
			e.preventDefault();
			onClick();
		}
	};

	return (
		<div
			className={baseClasses}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			role={onClick ? "button" : "status"}
			aria-label={
				value !== undefined
					? `Pressure: ${value > 0 ? "+" : ""}${formatValue(value)}. ${getModeLabel(mode)}`
					: getModeLabel(mode)
			}
			aria-pressed={onClick ? undefined : undefined}
			tabIndex={onClick ? 0 : undefined}
			title={
				value !== undefined
					? `Pressure: ${value > 0 ? "+" : ""}${formatValue(value)}`
					: getModeLabel(mode)
			}
		>
			<Icon name={colors.icon as any} size={iconSize} aria-hidden="true" />
			{showLabel && <span>{getModeLabel(mode)}</span>}
			{value !== undefined && !showLabel && (
				<span className="tabular-nums" aria-live="polite" aria-atomic="true">
					{value > 0 ? "+" : ""}
					{formatValue(value)}
				</span>
			)}
		</div>
	);
};

export default PressureBadge;
