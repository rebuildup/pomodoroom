/**
 * MiniTimerView -- Standalone compact timer window.
 *
 * Shows a minimal circular timer ring. Always-on-top, transparent background.
 * Clicks cycle through start/stop states like the main timer.
 */
import { useCallback, useEffect, useState } from "react";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useTaskStore } from "@/hooks/useTaskStore";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import TitleBar from "@/components/TitleBar";
import type { PomodoroSettings } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function MiniTimerView() {
	const timer = useTauriTimer();
	const taskStore = useTaskStore();
	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);

	// Get anchor task info
	const anchorTask = taskStore.anchorTask;
	const anchorTaskTitle = anchorTask?.title ?? null;

	// Load theme for shortcuts provider
	const [theme, setTheme] = useState<"light" | "dark">("dark");
	useEffect(() => {
		const stored = localStorage.getItem("pomodoroom-settings");
		if (stored) {
			let parsed: any = null;
			try {
				parsed = JSON.parse(stored);
			} catch {
				// ignore
			}

			if (parsed?.theme) {
				setTheme(parsed.theme === "light" ? "light" : "dark");
			}
		}
	}, []);

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

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				handleClick();
			} else if (e.key === "Escape") {
				getCurrentWindow().close();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleClick]);

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
		<KeyboardShortcutsProvider theme={theme}>
			<div
				className="w-screen h-screen bg-transparent select-none flex flex-col items-center justify-center gap-4"
				onMouseDown={handleRightDown}
				onContextMenu={(e) => e.preventDefault()}
			>
				<TitleBar
					transparent
					showMinMax={false}
				/>

				{/* Anchor task title display */}
				{anchorTaskTitle && (
					<div className="text-center px-4 max-w-[200px]">
						<p className="text-[var(--md-ref-color-on-surface-variant)] text-xs truncate opacity-70">{anchorTaskTitle}</p>
					</div>
				)}

				<button
					type="button"
					onClick={handleClick}
					aria-label={isActive ? "Pause timer" : "Start timer"}
					className="relative cursor-pointer flex-shrink-0"
					style={{ width: "min(70vmin, 160px)", height: "min(70vmin, 160px)" }}
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
		</KeyboardShortcutsProvider>
	);
}
