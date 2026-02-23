/**
 * useActionNotification — Hook for showing action notification modal.
 *
 * Provides functions to show modal action notifications that require
 * user response (complete, extend, pause, etc.).
 */

import { invoke } from "@tauri-apps/api/core";
import type { ActionNotificationData } from "@/types/notification";
import {
	dequeueReplayableNudge,
	enqueueDeferredNudge,
	evaluateNudgeWindow,
	getNudgePolicyConfig,
	recordNudgeOutcome,
} from "@/utils/nudge-window-policy";

// Re-export types for convenience
export type { NotificationAction, NotificationButton } from "@/types/notification";

// Simple in-memory queue for notifications when max is reached
const NOTIFICATION_QUEUE: ActionNotificationData[] = [];
let IS_PROCESSING_QUEUE = false;

/**
 * Process the next notification in the queue.
 */
async function processNextQueuedNotification(): Promise<void> {
	if (IS_PROCESSING_QUEUE || NOTIFICATION_QUEUE.length === 0) {
		return;
	}

	IS_PROCESSING_QUEUE = true;
	try {
		const notification = NOTIFICATION_QUEUE.shift();
		if (notification) {
			await showActionNotificationImmediate(notification);
		}
	} finally {
		IS_PROCESSING_QUEUE = false;
		// Process next if there are more
		if (NOTIFICATION_QUEUE.length > 0) {
			void processNextQueuedNotification();
		}
	}
}

/**
 * Show notification immediately without queueing.
 */
async function showActionNotificationImmediate(
	notification: ActionNotificationData
): Promise<void> {
	await invoke("cmd_show_action_notification", { notification });
}

/**
 * Show action notification window.
 *
 * Opens the modal notification window with specified title, message, and action buttons.
 * The window is always-on-top, modal, and has no close button.
 *
 * @param notification - Notification data with title, message, and buttons
 */
export async function showActionNotification(
	notification: ActionNotificationData
): Promise<void> {
	const now = new Date();
	const config = getNudgePolicyConfig();

	let hasRunningFocus = false;
	try {
		const tasks = await invoke<any[]>("cmd_task_list");
		hasRunningFocus = (tasks ?? []).some(
			(task) => task?.state === "RUNNING" && task?.kind !== "break",
		);
	} catch (error) {
		console.warn("[useActionNotification] Failed to get task list, defaulting hasRunningFocus=false:", error);
		hasRunningFocus = false;
	}

	const context = { hasRunningFocus, now };
	const replay = dequeueReplayableNudge(context);
	if (replay) {
		try {
			await showActionNotificationImmediate(replay);
			recordNudgeOutcome("shown");
		} catch (error) {
			// If max notifications reached, queue it
			const errorMsg = error instanceof Error ? error.message : String(error);
			if (errorMsg.includes("Maximum") && errorMsg.includes("simultaneous notifications")) {
				NOTIFICATION_QUEUE.push(replay);
			} else {
				throw error;
			}
		}
		enqueueDeferredNudge(notification, now, config.deferMinutes);
		return;
	}

	const decision = evaluateNudgeWindow(notification, context, config);
	if (decision === "defer") {
		enqueueDeferredNudge(notification, now, config.deferMinutes);
		return;
	}

	try {
		await showActionNotificationImmediate(notification);
		recordNudgeOutcome("shown");
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		// If max notifications reached, queue it
		if (errorMsg.includes("Maximum") && errorMsg.includes("simultaneous notifications")) {
			console.log("[useActionNotification] Max notifications reached, queuing notification");
			NOTIFICATION_QUEUE.push(notification);
		} else {
			throw error;
		}
	}
}

/**
 * Call this when a notification is closed to process the next queued notification.
 */
export function onNotificationClosed(): void {
	void processNextQueuedNotification();
}

/**
 * Predefined notification types for common scenarios.
 */
export const NotificationPresets = {
	/**
	 * Timer session completed notification.
	 */
	sessionCompleted: (): ActionNotificationData => ({
		title: "25分完了！",
		message: "お疲れ様でした！次の行動をお選びください",
		buttons: [
			{ label: "完了", action: { complete: null } },
			{ label: "+25分", action: { extend: { minutes: 25 } } },
			{ label: "+15分", action: { extend: { minutes: 15 } } },
			{ label: "+5分", action: { extend: { minutes: 5 } } },
		],
	}),

	/**
	 * Long session warning notification.
	 */
	longSession: (minutes: number): ActionNotificationData => ({
		title: `${Math.floor(minutes / 60)}時間継続`,
		message: "長時間集中しています。休憩しますか？",
		buttons: [
			{ label: "5分休憩", action: { pause: null } },
			{ label: "継続", action: { skip: null } },
		],
	}),

	/**
	 * Next task ready notification.
	 */
	nextTaskReady: (taskName: string): ActionNotificationData => ({
		title: "次のタスク",
		message: taskName,
		buttons: [
			{ label: "開始", action: { start_next: null } },
			{ label: "延長", action: { extend: { minutes: 25 } } },
		],
	}),
} as const;

/**
 * Hook for action notification functionality.
 *
 * Example usage:
 * ```ts
 * const { showSessionCompleted } = useActionNotification();
 * await showSessionCompleted();
 * ```
 */
export function useActionNotification() {
	return {
		showActionNotification,
		onNotificationClosed,
		presets: NotificationPresets,
	};
}
