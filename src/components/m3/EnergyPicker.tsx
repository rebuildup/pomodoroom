/**
 * Material 3 Energy Picker Component
 *
 * Energy level selector for task suggestions.
 * Three levels: Low, Medium, High
 *
 * @example
 * ```tsx
 * <EnergyPicker value="medium" onChange={setEnergy} />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";

export type EnergyLevel = "low" | "medium" | "high";

export interface EnergyPickerProps {
	/** Current energy level */
	value: EnergyLevel;
	/** Called when energy level changes */
	onChange: (level: EnergyLevel) => void;
	/** Custom className for styling */
	className?: string;
	/** Size variant */
	size?: "sm" | "md";
}

/**
 * Energy level configuration
 */
const ENERGY_LEVELS: ReadonlyArray<{
	key: EnergyLevel;
	iconName: string;
	label: string;
	colorClass: string;
	description: string;
}> = [
	{
		key: "low",
		iconName: "battery_1_bar",
		label: "Low",
		colorClass: "text-yellow-400",
		description: "Quick tasks, routine items",
	},
	{
		key: "medium",
		iconName: "battery_3_bar",
		label: "Medium",
		colorClass: "text-blue-400",
		description: "Regular work, moderate complexity",
	},
	{
		key: "high",
		iconName: "battery_full",
		label: "High",
		colorClass: "text-purple-400",
		description: "Deep work, creative tasks",
	},
] as const;

/**
 * Material 3 Energy Picker.
 *
 * Allows user to select their current energy level
 * to influence task suggestion algorithm.
 */
export const EnergyPicker: React.FC<EnergyPickerProps> = ({
	value,
	onChange,
	className = "",
	size = "md",
}) => {
	const buttonSize = size === "sm" ? "p-1.5" : "p-2";
	const iconSize = size === "sm" ? 16 : 20;

	return (
		<div className={`flex items-center gap-1 ${className}`.trim()}>
			{ENERGY_LEVELS.map(({ key, iconName, label, colorClass, description }) => {
				const isActive = value === key;
				const activeBg = isActive
					? key === "low"
						? "bg-yellow-500/20"
						: key === "medium"
							? "bg-blue-500/20"
							: "bg-purple-500/20"
					: "";

				return (
					<button
						key={key}
						type="button"
						onClick={() => onChange(key)}
						className={`${buttonSize} rounded-lg transition-all duration-200 ${
							isActive
								? `${colorClass} ${activeBg}`
								: "text-gray-500 hover:text-gray-400 hover:bg-white/5"
						}`}
						title={`${label} energy - ${description}`}
					>
						<Icon name={iconName as any} size={iconSize} />
					</button>
				);
			})}
		</div>
	);
};

export default EnergyPicker;
