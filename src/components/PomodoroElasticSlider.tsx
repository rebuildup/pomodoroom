import React from "react";
import BaseElasticSlider from "@/components/ElasticSlider";

interface ElasticSliderProps {
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
	accentColor?: string;
	label?: React.ReactNode;
	valueLabel?: React.ReactNode;
	ariaLabel?: string;
}

export function ElasticSlider({
	value,
	min,
	max,
	step = 1,
	onChange,
	label,
	valueLabel,
}: ElasticSliderProps) {
	return (
		<div className="space-y-2">
			{(label || valueLabel) && (
				<div className="flex items-center justify-between text-xs text-main">
					{label && <div>{label}</div>}
					{valueLabel && <div className="opacity-70">{valueLabel}</div>}
				</div>
			)}
			<BaseElasticSlider
				defaultValue={value}
				startingValue={min}
				maxValue={max}
				isStepped={true}
				stepSize={step}
				className="w-full"
				onChange={onChange}
				leftIcon={null}
				rightIcon={null}
			/>
		</div>
	);
}
