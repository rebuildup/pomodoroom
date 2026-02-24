import type React from "react";
import { forwardRef, useRef, useId } from "react";
import { Icon } from "./Icon";

type PickerMode = "date" | "time" | "datetime-local";
type Variant = "outlined" | "underlined";

export interface DateTimePickerFieldProps {
	value?: string;
	onChange?: (value: string) => void;
	label?: string;
	placeholder?: string;
	error?: string;
	supportingText?: string;
	disabled?: boolean;
	required?: boolean;
	className?: string;
	variant?: Variant;
	mode?: PickerMode;
	min?: string;
	max?: string;
	step?: number;
}

const modeIcon: Record<PickerMode, "calendar_month" | "schedule" | "event"> = {
	date: "calendar_month",
	time: "schedule",
	"datetime-local": "event",
};

const modeDefaultPlaceholder: Record<PickerMode, string> = {
	date: "YYYY-MM-DD",
	time: "HH:mm",
	"datetime-local": "YYYY-MM-DDTHH:mm",
};

export const DateTimePickerField = forwardRef<HTMLInputElement, DateTimePickerFieldProps>(
	(
		{
			value,
			onChange,
			label,
			placeholder,
			error,
			supportingText,
			disabled = false,
			required = false,
			className = "",
			variant = "underlined",
			mode = "datetime-local",
			min,
			max,
			step,
		},
		forwardedRef,
	) => {
		const inputId = useId();
		const inputRef = useRef<HTMLInputElement | null>(null);
		const hasError = Boolean(error);
		const isUnderlined = variant === "underlined";

		const setRefs = (node: HTMLInputElement | null) => {
			inputRef.current = node;
			if (typeof forwardedRef === "function") {
				forwardedRef(node);
			} else if (forwardedRef) {
				forwardedRef.current = node;
			}
		};

		const openNativePicker = () => {
			if (disabled) return;
			const inputEl = inputRef.current as HTMLInputElement | null;
			if (!inputEl) return;
			const pickerEl = inputEl as HTMLInputElement & { showPicker?: () => void };
			if (typeof pickerEl.showPicker === "function") {
				pickerEl.showPicker();
			} else {
				inputEl.focus();
			}
		};

		return (
			<div className={`flex flex-col gap-1 ${className}`.trim()}>
				{label ? (
					<label
						htmlFor={inputId}
						className={`text-sm font-medium ${hasError ? "text-[var(--md-ref-color-error)]" : "text-[var(--md-ref-color-on-surface)]"}`}
					>
						{label}
						{required ? <span aria-hidden="true"> *</span> : null}
					</label>
				) : null}
				<div className="relative">
					<input
						id={inputId}
						ref={setRefs}
						type={mode}
						value={value ?? ""}
						onChange={(e) => onChange?.(e.target.value)}
						disabled={disabled}
						required={required}
						min={min}
						max={max}
						step={step}
						placeholder={placeholder ?? modeDefaultPlaceholder[mode]}
						className={[
							"w-full py-2 text-sm transition-colors duration-150 ease-in-out",
							"focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
							"text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]",
							"pr-9",
							// Hide browser's native picker indicator
							"[&::-webkit-calendar-picker-indicator]:hidden",
							isUnderlined
								? "px-0 bg-transparent border-0 border-b border-[var(--md-ref-color-outline-variant)] rounded-none focus:border-[var(--md-ref-color-primary)]"
								: "px-3 rounded-lg border bg-[var(--md-ref-color-surface)]",
							!isUnderlined && hasError ? "border-[var(--md-ref-color-error)]" : "",
							!isUnderlined && !hasError ? "border-[var(--md-ref-color-outline)]" : "",
						].join(" ")}
						aria-invalid={hasError}
						aria-describedby={supportingText || error ? "picker-supporting-text" : undefined}
					/>
					<button
						type="button"
						onClick={openNativePicker}
						disabled={disabled}
						className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full inline-flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] disabled:opacity-40 disabled:cursor-not-allowed"
						aria-label={`Open ${mode} picker`}
					>
						<Icon name={modeIcon[mode]} size={16} />
					</button>
				</div>
				{supportingText || error ? (
					<p
						id="picker-supporting-text"
						className={`text-xs ${hasError ? "text-[var(--md-ref-color-error)]" : "text-[var(--md-ref-color-on-surface-variant)]"}`}
					>
						{error || supportingText}
					</p>
				) : null}
			</div>
		);
	},
);

DateTimePickerField.displayName = "DateTimePickerField";

export type DatePickerProps = Omit<DateTimePickerFieldProps, "mode">;
export const DatePicker: React.FC<DatePickerProps> = (props) => (
	<DateTimePickerField {...props} mode="date" />
);

export type TimePickerProps = Omit<DateTimePickerFieldProps, "mode">;
export const TimePicker: React.FC<TimePickerProps> = (props) => (
	<DateTimePickerField {...props} mode="time" />
);

export type DateTimePickerProps = Omit<DateTimePickerFieldProps, "mode">;
export const DateTimePicker: React.FC<DateTimePickerProps> = (props) => (
	<DateTimePickerField {...props} mode="datetime-local" />
);
