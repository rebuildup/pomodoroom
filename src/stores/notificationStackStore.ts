/**
 * Notification Stack Utilities
 *
 * Helper functions for the notification stack system.
 * State is managed by the backend (NotificationStackState in bridge.rs).
 */

import type { NotificationAction } from '@/views/ActionNotificationView';

export interface NotificationButton {
	label: string;
	action: NotificationAction;
}

export interface NotificationData {
	id: string;
	title: string;
	message: string;
	buttons: NotificationButton[];
}

// Calculate window position offset for stacked notifications
export function getStackedWindowPosition(position: number): { x: number; y: number } {
	const OFFSET_X = 30; // pixels to offset right
	const OFFSET_Y = 30; // pixels to offset down
	const START_X = 100;
	const START_Y = 100;

	return {
		x: START_X + position * OFFSET_X,
		y: START_Y + position * OFFSET_Y,
	};
}
