/**
 * MiniTimerView -- Standalone compact timer window.
 *
 * Shows a minimal circular timer ring. Always-on-top, transparent background.
 * Clicks cycle through start/stop states like the main timer.
 */
import { useCallback, useEffect, useRef } from "react";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import TitleBar from "@/components/TitleBar";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";

const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	shortBreakDuration: 5,
	longBreakDuration: 30,
	sessionsUntilLongBreak: 4,
	notificationSound: true,
	notificationVolume: 50,
	vibration: true,
	theme: "dark",
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
};

export default function MiniTimerView() {
	const timer = useTauriTimer();
	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);

	const highlightColor = settings.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
	const isActive =
		timer.snapshot?.state === "running" ||
		timer.snapshot?.state === "paused";

	const handleClick = useCallback(() => {
		if (timer.isCompleted) {
			timer.start();
		} else if (isActive) {
			if (timer.snapshot?.state === "running") {
				timer.pause();
			} else {
				timer.resume();
			}
		} else {
			timer.start();
		}
	}, [timer, isActive]);

	// Right-click drag
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
			// Not in Tauri
		}
	}, []);

	// Timer display
	const remainingMs = timer.remainingMs ?? 0;
	const totalMs = timer.snapshot?.total_ms ?? 1;
	const progress = 1 - remainingMs / totalMs;
	const minutes = Math.floor(remainingMs / 60000);
	const seconds = Math.floor((remainingMs % 60000) / 1000);
	const centiseconds = Math.floor((remainingMs % 1000) / 10);

	const circumference = 2 * Math.PI * 46;
	const dashOffset = circumference * (1 - progress);

	return (
		<div
			className="w-screen h-screen bg-transparent select-none flex items-center justify-center"
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar
				transparent
				showMinMax={false}
			/>

			<button
				type="button"
				onClick={handleClick}
				className="relative cursor-pointer"
				style={{ width: "min(85vmin, 180px)", height: "min(85vmin, 180px)" }}
			>
				<svg
					viewBox="0 0 100 100"
					className="w-full h-full -rotate-90"
				>
					{/* Background ring */}
					<circle
						cx="50"
						cy="50"
						r="46"
						fill="none"
						stroke="rgba(255,255,255,0.15)"
						strokeWidth="3"
					/>
					{/* Progress ring */}
					<circle
						cx="50"
						cy="50"
						r="46"
						fill="none"
						stroke={highlightColor}
						strokeWidth="3"
						strokeLinecap="round"
						strokeDasharray={circumference}
						strokeDashoffset={dashOffset}
						className="transition-[stroke-dashoffset] duration-200"
					/>
				</svg>
				{/* Time display */}
				<div className="absolute inset-0 flex items-center justify-center">
					<span
						className="text-white font-light tabular-nums"
						style={{ fontSize: "min(14vmin, 32px)" }}
					>
						{String(minutes).padStart(2, "0")}:
						{String(seconds).padStart(2, "0")}
						<span style={{ fontSize: "min(5vmin, 12px)" }} className="opacity-60">
							.{String(centiseconds).padStart(2, "0")}
						</span>
					</span>
				</div>
			</button>
		</div>
	);
}
