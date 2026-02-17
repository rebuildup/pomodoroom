/**
 * Notification types shared across the application.
 */

export type NotificationAction =
	| { complete: null }
	| { extend: { minutes: number } }
	| { pause: null }
	| { resume: null }
	| { skip: null }
	| { start_next: null }
	| { start_task: { id: string; resume: boolean; ignoreEnergyMismatch?: boolean; mismatchDecision?: "accepted" | "rejected" } }
	| { start_later_pick: { id: string } }
	| { complete_task: { id: string } }
	| { extend_task: { id: string; minutes: number } }
	| { postpone_task: { id: string } }
	| { defer_task_until: { id: string; defer_until: string } }
	| { delete_task: { id: string } }
	| { interrupt_task: { id: string; resume_at: string } }
	| { dismiss: null };

export interface NotificationButton {
	label: string;
	action: NotificationAction;
}

export interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
}
