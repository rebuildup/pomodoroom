/**
 * useTauriTimer -- React hook that drives the timer via Rust IPC bridge.
 *
 * Replaces the old localStorage/setInterval approach. The Rust engine
 * (pomodoroom-core) owns all timer state; the frontend polls via
 * cmd_timer_tick every 100ms when running.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";

// Check if we're in a Tauri environment
function isTauriAvailable(): boolean {
	return isTauriEnvironment();
}

// Safe invoke wrapper that checks Tauri availability
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	if (!isTauriAvailable()) {
		throw new Error("Tauri API not available");
	}
	return invoke<T>(command, args);
}

// ── Types mirroring Rust Event::StateSnapshot ────────────────────────────────

/**
 * Base timer snapshot interface.
 */
export interface BaseTimerSnapshot {
	state: "idle" | "running" | "paused" | "completed";
	step_index: number;
	step_type: "focus" | "break";
	step_label: string;
	remaining_ms: number;
	total_ms: number;
	schedule_progress_pct: number;
	at: string;
}

/**
 * Timer snapshot when a step just completed.
 */
export interface CompletedStepSnapshot extends BaseTimerSnapshot {
	state: "running";
	completed: {
		type: "TimerCompleted";
		step_index: number;
		step_type: "focus" | "break";
		at: string;
	};
}

/**
 * Timer snapshot for idle, paused, or completed states without step completion.
 */
export interface StandardTimerSnapshot extends BaseTimerSnapshot {
	state: "idle" | "paused" | "completed";
	completed?: never;
}

/**
 * Timer snapshot discriminated union.
 * Use type guards to narrow to specific snapshot types.
 */
export type TimerSnapshot = StandardTimerSnapshot | CompletedStepSnapshot;

/**
 * Type guard to check if a snapshot has a completed step.
 */
export function isCompletedStepSnapshot(snapshot: TimerSnapshot): snapshot is CompletedStepSnapshot {
	return snapshot.state === "running" && snapshot.completed !== undefined;
}

/**
 * Type guard to check if timer is fully completed (all steps done).
 */
export function isTimerCompleted(snapshot: TimerSnapshot): boolean {
	return snapshot.state === "completed";
}

/**
 * Type guard to check if a snapshot is a standard snapshot (no completed step).
 */
export function isStandardTimerSnapshot(snapshot: TimerSnapshot): snapshot is StandardTimerSnapshot {
	return !isCompletedStepSnapshot(snapshot);
}

export interface ScheduleStep {
	step_type: "focus" | "break";
	duration_min: number;
	label: string;
	description: string;
}

export interface Schedule {
	steps: ScheduleStep[];
}

export interface WindowState {
	always_on_top: boolean;
	float_mode: boolean;
}

// ── Action Notification Integration ─────────────────────────────────────
// Import notification hook
let showActionNotification: ((notification: import("./useActionNotification").ActionNotificationData) => Promise<void>) | null = null;

/**
 * Initialize notification integration.
 * Must be called before using notification functions.
 */
export function initNotificationIntegration(
	notificationFn: typeof import("./useActionNotification").showActionNotification
) {
	showActionNotification = notificationFn;
}

// ── Window Control Helpers (outside hook for React Compiler) ────────────────

async function tauriMinimizeWindow() {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().minimize();
	} catch (error) {
		console.debug("[useTauriTimer] minimizeWindow failed:", error instanceof Error ? error.message : String(error));
	}
}

async function tauriToggleMaximizeWindow() {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().toggleMaximize();
	} catch (error) {
		console.debug("[useTauriTimer] toggleMaximizeWindow failed:", error instanceof Error ? error.message : String(error));
	}
}

