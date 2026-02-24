import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

interface ThemeProviderProps {
	children: ReactNode;
}

/**
 * Theme provider component that wraps the app
 * Handles light/dark mode switching with localStorage persistence
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
	const { theme } = useTheme();

	return (
		<div
			className={`app-frame min-h-full bg-[var(--color-bg)] text-[var(--color-text-primary)] transition-colors duration-150 ${theme}`}
		>
			{children}
		</div>
	);
}

/**
 * Theme toggle button component
 */
export function ThemeToggle() {
	const { theme, toggleTheme } = useTheme();

	return (
		<button
			type="button"
			onClick={toggleTheme}
			className="no-drag inline-flex items-center justify-center w-8 h-8 rounded hover:bg-[var(--color-border)] transition-colors"
			aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
			title={`Current: ${theme} theme`}
		>
			{theme === "light" ? (
				// Sun icon for light mode
				<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<title>Sun icon</title>
					<circle cx="12" cy="12" r="4" strokeWidth="2" />
					<path
						strokeWidth="2"
						d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
					/>
				</svg>
			) : (
				// Moon icon for dark mode
				<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<title>Moon icon</title>
					<path strokeWidth="2" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			)}
		</button>
	);
}
