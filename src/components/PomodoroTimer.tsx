import {
	BarChart2,
	Moon,
	Music,
	Pin,
	PinOff,
	Maximize2,
	Minimize2,
	Settings,
	StickyNote,
	Sun,
	Timer,
} from "lucide-react";
import React, {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useNotifications } from "@/hooks/useNotifications";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useWindowManager } from "@/hooks/useWindowManager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type {
	PomodoroSession,
	PomodoroSessionType,
	PomodoroSettings,
} from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { playNotificationSound } from "@/utils/soundPlayer";
import TitleBar from "@/components/TitleBar";

// ─── Error Boundary for Debugging ─────────────────────────────────────────────────

class TimerErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	{ hasError: boolean; error: Error | null }
> {
	constructor(props: { children: React.ReactNode }) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error) {
		console.error("[TimerErrorBoundary] Caught error:", error);
		return { hasError: true, error };
	}

	componentDidCatch(_error: Error, errorInfo: React.ErrorInfo) {
		console.error("[TimerErrorBoundary] Error info:", errorInfo);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="w-screen h-screen flex items-center justify-center bg-red-950 text-white p-8">
					<div>
						<h1 className="text-2xl font-bold mb-4">Timer Error</h1>
						<pre className="text-sm bg-black/50 p-4 rounded overflow-auto max-h-96">
							{this.state.error?.stack || String(this.state.error)}
						</pre>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

// ─── Constants ──────────────────────────────────────────────────────────────────

interface ScheduleStep {
	type: "focus" | "break";
	duration: number;
}

const SCHEDULE: ScheduleStep[] = (() => {
	const workDurations = [15, 30, 45, 60, 75];
	const breakDurations = [5, 5, 5, 5, 30];
	const steps: ScheduleStep[] = [];
	for (let i = 0; i < workDurations.length; i++) {
		steps.push({ type: "focus", duration: workDurations[i] });
		steps.push({ type: "break", duration: breakDurations[i] });
	}
	return steps;
})();

const TOTAL_SCHEDULE_DURATION = SCHEDULE.reduce(
	(sum, s) => sum + s.duration,
	0,
);

const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	shortBreakDuration: 5,
	longBreakDuration: 30,
	sessionsUntilLongBreak: 4,
	notificationSound: true,
	notificationVolume: 50,
	vibration: true,
	theme: "dark",
	autoPlayOnFocusSession: true,
	pauseOnBreak: true,
	youtubeDefaultVolume: 50,
	stickyWidgetSize: 220,
	youtubeWidgetWidth: 400,
	youtubeLoop: true,
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
};

// ─── Utility Functions ──────────────────────────────────────────────────────────

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function formatTimeStr(totalSeconds: number): string {
	const absSecs = Math.abs(totalSeconds);
	const minutes = Math.floor(absSecs / 60);
	const seconds = absSecs % 60;
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${minutes}m`;
}


// ─── Dock Components ────────────────────────────────────────────────────────────

function DockButton({
	icon: Icon,
	label,
	onClick,
	active,
	theme,
	badge,
}: {
	icon: React.ComponentType<{ size: number; className?: string }>;
	label: string;
	onClick: () => void;
	active?: boolean;
	theme: "light" | "dark";
	badge?: string | number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			className={`relative p-2.5 rounded-xl transition-all duration-200 ${
				active
					? theme === "dark"
						? "bg-white/20 text-white"
						: "bg-black/15 text-gray-900"
					: theme === "dark"
						? "text-gray-400 hover:text-white hover:bg-white/10"
						: "text-gray-500 hover:text-gray-900 hover:bg-black/5"
			}`}
		>
			<Icon size={20} />
			{badge !== undefined && (
				<span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1">
					{badge}
				</span>
			)}
		</button>
	);
}

function DockItem({
	children,
	mouseX,
}: {
	children: React.ReactNode;
	mouseX: number | null;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		if (mouseX === null || !ref.current) {
			setScale(1);
			return;
		}
		const rect = ref.current.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const distance = Math.abs(mouseX - center);
		const maxDistance = 120;
		const newScale = 1 + Math.max(0, 1 - distance / maxDistance) * 0.35;
		setScale(newScale);
	}, [mouseX]);

	return (
		<div
			ref={ref}
			className="transition-transform duration-150 origin-bottom"
			style={{ transform: `scale(${scale})` }}
		>
			{children}
		</div>
	);
}

function Dock({
	children,
	theme,
	className = "",
}: {
	children: React.ReactNode;
	theme: "light" | "dark";
	className?: string;
}) {
	const [mouseX, setMouseX] = useState<number | null>(null);
	const childArray = React.Children.toArray(children);

	return (
		<div
			className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-end gap-1 px-3 py-2 rounded-2xl backdrop-blur-xl border transition-colors duration-300 ${
				theme === "dark"
					? "bg-gray-900/70 border-white/10"
					: "bg-white/70 border-black/10 shadow-lg"
			} ${className}`}
			onMouseMove={(e) => setMouseX(e.clientX)}
			onMouseLeave={() => setMouseX(null)}
		>
			{childArray.map((child, i) => (
				<DockItem key={i} mouseX={mouseX}>
					{child}
				</DockItem>
			))}
		</div>
	);
}