async function tauriCloseWindow() {
	try {
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().close();
	} catch (error) {
		console.debug("[useTauriTimer] closeWindow failed:", error instanceof Error ? error.message : String(error));
	}
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTauriTimer() {
	const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
	const [windowState, setWindowState] = useState<WindowState>({
		always_on_top: false,
		float_mode: false,
	});
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const mountedRef = useRef(true);

	// ── Fetch initial state ──────────────────────────────────────────────────

	const fetchStatus = useCallback(async () => {
		console.log("[useTauriTimer] fetchStatus called");
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping fetchStatus");
			return;
		}
		let snap: TimerSnapshot | null = null;
		try {
			snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			console.log("[useTauriTimer] fetchStatus success:", snap);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_timer_status failed:", err.message);
		}
		if (snap && mountedRef.current) {
			setSnapshot(snap);
		}
	}, []);

	const fetchWindowState = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping fetchWindowState");
			return;
		}
		let ws: WindowState | null = null;
		try {
			ws = await safeInvoke<WindowState>("cmd_get_window_state");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_get_window_state failed:", err.message);
		}
		if (ws && mountedRef.current) {
			setWindowState(ws);
		}
	}, []);

	// ── Tick loop (active when timer is running) ─────────────────────────────

	const startTicking = useCallback(() => {
		if (tickRef.current) return;
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping tick");
			return;
		}
		tickRef.current = setInterval(async () => {
			let snap: TimerSnapshot | null = null;
			try {
				snap = await safeInvoke<TimerSnapshot>("cmd_timer_tick");

				// Check for step completion and show notification
				if (snap && isCompletedStepSnapshot(snap) && showActionNotification) {
					try {
						const stepType = snap.step_type === "focus" ? "集中" : "休憩";
						await showActionNotification({
							title: `${stepType}完了！`,
							message: "お疲れ様でした！次の行動をお選びください",
							buttons: [
								{ label: "完了", action: "complete" },
								{ label: "+25分", action: "extend" },
								{ label: "+15分", action: "extend" },
								{ label: "+5分", action: "extend" },
							],
						});
					} catch (error) {
						console.error("[useTauriTimer] Failed to show action notification:", error);
					}
				}

				// Check for full timer completion (all steps done)
				if (snap && isTimerCompleted(snap) && showActionNotification) {
					try {
						await showActionNotification({
							title: "タイマー完了！",
							message: "お疲れ様でした！すべてのセッションが終了しました",
							buttons: [
								{ label: "閉じる", action: "complete" },
								{ label: "リセット", action: "skip" },
							],
						});
					} catch (error) {
						console.error("[useTauriTimer] Failed to show completion notification:", error);
					}
				}
			} catch (error) {
				// Engine might not be ready yet, log with context for debugging
				console.error("[useTauriTimer] cmd_timer_tick failed:", error instanceof Error ? error.message : String(error));
			}
			if (snap && mountedRef.current) {
				setSnapshot(snap);
			}
		}, 100);
	}, []);

	const stopTicking = useCallback(() => {
		if (tickRef.current) {
			clearInterval(tickRef.current);
			tickRef.current = null;
		}
	}, []);

	// Start/stop tick loop based on timer state
	useEffect(() => {
		if (snapshot?.state === "running") {
			startTicking();
		} else {
			stopTicking();
			// Still fetch one more time to get final state
			if (snapshot?.state === "completed" || snapshot?.state === "paused") {
				fetchStatus();
			}
		}
		return () => stopTicking();
	}, [snapshot?.state, startTicking, stopTicking, fetchStatus]);

	// Init on mount
	useEffect(() => {
		mountedRef.current = true;
		fetchStatus();
		fetchWindowState();
		return () => {
			mountedRef.current = false;
			stopTicking();
		};
	}, [fetchStatus, fetchWindowState, stopTicking]);

	// ── Timer commands ───────────────────────────────────────────────────────

	const start = useCallback(
		async (step?: number) => {
			if (!isTauriAvailable()) {
				console.log("[useTauriTimer] Not in Tauri context, skipping start");
				return;
			}
			const stepArg = step ?? null;
			let snap: TimerSnapshot | null = null;
			try {
				await safeInvoke("cmd_timer_start", { step: stepArg });
				snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error("[useTauriTimer] cmd_timer_start failed:", err.message);
			}
			if (snap) {
				setSnapshot(snap);
			}
		},
		[],
	);

	const pause = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping pause");
			return;
		}
		let snap: TimerSnapshot | null = null;
		try {
			await safeInvoke("cmd_timer_pause");
			snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_timer_pause failed:", err.message);
		}
		if (snap) {
			setSnapshot(snap);
		}
	}, []);

	const resume = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping resume");
			return;
		}
		let snap: TimerSnapshot | null = null;
		try {
			await safeInvoke("cmd_timer_resume");
			snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_timer_resume failed:", err.message);
		}
		if (snap) {
			setSnapshot(snap);
		}
	}, []);

	const skip = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping skip");
			return;
		}
		let snap: TimerSnapshot | null = null;
		try {
			await safeInvoke("cmd_timer_skip");
			snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_timer_skip failed:", err.message);
		}
		if (snap) {
			setSnapshot(snap);
		}
	}, []);

	const reset = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping reset");
			return;
		}
		let snap: TimerSnapshot | null = null;
		try {
			await safeInvoke("cmd_timer_reset");
			snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_timer_reset failed:", err.message);
		}
		if (snap) {
			setSnapshot(snap);
		}
	}, []);

	// ── Window commands ──────────────────────────────────────────────────────

	const setAlwaysOnTop = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping setAlwaysOnTop");
			setWindowState((prev) => ({ ...prev, always_on_top: enabled }));
			return;
		}
		let success = false;
		try {
			await safeInvoke("cmd_set_always_on_top", { enabled });
			success = true;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_set_always_on_top failed:", err.message);
		}
		if (success) {
			setWindowState((prev) => ({ ...prev, always_on_top: enabled }));
		}
	}, []);

	const setFloatMode = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping setFloatMode");
			setWindowState((prev) => ({
				...prev,
				float_mode: enabled,
				always_on_top: enabled ? true : prev.always_on_top,
			}));
			return;
		}
		let success = false;
		try {
			await safeInvoke("cmd_set_float_mode", { enabled });
			success = true;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useTauriTimer] cmd_set_float_mode failed:", err.message);
		}
		if (success) {
			setWindowState((prev) => ({
				...prev,
				float_mode: enabled,
				always_on_top: enabled ? true : prev.always_on_top,
			}));
		}
	}, []);

	const startDrag = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping startDrag");
			return;
		}
		try {
			await safeInvoke("cmd_start_drag");
		} catch (error) {
			// Drag may fail silently when window is already being dragged or not in float mode
			console.debug("[useTauriTimer] cmd_start_drag failed (may be expected):", error instanceof Error ? error.message : String(error));
		}
	}, []);

	// ── Window control commands (for custom title bar) ───────────────────

	const minimizeWindow = useCallback(async () => {
		await tauriMinimizeWindow();
	}, []);

	const toggleMaximizeWindow = useCallback(async () => {
		await tauriToggleMaximizeWindow();
	}, []);

	const closeWindow = useCallback(async () => {
		await tauriCloseWindow();
	}, []);

	// ── Derived values ───────────────────────────────────────────────────────

	const remainingMs = snapshot?.remaining_ms ?? 0;
	const remainingSeconds = Math.ceil(remainingMs / 1000);
	const totalSeconds = Math.ceil((snapshot?.total_ms ?? 0) / 1000);
	const progress =
		totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
	const isActive = snapshot?.state === "running";
	const isPaused = snapshot?.state === "paused";
	const isIdle = snapshot?.state === "idle" || !snapshot;
	const isCompleted = snapshot?.state === "completed";
	const stepType = snapshot?.step_type ?? "focus";
	const stepLabel = snapshot?.step_label ?? "Warm Up";
	const stepIndex = snapshot?.step_index ?? 0;

	return {
		// Raw snapshot
		snapshot,
		// Derived
		remainingMs,
		remainingSeconds,
		totalSeconds,
		progress,
		isActive,
		isPaused,
		isIdle,
		isCompleted,
		stepType,
		stepLabel,
		stepIndex,
		// Timer commands
		start,
		pause,
		resume,
		skip,
		reset,
		// Window
		windowState,
		setAlwaysOnTop,
		setFloatMode,
		startDrag,
		minimizeWindow,
		toggleMaximizeWindow,
		closeWindow,
		// Refresh
		fetchStatus,
		// Notification integration
		initNotificationIntegration,
	};
}
