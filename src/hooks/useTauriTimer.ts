/**
 * useTauriTimer -- React hook that drives the timer via Rust IPC bridge.
 *
 * Replaces the old localStorage/setInterval approach. The Rust engine
 * (pomodoroom-core) owns all timer state; the frontend polls via
 * cmd_timer_tick every 100ms when running.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Check if we're in a Tauri environment
function isTauriAvailable(): boolean {
	return typeof window !== "undefined" && "__TAURI__" in window;
}

// Safe invoke wrapper that checks Tauri availability
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	if (!isTauriAvailable()) {
		throw new Error("Tauri API not available");
	}
	return invoke<T>(command, args);
}

// ── Types mirroring Rust Event::StateSnapshot ────────────────────────────────

export interface TimerSnapshot {
	state: "idle" | "running" | "paused" | "completed";
	step_index: number;
	step_type: "focus" | "break";
	step_label: string;
	remaining_ms: number;
	total_ms: number;
	schedule_progress_pct: number;
	at: string;
	// Attached by tick when step completes
	completed?: {
		type: "TimerCompleted";
		step_index: number;
		step_type: "focus" | "break";
		at: string;
	};
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTauriTimer() {
	const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
	const [schedule] = useState<Schedule | null>(null);
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
		try {
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			console.log("[useTauriTimer] fetchStatus success:", snap);
			if (mountedRef.current) setSnapshot(snap);
		} catch (e) {
			console.error("[useTauriTimer] cmd_timer_status failed:", e);
		}
	}, []);

	const fetchWindowState = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping fetchWindowState");
			return;
		}
		try {
			const ws = await safeInvoke<WindowState>("cmd_get_window_state");
			if (mountedRef.current) setWindowState(ws);
		} catch (e) {
			console.error("cmd_get_window_state failed:", e);
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
			try {
				const snap = await safeInvoke<TimerSnapshot>("cmd_timer_tick");
				if (mountedRef.current) setSnapshot(snap);
			} catch {
				// Engine might not be ready yet
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
			try {
				await safeInvoke("cmd_timer_start", { step: step ?? null });
				const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
				setSnapshot(snap);
			} catch (e) {
				console.error("cmd_timer_start failed:", e);
			}
		},
		[],
	);

	const pause = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping pause");
			return;
		}
		try {
			await safeInvoke("cmd_timer_pause");
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSnapshot(snap);
		} catch (e) {
			console.error("cmd_timer_pause failed:", e);
		}
	}, []);

	const resume = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping resume");
			return;
		}
		try {
			await safeInvoke("cmd_timer_resume");
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSnapshot(snap);
		} catch (e) {
			console.error("cmd_timer_resume failed:", e);
		}
	}, []);

	const skip = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping skip");
			return;
		}
		try {
			await safeInvoke("cmd_timer_skip");
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSnapshot(snap);
		} catch (e) {
			console.error("cmd_timer_skip failed:", e);
		}
	}, []);

	const reset = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping reset");
			return;
		}
		try {
			await safeInvoke("cmd_timer_reset");
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSnapshot(snap);
		} catch (e) {
			console.error("cmd_timer_reset failed:", e);
		}
	}, []);

	// ── Window commands ──────────────────────────────────────────────────────

	const setAlwaysOnTop = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping setAlwaysOnTop");
			setWindowState((prev) => ({ ...prev, always_on_top: enabled }));
			return;
		}
		try {
			await safeInvoke("cmd_set_always_on_top", { enabled });
			setWindowState((prev) => ({ ...prev, always_on_top: enabled }));
		} catch (e) {
			console.error("cmd_set_always_on_top failed:", e);
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
		try {
			await safeInvoke("cmd_set_float_mode", { enabled });
			setWindowState((prev) => ({
				...prev,
				float_mode: enabled,
				always_on_top: enabled ? true : prev.always_on_top,
			}));
		} catch (e) {
			console.error("cmd_set_float_mode failed:", e);
		}
	}, []);

	const startDrag = useCallback(async () => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping startDrag");
			return;
		}
		try {
			await safeInvoke("cmd_start_drag");
		} catch {
			// Drag may fail silently
		}
	}, []);

	// ── Window control commands (for custom title bar) ───────────────────

	const minimizeWindow = useCallback(async () => {
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().minimize();
		} catch {
			// Not in Tauri context
		}
	}, []);

	const toggleMaximizeWindow = useCallback(async () => {
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().toggleMaximize();
		} catch {
			// Not in Tauri context
		}
	}, []);

	const closeWindow = useCallback(async () => {
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().close();
		} catch {
			// Not in Tauri context
		}
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
		schedule,
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
	};
}
