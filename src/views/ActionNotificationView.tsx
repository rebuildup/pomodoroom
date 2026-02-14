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
export type NotificationAction = 
	| { complete: null }
	| { extend: { minutes: number } }
	| { pause: null }
	| { resume: null }
	| { skip: null }
	| { start_next: null };

interface NotificationButton {
	label: string;
	action: NotificationAction;
}

interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
}

export function ActionNotificationView() {
	const [notification, setNotification] = useState<ActionNotificationData | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	// Load notification data from backend on mount
	useEffect(() => {
		const loadNotification = async () => {
			try {
				const result = await invoke<ActionNotificationData | null>(
					"cmd_get_action_notification"
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
			const action = button.action;
			
			if ('complete' in action) {
				await invoke("cmd_timer_complete");
			} else if ('extend' in action) {
				await invoke("cmd_timer_extend", { minutes: action.extend.minutes });
			} else if ('pause' in action) {
				await invoke("cmd_timer_pause");
			} else if ('resume' in action) {
				await invoke("cmd_timer_resume");
			} else if ('skip' in action) {
				await invoke("cmd_timer_skip");
			} else if ('start_next' in action) {
				await invoke("cmd_timer_start", { step: null, task_id: null, project_id: null });
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
		<div className="w-full h-full flex flex-col justify-center px-4 py-3 bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)] gap-2">
			{/* Row 1: Icon + Title + Message */}
			<div className="flex items-center gap-2">
				<Icon name="check_circle" size={28} color="var(--md-ref-color-primary)" className="flex-shrink-0" />
				<div className="flex-1 min-w-0">
					<h1 className="text-sm font-semibold truncate">
						{notification.title}
					</h1>
					<p className="text-xs text-[var(--md-ref-color-on-surface-variant)] truncate">
						{notification.message}
					</p>
				</div>
			</div>

			{/* Row 2: Action Buttons */}
			<div className="flex gap-2 justify-end">
				{notification.buttons.map((button, index) => (
					<Button
						key={index}
						variant="filled"
						size="small"
						disabled={isProcessing}
						onClick={() => handleAction(button)}
						className="min-w-[70px] text-xs"
					>
						{button.label}
					</Button>
				))}
			</div>

			{/* Processing overlay */}
			{isProcessing && (
				<div className="absolute inset-0 flex items-center justify-center bg-black/50">
					<div className="animate-spin">
						<Icon name="refresh" size={20} />
					</div>
				</div>
			)}
		</div>
	);
}

export default ActionNotificationView;