// ─── Main PomodoroTimer Component ───────────────────────────────────────────────

export default function PomodoroTimer() {
	// ─── Notifications ──────────────────────────────────────────────────────────
	const { requestPermission, showNotification } = useNotifications();

	// ─── Rust Engine (via Tauri IPC) ────────────────────────────────────────────
	const timer = useTauriTimer();
	const windowManager = useWindowManager();

	// ─── Persisted State (localStorage -- UI-only state) ────────────────────────
	const [settings, setSettings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);

	const [, setSessions] = useLocalStorage<PomodoroSession[]>(
		"pomodoroom-sessions",
		[],
	);

	const [customBackground] = useLocalStorage<string>(
		"pomodoroom-custom-bg",
		"",
	);

	const [completedCycles, setCompletedCycles] = useLocalStorage<number>(
		"pomodoroom-completed-cycles",
		0,
	);

	// ─── Local UI State ─────────────────────────────────────────────────────────
	const [showStopDialog, setShowStopDialog] = useState(false);

	// ─── Refs ───────────────────────────────────────────────────────────────────
	const containerRef = useRef<HTMLDivElement>(null);
	const prevStepRef = useRef<number>(timer.stepIndex);
	const rightDragRef = useRef<{
		startX: number;
		startY: number;
		winX: number;
		winY: number;
		scale: number;
	} | null>(null);

	// ─── Derived State (from Rust engine) ───────────────────────────────────────
	const theme = settings.theme;
	const currentStepIndex = timer.stepIndex;
	const currentStep = SCHEDULE[currentStepIndex] || SCHEDULE[0];
	const timeRemaining = timer.remainingSeconds;
	const progress = timer.progress;
	const isActive = timer.isActive;
	const highlightColor = settings.highlightColor || DEFAULT_HIGHLIGHT_COLOR;

	// ─── Effects ────────────────────────────────────────────────────────────────

	useEffect(() => {
		requestPermission();
	}, [requestPermission]);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
		document.documentElement.style.colorScheme = theme;
	}, [theme]);

	useEffect(() => {
		if (isActive) {
			document.title = `${formatTimeStr(timeRemaining)} \u2013 ${
				timer.stepType === "focus" ? "Focus" : "Break"
			} | Pomodoroom`;
		} else {
			document.title = "Pomodoroom";
		}
		return () => {
			document.title = "Pomodoroom";
		};
	}, [isActive, timeRemaining, timer.stepType]);

	// ─── Detect step completion from Rust engine ────────────────────────────────
	useEffect(() => {
		if (!timer.snapshot?.completed) return;
		const { step_type } = timer.snapshot.completed;

		// Play notification sound
		if (settings.notificationSound) {
			playNotificationSound(settings.notificationVolume / 100);
		}
		if (settings.vibration && navigator.vibrate) {
			navigator.vibrate([200, 100, 200, 100, 200]);
		}

		// Record session locally for widget stats
		const endTime = new Date().toISOString();
		const sessionType: PomodoroSessionType =
			step_type === "focus" ? "focus" : "break";
		const newSession: PomodoroSession = {
			id: generateId(),
			type: sessionType,
			duration: currentStep.duration,
			completedAt: endTime,
			startTime: endTime,
			endTime,
			completed: true,
		};
		setSessions((prev: PomodoroSession[]) => [...prev, newSession]);

		showNotification({
			title: step_type === "focus" ? "Focus Complete!" : "Break Over!",
			body:
				step_type === "focus"
					? `Great work! Focus session done.`
					: "Break's over. Ready for the next focus session?",
		});

		// Auto-advance via Rust engine (start next step)
		timer.start();
	}, [timer.snapshot?.completed]);

	// Track step index changes for cycle counting
	useEffect(() => {
		if (timer.stepIndex === 0 && prevStepRef.current > 0) {
			setCompletedCycles((prev: number) => prev + 1);
		}
		prevStepRef.current = timer.stepIndex;
	}, [timer.stepIndex, setCompletedCycles]);

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger shortcuts when typing in inputs
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				if (isActive) {
					handlePause();
				} else {
					handleStart();
				}
			} else if (
				e.key === "s" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleSkip();
			} else if (
				e.key === "r" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleReset();
			} else if (e.key === "Escape") {
				if (showStopDialog) {
					setShowStopDialog(false);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isActive, showStopDialog]);

	// ─── Timer Control Functions (delegate to Rust engine) ──────────────────────

	const handleStart = useCallback(() => {
		if (timer.isPaused) {
			timer.resume();
		} else {
			timer.start();
		}
	}, [timer]);

	const handlePause = useCallback(() => {
		timer.pause();
	}, [timer]);

	const handleStop = useCallback(() => {
		setShowStopDialog(false);
		timer.reset();
	}, [timer]);

	const handleSkip = useCallback(() => {
		setShowStopDialog(false);
		timer.skip();
	}, [timer]);

	const handleReset = useCallback(() => {
		timer.reset();
	}, [timer]);

	const handleTimerClick = useCallback(() => {
		if (timer.isCompleted) {
			timer.start();
		} else if (isActive) {
			setShowStopDialog(true);
		} else {
			handleStart();
		}
	}, [timer, isActive, handleStart]);

	// ─── Settings / Theme ────────────────────────────────────────────────────────

	const toggleTheme = useCallback(() => {
		setSettings((prev: PomodoroSettings) => ({
			...prev,
			theme: prev.theme === "dark" ? "light" : "dark",
		}));
	}, [setSettings]);

	// ─── Right-Click Window Drag (PureRef-style) ────────────────────────────────

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

	// ─── Render ─────────────────────────────────────────────────────────────────

	return (
		<TimerErrorBoundary>
			<div
			ref={containerRef}
			className={`relative w-screen h-screen overflow-hidden select-none transition-colors duration-500 ${
				timer.windowState.float_mode
					? "bg-transparent text-white"
					: theme === "dark"
						? "bg-gray-950 text-white"
						: "bg-stone-100 text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
			style={
				!timer.windowState.float_mode && customBackground
					? {
							backgroundImage: `url(${customBackground})`,
							backgroundSize: "cover",
							backgroundPosition: "center",
						}
					: undefined
			}
		>
			{/* Background overlay when custom bg is set (not in float mode) */}
			{!timer.windowState.float_mode && customBackground && (
				<div
					className={`absolute inset-0 ${
						theme === "dark" ? "bg-black/40" : "bg-white/30"
					}`}
				/>
			)}

			{/* ─── Custom Title Bar ──────────────────────────────────────────── */}
			<TitleBar
				theme={theme}
				transparent={timer.windowState.float_mode}
				showModeToggles
				floatMode={timer.windowState.float_mode}
				alwaysOnTop={timer.windowState.always_on_top}
				onToggleFloat={() => timer.setFloatMode(!timer.windowState.float_mode)}
				onTogglePin={() => timer.setAlwaysOnTop(!timer.windowState.always_on_top)}
			/>

			{/* ─── Workflow Progress Bar (hidden in float mode) ────────────────── */}
			<div className={`relative z-10 px-6 pt-4 pb-2 ${timer.windowState.float_mode ? "hidden" : ""}`}>
				<div className="flex items-center gap-1 w-full">
					{SCHEDULE.map((step, index) => {
						const isCurrentStep = index === currentStepIndex;
						const isCompleted = index < currentStepIndex;
						const isFocus = step.type === "focus";

						return (
							<div
								key={index}
								className="flex flex-col items-center transition-all duration-300"
								style={{ flex: step.duration }}
							>
								<div
									className={`w-full rounded-full transition-all duration-500 overflow-hidden ${
										isCurrentStep
											? "h-2.5 shadow-sm"
											: isCompleted
												? "h-1.5 opacity-50"
												: "h-1.5 opacity-20"
									}`}
									style={{
										backgroundColor: isCurrentStep
											? "transparent"
											: isCompleted
												? theme === "dark"
													? "#6b7280"
													: "#9ca3af"
												: theme === "dark"
													? "#374151"
													: "#d1d5db",
									}}
								>
									{isCurrentStep ? (
										<>
											{/* Track background */}
											<div
												className="absolute inset-0 rounded-full"
												style={{
													backgroundColor: isFocus
														? `${highlightColor}30`
														: "#10b98130",
												}}
											/>
											{/* Fill */}
											<div
												className="h-full rounded-full transition-all duration-1000 ease-linear relative"
												style={{
													width: `${progress * 100}%`,
													backgroundColor: isFocus
														? highlightColor
														: "#10b981",
												}}
											/>
										</>
									) : isCompleted ? (
										<div
											className="h-full w-full rounded-full"
											style={{
												backgroundColor:
													theme === "dark"
														? "#6b7280"
														: "#9ca3af",
											}}
										/>
									) : null}
								</div>
								<span
									className={`text-[9px] mt-1 font-medium transition-opacity ${
										isCurrentStep
											? "opacity-80"
											: isCompleted
												? "opacity-30"
												: "opacity-15"
									}`}
								>
									{isFocus ? "F" : "B"}
									{step.duration}
								</span>
							</div>
						);
					})}
				</div>

				{/* Cycle counter */}
				{completedCycles > 0 && (
					<div className="text-center mt-1">
						<span
							className={`text-[10px] font-medium ${
								theme === "dark"
									? "text-gray-500"
									: "text-gray-400"
							}`}
						>
							Cycle {completedCycles + 1} &bull;{" "}
							{formatMinutes(TOTAL_SCHEDULE_DURATION)} total
						</span>
					</div>
				)}
			</div>

			{/* ─── Step Label (hidden in float mode) ─────────────────────────── */}
			{!timer.windowState.float_mode && (
				<div
					className={`fixed top-16 left-1/2 -translate-x-1/2 z-30 text-sm tracking-[0.4em] uppercase font-bold opacity-30 pointer-events-none ${
						theme === "dark" ? "text-white" : "text-black"
					}`}
				>
					{currentStep.type === "focus" ? "Focus" : "Break"}
				</div>
			)}

			{/* ─── Main Timer (click to interact) ─────────────────────────────── */}
			<div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none">
				<div
					className="relative flex items-center justify-center"
					style={{
						width: "min(70vmin, 420px)",
						height: "min(70vmin, 420px)",
					}}
				>
					<svg
						className="absolute inset-0 w-full h-full"
						viewBox="0 0 100 100"
						aria-hidden="true"
						style={{ transform: "rotate(90deg) scaleX(-1)" }}
					>
						<circle
							cx="50"
							cy="50"
							r="45"
							stroke={
								timer.windowState.float_mode
									? "rgba(255, 255, 255, 0.15)"
									: theme === "dark"
										? "#555"
										: "#ddd"
							}
							strokeWidth="3"
							fill="none"
						/>
						<circle
							cx="50"
							cy="50"
							r="45"
							stroke={
								currentStep.type === "focus"
									? timer.windowState.float_mode
										? "rgba(255, 255, 255, 0.6)"
										: theme === "dark"
											? "rgba(255, 255, 255, 0.5)"
											: "rgba(0, 0, 0, 0.5)"
									: timer.windowState.float_mode
										? "rgba(14, 165, 233, 0.7)"
										: theme === "dark"
											? "rgba(14, 165, 233, 0.5)"
											: "rgba(59, 130, 246, 0.5)"
							}
							strokeWidth="3"
							fill="none"
							strokeDasharray={Math.PI * 2 * 45}
							strokeDashoffset={Math.PI * 2 * 45 * progress}
							strokeLinecap="butt"
						/>
					</svg>

					<button
						type="button"
						onClick={handleTimerClick}
						className="relative pointer-events-auto focus:outline-none"
						style={{ zIndex: 50 }}
					>
						{(() => {
							const ms = timer.remainingMs;
							const totalSecs = Math.floor(ms / 1000);
							const mins = Math.floor(totalSecs / 60);
							const secs = totalSecs % 60;
							const cs = Math.floor((ms % 1000) / 10);
							return (
								<div
									className={`flex items-baseline justify-center tabular-nums tracking-[-0.15em] select-none cursor-pointer font-mono font-bold transition-opacity duration-300 ${
										timer.windowState.float_mode
											? "text-white"
											: theme === "dark"
												? "text-neutral-100"
												: "text-slate-900"
									} ${isActive ? "opacity-100" : "opacity-60 hover:opacity-80"}`}
								>
									<span className="leading-none" style={{ fontSize: "min(12vmin, 72px)" }}>
										{String(mins).padStart(2, "0")}
									</span>
									<span
										className={`leading-none -mx-[0.5vmin] ${isActive ? "animate-pulse" : "opacity-50"}`}
										style={{ fontSize: "min(12vmin, 72px)" }}
									>
										:
									</span>
									<span className="leading-none" style={{ fontSize: "min(12vmin, 72px)" }}>
										{String(secs).padStart(2, "0")}
									</span>
									<span
										className="leading-none ml-1 opacity-40 font-medium self-end mb-1"
										style={{ fontSize: "min(4vmin, 24px)" }}
									>
										.{String(cs).padStart(2, "0")}
									</span>
								</div>
							);
						})()}
					</button>
				</div>
			</div>

			{/* ─── Dock (hidden in float mode) ─────────────────────────────── */}
			<Dock theme={theme} className={timer.windowState.float_mode ? "hidden" : ""}>
				<DockButton
					icon={StickyNote}
					label="New Note"
					onClick={() => windowManager.openWindow("note")}
					theme={theme}
				/>
				<DockButton
					icon={Timer}
					label="Mini Timer"
					onClick={() => windowManager.openWindow("mini-timer")}
					theme={theme}
				/>
				<DockButton
					icon={BarChart2}
					label="Statistics"
					onClick={() => windowManager.openWindow("stats")}
					theme={theme}
				/>
				<DockButton
					icon={Music}
					label="YouTube"
					onClick={() => windowManager.openWindow("youtube")}
					theme={theme}
				/>

				{/* Separator */}
				<div
					className={`w-px h-8 mx-1 ${
						theme === "dark" ? "bg-white/10" : "bg-black/10"
					}`}
				/>

				<DockButton
					icon={timer.windowState.always_on_top ? PinOff : Pin}
					label={timer.windowState.always_on_top ? "Unpin" : "Pin on Top"}
					onClick={() => timer.setAlwaysOnTop(!timer.windowState.always_on_top)}
					active={timer.windowState.always_on_top}
					theme={theme}
				/>
				<DockButton
					icon={timer.windowState.float_mode ? Maximize2 : Minimize2}
					label={timer.windowState.float_mode ? "Exit Float" : "Float Timer"}
					onClick={() => timer.setFloatMode(!timer.windowState.float_mode)}
					active={timer.windowState.float_mode}
					theme={theme}
				/>
				<DockButton
					icon={Settings}
					label="Settings"
					onClick={() => windowManager.openWindow("settings")}
					theme={theme}
				/>
				<DockButton
					icon={theme === "dark" ? Sun : Moon}
					label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
					onClick={toggleTheme}
					theme={theme}
				/>
			</Dock>

			{/* ─── Stop Dialog ────────────────────────────────────────────────── */}
			{showStopDialog && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-60 bg-black/40 backdrop-blur-sm"
						onClick={() => setShowStopDialog(false)}
					/>

					{/* Dialog */}
					<div className="fixed inset-0 z-70 flex items-center justify-center p-4">
						<div
							className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl ${
								theme === "dark"
									? "bg-gray-900 border border-white/10"
									: "bg-white border border-gray-200"
							}`}
						>
							<h3 className="text-lg font-bold mb-2">
								Stop Session?
							</h3>
							<p
								className={`text-sm mb-6 ${
									theme === "dark"
										? "text-gray-400"
										: "text-gray-500"
								}`}
							>
								You have{" "}
								<span className="font-mono font-semibold">
									{formatTimeStr(timeRemaining)}
								</span>{" "}
								remaining in this{" "}
								{currentStep.type === "focus"
									? "focus"
									: "break"}{" "}
								session.
							</p>

							<div className="flex flex-col gap-2">
								{/* Stop & Reset */}
								<button
									type="button"
									onClick={handleStop}
									className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
										theme === "dark"
											? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
											: "bg-red-50 text-red-600 hover:bg-red-100"
									}`}
								>
									Stop &amp; Reset
								</button>

								{/* Skip to Next */}
								<button
									type="button"
									onClick={handleSkip}
									className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
										theme === "dark"
											? "bg-white/5 text-gray-300 hover:bg-white/10"
											: "bg-gray-50 text-gray-700 hover:bg-gray-100"
									}`}
								>
									Skip to Next
								</button>

								{/* Continue */}
								<button
									type="button"
									onClick={() => setShowStopDialog(false)}
									className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
										theme === "dark"
											? "text-gray-500 hover:text-gray-300"
											: "text-gray-400 hover:text-gray-600"
									}`}
								>
									Continue Session
								</button>
							</div>
						</div>
					</div>
				</>
			)}

		</div>
		</TimerErrorBoundary>
	);
}
