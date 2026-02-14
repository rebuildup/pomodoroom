/**
 * SplitButton - M3 Split Button Component
 * 
 * Button with primary action and dropdown menu for secondary actions.
 */

import React, { useState, useRef, useEffect } from "react";
import { Icon } from "./Icon";

export interface SplitButtonAction {
	label: string;
	icon?: string;
	onClick: () => void;
	disabled?: boolean;
}

export interface SplitButtonProps {
	/** Primary action label */
	label: string;
	/** Primary action icon */
	icon?: string;
	/** Primary action handler */
	onClick: () => void;
	/** Secondary actions in dropdown */
	actions?: SplitButtonAction[];
	/** Button variant */
	variant?: "filled" | "outlined" | "text";
	/** Button size */
	size?: "small" | "medium" | "large";
	/** Disabled state */
	disabled?: boolean;
	/** Additional CSS classes */
	className?: string;
}

export const SplitButton: React.FC<SplitButtonProps> = ({
	label,
	icon,
	onClick,
	actions = [],
	variant = "filled",
	size = "medium",
	disabled = false,
	className = "",
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const variantClasses = {
		filled: "bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] hover:bg-[var(--md-ref-color-primary)]/90",
		outlined: "border border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-primary)]/10",
		text: "text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-primary)]/10",
	}[variant];

	const sizeClasses = {
		small: "text-xs px-3 py-1.5",
		medium: "text-sm px-4 py-2",
		large: "text-base px-5 py-2.5",
	}[size];

	const iconSize = {
		small: 16,
		medium: 18,
		large: 20,
	}[size];

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [isOpen]);

	const hasActions = actions.length > 0;

	return (
		<div className={`relative inline-flex ${className}`} ref={dropdownRef}>
			<div className="flex rounded-lg overflow-hidden">
				{/* Primary button */}
				<button
					type="button"
					onClick={onClick}
					disabled={disabled}
					className={`
						flex items-center gap-2 font-medium transition-colors
						${variantClasses} ${sizeClasses}
						${hasActions ? "rounded-l-lg rounded-r-none" : "rounded-lg"}
						disabled:opacity-50 disabled:cursor-not-allowed
					`}
				>
					{icon && <Icon name={icon} size={iconSize} />}
					<span>{label}</span>
				</button>

				{/* Dropdown toggle */}
				{hasActions && (
					<button
						type="button"
						onClick={() => setIsOpen(!isOpen)}
						disabled={disabled}
						className={`
							flex items-center justify-center px-2 border-l border-current/20
							${variantClasses} ${sizeClasses}
							rounded-r-lg rounded-l-none
							disabled:opacity-50 disabled:cursor-not-allowed
						`}
					>
						<Icon name={isOpen ? "expand_less" : "expand_more"} size={iconSize} />
					</button>
				)}
			</div>

			{/* Dropdown menu */}
			{hasActions && isOpen && (
				<div className="absolute top-full right-0 mt-1 min-w-[160px] rounded-lg bg-[var(--md-ref-color-surface-container)] shadow-lg border border-[var(--md-ref-color-outline-variant)] overflow-hidden z-50">
					{actions.map((action, index) => (
						<button
							key={index}
							type="button"
							onClick={() => {
								action.onClick();
								setIsOpen(false);
							}}
							disabled={action.disabled}
							className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-[var(--md-ref-color-primary)]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							{action.icon && (
								<Icon name={action.icon} size={18} className="flex-shrink-0" />
							)}
							<span>{action.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
};
