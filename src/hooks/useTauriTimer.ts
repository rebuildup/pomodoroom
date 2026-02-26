/**
 * useTauriTimer -- React hook for task-based timer via Rust IPC bridge.
 *
 * The Rust engine tracks remaining time for the currently RUNNING task.
 * Timer continuously counts down - no start/stop concept.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { pushNotificationDiagnostic } from "@/utils/notification-diagnostics";

// Check if we're in a Tauri environment
function isTauriAvailable(): boolean {
	return isTauriEnvironment();
}

// Safe invoke wrapper
async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	if (!isTauriAvailable()) {
		throw new Error("Tauri API not available");
	}
	return invoke<T>(command, args);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface TimerSnapshot {
	state: "idle" | "running" | "drifting";
	step_index: number;
	step_type: "focus" | "break";
	step_label: string;
	remaining_ms: number;
	total_ms: number;
	schedule_progress_pct: number;
	at: string;
	completed?: {
		type: "TimerCompleted";
		step_index: number;
		step_type: "focus" | "break";
		at: string;
	};
}

export interface WindowState {
	always_on_top: boolean;
	float_mode: boolean;
}

// ── Action Notification Integration ─────────────────────────────────────────
let showActionNotification:
	| ((
			notification: import("@/types/notification").ActionNotificationData,
			opts?: { force?: boolean },
		) => Promise<void>)
	| null = null;

export function initNotificationIntegration(
	notificationFn: typeof import("./useActionNotification").showActionNotification,
) {
	showActionNotification = notificationFn;
}

// ── Step Complete Callback ─────────────────────────────────────────────────
let onTaskTimeUpCallback:
	| ((taskInfo: { taskLabel: string; remainingMs: number }) => Promise<void>)
	| null = null;

export function initTaskTimeUpCallback(callbackFn: typeof onTaskTimeUpCallback) {
	onTaskTimeUpCallback = callbackFn;
}

// ── Shared State ────────────────────────────────────────────────────────────
type TimerStateListener = (state: {
	snapshot: TimerSnapshot | null;
	windowState: WindowState;
}) => void;

const DEFAULT_WINDOW_STATE: WindowState = {
	always_on_top: false,
	float_mode: false,
};

let sharedSnapshot: TimerSnapshot | null = null;
let sharedWindowState: WindowState = DEFAULT_WINDOW_STATE;
const timerStateListeners = new Set<TimerStateListener>();

let globalTickRef: ReturnType<typeof setInterval> | null = null;
let globalTickInFlight = false;
let subscriberCount = 0;
let globalConsecutiveErrorCount = 0;
const MAX_CONSECUTIVE_ERRORS = 10;

// Dedup key for notifications
let lastNotifiedCompletionKey: string | null = null;

function notifyTimerStateListeners(): void {
	for (const listener of timerStateListeners) {
		listener({
			snapshot: sharedSnapshot,
			windowState: sharedWindowState,
		});
	}
}

function setSharedSnapshot(snapshot: TimerSnapshot | null): void {
	sharedSnapshot = snapshot;
	notifyTimerStateListeners();
}

function setSharedWindowState(windowState: WindowState): void {
	sharedWindowState = windowState;
	notifyTimerStateListeners();
}

function subscribeTimerState(listener: TimerStateListener): () => void {
	timerStateListeners.add(listener);
	listener({
		snapshot: sharedSnapshot,
		windowState: sharedWindowState,
	});
	return () => {
		timerStateListeners.delete(listener);
	};
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useTauriTimer() {
	const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(sharedSnapshot);
	const [windowState, setWindowState] = useState<WindowState>(sharedWindowState);
	const instanceIdRef = useRef<string>(`timer-${Math.random().toString(36).slice(2, 10)}`);

	// ── Fetch initial state ─────────────────────────────────────────────────
	const fetchStatus = useCallback(async () => {
		if (!isTauriAvailable()) return;
		try {
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSharedSnapshot(snap);
		} catch (error) {
			console.error("[useTauriTimer] cmd_timer_status failed:", error);
		}
	}, []);

	const fetchWindowState = useCallback(async () => {
		if (!isTauriAvailable()) return;
		try {
			const ws = await safeInvoke<WindowState>("cmd_get_window_state");
			setSharedWindowState(ws);
		} catch (error) {
			console.error("[useTauriTimer] cmd_get_window_state failed:", error);
		}
	}, []);

	// ── Update session with task info ───────────────────────────────────────
	const updateSession = useCallback(
		async (
			taskId: string | null,
			taskTitle: string | null,
			requiredMinutes: number,
			elapsedMinutes: number,
		) => {
			if (!isTauriAvailable()) return;
			try {
				await safeInvoke("cmd_timer_update_session", {
					task_id: taskId,
					task_title: taskTitle,
					required_minutes: requiredMinutes,
					elapsed_minutes: elapsedMinutes,
				});
				const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
				setSharedSnapshot(snap);
			} catch (error) {
				console.error("[useTauriTimer] cmd_timer_update_session failed:", error);
			}
		},
		[],
	);

	// ── Tick loop (singleton) ───────────────────────────────────────────────
	const stopTicking = useCallback(() => {
		if (globalTickRef) {
			clearInterval(globalTickRef);
			globalTickRef = null;
			globalTickInFlight = false;
			pushNotificationDiagnostic("timer.tick.stop", "stopped global tick loop", {
				instanceId: instanceIdRef.current,
				subscribers: subscriberCount,
			});
		}
	}, []);

	const runTickOnce = useCallback(async () => {
		if (globalTickInFlight) return;
		globalTickInFlight = true;

		let snap: TimerSnapshot | null = null;
		let hadError = false;
		try {
			// cmd_timer_tick returns TimerSnapshot with optional completed field
			interface TimerTickResponse extends TimerSnapshot {
				completed?: { type: "TimerCompleted"; step_index: number; step_type: "focus" | "break"; at: string };
			}
			const response = await safeInvoke<TimerTickResponse>("cmd_timer_tick");
			snap = response;
			globalConsecutiveErrorCount = 0;

			// Check if task time expired (drifting state with completion)
			if (snap?.state === "drifting" && response.completed) {
				const completionKey = `${snap.step_label}:${response.completed.at}`;
				if (lastNotifiedCompletionKey !== completionKey) {
					lastNotifiedCompletionKey = completionKey;

					pushNotificationDiagnostic("timer.task.timeup", "task time expired", {
						taskLabel: snap.step_label,
						remainingMs: snap.remaining_ms,
					});

					if (onTaskTimeUpCallback) {
						try {
							await onTaskTimeUpCallback({
								taskLabel: snap.step_label,
								remainingMs: snap.remaining_ms,
							});
						} catch (error) {
							console.error("[useTauriTimer] Task time up callback failed:", error);
						}
					}

					if (showActionNotification) {
						try {
							pushNotificationDiagnostic("timer.notification.request", "requesting action notification", {
								title: "時間切れ！",
								taskLabel: snap.step_label,
							});
							await showActionNotification(
								{
									title: "時間切れ！",
									message: `${snap.step_label}の予定時間が終了しました。次の行動をお選びください`,
									buttons: [
										{ label: "完了", action: { complete: null } },
										{ label: "+15分", action: { extend: { minutes: 15 } } },
										{ label: "+5分", action: { extend: { minutes: 5 } } },
									],
								},
								{ force: true },
							);
						} catch (error) {
							console.error("[useTauriTimer] Failed to show action notification:", error);
						}
					}
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error("[useTauriTimer] cmd_timer_tick failed:", errorMessage);
			hadError = true;
			globalConsecutiveErrorCount += 1;

			if (globalConsecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
				console.error(`[useTauriTimer] Stopping tick loop after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
				stopTicking();
			}
		}
		globalTickInFlight = false;
		if (!hadError && snap) {
			setSharedSnapshot(snap);
		}
	}, [stopTicking]);

	const startTicking = useCallback(() => {
		if (globalTickRef) return;
		if (!isTauriAvailable()) return;
		if (subscriberCount <= 0) return;

		pushNotificationDiagnostic("timer.tick.start", "started global tick loop", {
			instanceId: instanceIdRef.current,
			subscribers: subscriberCount,
		});
		globalTickRef = setInterval(() => {
			void runTickOnce();
		}, 250);
	}, [runTickOnce]);

	// Keep all hook instances synchronized
	useEffect(() => {
		subscriberCount += 1;
		const unsubscribe = subscribeTimerState(({ snapshot: nextSnapshot, windowState: nextWindowState }) => {
			setSnapshot(nextSnapshot);
			setWindowState(nextWindowState);
		});

		void fetchStatus();
		void fetchWindowState();

		return () => {
			unsubscribe();
			subscriberCount = Math.max(0, subscriberCount - 1);
			if (subscriberCount === 0) {
				stopTicking();
			}
		};
	}, [fetchStatus, fetchWindowState, stopTicking]);

	// Start/stop global tick loop based on timer state
	useEffect(() => {
		if (snapshot?.state === "running" || snapshot?.state === "drifting") {
			startTicking();
		} else {
			stopTicking();
		}
	}, [snapshot?.state, startTicking, stopTicking]);

	// ── Commands ────────────────────────────────────────────────────────────

	const extend = useCallback(async (minutes: number) => {
		if (!isTauriAvailable()) return;
		try {
			await safeInvoke("cmd_timer_extend", { minutes });
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSharedSnapshot(snap);
		} catch (error) {
			console.error("[useTauriTimer] cmd_timer_extend failed:", error);
		}
	}, []);

	const complete = useCallback(async () => {
		if (!isTauriAvailable()) return;
		try {
			await safeInvoke("cmd_timer_complete");
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSharedSnapshot(snap);
		} catch (error) {
			console.error("[useTauriTimer] cmd_timer_complete failed:", error);
		}
	}, []);

	const reset = useCallback(async () => {
		if (!isTauriAvailable()) return;
		try {
			await safeInvoke("cmd_timer_reset");
			const snap = await safeInvoke<TimerSnapshot>("cmd_timer_status");
			setSharedSnapshot(snap);
		} catch (error) {
			console.error("[useTauriTimer] cmd_timer_reset failed:", error);
		}
	}, []);

	// ── Window commands ─────────────────────────────────────────────────────

	const setAlwaysOnTop = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) return;
		try {
			await safeInvoke("cmd_set_always_on_top", { enabled });
			setSharedWindowState({ ...sharedWindowState, always_on_top: enabled });
		} catch (error) {
			console.error("[useTauriTimer] cmd_set_always_on_top failed:", error);
		}
	}, []);

	const setFloatMode = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) return;
		try {
			await safeInvoke("cmd_set_float_mode", { enabled });
			setSharedWindowState({
				...sharedWindowState,
				float_mode: enabled,
				always_on_top: enabled ? true : sharedWindowState.always_on_top,
			});
		} catch (error) {
			console.error("[useTauriTimer] cmd_set_float_mode failed:", error);
		}
	}, []);

	// ── Derived values ──────────────────────────────────────────────────────

	const remainingMs = snapshot?.remaining_ms ?? 0;
	const remainingSeconds = Math.ceil(remainingMs / 1000);
	const totalSeconds = Math.ceil((snapshot?.total_ms ?? 0) / 1000);
	const progress = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
	const isActive = snapshot?.state === "running";
	const isDrifting = snapshot?.state === "drifting";
	const isIdle = snapshot?.state === "idle" || !snapshot;
	const stepType = snapshot?.step_type ?? "focus";
	const stepLabel = snapshot?.step_label ?? "";

	return {
		// Raw snapshot
		snapshot,
		// Derived
		remainingMs,
		remainingSeconds,
		totalSeconds,
		progress,
		isActive,
		isDrifting,
		isIdle,
		stepType,
		stepLabel,
		// Timer commands
		updateSession,
		extend,
		complete,
		reset,
		// Window
		windowState,
		setAlwaysOnTop,
		setFloatMode,
		// Refresh
		fetchStatus,
		// Notification integration
		initNotificationIntegration,
		// Task time up callback
		initTaskTimeUpCallback,
	};
}
