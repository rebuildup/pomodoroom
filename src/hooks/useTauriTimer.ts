/**
 * useTauriTimer -- React hook that drives the timer via Rust IPC bridge.
 *
 * Replaces the old localStorage/setInterval approach. The Rust engine
 * (pomodoroom-core) owns all timer state; the frontend polls via
 * cmd_timer_tick every 100ms when running.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { pushNotificationDiagnostic } from "@/utils/notification-diagnostics";

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
	state: "idle" | "running" | "paused" | "completed" | "drifting";
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
 * Timer snapshot for idle, paused, completed, or drifting states without step completion.
 * Note: drifting state can also have a completed step, handled by CompletedStepSnapshot.
 */
export interface StandardTimerSnapshot extends BaseTimerSnapshot {
	state: "idle" | "paused" | "completed" | "drifting";
	completed?: never;
}

/**
 * Timer snapshot discriminated union.
 * Use type guards to narrow to specific snapshot types.
 */
export type TimerSnapshot = StandardTimerSnapshot | CompletedStepSnapshot;

/**
 * Type guard to check if a snapshot has a completed step.
 * Note: When a step completes, the engine enters "drifting" state,
 * so we need to check for both "running" and "drifting" states.
 */
export function isCompletedStepSnapshot(
	snapshot: TimerSnapshot,
): snapshot is CompletedStepSnapshot {
	return (
		(snapshot.state === "running" || snapshot.state === "drifting") &&
		snapshot.completed !== undefined
	);
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
export function isStandardTimerSnapshot(
	snapshot: TimerSnapshot,
): snapshot is StandardTimerSnapshot {
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
let showActionNotification:
	| ((notification: import("@/types/notification").ActionNotificationData) => Promise<void>)
	| null = null;

/**
 * Initialize notification integration.
 * Must be called before using notification functions.
 */
export function initNotificationIntegration(
	notificationFn: typeof import("./useActionNotification").showActionNotification,
) {
	showActionNotification = notificationFn;
}

// ── Step Complete Callback ─────────────────────────────────────────────
// Callback for timer step completion (auto-start next task)
let onStepCompleteCallback:
	| ((stepInfo: {
			stepType: "focus" | "break";
			stepIndex: number;
			stepLabel: string;
	  }) => Promise<void>)
	| null = null;

/**
 * Initialize step complete callback.
 * Called when a timer step completes for auto-starting next task.
 */
export function initStepCompleteCallback(callbackFn: typeof onStepCompleteCallback) {
	onStepCompleteCallback = callbackFn;
}

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

// ── Window Control Helpers (outside hook for React Compiler) ────────────────

async function tauriMinimizeWindow() {
	try {
		await getCurrentWindow().minimize();
	} catch (error) {
		let errorMessage: string;
		if (error instanceof Error) {
			errorMessage = error.message;
		} else {
			errorMessage = String(error);
		}
		console.debug("[useTauriTimer] minimizeWindow failed:", errorMessage);
	}
}

async function tauriToggleMaximizeWindow() {
	try {
		await getCurrentWindow().toggleMaximize();
	} catch (error) {
		let errorMessage: string;
		if (error instanceof Error) {
			errorMessage = error.message;
		} else {
			errorMessage = String(error);
		}
		console.debug("[useTauriTimer] toggleMaximizeWindow failed:", errorMessage);
	}
}

async function tauriCloseWindow() {
	try {
		await getCurrentWindow().close();
	} catch (error) {
		let errorMessage: string;
		if (error instanceof Error) {
			errorMessage = error.message;
		} else {
			errorMessage = String(error);
		}
		console.debug("[useTauriTimer] closeWindow failed:", errorMessage);
	}
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTauriTimer() {
	const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(sharedSnapshot);
	const [windowState, setWindowState] = useState<WindowState>(sharedWindowState);
	const instanceIdRef = useRef<string>(`timer-${Math.random().toString(36).slice(2, 10)}`);

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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_timer_status failed:", err.message);
			pushNotificationDiagnostic("timer.status.error", "cmd_timer_status failed", {
				error: err.message,
				instanceId: instanceIdRef.current,
			});
		}
		if (snap) {
			setSharedSnapshot(snap);
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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_get_window_state failed:", err.message);
			pushNotificationDiagnostic("timer.window-state.error", "cmd_get_window_state failed", {
				error: err.message,
				instanceId: instanceIdRef.current,
			});
		}
		if (ws) {
			setSharedWindowState(ws);
		}
	}, []);

	// ── Tick loop (singleton across all hook instances) ──────────────────────
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
			snap = await safeInvoke<TimerSnapshot>("cmd_timer_tick");
			globalConsecutiveErrorCount = 0;

			if (snap && isCompletedStepSnapshot(snap)) {
				pushNotificationDiagnostic("timer.step.completed", "completed step detected", {
					stepType: snap.step_type,
					stepIndex: snap.completed.step_index,
					state: snap.state,
				});

				if (onStepCompleteCallback) {
					try {
						await onStepCompleteCallback({
							stepType: snap.step_type,
							stepIndex: snap.completed.step_index,
							stepLabel: snap.step_label,
						});
					} catch (error) {
						console.error("[useTauriTimer] Step complete callback failed:", error);
						let errorMsg: string;
						if (error instanceof Error) {
							errorMsg = error.message;
						} else {
							errorMsg = String(error);
						}
						pushNotificationDiagnostic("timer.step.callback.error", "step callback failed", {
							error: errorMsg,
						});
					}
				}

				if (showActionNotification) {
					let stepType: string;
					if (snap.step_type === "focus") {
						stepType = "集中";
					} else {
						stepType = "休憩";
					}
					const totalMsValue = snap.total_ms;
					const totalMs = totalMsValue !== null && totalMsValue !== undefined ? totalMsValue : 0;
					const stepMinutes = Math.max(1, Math.round(totalMs / 60_000));
					let detailMessage: string;
					if (snap.step_type === "break") {
						detailMessage = `${stepMinutes}分休憩です。次の行動をお選びください`;
					} else {
						detailMessage = "お疲れ様でした！次の行動をお選びください";
					}
					try {
						pushNotificationDiagnostic(
							"timer.notification.request",
							"requesting action notification",
							{
								title: `${stepType}完了！`,
								stepType: snap.step_type,
							},
						);
						await showActionNotification({
							title: `${stepType}完了！`,
							message: detailMessage,
							buttons: [
								{ label: "完了", action: { complete: null } },
								{ label: "+25分", action: { extend: { minutes: 25 } } },
								{ label: "+15分", action: { extend: { minutes: 15 } } },
								{ label: "+5分", action: { extend: { minutes: 5 } } },
							],
						});
						pushNotificationDiagnostic("timer.notification.success", "action notification shown", {
							title: `${stepType}完了！`,
						});
					} catch (error) {
						console.error("[useTauriTimer] Failed to show action notification:", error);
						let errorMsg2: string;
						if (error instanceof Error) {
							errorMsg2 = error.message;
						} else {
							errorMsg2 = String(error);
						}
						pushNotificationDiagnostic("timer.notification.error", "action notification failed", {
							error: errorMsg2,
						});
					}
				} else {
					pushNotificationDiagnostic(
						"timer.notification.missing-integration",
						"notification integration not initialized",
					);
				}
			}

			if (snap && isTimerCompleted(snap) && showActionNotification) {
				try {
					pushNotificationDiagnostic("timer.session.completed", "all timer steps completed");
					await showActionNotification({
						title: "タイマー完了！",
						message: "お疲れ様でした！すべてのセッションが終了しました",
						buttons: [
							{ label: "閉じる", action: { complete: null } },
							{ label: "リセット", action: { skip: null } },
						],
					});
				} catch (error) {
					console.error("[useTauriTimer] Failed to show completion notification:", error);
					let errorMsg3: string;
					if (error instanceof Error) {
						errorMsg3 = error.message;
					} else {
						errorMsg3 = String(error);
					}
					pushNotificationDiagnostic(
						"timer.session.notification.error",
						"failed to show completion notification",
						{
							error: errorMsg3,
						},
					);
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error("[useTauriTimer] cmd_timer_tick failed:", errorMessage);
			hadError = true;
			globalConsecutiveErrorCount += 1;
			pushNotificationDiagnostic("timer.tick.error", "cmd_timer_tick failed", {
				error: errorMessage,
				consecutive: globalConsecutiveErrorCount,
			});

			if (globalConsecutiveErrorCount >= MAX_CONSECUTIVE_ERRORS) {
				console.error(
					`[useTauriTimer] Stopping tick loop after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`,
				);
				stopTicking();
				if (sharedSnapshot) {
					const { completed: _, ...rest } = sharedSnapshot as BaseTimerSnapshot & {
						completed?: unknown;
					};
					setSharedSnapshot({
						...rest,
						state: "paused" as const,
					} as StandardTimerSnapshot);
				}
			}
		}
		globalTickInFlight = false;
		if (!hadError && snap) {
			setSharedSnapshot(snap);
		}
	}, [stopTicking]);

	const startTicking = useCallback(() => {
		if (globalTickRef) return;
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping tick");
			return;
		}
		if (subscriberCount <= 0) return;
		pushNotificationDiagnostic("timer.tick.start", "started global tick loop", {
			instanceId: instanceIdRef.current,
			subscribers: subscriberCount,
		});
		globalTickRef = setInterval(() => {
			void runTickOnce();
		}, 250);
	}, [runTickOnce]);

	// Keep all hook instances synchronized with shared timer state.
	useEffect(() => {
		subscriberCount += 1;
		const unsubscribe = subscribeTimerState(
			({ snapshot: nextSnapshot, windowState: nextWindowState }) => {
				setSnapshot(nextSnapshot);
				setWindowState(nextWindowState);
			},
		);

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

	// Start/stop global tick loop based on shared timer state.
	useEffect(() => {
		if (snapshot?.state === "running" || snapshot?.state === "drifting") {
			startTicking();
		} else {
			stopTicking();
			if (snapshot?.state === "completed" || snapshot?.state === "paused") {
				void fetchStatus();
			}
		}
	}, [snapshot?.state, startTicking, stopTicking, fetchStatus]);

	// ── Timer commands ───────────────────────────────────────────────────────

	const start = useCallback(async (step?: number) => {
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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_timer_start failed:", err.message);
		}
		if (snap) {
			setSharedSnapshot(snap);
		}
	}, []);

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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_timer_pause failed:", err.message);
		}
		if (snap) {
			setSharedSnapshot(snap);
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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_timer_resume failed:", err.message);
		}
		if (snap) {
			setSharedSnapshot(snap);
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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_timer_skip failed:", err.message);
		}
		if (snap) {
			setSharedSnapshot(snap);
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
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_timer_reset failed:", err.message);
		}
		if (snap) {
			setSharedSnapshot(snap);
		}
	}, []);

	// ── Window commands ──────────────────────────────────────────────────────

	const setAlwaysOnTop = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping setAlwaysOnTop");
			setSharedWindowState({ ...sharedWindowState, always_on_top: enabled });
			return;
		}
		let success = false;
		try {
			await safeInvoke("cmd_set_always_on_top", { enabled });
			success = true;
		} catch (error) {
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_set_always_on_top failed:", err.message);
		}
		if (success) {
			setSharedWindowState({ ...sharedWindowState, always_on_top: enabled });
		}
	}, []);

	const setFloatMode = useCallback(async (enabled: boolean) => {
		if (!isTauriAvailable()) {
			console.log("[useTauriTimer] Not in Tauri context, skipping setFloatMode");
			setSharedWindowState({
				...sharedWindowState,
				float_mode: enabled,
				always_on_top: enabled ? true : sharedWindowState.always_on_top,
			});
			return;
		}
		let success = false;
		try {
			await safeInvoke("cmd_set_float_mode", { enabled });
			success = true;
		} catch (error) {
			let err: Error;
			if (error instanceof Error) {
				err = error;
			} else {
				err = new Error(String(error));
			}
			console.error("[useTauriTimer] cmd_set_float_mode failed:", err.message);
		}
		if (success) {
			setSharedWindowState({
				...sharedWindowState,
				float_mode: enabled,
				always_on_top: enabled ? true : sharedWindowState.always_on_top,
			});
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
			let errorMessage: string;
			if (error instanceof Error) {
				errorMessage = error.message;
			} else {
				errorMessage = String(error);
			}
			console.debug("[useTauriTimer] cmd_start_drag failed (may be expected):", errorMessage);
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
	const progress = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
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
		// Step complete callback
		initStepCompleteCallback,
	};
}
