import React from "react";
import { Icon } from "./Icon";

export interface SelectOption {
	value: string;
	label: string;
}

export interface SelectProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	label?: string;
	disabled?: boolean;
	required?: boolean;
	className?: string;
	variant?: "outlined" | "underlined";
}

export const Select: React.FC<SelectProps> = ({
	value,
	onChange,
	options,
	label,
	disabled = false,
	required = false,
	className = "",
	variant = "underlined",
}) => {
	const isUnderlined = variant === "underlined";

	return (
		<div className={`flex flex-col gap-1 ${className}`.trim()}>
			{label ? (
				<label className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
					{label}
					{required ? <span aria-hidden="true"> *</span> : null}
				</label>
			) : null}
			<div className="relative">
				<select
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={[
						"w-full py-2 text-sm text-[var(--md-ref-color-on-surface)] transition-colors duration-150 ease-in-out",
						"focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none",
						"pr-8",
						isUnderlined
							? "px-0 bg-transparent border-0 border-b border-[var(--md-ref-color-outline)] rounded-none focus:border-b"
							: "px-3 rounded-lg border border-[var(--md-ref-color-outline)] bg-[var(--md-ref-color-surface)]",
					].join(" ")}
					required={required}
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[var(--md-ref-color-on-surface-variant)]">
					<Icon name="expand_more" size={18} />
				</div>
			</div>
		</div>
	);
};

export default Select;
