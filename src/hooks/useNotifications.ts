import { useCallback, useEffect, useState } from "react";
import type { NotificationOptions } from "@/types";

export function useNotifications() {
	const [permission, setPermission] =
		useState<NotificationPermission>("default");

	useEffect(() => {
		if ("Notification" in window) {
			setPermission(Notification.permission);
		}
	}, []);

	const requestPermission = useCallback(async () => {
		if (!("Notification" in window)) {
			console.warn("This browser does not support notifications");
			return false;
		}

		if (permission === "granted") return true;
		if (permission === "denied") return false;

		try {
			const result = await Notification.requestPermission();
			setPermission(result);
			return result === "granted";
		} catch (error) {
			console.error("Error requesting notification permission:", error);
			return false;
		}
	}, [permission]);

	const showNotification = useCallback(
		(options: NotificationOptions) => {
			if (!("Notification" in window)) {
				return;
			}

			if (permission !== "granted") {
				console.warn("Notification permission not granted");
				return;
			}

			try {
				const notification = new Notification(options.title, {
					body: options.body,
					icon: options.icon || "/favicon.ico",
					requireInteraction: options.requireInteraction || false,
					tag: "pomodoro-timer",
				});

				setTimeout(() => {
					notification.close();
				}, 5000);

				return notification;
			} catch (error) {
				console.error("Error showing notification:", error);
			}
		},
		[permission],
	);

	return {
		permission,
		requestPermission,
		showNotification,
		isSupported: "Notification" in window,
	};
}
