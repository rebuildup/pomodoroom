/**
 * Material 3 Button Component
 *
 * General purpose button component supporting all M3 variants.
 *
 * Reference: https://m3.material.io/components/buttons/overview
 */
import React from 'react';
import { Icon, type MSIconName } from './Icon';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text';
export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps {
	/** Button content */
	children: React.ReactNode;
	/** Button click handler */
	onClick?: () => void;
	/** Button type */
	type?: 'button' | 'submit' | 'reset';
	/** Button variant (default: tonal) */
	variant?: ButtonVariant;
	/** Button size (default: medium) */
	size?: ButtonSize;
	/** Whether button is disabled */
	disabled?: boolean;
	/** Icon to show before text */
	icon?: MSIconName;
	/** Whether to show icon only */
	iconOnly?: boolean;
	/** Additional CSS class */
	className?: string;
	/** Button is full width of parent */
	fullWidth?: boolean;
}

/**
 * Material 3 Button component.
 *
 * @example
 * ```tsx
 * <Button variant="filled" onClick={handleSubmit}>
 *   Submit
 * </Button>
 *
 * <Button variant="tonal" icon="add" onClick={handleAdd}>
 *   Add Item
 * </Button>
 *
 * <Button variant="outlined" size="small" onClick={handleCancel}>
 *   Cancel
 * </Button>
 * ```
 */
export const Button: React.FC<ButtonProps> = ({
	children,
	onClick,
	type = 'button',
	variant = 'tonal',
	size = 'medium',
	disabled = false,
	icon,
	iconOnly = false,
	className = '',
	fullWidth = false,
}) => {
	// Variant styles
	const variantStyles: Record<ButtonVariant, string> = {
		filled: `
			bg-[var(--md-ref-color-primary)]
			text-[var(--md-ref-color-on-primary)]
			hover:bg-[var(--md-ref-color-primary)]
			shadow-sm
		`.trim(),
		tonal: `
			bg-[var(--md-ref-color-secondary-container)]
			text-[var(--md-ref-color-on-secondary-container)]
			hover:bg-[var(--md-ref-color-secondary-container)]
		`.trim(),
		outlined: `
			border border-[var(--md-ref-color-outline)]
			text-[var(--md-ref-color-primary)]
			hover:bg-[var(--md-ref-color-primary-container)]
			hover:text-[var(--md-ref-color-on-primary-container)]
		`.trim(),
		text: `
			text-[var(--md-ref-color-primary)]
			hover:bg-[var(--md-ref-color-primary-container)]
			hover:text-[var(--md-ref-color-on-primary-container)]
		`.trim(),
	};

	// Size configurations
	const sizeStyles: Record<ButtonSize, string> = {
		small: 'px-3 py-1.5 text-xs gap-1',
		medium: 'px-4 py-2 text-sm gap-1.5',
		large: 'px-5 py-2.5 text-base gap-2',
	};

	const iconSizes: Record<ButtonSize, number> = {
		small: 16,
		medium: 18,
		large: 20,
	};

	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			className={`
				inline-flex items-center justify-center
				font-medium
				rounded-lg
				transition-all duration-150 ease-in-out
				focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)] focus:ring-offset-2
				disabled:opacity-40 disabled:cursor-not-allowed
				${variantStyles[variant]}
				${sizeStyles[size]}
				${fullWidth ? 'w-full' : ''}
				${className}
			`.trim()}
			aria-busy={iconOnly}
		>
			{icon && <Icon name={icon} size={iconSizes[size]} />}
			{!iconOnly && <span>{children}</span>}
		</button>
	);
};

export default Button;
