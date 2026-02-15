/**
 * MiniTimerView -- Standalone compact timer window.
 *
 * Standalone stopwatch / kitchen timer window independent from Pomodoro state.
 * - Starts from 0s -> stopwatch mode (count up)
 * - Starts from >0s -> timer mode (count down)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useTheme } from "@/hooks/useTheme";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function MiniTimerView() {
	const [baseMs, setBaseMs] = useState(0);
	const [isRunning, setIsRunning] = useState(false);
	const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
	const [mode, setMode] = useState<"stopwatch" | "timer">("stopwatch");
	const [runInitialMs, setRunInitialMs] = useState(0);
	const [nowMs, setNowMs] = useState(() => Date.now());

	// Theme is now managed by useTheme hook
	const { theme: currentTheme } = useTheme();
	const theme = currentTheme;

	const currentMs = useMemo(() => {
		if (!isRunning || !startedAtMs) return baseMs;
		const delta = Math.max(0, nowMs - startedAtMs);
		if (mode === "stopwatch") {
			return baseMs + delta;
		}
		return Math.max(0, baseMs - delta);
	}, [isRunning, startedAtMs, nowMs, mode, baseMs]);

	const handleToggle = useCallback(() => {
		if (isRunning) {
			setBaseMs(currentMs);
			setStartedAtMs(null);
			setIsRunning(false);
			return;
		}
		const nextMode = baseMs === 0 ? "stopwatch" : "timer";
		setMode(nextMode);
		setRunInitialMs(baseMs);
		setStartedAtMs(Date.now());
		setIsRunning(true);
	}, [isRunning, currentMs, baseMs]);

	const handleReset = useCallback(() => {
		setIsRunning(false);
		setStartedAtMs(null);
		setBaseMs(0);
		setMode("stopwatch");
		setRunInitialMs(0);
	}, []);

	const adjustMs = useCallback((delta: number) => {
		setBaseMs((prev) => Math.max(0, prev + delta));
	}, []);

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				handleToggle();
			} else if (e.key.toLowerCase() === "r") {
				e.preventDefault();
				handleReset();
			} else if (e.key === "Escape") {
				getCurrentWindow().close();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleToggle, handleReset]);

	useEffect(() => {
		if (!isRunning || !startedAtMs) return;
		const id = window.setInterval(() => {
			setNowMs(Date.now());
		}, 50);
		return () => window.clearInterval(id);
	}, [isRunning, startedAtMs]);

	useEffect(() => {
		if (!isRunning || mode !== "timer") return;
		if (currentMs > 0) return;
		setBaseMs(0);
		setStartedAtMs(null);
		setIsRunning(false);
	}, [isRunning, mode, currentMs]);

	// Display MM:SS.cc (minutes are total minutes)
	const minutes = Math.floor(currentMs / 60_000);
	const seconds = Math.floor((currentMs % 60_000) / 1000);
	const centiseconds = Math.floor((currentMs % 1000) / 10);

	const progress = useMemo(() => {
		if (mode === "timer" && runInitialMs > 0) {
			return Math.max(0, Math.min(1, 1 - currentMs / runInitialMs));
		}
		// Stopwatch: loop ring every minute
		return (currentMs % 60_000) / 60_000;
	}, [mode, runInitialMs, currentMs]);

	const circumference = 2 * Math.PI * 46;
	const dashOffset = circumference * (1 - progress);

	return (
		<KeyboardShortcutsProvider theme={theme}>
			<DetachedWindowShell
				title="Mini Timer"
				showMinMax={false}

			>
				<div
				className="absolute inset-0 select-none flex flex-col items-center justify-center gap-3 px-3 pb-3"
				onMouseDown={handleRightDown}
				onContextMenu={(e) => e.preventDefault()}
			>
				<div
					className="relative flex-shrink-0"
					style={{ width: "min(70vmin, 160px)", height: "min(70vmin, 160px)" }}
				>
					<button
						type="button"
						onClick={handleToggle}
						aria-label={isRunning ? "Pause mini timer" : "Start mini timer"}
						className="no-pill absolute inset-0 cursor-pointer !bg-transparent z-10"
					/>
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
							stroke="var(--md-ref-color-outline-variant)"
							strokeWidth="3"
							opacity="0.45"
						/>
						<circle
							cx="50"
							cy="50"
							r="46"
							fill="none"
							stroke="var(--md-ref-color-primary)"
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
							<span style={{ fontSize: "min(5vmin, 12px)" }} className="opacity-70">
								.{String(centiseconds).padStart(2, "0")}
							</span>
						</span>
					</div>
					{!isRunning && (
						<div className="absolute inset-x-1 bottom-1 z-20 space-y-1">
							<div className="grid grid-cols-2 gap-1">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										handleToggle();
									}}
									className="no-pill h-6 rounded-full bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] text-[10px] font-medium"
								>
									Start
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										handleReset();
									}}
									className="no-pill h-6 rounded-full border border-[var(--md-ref-color-outline)] text-[10px] font-medium"
								>
									Clear
								</button>
							</div>
							<div className="grid grid-cols-2 gap-1">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										adjustMs(60_000);
									}}
									className="no-pill h-6 rounded-full border border-[var(--md-ref-color-outline)] text-[10px] font-medium"
								>
									+1m
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										adjustMs(10_000);
									}}
									className="no-pill h-6 rounded-full border border-[var(--md-ref-color-outline)] text-[10px] font-medium"
								>
									+10s
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
			</DetachedWindowShell>
		</KeyboardShortcutsProvider>
	);
}
