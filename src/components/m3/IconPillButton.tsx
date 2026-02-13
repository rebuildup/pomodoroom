import React from "react";
import { Icon, type MSIconName } from "./Icon";

export interface IconPillButtonProps {
	icon: MSIconName;
	label?: string;
	onClick?: () => void;
	type?: "button" | "submit" | "reset";
	disabled?: boolean;
	className?: string;
	size?: "sm" | "md";
}

export const IconPillButton: React.FC<IconPillButtonProps> = ({
	icon,
	label,
	onClick,
	type = "button",
	disabled = false,
	className = "",
	size = "md",
}) => {
	const iconSize = size === "sm" ? 14 : 16;
	const height = size === "sm" ? "h-9 px-5 text-xs gap-2" : "h-11 px-6 text-sm gap-2.5";
	const iconOnlyHeight = size === "sm" ? "h-9 w-9" : "h-11 w-11";

	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
		className={[
			"inline-flex items-center justify-center whitespace-nowrap rounded-[9999px]",
			"bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface)]",
			"border border-[var(--md-ref-color-outline)]",
			"hover:bg-[var(--md-ref-color-surface-container-high)] hover:border-[var(--md-ref-color-outline-variant)]",
			"transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
			label ? height : iconOnlyHeight,
			className,
		].join(" ")}
			aria-label={label || icon}
		>
			<Icon name={icon} size={iconSize} />
			{label && <span>{label}</span>}
		</button>
	);
};

export default IconPillButton;
