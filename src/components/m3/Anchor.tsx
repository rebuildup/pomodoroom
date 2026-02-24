/**
 * Material 3 Anchor Floating Component
 *
 * Floating timer component for 280x280 float mode window.
 * Replaces MiniTimer.tsx with Material 3 design principles.
 *
 * Features:
 * - Compact circular timer display with centisecond precision
 * - Quick controls (play/pause, skip) with 48px touch targets
 * - Always-on-top behavior via Tauri window API
 * - Drag-to-reposition via right-click (PureRef-style)
 * - State sync with main timer via useTauriTimer hook
 *
 * @example
 * ```tsx
 * <Anchor />
 * ```
 */

import type React from "react";
import { useCallback, useEffect } from "react";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { MiniTimerDisplay } from "./MiniTimerDisplay";
import { Icon } from "./Icon";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface AnchorProps {
	/** Custom className for styling */
	className?: string;
}

/**
 * Material 3 Anchor Floating Component
 *
 * The Anchor is a compact floating timer that stays on top of other windows.
 * It provides quick access to timer controls without disrupting your workflow.
 */
export const Anchor: React.FC<AnchorProps> = ({ className = "" }) => {
	const timer = useTauriTimer();
	const { handleRightDown } = useRightClickDrag();

	// Derived timer state
	const isActive = timer.snapshot?.state === "running";
	const isPaused = timer.snapshot?.state === "paused";
	const isIdle = timer.snapshot?.state === "idle" || !timer.snapshot;
	const isCompleted = timer.snapshot?.state === "completed";
	const stepType = timer.snapshot?.step_type ?? "focus";

	// Handle play/pause click
	const handlePlayPause = useCallback(() => {
		if (isCompleted || isIdle) {
			timer.start();
		} else if (isActive) {
			timer.pause();
		} else if (isPaused) {
			timer.resume();
		} else {
			timer.start();
		}
	}, [timer, isActive, isPaused, isIdle, isCompleted]);

	// Handle skip click
	const handleSkip = useCallback(() => {
		timer.skip();
	}, [timer]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				handlePlayPause();
			} else if (e.key === "Escape") {
				getCurrentWindow().close().catch(console.error);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handlePlayPause]);

	// Timer values
	const remainingMs = timer.remainingMs ?? 0;
	const totalMs = timer.snapshot?.total_ms ?? 1;

	return (
		<div
			className={`w-screen h-screen bg-transparent select-none flex flex-col items-center justify-center ${className}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			{/* Timer Display */}
			<button
				type="button"
				onClick={handlePlayPause}
				aria-label={isActive ? "Pause timer" : "Start timer"}
				className="relative cursor-pointer active:scale-95 transition-transform duration-200"
				style={{ width: "min(85vmin, 180px)", height: "min(85vmin, 180px)" }}
			>
				<MiniTimerDisplay
					remainingMs={remainingMs}
					totalMs={totalMs}
					isActive={isActive}
					stepType={stepType}
				/>
			</button>

			{/* Quick Controls - Bottom */}
			<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
				{/* Skip Button - Left */}
				<button
					type="button"
					onClick={handleSkip}
					aria-label="Skip to next session"
					className="w-12 h-12 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full bg-white/10 backdrop-blur text-white/70 hover:bg-white/15 hover:text-white active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30"
					style={{ touchAction: "manipulation" }}
				>
					<Icon name="skip_next" size={24} />
				</button>

				{/* Play/Pause Button - Center (Primary) */}
				<button
					type="button"
					onClick={handlePlayPause}
					aria-label={isActive ? "Pause timer" : "Start timer"}
					className="w-14 h-14 min-w-[56px] min-h-[56px] flex items-center justify-center rounded-full bg-white/20 backdrop-blur text-white hover:bg-white/25 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30 shadow-lg"
					style={{ touchAction: "manipulation" }}
				>
					<Icon name={isActive ? "pause" : "play_arrow"} size={28} filled={isActive} />
				</button>

				{/* Close Button - Right */}
				<button
					type="button"
					onClick={() => getCurrentWindow().close().catch(console.error)}
					aria-label="Close floating timer"
					className="w-12 h-12 min-w-[48px] min-h-[48px] flex items-center justify-center rounded-full bg-white/5 backdrop-blur text-white/50 hover:bg-white/10 hover:text-white/70 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/30"
					style={{ touchAction: "manipulation" }}
				>
					<Icon name="close" size={20} />
				</button>
			</div>

			{/* Drag hint - shows on hover */}
			<div className="absolute top-4 left-1/2 -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none">
				<span className="text-xs text-white/30 font-medium">Right-click to drag</span>
			</div>
		</div>
	);
};

export default Anchor;
