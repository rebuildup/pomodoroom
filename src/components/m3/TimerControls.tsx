/**
 * Material 3 Timer Controls Component
 *
 * Play/Pause and Skip buttons for NowHub.
 * State-aware icons that transition based on timer state.
 *
 * @example
 * ```tsx
 * <TimerControls
 *   isActive={true}
 *   onPlayPause={() => {}}
 *   onSkip={() => {}}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";

export interface TimerControlsProps {
	/** Whether timer is currently running */
	isActive: boolean;
	/** Play/Pause button click handler */
	onPlayPause: () => void;
	/** Skip button click handler */
	onSkip: () => void;
	/** Custom className for styling */
	className?: string;
	/** Size variant */
	size?: "sm" | "md" | "lg";
}

/**
 * Get button size classes
 */
function getSizeClasses(size: "sm" | "md" | "lg"): string {
	switch (size) {
		case "sm":
			return "p-2 rounded-full";
		case "md":
			return "p-3 rounded-2xl";
		case "lg":
			return "p-4 rounded-2xl";
	}
}

/**
 * Get icon size
 */
function getIconSize(size: "sm" | "md" | "lg"): number {
	switch (size) {
		case "sm":
			return 20;
		case "md":
			return 24;
		case "lg":
			return 32;
	}
}

/**
 * Material 3 Timer Controls
 *
 * State-aware control buttons with Material Design 3 styling.
 */
export const TimerControls: React.FC<TimerControlsProps> = ({
	isActive,
	onPlayPause,
	onSkip,
	className = "",
	size = "md",
}) => {
	const sizeClasses = getSizeClasses(size);
	const iconSize = getIconSize(size);

	return (
		<div className={`flex items-center gap-3 ${className}`}>
			{/* Play/Pause Button */}
			<button
				type="button"
				onClick={onPlayPause}
				aria-label={isActive ? "Pause timer" : "Start timer"}
				className={`${sizeClasses} bg-white/10 backdrop-blur text-white hover:bg-white/20 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30`}
			>
				<Icon
					name={isActive ? "pause" : "play_arrow"}
					size={iconSize}
					filled={isActive}
				/>
			</button>

			{/* Skip Button */}
			<button
				type="button"
				onClick={onSkip}
				aria-label="Skip to next session"
				className={`${sizeClasses} bg-white/5 backdrop-blur text-white/70 hover:bg-white/10 hover:text-white active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30`}
			>
				<Icon
					name="skip_next"
					size={iconSize}
				/>
			</button>
		</div>
	);
};

export default TimerControls;
