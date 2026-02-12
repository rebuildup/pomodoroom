/**
 * Material 3 Switch Component
 *
 * Toggle switch component for binary settings.
 *
 * Reference: https://m3.material.io/components/Switch/overview
 */
import React from 'react';

export interface SwitchProps {
	/** Whether switch is on (checked) */
	checked: boolean;
	/** Callback when toggle is clicked */
	onChange: (checked: boolean) => void;
	/** Whether switch is disabled */
	disabled?: boolean;
	/** Additional CSS class */
	className?: string;
	/** Accessible label for screen readers */
	ariaLabel?: string;
}

/**
 * Material 3 Switch toggle component.
 *
 * @example
 * ```tsx
 * <Switch
 *   checked={isEnabled}
 *   onChange={setChecked}
 *   ariaLabel="Enable feature"
 * />
 * ```
 */
export const Switch: React.FC<SwitchProps> = ({
	checked,
	onChange,
	disabled = false,
	className = '',
	ariaLabel,
}) => {
	const handleClick = () => {
		if (!disabled) {
			onChange(!checked);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={disabled}
			aria-label={ariaLabel}
			aria-checked={checked}
			role="switch"
			className={`
				group-relative inline-flex items-center
				w-11 h-6 shrink-0
				rounded-full
				transition-colors duration-200 ease-in-out
				focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)] focus:ring-offset-2
				${checked
					? 'bg-[var(--md-ref-color-primary)]'
					: 'bg-[var(--md-ref-color-surface-variant)]'
				}
				${disabled
					? 'opacity-50 cursor-not-allowed'
					: 'cursor-pointer'
				}
				${className}
			`.trim()}
		>
			{/* Track thumb */}
			<span
				className={`
					block w-5 h-5 rounded-full
					bg-white shadow-sm
					transition-transform duration-200 ease-in-out
					transform
					${checked ? 'translate-x-5' : 'translate-x-1'}
				`.trim()}
			/>
		</button>
	);
};

export default Switch;
