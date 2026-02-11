import { useCallback, useEffect, useState } from "react";
import type { NotificationOptions } from "@/types";
import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";

export type NotificationPermission = "granted" | "denied" | "default";

export function useNotifications() {
	const [permission, setPermission] = useState<NotificationPermission>("default");
	const isSupported = typeof window !== "undefined" && Boolean(window.__TAURI__);

	useEffect(() => {
		if (!isSupported) {
			setPermission("default");
			return;
		}

		// Check current permission status on mount
		isPermissionGranted()
			.then((permitted: boolean) => {
				setPermission(permitted ? "granted" : "default");
			})
			.catch(() => {
				setPermission("default");
			});
	}, [isSupported]);

	const requestPermissionImpl = useCallback(async (): Promise<boolean> => {
		if (!isSupported) return false;
		let result: string;
		try {
			result = await requestPermission();
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useNotifications] Error requesting notification permission:", err.message);
			setPermission("denied");
			return false;
		}

		const granted = result === "granted";
		setPermission(granted ? "granted" : "denied");
		return granted;
	}, [isSupported]);

	const showNotification = useCallback(
		async (options: NotificationOptions): Promise<void> => {
			if (!isSupported) return;
			const hasPermission = await isPermissionGranted();
			if (!hasPermission) return;

			const notification = {
				title: options.title,
				body: options.body,
				icon: options.icon || "icons/32x32.png",
			};

			try {
				sendNotification(notification);
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error(`[useNotifications] Error showing notification "${options.title}":`, err.message);
			}
		},
		[isSupported],
	);

	return {
		permission,
		requestPermission: requestPermissionImpl,
		showNotification,
		isSupported,
	};
}
