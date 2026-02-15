/**
 * ActionNotificationView — Modal action notification popup.
 *
 * This is a forced-choice modal notification that requires user action.
 * No close button - user must click an action button to proceed.
 * Window is always-on-top and modal (blocks other windows).
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/m3/Button";
import { Icon } from "@/components/m3/Icon";

// Helper functions extracted from try/catch context
const roundUpToQuarter = (date: Date): Date => {
	const rounded = new Date(date);
	const minutes = rounded.getMinutes();
	const roundedMinutes = Math.ceil(minutes / 15) * 15;
	if (roundedMinutes === 60) {
		rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
		return rounded;
	}
	rounded.setMinutes(roundedMinutes, 0, 0);
	return rounded;
};

const toCandidateIso = (ms: number) => roundUpToQuarter(new Date(ms)).toISOString();

const calculateTaskData = (task: any) => {
	const requiredMinutes = Math.max(1, task.requiredMinutes ?? task.required_minutes ?? 25);
	const durationMs = requiredMinutes * 60_000;
	return { requiredMinutes, durationMs };
};

const toLabel = (iso: string) =>
	new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

// Helper to check if nextScheduledMs exists
const hasNextScheduledTime = (nextScheduledMs: number | null): nextScheduledMs is number => {
	return nextScheduledMs !== null;
};

// Types for notification data from Rust backend
export type NotificationAction = 
	| { complete: null }
	| { extend: { minutes: number } }
	| { pause: null }
	| { resume: null }
	| { skip: null }
	| { start_next: null }
	| { start_task: { id: string; resume: boolean } }
	| { start_later_pick: { id: string } }
	| { complete_task: { id: string } }
	| { extend_task: { id: string; minutes: number } }
	| { postpone_task: { id: string } }
	| { defer_task_until: { id: string; defer_until: string } }
	| { delete_task: { id: string } }
	| { interrupt_task: { id: string; resume_at: string } }
	| { dismiss: null };

interface NotificationButton {
	label: string;
	action: NotificationAction;
}

interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
}

function getStartIso(task: any): string | null {
	const fixed = task.fixedStartAt ?? task.fixed_start_at ?? null;
	const windowStart = task.windowStartAt ?? task.window_start_at ?? null;
	const estimated = task.estimatedStartAt ?? task.estimated_start_at ?? null;
	return fixed ?? windowStart ?? estimated ?? null;
}

export function ActionNotificationView() {
	const [notification, setNotification] = useState<ActionNotificationData | null>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	const closeSelf = async () => {
		try {
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
				const result = await invoke<ActionNotificationData | null>(
					"cmd_get_action_notification"
				);
				if (result) {
					setNotification(result);
				} else {
					await closeSelf();
				}
			} catch (error) {
				console.error("Failed to load notification:", error);
				await closeSelf();
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
			} else if ('start_task' in action) {
				if (action.start_task.resume) {
					await invoke("cmd_task_resume", { id: action.start_task.id });
				} else {
					await invoke("cmd_task_start", { id: action.start_task.id });
				}
			} else if ('start_later_pick' in action) {
				const task = await invoke<any>("cmd_task_get", { id: action.start_later_pick.id });
				if (!task) {
					setIsProcessing(false);
					return;
				}

				const tasks = await invoke<any[]>("cmd_task_list");
				const nowMs = Date.now();

				// Use helper functions from module scope
				const { durationMs } = calculateTaskData(task);

				// Calculate next scheduled task time
				const findNextScheduledTime = (tasks: any[], task: any, nowMs: number) => {
					return tasks
						.filter((t) => String(t.id) !== String(task.id))
						.filter((t) => (t.state === "READY" || t.state === "PAUSED"))
						.map((t) => getStartIso(t))
						.filter((v): v is string => Boolean(v))
						.map((v) => Date.parse(v))
						.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
						.sort((a, b) => a - b)[0] ?? null;
				};

				const nextScheduledMs = findNextScheduledTime(tasks, task, nowMs);

				// Use global toLabel function from module scope

				// Generate base candidates
				const generateBaseCandidates = (nowMs: number) => {
					return [
						{ label: "15分後", atMs: nowMs + 15 * 60_000 },
						{ label: "30分後", atMs: nowMs + 30 * 60_000 },
					];
				};

				// Add next scheduled time candidates if available
				const addNextScheduledCandidates = (
					candidates: Array<{ label: string; atMs: number }>,
					nextScheduledMs: number | null,
					durationMs: number
				) => {
					if (hasNextScheduledTime(nextScheduledMs)) {
						candidates.push(
							{ label: "次タスク開始時刻", atMs: nextScheduledMs },
							{ label: "次タスク後", atMs: nextScheduledMs + durationMs }
						);
					}
					return candidates;
				};

				// Generate raw candidates without conditional spread
				const generateRawCandidates = (
					nowMs: number,
					nextScheduledMs: number | null,
					durationMs: number
				) => {
					let candidates = generateBaseCandidates(nowMs);
					candidates = addNextScheduledCandidates(candidates, nextScheduledMs, durationMs);
					return candidates;
				};

				// Generate schedule candidates
				const generateScheduleCandidates = (
					nowMs: number,
					nextScheduledMs: number | null,
					durationMs: number
				) => {
					const candidatesRaw = generateRawCandidates(nowMs, nextScheduledMs, durationMs);

					const unique = new Map<string, { label: string; iso: string }>();
					for (const c of candidatesRaw) {
						const iso = toCandidateIso(c.atMs);
						if (Date.parse(iso) <= nowMs) continue;
						if (!unique.has(iso)) unique.set(iso, { label: c.label, iso });
						if (unique.size >= 3) break;
					}

					const candidates = [...unique.values()];
					if (candidates.length === 0) {
						candidates.push({ label: "15分後", iso: toCandidateIso(nowMs + 15 * 60_000) });
					}

					return candidates;
				};

				const candidates = generateScheduleCandidates(nowMs, nextScheduledMs, durationMs);

				setNotification({
					title: "開始を先送り",
					message: `${task.title} をいつ開始しますか`,
					buttons: [
						...candidates.map((c) => ({
							label: `${c.label} (${toLabel(c.iso)})`,
							action: { defer_task_until: { id: task.id, defer_until: c.iso } },
						})),
						{ label: "キャンセル", action: { dismiss: null } },
					],
				});
				setIsProcessing(false);
				return;
			} else if ('complete_task' in action) {
				await invoke("cmd_task_complete", { id: action.complete_task.id });
			} else if ('extend_task' in action) {
				await invoke("cmd_task_extend", {
					id: action.extend_task.id,
					minutes: action.extend_task.minutes,
				});
			} else if ('postpone_task' in action) {
				await invoke("cmd_task_postpone", { id: action.postpone_task.id });
			} else if ('defer_task_until' in action) {
				await invoke("cmd_task_defer_until", {
					id: action.defer_task_until.id,
					deferUntil: action.defer_task_until.defer_until,
				});
			} else if ('delete_task' in action) {
				await invoke("cmd_task_delete", { id: action.delete_task.id });
			} else if ('interrupt_task' in action) {
				await invoke("cmd_task_interrupt", {
					id: action.interrupt_task.id,
					resumeAt: action.interrupt_task.resume_at,
				});
			} else if ('dismiss' in action) {
				// Always close even if clear fails
				try {
					await invoke("cmd_clear_action_notification");
				} catch (clearError) {
					console.error("Failed to clear notification before dismiss:", clearError);
				}
				await closeSelf();
				return;
			}

			try {
				await invoke("cmd_clear_action_notification");
			} catch (clearError) {
				console.error("Failed to clear notification:", clearError);
			}

			// Close window after action
			await closeSelf();
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
