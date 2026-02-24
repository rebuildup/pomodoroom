import type React from "react";

interface SliderProps {
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
	label: React.ReactNode;
	valueLabel: React.ReactNode;
	disabled?: boolean;
	className?: string;
}

export const Slider: React.FC<SliderProps> = ({
	min,
	max,
	step,
	value,
	onChange,
	label,
	valueLabel,
	disabled = false,
	className = "",
}) => {
	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(parseFloat(e.target.value));
	};

	// Calculate percentage for thumb position and track fill
	const percentage = ((value - min) / (max - min)) * 100;

	return (
		<div className={`w-full ${className}`}>
			<div className="flex justify-between items-baseline mb-2">
				<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">{label}</span>
				<span className="text-sm font-medium text-[var(--md-ref-color-primary)]">{valueLabel}</span>
			</div>
			<div className="relative h-6 flex items-center">
				{/* Track background */}
				<div className="absolute w-full h-1.5 rounded-full bg-[var(--md-ref-color-surface-container-highest)]" />
				{/* Active track fill */}
				<div
					className="absolute h-1.5 rounded-full bg-[var(--md-ref-color-primary)]"
					style={{ width: `${percentage}%` }}
				/>
				{/* Invisible range input */}
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={handleChange}
					disabled={disabled}
					className="absolute w-full h-6 opacity-0 cursor-pointer disabled:cursor-not-allowed"
					style={{ zIndex: 1 }}
				/>
				{/* Thumb (visible) */}
				{!disabled && (
					<div
						className="absolute w-5 h-5 rounded-full bg-[var(--md-ref-color-primary)] border-2 border-[var(--md-ref-color-surface)] shadow-sm transition-transform hover:scale-110 active:scale-95"
						style={{ left: `calc(${percentage}% - 10px)` }}
					/>
				)}
				{disabled && (
					<div
						className="absolute w-5 h-5 rounded-full bg-[var(--md-ref-color-on-surface-variant)] border-2 border-[var(--md-ref-color-surface)] opacity-50"
						style={{ left: `calc(${percentage}% - 10px)` }}
					/>
				)}
			</div>
		</div>
	);
};

export default Slider;
