import type React from "react";
import { useId } from "react";
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
	placeholder?: string;
	id?: string;
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
	placeholder,
	id,
}) => {
	const selectId = useId();
	const isUnderlined = variant === "underlined";
	const hasValue = value !== "" && value !== undefined;

	return (
		<div className={`flex flex-col gap-1 ${className}`.trim()}>
			{label ? (
				<label htmlFor={id ?? selectId} className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
					{label}
					{required ? <span aria-hidden="true"> *</span> : null}
				</label>
			) : null}
			<div className="relative">
				<select
					id={id ?? selectId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className={[
						"w-full h-10 text-sm transition-colors duration-150 ease-in-out cursor-pointer",
						"focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none",
						"pr-8",
						isUnderlined
							? "px-0 bg-transparent border-0 border-b border-[var(--md-ref-color-outline-variant)] rounded-none focus:border-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-surface)]"
							: "px-3 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)] focus:border-[var(--md-ref-color-primary)]",
						!hasValue ? "text-[var(--md-ref-color-on-surface-variant)]" : "",
					].join(" ")}
					required={required}
				>
					{placeholder && (
						<option
							value=""
							disabled
							hidden
							className="text-[var(--md-ref-color-on-surface-variant)]"
						>
							{placeholder}
						</option>
					)}
					{options.map((option) => (
						<option
							key={option.value}
							value={option.value}
							className="bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
						>
							{option.label}
						</option>
					))}
				</select>
				<div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--md-ref-color-on-surface-variant)]">
					<Icon name="expand_more" size={20} />
				</div>
			</div>
		</div>
	);
};

export default Select;
