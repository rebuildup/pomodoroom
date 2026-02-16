/**
 * useNotificationStack hook
 *
 * Manages the notification stack from the frontend side.
 * Provides functions to add notifications to the stack and handle window closures.
 */

import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { NotificationData, NotificationButton } from '@/stores/notificationStackStore';

export type { NotificationButton, NotificationData };

interface OpenNotificationOptions {
	onClosed?: () => void;
}

/**
 * Hook for managing notification stack
 *
 * Automatically handles opening multiple notification windows
 * with proper stacking (max 3 simultaneous, rest queued).
 */
export function useNotificationStack() {
	/**
	 * Show a notification with the stack behavior
	 */
	const showNotification = useCallback(
		(data: Omit<NotificationData, 'id'>, options?: OpenNotificationOptions) => {
			const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

			invoke('cmd_open_notification_window', {
				notificationId,
				title: data.title,
				message: data.message,
				buttons: data.buttons,
				x: 0, // Position will be calculated by backend
				y: 0,
			}).catch((error) => {
				console.error('Failed to show notification:', error);
			});

			// Listen for window close event if callback provided
			if (options?.onClosed) {
				// In a real implementation, you'd set up a listener
				// For now, we rely on the backend to manage the queue
			}
		},
		[],
	);

	/**
	 * Clear all active notifications
	 */
	const clearAll = useCallback(
		() => {
			invoke('cmd_clear_all_notifications').catch((error) => {
				console.error('Failed to clear notifications:', error);
			});
		},
		[],
	);

	/**
	 * Get count of active notifications
	 */
	const getActiveCount = useCallback(
		async (): Promise<number> => {
			try {
				const count = await invoke<number>('cmd_get_active_notification_count');
				return count;
			} catch {
				return 0;
			}
		},
		[],
	);

	return {
		showNotification,
		clearAll,
		getActiveCount,
	};
}
