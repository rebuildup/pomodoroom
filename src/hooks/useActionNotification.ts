/**
 * useActionNotification — Hook for showing action notification modal.
 *
 * Provides functions to show modal action notifications that require
 * user response (complete, extend, pause, etc.).
 */

import { invoke } from "@tauri-apps/api/core";

// Types matching Rust backend
export type NotificationAction = 
	| { complete: null }
	| { extend: { minutes: number } }
	| { pause: null }
	| { resume: null }
	| { skip: null }
	| { start_next: null };

export interface NotificationButton {
	label: string;
	action: NotificationAction;
}

export interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
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
	await invoke("cmd_show_action_notification", { notification });
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
		presets: NotificationPresets,
	};
}
