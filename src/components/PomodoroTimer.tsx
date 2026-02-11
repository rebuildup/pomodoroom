import React, {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useNotifications } from "@/hooks/useNotifications";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useTimeline } from "@/hooks/useTimeline";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import type {
	PomodoroSession,
	PomodoroSessionType,
	PomodoroSettings,
	TaskProposal,
} from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { playNotificationSound } from "@/utils/soundPlayer";
import TitleBar from "@/components/TitleBar";
import { TaskProposalCard } from "@/components/TaskProposalCard";

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
		const workDuration = workDurations[i];
		const breakDuration = breakDurations[i];
		if (workDuration !== undefined && breakDuration !== undefined) {
			steps.push({ type: "focus", duration: workDuration });
			steps.push({ type: "break", duration: breakDuration });
		}
	}
	return steps;
})();

const TOTAL_SCHEDULE_DURATION = SCHEDULE.reduce(
	(sum, s) => sum + s.duration,
	0,
);

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


// ─── Main PomodoroTimer Component ───────────────────────────────────────────────

export default function PomodoroTimer() {
	// ─── Notifications ──────────────────────────────────────────────────────────
	const { requestPermission, showNotification } = useNotifications();

	// ─── Rust Engine (via Tauri IPC) ────────────────────────────────────────────
	const timer = useTauriTimer();
	const timeline = useTimeline();

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
	const [proposal, setProposal] = useState<TaskProposal | null>(null);
	const [showProposal, setShowProposal] = useState(false);
	const [snoozedProposals, setSnoozedProposals] = useState<Set<string>>(new Set());
	const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
	const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);

	// ─── Refs ───────────────────────────────────────────────────────────────────
	const prevStepRef = useRef<number>(timer.stepIndex);

	// ─── Right-click drag ───────────────────────────────────────────────────────
	const { handleRightDown } = useRightClickDrag();

	// ─── Derived State (from Rust engine) ───────────────────────────────────────
	const theme = settings.theme;
	const currentStepIndex = timer.stepIndex;
	const currentStep = SCHEDULE[currentStepIndex] ?? { type: "focus", duration: 25 };
	const timeRemaining = timer.remainingSeconds;
	const progress = timer.progress;
	const isActive = timer.isActive;
	const highlightColor = settings.highlightColor || DEFAULT_HIGHLIGHT_COLOR;

	// ─── Effects ────────────────────────────────────────────────────────────────

	useEffect(() => {
		requestPermission();
	}, [requestPermission]);

	// ─── Task Proposal Detection ────────────────────────────────────────────────
	// TODO(#174): Update to use real data from useTaskStore + useGoogleCalendar
	// getTopProposal now requires events and tasks parameters
	useEffect(() => {
		// Temporarily disabled: getTopProposal API changed to require real data
		// Only show proposal when timer is idle and not in float mode
		// if (!timer.isActive && !timer.isPaused && !timer.windowState.float_mode) {
		// 	// Need to get events from useGoogleCalendar and tasks from useTaskStore
		// 	timeline.getTopProposal(events, tasks).then(topProposal => {
		// 		if (topProposal && !snoozedProposals.has(topProposal.task.id)) {
		// 			setProposal(topProposal);
		// 			setShowProposal(true);
		// 		} else {
		// 			setShowProposal(false);
		// 		}
		// 	});
		// } else {
		// 	setShowProposal(false);
		// }
		setShowProposal(false); // Temporarily disabled
	}, [timer.isActive, timer.isPaused, timer.windowState.float_mode, snoozedProposals]);

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

		// Show native notification (fire and forget)
		void showNotification({
			title: step_type === "focus" ? "Focus Complete!" : "Break Over!",
			body:
				step_type === "focus"
					? `Great work! Focus session done.`
					: "Break's over. Ready for the next focus session?",
		});

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

		// Auto-advance via Rust engine (start next step)
		timer.start();
	}, [timer.snapshot?.completed]);

	// Track step index changes for cycle counting
	useEffect(() => {
		if (timer.stepIndex === 0 && prevStepRef.current > 0) {
			setCompletedCycles((prev: number) => prev + 1);
		}
		prevStepRef.current = timer.stepIndex;
	}, [timer.stepIndex, setCompletedCycles, currentStep]);

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

	// ─── Task Proposal Handlers ─────────────────────────────────────────────────
	const handleAcceptProposal = useCallback(() => {
		if (proposal) {
			console.log('Accepted proposal:', proposal.task.title);
			setShowProposal(false);
			handleStart();
		}
	}, [proposal, handleStart]);

	const handleRejectProposal = useCallback(() => {
		if (proposal) {
			console.log('Rejected proposal:', proposal.task.title);
			setSnoozedProposals(prev => new Set(prev).add(proposal.task.id));
			setShowProposal(false);
		}
	}, [proposal]);

	const handleSnoozeProposal = useCallback(() => {
		if (proposal) {
			console.log('Snoozed proposal:', proposal.task.title);
			setSnoozedProposals(prev => new Set(prev).add(proposal.task.id));
			setShowProposal(false);
		}
	}, [proposal]);

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	const showShortcutFeedback = useCallback((action: string) => {
		setShortcutFeedback(action);
		setTimeout(() => setShortcutFeedback(null), 500);
	}, []);

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

			// Handle ? for shortcuts help
			if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				setShowShortcutsHelp(prev => !prev);
				return;
			}

			// Esc closes all modals/panels
			if (e.key === "Escape") {
				if (showShortcutsHelp) {
					setShowShortcutsHelp(false);
					return;
				}
				if (showStopDialog) {
					setShowStopDialog(false);
					showShortcutFeedback("Closed");
					return;
				}
				if (showProposal) {
					setShowProposal(false);
					showShortcutFeedback("Closed");
					return;
				}
			}

			// Don't process other shortcuts if modal is open
			if (showStopDialog || showProposal || showShortcutsHelp) {
				return;
			}

			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				if (isActive) {
					handlePause();
					showShortcutFeedback("Paused");
				} else {
					handleStart();
					showShortcutFeedback("Started");
				}
			} else if (
				e.key === "s" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleSkip();
				showShortcutFeedback("Skipped");
			} else if (
				e.key === "r" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleReset();
				showShortcutFeedback("Reset");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isActive, showStopDialog, showProposal, showShortcutsHelp, handlePause, handleStart, handleSkip, handleReset, showShortcutFeedback]);

	// ─── Settings / Theme ────────────────────────────────────────────────────────

	const toggleTheme = useCallback(() => {
		setSettings((prev: PomodoroSettings) => ({
			...prev,
			theme: prev.theme === "dark" ? "light" : "dark",
		}));
	}, [setSettings]);

	// ─── Render ─────────────────────────────────────────────────────────────────

	return (
		<TimerErrorBoundary>
			<div
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
				showMenu={!timer.windowState.float_mode}
				onToggleTheme={toggleTheme}
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
						aria-label={isActive ? "Pause timer" : "Start timer"}
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

		{/* ─── Task Proposal Card (hidden in float mode, shows when idle) ─── */}
		{showProposal && proposal && !timer.windowState.float_mode && (
			<div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in slide-in-from-bottom-4 duration-300">
				<TaskProposalCard
					proposal={proposal}
					onAccept={handleAcceptProposal}
					onReject={handleRejectProposal}
					onSnooze={handleSnoozeProposal}
				/>
			</div>
		)}

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

			{/* ─── Keyboard Shortcuts Help Panel ─────────────────────────────────── */}
			{showShortcutsHelp && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-60 bg-black/40 backdrop-blur-sm"
						onClick={() => setShowShortcutsHelp(false)}
					/>

					{/* Panel */}
					<div className="fixed inset-0 z-70 flex items-center justify-center p-4">
						<div
							className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${
								theme === "dark"
									? "bg-gray-900 border border-white/10"
									: "bg-white border border-gray-200"
							}`}
						>
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-bold">
									Keyboard Shortcuts
								</h3>
								<button
									type="button"
									onClick={() => setShowShortcutsHelp(false)}
									className={`p-1.5 rounded-lg transition-colors ${
										theme === "dark"
											? "hover:bg-white/10"
											: "hover:bg-black/5"
									}`}
								>
									✕
								</button>
							</div>

							<div
								className={`space-y-3 text-sm ${
									theme === "dark"
										? "text-gray-300"
										: "text-gray-700"
								}`}
							>
								{(
									[
										["Space", "Start / Pause timer"],
										["S", "Skip to next session"],
										["R", "Reset timer"],
										["Esc", "Close panels / dialogs"],
										["?", "Show this help panel"],
									] as const
								).map(([key, label]) => (
									<div
										key={key}
										className="flex items-center justify-between"
									>
										<span>{label}</span>
										<kbd
											className={`px-2.5 py-1 rounded text-xs font-mono ${
												theme === "dark"
													? "bg-white/10 text-gray-200"
													: "bg-gray-100 text-gray-800 border border-gray-200"
											}`}
										>
											{key}
										</kbd>
									</div>
								))}
							</div>

							<div
								className={`mt-6 pt-4 border-t text-xs ${
									theme === "dark"
										? "text-gray-500 border-white/10"
										: "text-gray-400 border-gray-200"
								}`}
							>
								Press <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 border border-gray-200">Esc</kbd> or click outside to close
							</div>
						</div>
					</div>
				</>
			)}

			{/* ─── Shortcut Feedback Toast ─────────────────────────────────────────── */}
			{shortcutFeedback && (
				<div
					className={`fixed top-20 left-1/2 -translate-x-1/2 z-80 px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 ${
						theme === "dark"
							? "bg-white text-gray-900"
							: "bg-gray-900 text-white"
					}`}
				>
					{shortcutFeedback}
				</div>
			)}

			{/* ─── Shortcuts Help Button (floating) ─────────────────────────────────── */}
			{!timer.windowState.float_mode && (
				<button
					type="button"
					onClick={() => setShowShortcutsHelp(true)}
					title="Keyboard shortcuts (?)"
					className={`fixed bottom-24 right-4 z-40 p-2.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 ${
						theme === "dark"
							? "bg-white/10 backdrop-blur text-white hover:bg-white/20"
							: "bg-black/5 backdrop-blur text-gray-700 hover:bg-black/10"
					}`}
				>
					<span className="text-sm font-bold">?</span>
				</button>
			)}

		</div>
		</TimerErrorBoundary>
	);
}
