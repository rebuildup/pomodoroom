/**
 * TitleBar -- Shared custom title bar for frameless windows.
 *
 * Features:
 * - Hover to reveal window controls
 * - Left-click drag to move window (via Tauri startDragging)
 * - Right-click drag handled by GlobalDragProvider
 * - Optional pin/float toggles for the main timer window
 * - Close / minimize / maximize buttons
 */
import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "@/components/m3/Icon";

interface TitleBarProps {
	theme?: "light" | "dark";
	transparent?: boolean;
	/** Always show pin control (without hover) */
	alwaysShowPin?: boolean;
	/** Always show theme toggle (without hover) */
	alwaysShowThemeToggle?: boolean;
	/** Show pin/float toggles (main window only) */
	showModeToggles?: boolean;
	floatMode?: boolean;
	alwaysOnTop?: boolean;
	onToggleFloat?: () => void;
	onTogglePin?: () => void;
	/** Show minimize/maximize buttons */
	showMinMax?: boolean;
	onClose?: () => void;
	/** Title text shown in center */
	title?: string;
	/** Theme toggle callback */
	onToggleTheme?: () => void;
	/** Positioning mode for title bar layer */
	position?: "fixed" | "absolute";
	/** Disable internal rounded corners for special windows */
	disableRounding?: boolean;
}

