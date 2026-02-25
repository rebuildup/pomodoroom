/**
 * useInterventionTrigger — Hook for triggering unavoidable interventions.
 *
 * This hook monitors various conditions and triggers intervention dialogs
 * per CORE_POLICY.md §6:
 * - Timer completion
 * - Active task list empty (idling detection)
 * - Pressure mode transitions
 * - Wait condition resolution
 * - Break completion
 *
 * Intervention frequency varies by Pressure mode:
 * - Normal: 5 minutes idle interval
 * - Pressure: 1 minute idle interval
 * - Overload: 30 second idle interval
 */
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PressureMode } from "@/types/pressure";

// ─── Configuration ────────────────────────────────────────────────────────────────

/** Idle detection intervals by pressure mode (milliseconds) */
const IDLE_INTERVALS: Record<PressureMode, number> = {
	normal: 5 * 60 * 1000, // 5 minutes
	pressure: 1 * 60 * 1000, // 1 minute
	overload: 30 * 1000, // 30 seconds
};

// ─── Types ─────────────────────────────────────────────────────────────────────────

export type InterventionTrigger =
	| "timer_complete"
	| "active_empty"
	| "pressure_transition"
	| "wait_resolved"
	| "break_complete";

export interface InterventionTriggerOptions {
	/** Current pressure mode */
	pressureMode: PressureMode;
	/** Whether the timer is running */
	isTimerRunning: boolean;
	/** Whether there are active tasks */
	hasActiveTasks: boolean;
	/** Callback when intervention is triggered */
	onIntervention?: (trigger: InterventionTrigger) => void;
	/** Disable idle detection (for testing) */
	disableIdleDetection?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────────

export function useInterventionTrigger({
	pressureMode,
	isTimerRunning,
	hasActiveTasks,
	onIntervention,
	disableIdleDetection = false,
}: InterventionTriggerOptions) {
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastActivityRef = useRef<number>(Date.now());
	const previousPressureModeRef = useRef<PressureMode>(pressureMode);

	// Reset idle timer on activity
	const resetIdleTimer = () => {
		lastActivityRef.current = Date.now();
		if (idleTimerRef.current) {
			clearTimeout(idleTimerRef.current);
		}
	};

	// Check idle state and trigger intervention if needed
	const checkIdleState = () => {
		if (disableIdleDetection) return;
		if (isTimerRunning) return; // Don't interrupt active timer
		if (hasActiveTasks) return; // Don't trigger if there are active tasks

		const now = Date.now();
		const idleTime = now - lastActivityRef.current;
		const interval = IDLE_INTERVALS[pressureMode];

		if (idleTime >= interval) {
			// Trigger active empty intervention
			void triggerIntervention("active_empty");
			resetIdleTimer();
		}
	};

	// Trigger intervention dialog
	const triggerIntervention = async (trigger: InterventionTrigger) => {
		try {
			await invoke("cmd_open_intervention_dialog", {
				trigger,
				pressureMode,
			});
			onIntervention?.(trigger);
		} catch (error) {
			console.error("Failed to trigger intervention:", error);
		}
	};

	// Monitor for timer completion
	useEffect(() => {
		// This would be triggered by the timer engine via event
		const handleTimerComplete = async () => {
			await triggerIntervention("timer_complete");
		};

		// Listen for timer complete event
		const listener = (_event: Event) => {
			void handleTimerComplete();
		};

		window.addEventListener("timer:complete", listener);
		return () => window.removeEventListener("timer:complete", listener);
	}, []);

	// Monitor for pressure mode transitions
	useEffect(() => {
		if (previousPressureModeRef.current !== pressureMode) {
			// Trigger pressure transition intervention
			void triggerIntervention("pressure_transition");
			previousPressureModeRef.current = pressureMode;
		}
	}, [pressureMode]);

	// Monitor for wait condition resolution
	useEffect(() => {
		const handleWaitResolved = async () => {
			await triggerIntervention("wait_resolved");
		};

		const listener = (_event: Event) => {
			void handleWaitResolved();
		};

		window.addEventListener("task:wait_resolved", listener);
		return () => window.removeEventListener("task:wait_resolved", listener);
	}, []);

	// Monitor for break completion
	useEffect(() => {
		const handleBreakComplete = async () => {
			await triggerIntervention("break_complete");
		};

		const listener = (_event: Event) => {
			void handleBreakComplete();
		};

		window.addEventListener("break:complete", listener);
		return () => window.removeEventListener("break:complete", listener);
	}, []);

	// Idle detection loop
	useEffect(() => {
		if (disableIdleDetection) return;

		// Check every second
		const intervalId = setInterval(checkIdleState, 1000);

		return () => clearInterval(intervalId);
	}, [pressureMode, isTimerRunning, hasActiveTasks, disableIdleDetection]);

	// Public API
	return {
		triggerIntervention,
		resetIdleTimer,
	};
}

export default useInterventionTrigger;
