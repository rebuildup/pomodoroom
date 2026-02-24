/**
 * Material 3 Top App Bar Component
 *
 * Header bar with title and theme toggle action.
 * Consistent with Material 3 spec.
 *
 * Reference: https://m3.material.io/components/top-app-bars/overview
 */

import type React from "react";
import { Icon } from "./Icon";
import { useTheme, type Theme } from "@/hooks/useTheme";

export interface TopAppBarProps {
	/**
	 * Title displayed in the app bar
	 */
	title: string;

	/**
	 * Optional subtitle displayed below title
	 */
	subtitle?: string;

	/**
	 * Additional actions to display on the right side
	 */
	actions?: React.ReactNode;

	/**
	 * Whether to show the theme toggle button
	 */
	showThemeToggle?: boolean;

	/**
	 * Theme override (for controlled mode)
	 */
	theme?: Theme;

	/**
	 * Theme toggle callback (for controlled mode)
	 */
	onThemeToggle?: () => void;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

/**
 * Top App Bar for App Shell
 *
 * @example
 * ```tsx
 * <TopAppBar
 *   title="Timer"
 *   subtitle="Focus on your task"
 *   showThemeToggle
 * />
 * ```
 */
export const TopAppBar: React.FC<TopAppBarProps> = ({
	title,
	subtitle,
	actions,
	showThemeToggle = true,
	theme: controlledTheme,
	onThemeToggle: controlledOnToggle,
	className = "",
}) => {
	// Use internal theme if not controlled
	const internalTheme = useTheme();
	const theme = controlledTheme ?? internalTheme.theme;
	const toggleTheme = controlledOnToggle ?? internalTheme.toggleTheme;

	return (
		<header
			className={`
				flex items-center justify-between
				px-6 py-4
				bg-[var(--md-ref-color-surface)]
				border-b border-[var(--md-ref-color-outline-variant)]
				transition-colors duration-150
				${className}
			`.trim()}
		>
			{/* Title section */}
			<div className="flex flex-col">
				<h1 className="text-xl font-medium" style={{ font: "var(--md-sys-typescale-title-large)" }}>
					{title}
				</h1>
				{subtitle && (
					<p className="text-sm opacity-70" style={{ font: "var(--md-sys-typescale-body-medium)" }}>
						{subtitle}
					</p>
				)}
			</div>

			{/* Actions section */}
			<div className="flex items-center gap-2">
				{/* Custom actions */}
				{actions}

				{/* Theme toggle button */}
				{showThemeToggle && (
					<button
						onClick={toggleTheme}
						className={`
							flex items-center justify-center
							w-10 h-10 rounded-full
							transition-all duration-150 ease-out
							bg-[var(--md-ref-color-surface-container-high)]
							hover:bg-[var(--md-ref-color-surface-container-highest)]
							text-[var(--md-ref-color-on-surface-variant)]
							hover:text-[var(--md-ref-color-on-surface)]
						`.trim()}
						aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
						title={`Current: ${theme} theme`}
					>
						<Icon name={theme === "light" ? "dark_mode" : "light_mode"} size={20} />
					</button>
				)}
			</div>
		</header>
	);
};

export default TopAppBar;