export default function TitleBar({
	theme = "dark",
	transparent = false,
	alwaysShowPin = false,
	alwaysShowThemeToggle = false,
	showModeToggles = false,
	floatMode = false,
	alwaysOnTop = false,
	onToggleFloat,
	onTogglePin,
	showMinMax = true,
	onClose,
	title,
	onToggleTheme,
	position = "fixed",
	disableRounding = false,
}: TitleBarProps) {
	const [hovered, setHovered] = useState(false);
	const [isMaximized, setIsMaximized] = useState(false);

	// Track window maximized state for rounded corners
	useEffect(() => {
		const win = getCurrentWindow();
		let unlistenResize: (() => void) | null = null;

		const updateMaximized = async () => {
			try {
				const maximized = await win.isMaximized();
				setIsMaximized(maximized);
			} catch {
				// Ignore errors
			}
		};

		// Initial check
		void updateMaximized();

		// Listen for resize events
		(async () => {
			try {
				unlistenResize = await win.onResized(() => {
					void updateMaximized();
				});
			} catch {
				// Ignore errors
			}
		})();

		return () => {
			unlistenResize?.();
		};
	}, []);

	const handleLeftDrag = useCallback(() => {
		invoke("cmd_start_drag").catch((error) => {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[TitleBar] Failed to start drag:", err.message);
		});
	}, []);

	const handleMinimize = useCallback(async () => {
		try {
			await getCurrentWindow().minimize();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[TitleBar] Failed to minimize window:", err.message);
		}
	}, []);

	const handleToggleMaximize = useCallback(async () => {
		try {
			await getCurrentWindow().toggleMaximize();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[TitleBar] Failed to toggle maximize:", err.message);
		}
	}, []);

	const handleClose = useCallback(async () => {
		if (onClose) {
			onClose();
		} else {
			try {
				await getCurrentWindow().close();
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error("[TitleBar] Failed to close window:", err.message);
			}
		}
	}, [onClose]);

	const btnBase =
		"no-pill !bg-transparent h-8 flex items-center justify-center transition-colors text-(--color-text-secondary) hover:text-(--color-text-primary)";
	const btnCloseBase =
		"no-pill !bg-transparent w-11 h-8 flex items-center justify-center transition-colors text-(--color-text-secondary) hover:text-(--color-text-primary)";
	const barBg = hovered
		? transparent
			? "bg-transparent"
			: "bg-(--color-bg)"
		: "bg-transparent";

	// Rounded corners only when not maximized (matches window behavior)
	const roundedClass = disableRounding ? "rounded-none" : isMaximized ? "rounded-none" : "rounded-t-2xl";

	return (
		<div
			className={`${position} top-0 left-0 right-0 z-[9999] select-none ${roundedClass}`}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => {
				setHovered(false);
			}}
		>
			<div
				className={`h-8 flex items-center transition-colors duration-150 ${barBg} ${roundedClass}`}
				onMouseDown={(e) => {
					if (
						e.button === 0 &&
						!(e.target as HTMLElement).closest("button") &&
						!(e.target as HTMLElement).closest("[data-no-drag]")
					) {
						handleLeftDrag();
					}
				}}
			>
				{/* Always-visible left controls (pin/theme) */}
				{(alwaysShowPin || alwaysShowThemeToggle) && (
					<div className="flex items-center gap-0 ml-1">
						{alwaysShowPin && showModeToggles && onTogglePin && (
							<button
								type="button"
								onClick={onTogglePin}
								aria-label={alwaysOnTop ? "Unpin window" : "Pin window on top"}
								className={`${btnBase} w-8 ${alwaysOnTop ? "text-(--color-text-primary)" : ""}`}
								title={alwaysOnTop ? "Unpin" : "Pin on Top"}
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill={alwaysOnTop ? "currentColor" : "none"}
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M12 17v5" />
									<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
								</svg>
							</button>
						)}

						{alwaysShowThemeToggle && onToggleTheme && (
							<button
								type="button"
								onClick={onToggleTheme}
								aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
								className={`${btnBase} w-8`}
								title={theme === "dark" ? "Light mode" : "Dark mode"}
							>
								<Icon name={theme === "dark" ? "light_mode" : "dark_mode"} size={14} />
							</button>
						)}
					</div>
				)}

				{/* Left: Menu button + mode toggles */}
				<div
					className={`flex items-center gap-0 ml-1 transition-opacity duration-300 ${
						hovered
							? "opacity-100"
							: "opacity-0 pointer-events-none"
					}`}
				>
					{!alwaysShowPin && showModeToggles && onTogglePin && (
						<button
							type="button"
							onClick={onTogglePin}
							data-no-drag
							aria-label={alwaysOnTop ? "Unpin window" : "Pin window on top"}
							className={`${btnBase} w-8 ${alwaysOnTop ? "text-(--color-text-primary)" : ""}`}
							title={alwaysOnTop ? "Unpin" : "Pin on Top"}
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill={alwaysOnTop ? "currentColor" : "none"}
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M12 17v5" />
								<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
							</svg>
						</button>
					)}

					{!alwaysShowThemeToggle && onToggleTheme && (
						<button
							type="button"
							onClick={onToggleTheme}
							data-no-drag
							aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
							className={`${btnBase} w-8`}
							title={theme === "dark" ? "Light mode" : "Dark mode"}
						>
							<Icon name={theme === "dark" ? "light_mode" : "dark_mode"} size={14} />
						</button>
					)}

					{showModeToggles && onToggleFloat && (
						<button
							type="button"
							onClick={onToggleFloat}
							aria-label={floatMode ? "Exit compact mode" : "Enter compact mode"}
							className={`${btnBase} w-8 ${floatMode ? "text-(--color-text-primary)" : ""}`}
							title={
								floatMode ? "Exit Compact" : "Compact Mode"
							}
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								{floatMode ? (
									<>
										<polyline points="15 3 21 3 21 9" />
										<polyline points="9 21 3 21 3 15" />
										<line
											x1="21"
											y1="3"
											x2="14"
											y2="10"
										/>
										<line
											x1="3"
											y1="21"
											x2="10"
											y2="14"
										/>
									</>
								) : (
									<>
										<polyline points="4 14 10 14 10 20" />
										<polyline points="20 10 14 10 14 4" />
										<line
											x1="14"
											y1="10"
											x2="21"
											y2="3"
										/>
										<line
											x1="3"
											y1="21"
											x2="10"
											y2="14"
										/>
									</>
								)}
							</svg>
						</button>
					)}
				</div>

				{/* Center: title */}
				{title && (
					<div
						className={`flex-1 text-center text-xs font-medium tracking-wide truncate transition-opacity duration-300 ${
							hovered
								? "text-(--color-text-secondary) opacity-100"
								: "opacity-0"
						}`}
					>
						{title}
					</div>
				)}
				{!title && <div className="flex-1" />}

				{/* Right: window controls */}
				<div
					className={`flex items-center gap-0 transition-opacity duration-300 ${
						hovered
							? "opacity-100"
							: "opacity-0 pointer-events-none"
					}`}
				>
					{showMinMax && !floatMode && (
						<>
							<button
								type="button"
								onClick={handleMinimize}
								data-no-drag
								aria-label="Minimize window"
								className={`${btnBase} w-11`}
							>
								<svg
									width="10"
									height="1"
									viewBox="0 0 10 1"
									fill="currentColor"
								>
									<rect width="10" height="1" />
								</svg>
							</button>
							<button
								type="button"
								onClick={handleToggleMaximize}
								data-no-drag
								aria-label="Maximize window"
								className={`${btnBase} w-11`}
							>
								<svg
									width="10"
									height="10"
									viewBox="0 0 10 10"
									fill="none"
									stroke="currentColor"
									strokeWidth="1"
								>
									<rect
										x="0.5"
										y="0.5"
										width="9"
										height="9"
									/>
								</svg>
							</button>
						</>
					)}
					<button
						type="button"
						onClick={handleClose}
						data-no-drag
						aria-label="Close window"
						className={btnCloseBase}
					>
						<svg
							width="10"
							height="10"
							viewBox="0 0 10 10"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.2"
						>
							<line x1="0" y1="0" x2="10" y2="10" />
							<line x1="10" y1="0" x2="0" y2="10" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}
