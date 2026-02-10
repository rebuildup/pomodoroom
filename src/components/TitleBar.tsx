/**
 * TitleBar -- Shared custom title bar for frameless windows.
 *
 * Features:
 * - Hover to reveal window controls
 * - Left-click drag to move window (via Tauri startDragging)
 * - Optional pin/float toggles for the main timer window
 * - Optional menu for accessing all features (main window)
 * - Close / minimize / maximize buttons
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useWindowManager } from "@/hooks/useWindowManager";
import { Icon } from "@/components/m3/Icon";

interface TitleBarProps {
	theme?: "light" | "dark";
	transparent?: boolean;
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
	/** Show main menu (for main window) */
	showMenu?: boolean;
	/** Theme toggle callback */
	onToggleTheme?: () => void;
}

interface MenuItemProps {
	icon: React.ReactNode;
	label: string;
	onClick: () => void;
	shortcut?: string;
	active?: boolean;
}

function MenuItem({ icon, label, onClick, shortcut, active }: MenuItemProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-none transition-colors ${
				active
					? "bg-(--color-text-primary) text-(--color-bg)"
					: "text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border)"
			}`}
		>
			<span className="w-5 h-5 flex items-center justify-center">{icon}</span>
			<span className="flex-1 text-left">{label}</span>
			{shortcut && (
				<span
					className={`text-xs ${active ? "opacity-70" : "text-(--color-text-muted)"}`}
				>
					{shortcut}
				</span>
			)}
		</button>
	);
}

export default function TitleBar({
	theme = "dark",
	transparent = false,
	showModeToggles = false,
	floatMode = false,
	alwaysOnTop = false,
	onToggleFloat,
	onTogglePin,
	showMinMax = true,
	onClose,
	title,
	showMenu = false,
	onToggleTheme,
}: TitleBarProps) {
	const [hovered, setHovered] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	// Window manager for opening sub-windows
	const windowManager = useWindowManager();

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// Close menu when clicking outside
	useEffect(() => {
		if (!menuOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [menuOpen]);

	// Close menu on Escape
	useEffect(() => {
		if (!menuOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setMenuOpen(false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [menuOpen]);

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

	const handleOpenWindow = useCallback(
		(type: string) => {
			windowManager.openWindow(type);
			setMenuOpen(false);
		},
		[windowManager]
	);

	const handleThemeToggle = useCallback(() => {
		if (onToggleTheme) {
			onToggleTheme();
		}
		setMenuOpen(false);
	}, [onToggleTheme]);

	const btnBase =
		"h-8 flex items-center justify-center transition-colors text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border)";
	const barBg = hovered || menuOpen
		? transparent
			? "bg-transparent"
			: "bg-(--color-bg)"
		: "bg-transparent";

	return (
		<div
			className="fixed top-0 left-0 right-0 z-200 select-none"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => {
				if (!menuOpen) setHovered(false);
			}}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<div
				className={`h-8 flex items-center transition-colors duration-150 ${barBg}`}
				onMouseDown={(e) => {
					if (
						e.button === 0 &&
						!(e.target as HTMLElement).closest("button")
					) {
						handleLeftDrag();
					}
				}}
			>
				{/* Left: Menu button + mode toggles */}
				<div
					className={`flex items-center gap-0 ml-1 transition-opacity duration-300 ${
						hovered || menuOpen
							? "opacity-100"
							: "opacity-0 pointer-events-none"
					}`}
				>
					{/* Menu button */}
					{showMenu && (
						<div className="relative" ref={menuRef}>
							<button
								type="button"
								onClick={() => setMenuOpen(!menuOpen)}
								aria-label="Open menu"
								className={`${btnBase} w-8 ${menuOpen ? "text-(--color-text-primary)" : ""}`}
								title="Menu"
							>
								<Icon name="menu" size={14} />
							</button>

							{/* Dropdown menu */}
							{menuOpen && (
								<div
									className="absolute top-full left-0 mt-1 w-56 rounded-none shadow-xl p-2 z-300 bg-(--color-surface)"
								>
									{/* Windows section */}
									<div className="space-y-0.5">
										<MenuItem
											icon={<Icon name="note" size={16} />}
											label="New Note"
											onClick={() => handleOpenWindow("note")}
										/>
										<MenuItem
											icon={<Icon name="timer" size={16} />}
											label="Mini Timer"
											onClick={() => handleOpenWindow("mini-timer")}
										/>
										<MenuItem
											icon={<Icon name="bar_chart" size={16} />}
											label="Statistics"
											onClick={() => handleOpenWindow("stats")}
										/>
										<MenuItem
											icon={<Icon name="calendar_month" size={16} />}
											label="Timeline"
											onClick={() => handleOpenWindow("timeline")}
										/>
										<MenuItem
											icon={<Icon name="music_note" size={16} />}
											label="YouTube"
											onClick={() => handleOpenWindow("youtube")}
										/>
									</div>
									<div className="my-2" />

									{/* Settings section */}
									<div className="space-y-0.5">
										<MenuItem
											icon={<Icon name="settings" size={16} />}
											label="Settings"
											onClick={() => handleOpenWindow("settings")}
										/>
										<MenuItem
											icon={theme === "dark" ? <Icon name="light_mode" size={16} /> : <Icon name="dark_mode" size={16} />}
											label={`${theme === "dark" ? "Light" : "Dark"} Mode`}
											onClick={handleThemeToggle}
										/>
									</div>
								</div>
							)}
						</div>
					)}

					{showModeToggles && onTogglePin && (
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
							hovered || menuOpen
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
						hovered || menuOpen
							? "opacity-100"
							: "opacity-0 pointer-events-none"
					}`}
				>
					{showMinMax && !floatMode && (
						<>
							<button
								type="button"
								onClick={handleMinimize}
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
						aria-label="Close window"
						className="w-11 h-8 flex items-center justify-center transition-colors text-(--color-text-secondary) hover:text-(--color-bg) hover:bg-(--color-text-primary)"
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
