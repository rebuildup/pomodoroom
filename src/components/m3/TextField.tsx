/**
 * Material 3 TextField Component
 *
 * Text input field with label and supporting text.
 *
 * Reference: https://m3.material.io/components/TextFields/overview
 */
import React, { forwardRef, useState } from 'react';

export interface TextFieldProps {
	/** Input value (controlled) */
	value?: string;
	/** Default value (uncontrolled) */
	defaultValue?: string;
	/** Value change callback */
	onChange?: (value: string) => void;
	/** Input placeholder */
	placeholder?: string;
	/** Input type */
	type?: 'text' | 'email' | 'password' | 'number' | 'time' | 'date' | 'datetime-local';
	/** Field label */
	label?: string;
	/** Supporting text below field */
	supportingText?: string;
	/** Error message (shows field in error state) */
	error?: string;
	/** Whether field is disabled */
	disabled?: boolean;
	/** Whether field is required */
	required?: boolean;
	/** Maximum length */
	maxLength?: number;
	/** Additional CSS class */
	className?: string;
	/** Visual variant */
	variant?: 'outlined' | 'underlined';

	/** Icon to show at start of input */
	startIcon?: React.ReactNode;
	/** Icon to show at end of input */
	endIcon?: React.ReactNode;
}

/**
 * Material 3 TextField component.
 *
 * @example
 * ```tsx
 * <TextField
 *   label="Email"
 *   type="email"
 *   value={email}
 *   onChange={setEmail}
 *   placeholder="your@email.com"
 *   supportingText="We'll never share your email."
 * />
 * ```
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(({
	value: controlledValue,
	defaultValue,
	onChange,
	placeholder,
	type = 'text',
	label,
	supportingText,
	error,
	disabled = false,
	required = false,
	maxLength,
	className = '',
	variant = 'outlined',
	startIcon,
	endIcon,
}, forwardedRef) => {
	const [internalValue, setInternalValue] = useState(defaultValue ?? '');
	const isControlled = controlledValue !== undefined;
	const currentValue = isControlled ? controlledValue : internalValue;

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		if (maxLength && newValue.length > maxLength) return;
		if (isControlled) {
			onChange?.(newValue);
		} else {
			setInternalValue(newValue);
			onChange?.(newValue);
		}
	};

	const hasError = !!error;
	const hasLabel = !!label;
	const isUnderlined = variant === 'underlined';

	return (
		<div className={`flex flex-col gap-1 ${className}`.trim()}>
			{hasLabel && (
				<label
					className={`text-sm font-medium ${
						hasError
							? 'text-[var(--md-ref-color-error)]'
							: 'text-[var(--md-ref-color-on-surface)]'
					}`}
				>
					{label}
					{required && <span aria-hidden="true"> *</span>}
				</label>
			)}
			<div className="relative">
				{startIcon && (
					<div className={`absolute top-1/2 flex items-center justify-center pointer-events-none ${isUnderlined ? 'left-0 -translate-y-1/2' : 'left-3 -translate-y-1/2'}`}>
						{startIcon}
					</div>
				)}
				<input
					ref={forwardedRef}
					type={type}
					value={currentValue}
					onChange={handleChange}
					disabled={disabled}
					placeholder={placeholder}
					maxLength={maxLength}
					className={`
						w-full py-2
						text-sm
						transition-colors duration-150 ease-in-out
						focus:outline-none
						disabled:opacity-50 disabled:cursor-not-allowed
						placeholder:text-[var(--md-ref-color-on-surface-variant)]
						${isUnderlined ? 'px-0 bg-transparent border-0 border-b rounded-none' : 'px-3 pr-3 rounded-lg border bg-[var(--md-ref-color-surface)] hover:bg-[var(--md-ref-color-surface-container-high)]'}
						${startIcon ? (isUnderlined ? 'pl-7' : 'pl-9') : ''}
						${endIcon ? (isUnderlined ? 'pr-7' : 'pr-9') : ''}
						${hasError
							? 'border-[var(--md-ref-color-error)]'
							: 'border-[var(--md-ref-color-outline)]'
						}
						${isUnderlined ? 'focus:border-b' : ''}
						text-[var(--md-ref-color-on-surface)]
					`.trim()}
					aria-invalid={hasError}
					aria-describedby={supportingText || error ? 'supporting-text' : undefined}
				/>
				{endIcon && (
					<div className={`absolute top-1/2 flex items-center justify-center pointer-events-none ${isUnderlined ? 'right-0 -translate-y-1/2' : 'right-3 -translate-y-1/2'}`}>
						{endIcon}
					</div>
				)}
			</div>
			{(supportingText || error) && (
				<p
					id="supporting-text"
					className={`text-xs ${
						hasError
							? 'text-[var(--md-ref-color-error)]'
							: 'text-[var(--md-ref-color-on-surface-variant)]'
					}`}
				>
					{error || supportingText}
				</p>
			)}
		</div>
	);
});

TextField.displayName = 'TextField';

export default TextField;
