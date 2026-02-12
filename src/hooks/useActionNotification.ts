/**
 * useActionNotification — Hook for showing action notification modal.
 *
 * Provides functions to show modal action notifications that require
 * user response (complete, extend, pause, etc.).
 */

import { invoke } from "@tauri-apps/api/core";

// Types matching Rust backend
export interface NotificationButton {
	label: string;
	action: "complete" | "extend" | "pause" | "resume" | "skip" | "start_next";
}

export interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
}

export type NotificationAction = ActionNotificationData["buttons"][number]["action"];

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
	await invoke("plugin:bridge|cmd_show_action_notification", { notification });
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
			{ label: "完了", action: "complete" },
			{ label: "+25分", action: "extend" as const },
			{ label: "+15分", action: "extend" as const },
			{ label: "+5分", action: "extend" as const },
		],
	}),

	/**
	 * Long session warning notification.
	 */
	longSession: (minutes: number): ActionNotificationData => ({
		title: `${Math.floor(minutes / 60)}時間継続`,
		message: "長時間集中しています。休憩しますか？",
		buttons: [
			{ label: "5分休憩", action: "pause" },
			{ label: "継続", action: "skip" },
		],
	}),

	/**
	 * Next task ready notification.
	 */
	nextTaskReady: (taskName: string): ActionNotificationData => ({
		title: "次のタスク",
		message: taskName,
		buttons: [
			{ label: "開始", action: "start_next" },
			{ label: "延長", action: "extend" as const },
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
		presets: NotificationPresets,
	};
}
