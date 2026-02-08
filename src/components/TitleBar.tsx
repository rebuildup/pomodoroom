/**
 * TitleBar -- Shared custom title bar for frameless windows.
 *
 * Features:
 * - Hover to reveal window controls
 * - Left-click drag to move window (via Tauri startDragging)
 * - Optional pin/float toggles for the main timer window
 * - Close / minimize / maximize buttons
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

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
}: TitleBarProps) {
	const [hovered, setHovered] = useState(false);
	const isDark = transparent || theme === "dark";

	// Right-click drag state
	const rightDragRef = useRef<{
		startX: number;
		startY: number;
		winX: number;
		winY: number;
		scale: number;
	} | null>(null);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = rightDragRef.current;
			if (!d) return;
			const dx = (e.screenX - d.startX) * d.scale;
			const dy = (e.screenY - d.startY) * d.scale;
			getCurrentWindow().setPosition(
				new PhysicalPosition(d.winX + dx, d.winY + dy),
			);
		};
		const onUp = () => {
			rightDragRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	const handleRightDown = useCallback(async (e: React.MouseEvent) => {
		if (e.button !== 2) return;
		e.preventDefault();
		try {
			const win = getCurrentWindow();
			const [pos, scale] = await Promise.all([
				win.outerPosition(),
				win.scaleFactor(),
			]);
			rightDragRef.current = {
				startX: e.screenX,
				startY: e.screenY,
				winX: pos.x,
				winY: pos.y,
				scale,
			};
		} catch {
			// Not in Tauri context
		}
	}, []);

	const handleLeftDrag = useCallback(() => {
		try {
			invoke("cmd_start_drag");
		} catch {
			// ignore
		}
	}, []);

	const handleMinimize = useCallback(async () => {
		try {
			await getCurrentWindow().minimize();
		} catch {
			// ignore
		}
	}, []);

	const handleToggleMaximize = useCallback(async () => {
		try {
			await getCurrentWindow().toggleMaximize();
		} catch {
			// ignore
		}
	}, []);

	const handleClose = useCallback(async () => {
		if (onClose) {
			onClose();
		} else {
			try {
				await getCurrentWindow().close();
			} catch {
				// ignore
			}
		}
	}, [onClose]);

	const btnBase = `h-8 flex items-center justify-center transition-colors ${
		isDark
			? "hover:bg-white/10 text-gray-400 hover:text-white"
			: "hover:bg-black/5 text-gray-500 hover:text-gray-900"
	}`;

	return (
		<div
			className="fixed top-0 left-0 right-0 z-[200] select-none"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<div
				className={`h-8 flex items-center transition-all duration-300 ${
					hovered
						? isDark
							? "bg-black/60 backdrop-blur-sm"
							: "bg-white/80 backdrop-blur-sm"
						: "bg-transparent"
				}`}
				onMouseDown={(e) => {
					if (
						e.button === 0 &&
						!(e.target as HTMLElement).closest("button")
					) {
						handleLeftDrag();
					}
				}}
			>
				{/* Left: mode toggles */}
				<div
					className={`flex items-center gap-0 ml-1 transition-opacity duration-300 ${
						hovered
							? "opacity-100"
							: "opacity-0 pointer-events-none"
					}`}
				>
					{showModeToggles && onTogglePin && (
						<button
							type="button"
							onClick={onTogglePin}
							className={`${btnBase} w-8 ${alwaysOnTop ? "!text-blue-400" : ""}`}
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
							className={`${btnBase} w-8 ${floatMode ? "!text-blue-400" : ""}`}
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
								? isDark
									? "text-gray-400 opacity-100"
									: "text-gray-500 opacity-100"
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
						className={`w-11 h-8 flex items-center justify-center transition-colors ${
							isDark
								? "hover:bg-red-500/80 text-gray-400 hover:text-white"
								: "hover:bg-red-500/80 text-gray-500 hover:text-white"
						}`}
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
