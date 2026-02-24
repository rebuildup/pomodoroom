/**
 * StackedNotificationView — A single notification in a stack.
 *
 * This view is opened in a new window at a specific offset position
 * to create the stacking effect. Each window displays one notification.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/m3/Button";
import { Icon } from "@/components/m3/Icon";

export function StackedNotificationView() {
	const [notification, setNotification] = useState<{
		id: string;
		title: string;
		message: string;
		buttons: Array<{
			label: string;
			action: any;
		}>;
	} | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [stackPosition, setStackPosition] = useState<number>(0);

	const closeSelf = async () => {
		const notificationId = notification?.id ?? "";
		try {
			// Notify the main window to remove this from stack
			try {
				await invoke("cmd_notification_window_closed", {
					notificationId,
				});
			} catch (e) {
				console.error("Failed to notify main window:", e);
			}

			await getCurrentWindow().close();
		} catch {
			if (typeof window !== "undefined") {
				window.close();
			}
		}
	};

	// Load notification data from backend on mount
	useEffect(() => {
		const loadNotification = async () => {
			try {
				const result = await invoke<{
					id: string;
					title: string;
					message: string;
					buttons: Array<{
						label: string;
						action: any;
					}>;
					stackPosition: number;
				} | null>("cmd_get_stacked_notification");

				if (result) {
					setNotification({
						id: result.id,
						title: result.title,
						message: result.message,
						buttons: result.buttons,
					});
					setStackPosition(result.stackPosition);
				} else {
					await closeSelf();
				}
			} catch (error) {
				console.error("Failed to load notification:", error);
				await closeSelf();
			}
		};

		loadNotification();
	}, [closeSelf]);

	// Handle button click
	const handleAction = async (button: { label: string; action: any }) => {
		if (isProcessing) return;

		setIsProcessing(true);
		setErrorMessage(null);

		try {
			const action = button.action;

			// Execute the action (similar logic to ActionNotificationView)
			if ("complete" in action) {
				await invoke("cmd_timer_complete");
			} else if ("extend" in action) {
				await invoke("cmd_timer_extend", { minutes: action.extend.minutes });
			} else if ("pause" in action) {
				await invoke("cmd_timer_pause");
			} else if ("resume" in action) {
				await invoke("cmd_timer_resume");
			} else if ("skip" in action) {
				await invoke("cmd_timer_skip");
			} else if ("start_next" in action) {
				await invoke("cmd_timer_start", { step: null, task_id: null, project_id: null });
			} else if ("start_task" in action) {
				await invoke("cmd_task_start", { id: action.start_task.id });
			} else if ("start_later_pick" in action) {
				// Would need to show defer UI - for now just acknowledge
				await invoke("cmd_task_defer_until", {
					id: action.start_later_pick.id,
					deferUntil: new Date(Date.now() + 3600000).toISOString(),
				});
			} else if ("complete_task" in action) {
				await invoke("cmd_task_complete", { id: action.complete_task.id });
			} else if ("extend_task" in action) {
				await invoke("cmd_task_extend", {
					id: action.extend_task.id,
					minutes: action.extend_task.minutes,
				});
			} else if ("postpone_task" in action) {
				await invoke("cmd_task_postpone", { id: action.postpone_task.id });
			} else if ("delete_task" in action) {
				await invoke("cmd_task_delete", { id: action.delete_task.id });
			} else if ("dismiss" in action) {
				try {
					await invoke("cmd_clear_action_notification");
				} catch (clearError) {
					console.error("Failed to clear notification:", clearError);
				}
				await closeSelf();
				return;
			}

			// Small delay to ensure database transaction is committed
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Dispatch task refresh event so other windows update
			if (typeof window !== "undefined") {
				window.dispatchEvent(new CustomEvent("tasks:refresh"));
				window.dispatchEvent(new CustomEvent("guidance-refresh"));
			}

			// Clear notification and close window
			try {
				await invoke("cmd_clear_action_notification");
			} catch (clearError) {
				console.error("Failed to clear notification:", clearError);
			}

			await closeSelf();
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error("Failed to execute action:", error);
			setErrorMessage(errorMsg);
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
			{/* Stack indicator */}
			<div className="absolute top-2 right-2 flex gap-1">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className={`w-2 h-2 rounded-full ${
							i === stackPosition
								? "bg-[var(--md-ref-color-primary)]"
								: "bg-[var(--md-ref-color-surface-variant)]"
						}`}
					/>
				))}
			</div>

			{/* Row 1: Icon + Title + Message */}
			<div className="flex items-center gap-2">
				<Icon
					name={errorMessage ? "error" : "check_circle"}
					size={28}
					color={errorMessage ? "var(--md-ref-color-error)" : "var(--md-ref-color-primary)"}
					className="flex-shrink-0"
				/>
				<div className="flex-1 min-w-0">
					<h1 className="text-sm font-semibold truncate">
						{errorMessage ? "エラーが発生しました" : notification.title}
					</h1>
					<p className="text-xs text-[var(--md-ref-color-on-surface-variant)] truncate">
						{errorMessage ?? notification.message}
					</p>
				</div>
			</div>

			{/* Error message detail */}
			{errorMessage && (
				<div className="rounded-lg border border-[var(--md-ref-color-error)] bg-[var(--md-ref-color-error-container)] px-3 py-2 text-xs text-[var(--md-ref-color-on-error-container)]">
					{errorMessage}
				</div>
			)}

			{/* Row 2: Action Buttons */}
			<div className="flex gap-2 justify-end">
				{errorMessage ? (
					<Button
						variant="filled"
						size="small"
						onClick={closeSelf}
						className="min-w-[70px] text-xs"
					>
						閉じる
					</Button>
				) : (
					notification.buttons.map((button, index) => (
						<Button
							key={`${button.label}-${index}`}
							variant="filled"
							size="small"
							disabled={isProcessing}
							onClick={() => handleAction(button)}
							className="min-w-[70px] text-xs"
						>
							{button.label}
						</Button>
					))
				)}
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

export default StackedNotificationView;
