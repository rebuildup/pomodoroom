import { useCallback, useEffect, useState } from "react";
import type { NotificationOptions } from "@/types";
import {
	isPermitted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";

export type NotificationPermission = "granted" | "denied" | "default";

export function useNotifications() {
	const [permission, setPermission] = useState<NotificationPermission>("default");

	useEffect(() => {
		// Check current permission status on mount
		isPermitted().then((permitted) => {
			setPermission(permitted ? "granted" : "default");
		});
	}, []);

	const requestPermissionImpl = useCallback(async (): Promise<boolean> => {
		try {
			const result = await requestPermission();
			setPermission(result ? "granted" : "denied");
			return result;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useNotifications] Error requesting notification permission:", err.message);
			setPermission("denied");
			return false;
		}
	}, []);

	const showNotification = useCallback(
		async (options: NotificationOptions): Promise<void> => {
			try {
				await sendNotification({
					title: options.title,
					body: options.body,
					icon: options.icon || "icons/32x32.png",
				});
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(`[useNotifications] Error showing notification "${options.title}":`, err.message);
			}
		},
		[],
	);

	return {
		permission,
		requestPermission: requestPermissionImpl,
		showNotification,
		isSupported: true, // Tauri notification plugin is always supported in desktop app
	};
}
