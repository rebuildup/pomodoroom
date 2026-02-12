/**
 * ActionNotificationView — Modal action notification popup.
 *
 * This is a forced-choice modal notification that requires user action.
 * No close button - user must click an action button to proceed.
 * Window is always-on-top and modal (blocks other windows).
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/m3/Button";
import { Icon } from "@/components/m3/Icon";

// Types for notification data from Rust backend
interface NotificationButton {
	label: string;
	action: "complete" | "extend" | "pause" | "resume" | "skip" | "start_next";
}

interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
}

// Extend action type with minutes for extend
interface ExtendAction extends NotificationButton {
	action: "extend";
}

export function ActionNotificationView() {
	const [notification, setNotification] = useState<ActionNotificationData | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	// Load notification data from backend on mount
	useEffect(() => {
		const loadNotification = async () => {
			try {
				const result = await invoke<ActionNotificationData | null>(
					"plugin:bridge|cmd_get_action_notification"
				);
				if (result) {
					setNotification(result);
				}
			} catch (error) {
				console.error("Failed to load notification:", error);
				// Close window if no notification to show
				if (typeof window !== "undefined") {
					window.close();
				}
			}
		};

		loadNotification();
	}, []);

	// Handle button click
	const handleAction = async (button: NotificationButton) => {
		if (isProcessing) return;

		setIsProcessing(true);

		try {
			switch (button.action) {
				case "complete":
					await invoke("plugin:bridge|cmd_timer_complete");
					break;
				case "extend": {
					const extendAction = button as ExtendAction;
					// Parse minutes from label (e.g., "+25分" -> 25)
					const minutesMatch = extendAction.label.match(/\d+/);
					const minutes = minutesMatch ? parseInt(minutesMatch[0], 0) : 25;
					await invoke("plugin:bridge|cmd_timer_extend", { minutes });
					break;
				}
				case "pause":
					await invoke("plugin:bridge|cmd_timer_pause");
					break;
				case "resume":
					await invoke("plugin:bridge|cmd_timer_resume");
					break;
				case "skip":
					await invoke("plugin:bridge|cmd_timer_skip");
					break;
				case "start_next":
					await invoke("plugin:bridge|cmd_timer_start", { step: null, task_id: null, project_id: null });
					break;
			}

			// Close window after action
			if (typeof window !== "undefined") {
				window.close();
			}
		} catch (error) {
			console.error("Failed to execute action:", error);
			setIsProcessing(false);
		}
	};

	// Close window if no notification loaded
	if (!notification) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]">
				<span className="text-sm">Loading...</span>
			</div>
		);
	}

	return (
		<div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]">
			{/* Icon */}
			<div className="mb-4">
				<Icon name="check_circle" size={48} color="var(--md-ref-color-primary)" />
			</div>

			{/* Title */}
			<h1 className="text-2xl font-semibold mb-2 text-center">
				{notification.title}
			</h1>

			{/* Message */}
			<p className="text-sm mb-6 text-center text-[var(--md-ref-color-on-surface-variant)]">
				{notification.message}
			</p>

			{/* Action Buttons */}
			<div className="flex gap-3 w-full justify-center">
				{notification.buttons.map((button, index) => (
					<Button
						key={index}
						variant="filled"
						size="large"
						disabled={isProcessing}
						onClick={() => handleAction(button)}
						className="min-w-[120px]"
					>
						{button.label}
					</Button>
				))}
			</div>

			{/* Processing indicator */}
			{isProcessing && (
				<div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
					<div className="animate-spin">
						<Icon name="refresh" size={24} />
					</div>
				</div>
			)}
		</div>
	);
}

export default ActionNotificationView;
