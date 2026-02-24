/**
 * ActionNotificationView — Modal action notification popup.
 *
 * This is a forced-choice modal notification that requires user action.
 * No close button - user must click an action button to proceed.
 * Window is always-on-top and modal (blocks other windows).
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/m3/Button";
import { Icon } from "@/components/m3/Icon";
import { toTimeLabel } from "@/utils/notification-time";
import { buildDeferCandidates } from "@/utils/defer-candidates";
import {
	acknowledgePrompt,
	markPromptIgnored,
	toCriticalStartPromptKey,
} from "@/utils/gatekeeper";
import { onNotificationClosed } from "@/hooks/useActionNotification";
import {
	evaluateTaskEnergyMismatch,
	rankAlternativeTasks,
	trackEnergyMismatchFeedback,
	type EnergyMismatchTaskLike,
} from "@/utils/task-energy-mismatch";
import {
	buildLowEnergyFallbackQueue,
	createLowEnergyStartAction,
	recordLowEnergyQueueFeedback,
	shouldTriggerLowEnergySuggestion,
} from "@/utils/low-energy-fallback-queue";
import { recordNudgeOutcome } from "@/utils/nudge-window-policy";
import {
	getBreakActivitySuggestions,
	recordBreakActivityFeedback,
	type BreakActivity,
	type BreakFatigueLevel,
} from "@/utils/break-activity-catalog";
import {
	accrueBreakDebt,
	applyBreakRepayment,
	decayBreakDebt,
	loadBreakDebtState,
	saveBreakDebtState,
} from "@/utils/break-debt-policy";
import { playNotificationSoundMaybe } from "@/utils/soundPlayer";
import { pushNotificationDiagnostic } from "@/utils/notification-diagnostics";

// Defer reason templates for postponement tracking
export const DEFER_REASON_TEMPLATES = [
	{ id: "interrupted", label: "割り込み発生", description: "予期せぬ割り込みが入った" },
	{ id: "not-ready", label: "準備不足", description: "タスクに必要な準備ができていない" },
	{ id: "low-energy", label: "エネルギー不足", description: "集中力や体力が不足している" },
	{ id: "higher-priority", label: "優先タスク出現", description: "より緊急度の高いタスクが発生" },
	{ id: "need-info", label: "情報不足", description: "タスク進行に必要な情報がない" },
	{ id: "meeting", label: "会議/予定", description: "会議や他の予定が入った" },
	{ id: "other", label: "その他", description: "上記に当てはまらない理由" },
] as const;

export type DeferReasonId = typeof DEFER_REASON_TEMPLATES[number]["id"];

interface DeferReasonRecord {
	taskId: string;
	reasonId: DeferReasonId;
	reasonLabel: string;
	timestamp: string;
	deferredUntil?: string;
}

// Store defer reason removed - database-only architecture
const storeDeferReason = (_record: DeferReasonRecord) => {
	// No-op - defer reason tracking now uses database only
};

const calculateTaskData = (task: any) => {
	const requiredMinutes = Math.max(1, task.requiredMinutes ?? task.required_minutes ?? 25);
	const durationMs = requiredMinutes * 60_000;
	return { requiredMinutes, durationMs };
};

const BREAK_DEBT_MAX_BREAK_MINUTES = 30;
const BREAK_DEBT_DECAY_PER_COMPLIANT_CYCLE = 1;

const toEnergyMismatchTask = (task: any): EnergyMismatchTaskLike => ({
	id: String(task.id),
	title: String(task.title ?? ""),
	energy: (task.energy ?? "medium") as "low" | "medium" | "high",
	requiredMinutes: task.requiredMinutes ?? task.required_minutes ?? 25,
	priority: task.priority ?? 50,
	state: task.state,
	tags: Array.isArray(task.tags) ? task.tags : [],
});

const estimatePressureValue = (tasks: any[]): number => {
	let pressure = 50;
	const readyCount = tasks.filter((task) => task.state === "READY").length;
	const doneCount = tasks.filter((task) => task.state === "DONE").length;
	const runningCount = tasks.filter((task) => task.state === "RUNNING").length;
	pressure += readyCount * 3;
	pressure -= doneCount * 5;
	if (runningCount > 0) pressure -= 10;
	return Math.max(0, Math.min(100, Math.round(pressure)));
};

// Types for notification data from Rust backend
// Note: Rust serde serializes unit enum variants as strings (e.g., "dismiss")
// but struct variants as objects (e.g., { "start_task": {...} })
// We handle both forms for compatibility.
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
	| { defer_with_reason: { reasonId: DeferReasonId } }
	| { defer_task_with_reason: { id: string; defer_until: string; reasonId: DeferReasonId; reasonLabel: string } }
	| { delete_task: { id: string } }
	| { interrupt_task: { id: string; resume_at: string } }
	| { dismiss: null }
	| "dismiss";  // Rust serde serializes unit variants as strings

interface NotificationButton {
	label: string;
	action: NotificationAction;
}

interface ActionNotificationData {
	title: string;
	message: string;
	buttons: NotificationButton[];
}

function getCriticalStartPromptKey(notification: ActionNotificationData | null): string | null {
	if (!notification) return null;
	for (const button of notification.buttons) {
		const action = button.action;
		// Skip string actions (unit variants from Rust)
		if (typeof action === "string") continue;
		if ("start_task" in action) {
			return toCriticalStartPromptKey(action.start_task.id);
		}
	}
	return null;
}

function parseBreakMinutes(notification: ActionNotificationData): number {
	const text = `${notification.title} ${notification.message}`;
	const match = text.match(/(\d+)\s*分/);
	if (match?.[1]) {
		const parsed = Number.parseInt(match[1], 10);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return 5;
}

function isBreakNotification(notification: ActionNotificationData): boolean {
	const text = `${notification.title} ${notification.message}`.toLowerCase();
	return text.includes("休憩") || text.includes("break");
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
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [breakSuggestions, setBreakSuggestions] = useState<BreakActivity[]>([]);
	const [breakSuggestionContext, setBreakSuggestionContext] = useState<{
		breakMinutes: number;
		fatigueLevel: BreakFatigueLevel;
	} | null>(null);
	const [breakDebtBalanceMinutes, setBreakDebtBalanceMinutes] = useState(0);
	const [effectiveBreakMinutes, setEffectiveBreakMinutes] = useState<number | null>(null);
	const [deferReasonStep, setDeferReasonStep] = useState<{
		taskId: string;
		taskTitle: string;
		candidates: Array<{ reason: string; iso: string }>;
		reasonId?: DeferReasonId;
		reasonLabel?: string;
	} | null>(null);

	const closeSelf = async () => {
		try {
			// Get the current window label
			const currentWindow = getCurrentWindow();
			const label = currentWindow.label;

			// Notify backend that this notification is closing
			try {
				await invoke("cmd_close_action_notification", { label });
			} catch (error) {
				console.warn("Failed to notify backend about notification close:", error);
			}

			// Trigger processing of next queued notification
			onNotificationClosed();

			// Close the window
			await currentWindow.close();
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
				pushNotificationDiagnostic("action.window.load", "loading action notification payload");
				const result = await invoke<ActionNotificationData | null>(
					"cmd_get_action_notification"
				);
				if (result) {
					setNotification(result);
					pushNotificationDiagnostic("action.window.loaded", "action notification payload loaded", {
						title: result.title,
						buttons: result.buttons.length,
					});

					// Play notification sound
					try {
						const config = await invoke<{ notifications?: { enabled?: boolean; volume?: number; custom_sound?: string } }>("cmd_config_list");
						const notifConfig = config?.notifications;
						let volumeValue: number;
						if (notifConfig?.volume !== null && notifConfig?.volume !== undefined) {
							volumeValue = notifConfig.volume;
						} else {
							volumeValue = 50;
						}
						if (notifConfig?.enabled !== false) {
							const volume = volumeValue / 100;
							void playNotificationSoundMaybe(notifConfig?.custom_sound, volume);
						}
					} catch (soundError) {
						console.warn("[ActionNotificationView] Failed to play notification sound:", soundError);
					}
				} else {
					pushNotificationDiagnostic("action.window.empty", "no notification payload found, closing window");
					await closeSelf();
				}
			} catch (error) {
				console.error("Failed to load notification:", error);
				pushNotificationDiagnostic("action.window.load.error", "failed to load notification payload", {
					error: error instanceof Error ? error.message : String(error),
				});
				await closeSelf();
			}
		};

		loadNotification();
	}, []);

	useEffect(() => {
		const loadBreakSuggestions = async () => {
			if (!notification || !isBreakNotification(notification)) {
				setBreakSuggestions([]);
				setBreakSuggestionContext(null);
				return;
			}
			const breakMinutes = parseBreakMinutes(notification);
			let fatigueLevel: BreakFatigueLevel = "medium";
			let tasks: any[];
			let tasksResult: any[];
			try {
				tasksResult = await invoke<any[]>("cmd_task_list");
				tasks = tasksResult !== null && tasksResult !== undefined ? tasksResult : [];
				const pressure = estimatePressureValue(tasks);
				if (pressure >= 70) fatigueLevel = "high";
				else if (pressure <= 35) fatigueLevel = "low";
			} catch {
				fatigueLevel = "medium";
			}
			const suggestions = getBreakActivitySuggestions({
				breakMinutes,
				fatigueLevel,
				limit: 3,
			});
			setBreakSuggestionContext({ breakMinutes, fatigueLevel });
			setBreakSuggestions(suggestions);
		};
		void loadBreakSuggestions();
	}, [notification]);

	
	useEffect(() => {
		const loadBreakDebt = async () => {
			if (!notification || !isBreakNotification(notification)) {
				setEffectiveBreakMinutes(null);
				setBreakDebtBalanceMinutes(loadBreakDebtState().balanceMinutes);
				return;
			}

			const scheduledBreakMinutes = parseBreakMinutes(notification);
			const repaid = applyBreakRepayment(loadBreakDebtState(), {
				scheduledBreakMinutes,
				maxBreakMinutes: BREAK_DEBT_MAX_BREAK_MINUTES,
			});
			saveBreakDebtState(repaid.state);
			setBreakDebtBalanceMinutes(repaid.state.balanceMinutes);
			setEffectiveBreakMinutes(repaid.nextBreakMinutes);
		};
		void loadBreakDebt();
	}, [notification]);

	const handleBreakSuggestionSelect = (activityId: string) => {
		recordBreakActivityFeedback(activityId, "selected");
		if (!breakSuggestionContext) return;
		const suggestions = getBreakActivitySuggestions({
			breakMinutes: breakSuggestionContext.breakMinutes,
			fatigueLevel: breakSuggestionContext.fatigueLevel,
			limit: 3,
		});
		setBreakSuggestions(suggestions);
	};

	// Handle button click
	const handleAction = async (button: NotificationButton) => {
		if (isProcessing) return;

		setIsProcessing(true);
		setErrorMessage(null);

		try {
			const action = button.action;

			// Handle string actions (Rust serde unit variants serialize as strings)
			if (action === "dismiss") {
				recordNudgeOutcome("dismissed");
				try {
					await invoke("cmd_clear_action_notification");
				} catch (clearError) {
					console.error("Failed to clear notification before dismiss:", clearError);
				}
				await closeSelf();
				return;
			}

			const criticalPromptKey = getCriticalStartPromptKey(notification);
			if (criticalPromptKey) {
				if ("start_task" in action) {
					acknowledgePrompt(criticalPromptKey);
				} else if ("start_later_pick" in action || "dismiss" in action) {
					markPromptIgnored(criticalPromptKey, "modal");
				}
			}
			const isBreak = notification ? isBreakNotification(notification) : false;
			const scheduledBreakMinutes = notification ? parseBreakMinutes(notification) : 0;
			
			if ('complete' in action) {
				if (isBreak) {
					const decayed = decayBreakDebt(loadBreakDebtState(), {
						compliantCycles: 1,
						decayMinutesPerCycle: BREAK_DEBT_DECAY_PER_COMPLIANT_CYCLE,
					});
					saveBreakDebtState(decayed);
					setBreakDebtBalanceMinutes(decayed.balanceMinutes);
				}
				await invoke("cmd_timer_complete");
			} else if ('extend' in action) {
				if (isBreak) {
					const next = accrueBreakDebt(loadBreakDebtState(), {
						deferredMinutes: Math.max(1, scheduledBreakMinutes),
						reason: "snooze",
					});
					saveBreakDebtState(next);
					setBreakDebtBalanceMinutes(next.balanceMinutes);
				}
				await invoke("cmd_timer_extend", { minutes: action.extend.minutes });
			} else if ('pause' in action) {
				await invoke("cmd_timer_pause");
			} else if ('resume' in action) {
				await invoke("cmd_timer_resume");
			} else if ('skip' in action) {
				if (isBreak) {
					const next = accrueBreakDebt(loadBreakDebtState(), {
						deferredMinutes: Math.max(1, scheduledBreakMinutes),
						reason: "skip",
					});
					saveBreakDebtState(next);
					setBreakDebtBalanceMinutes(next.balanceMinutes);
				}
				await invoke("cmd_timer_skip");
			} else if ('start_next' in action) {
				await invoke("cmd_timer_start", { step: null, task_id: null, project_id: null });
			} else if ('start_task' in action) {
				if (action.start_task.mismatchDecision) {
					trackEnergyMismatchFeedback(action.start_task.mismatchDecision);
					if (action.start_task.mismatchDecision === "rejected") {
						recordLowEnergyQueueFeedback(action.start_task.id, "accepted");
					}
				}

				if (action.start_task.resume) {
					await invoke("cmd_task_resume", { id: action.start_task.id });
				} else {
					if (!action.start_task.ignoreEnergyMismatch) {
						const [rawTask, rawTasks] = await Promise.all([
							invoke<any>("cmd_task_get", { id: action.start_task.id }),
							invoke<any[]>("cmd_task_list"),
						]);

						if (rawTask) {
							const pressureValue = estimatePressureValue(rawTasks ?? []);
							const targetTask = toEnergyMismatchTask(rawTask);
							const mismatch = evaluateTaskEnergyMismatch(targetTask, { pressureValue });

							if (mismatch.shouldWarn) {
								const normalizedTasks = (rawTasks ?? []).map(toEnergyMismatchTask);
								const lowEnergyQueue = buildLowEnergyFallbackQueue(
									normalizedTasks,
									{ pressureValue },
									3,
								).filter((entry) => entry.task.id !== targetTask.id);
								const alternatives = shouldTriggerLowEnergySuggestion({
									pressureValue,
									mismatchScore: mismatch.score,
									currentCapacity: mismatch.currentCapacity,
								})
									? lowEnergyQueue.map((entry) => ({
										task: entry.task,
										label: `低エネルギー候補: ${entry.task.title}`,
										action: createLowEnergyStartAction(entry),
									}))
									: rankAlternativeTasks(
										normalizedTasks,
										targetTask.id,
										{ pressureValue },
										3,
									)
										.filter((candidate) => candidate.actionable)
										.map((candidate) => ({
											task: candidate.task,
											label: `代替: ${candidate.task.title}`,
											action: {
												start_task: {
													id: candidate.task.id,
													resume: false,
													ignoreEnergyMismatch: false,
													mismatchDecision: "rejected" as const,
												},
											},
										}));
								const alternativeButtons: NotificationButton[] = alternatives.map((candidate) => ({
									label: candidate.label,
									action: candidate.action,
								}));
								const warningButtons: NotificationButton[] = [
									{
										label: "このまま開始",
										action: {
											start_task: {
												id: targetTask.id,
												resume: false,
												ignoreEnergyMismatch: true,
												mismatchDecision: "accepted",
											},
										},
									},
									...alternativeButtons,
									{ label: "キャンセル", action: { dismiss: null } },
								];

								const reasonSummary = mismatch.reasons.slice(0, 2).join(" / ");
								setNotification({
									title: "エネルギーミスマッチ警告",
									message: `${targetTask.title} は現在の状態とミスマッチの可能性があります（${mismatch.score}/${mismatch.threshold}）。${reasonSummary || "短いタスクまたは代替を推奨します。"}${targetTask.requiredMinutes && targetTask.requiredMinutes > mismatch.suggestedSegmentMinutes ? ` まずは${mismatch.suggestedSegmentMinutes}分の短いセグメント推奨。` : ""}`,
									buttons: warningButtons.slice(0, 5),
								});
								setIsProcessing(false);
								return;
							}
						}
					}

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

				const candidates = buildDeferCandidates({ nowMs, durationMs, nextScheduledMs });

				// Show reason selection step first
				setDeferReasonStep({
					taskId: task.id,
					taskTitle: task.title,
					candidates,
				});
				setNotification({
					title: "延期理由",
					message: `${task.title} を延期する理由を選択`,
					buttons: [
						...DEFER_REASON_TEMPLATES.slice(0, 4).map((r) => ({
							label: r.label,
							action: { defer_with_reason: { reasonId: r.id } },
						})),
						{ label: "その他の理由...", action: { defer_with_reason: { reasonId: "other" } } },
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
				const reason = deferReasonStep;
				await invoke("cmd_task_defer_until", {
					id: action.defer_task_until.id,
					deferUntil: action.defer_task_until.defer_until,
					reasonId: reason?.reasonId ?? null,
					reasonLabel: reason?.reasonLabel ?? null,
				});
				// Record defer reason if available
				if (reason) {
					storeDeferReason({
						taskId: reason.taskId,
						reasonId: "other", // Default when going direct to time selection
						reasonLabel: "直接時刻選択",
						timestamp: new Date().toISOString(),
						deferredUntil: action.defer_task_until.defer_until,
					});
				}
			} else if ('defer_with_reason' in action) {
				// User selected a reason, now show time candidates
				const reasonId = action.defer_with_reason.reasonId;
				const reasonTemplate = DEFER_REASON_TEMPLATES.find((r) => r.id === reasonId);
				const step = deferReasonStep;

				if (!step) {
					setIsProcessing(false);
					return;
				}

				setNotification({
					title: "開始を先送り",
					message: `${step.taskTitle} をいつ開始しますか (理由: ${reasonTemplate?.label || reasonId})`,
					buttons: [
						...step.candidates.map((c) => ({
							label: `${c.reason} (${toTimeLabel(c.iso)})`,
							action: {
								defer_task_with_reason: {
									id: step.taskId,
									defer_until: c.iso,
									reasonId,
									reasonLabel: reasonTemplate?.label || reasonId,
								},
							},
						})),
						{ label: "キャンセル", action: { dismiss: null } },
					],
				});
				setIsProcessing(false);
				return;
			} else if ('defer_task_with_reason' in action) {
				await invoke("cmd_task_defer_until", {
					id: action.defer_task_with_reason.id,
					deferUntil: action.defer_task_with_reason.defer_until,
					reasonId: action.defer_task_with_reason.reasonId,
					reasonLabel: action.defer_task_with_reason.reasonLabel,
				});
				// Record defer reason
				storeDeferReason({
					taskId: action.defer_task_with_reason.id,
					reasonId: action.defer_task_with_reason.reasonId,
					reasonLabel: action.defer_task_with_reason.reasonLabel,
					timestamp: new Date().toISOString(),
					deferredUntil: action.defer_task_with_reason.defer_until,
				});
			} else if ('delete_task' in action) {
				await invoke("cmd_task_delete", { id: action.delete_task.id });
			} else if ('interrupt_task' in action) {
				await invoke("cmd_task_interrupt", {
					id: action.interrupt_task.id,
					resumeAt: action.interrupt_task.resume_at,
				});
			} else if ('dismiss' in action) {
				// Handle object form { dismiss: null }
				recordNudgeOutcome("dismissed");
				try {
					await invoke("cmd_clear_action_notification");
				} catch (clearError) {
					console.error("Failed to clear notification before dismiss:", clearError);
				}
				await closeSelf();
				return;
			}

			recordNudgeOutcome("accepted");

			// Small delay to ensure database transaction is committed
			await new Promise(resolve => setTimeout(resolve, 100));

			// Dispatch task refresh event so other windows update
			if (typeof window !== "undefined") {
				window.dispatchEvent(new CustomEvent("tasks:refresh"));
				window.dispatchEvent(new CustomEvent("guidance-refresh"));
			}

			// Also dispatch Tauri event for cross-window communication
			try {
				await emit("tasks:refresh");
			} catch {
				// Ignore if Tauri event emit fails
			}

			try {
				await invoke("cmd_clear_action_notification");
			} catch (clearError) {
				console.error("Failed to clear notification:", clearError);
			}

			// Close window after action
			await closeSelf();
		} catch (error) {
			let errorMsg: string;
			if (error instanceof Error) {
				errorMsg = error.message;
			} else {
				errorMsg = String(error);
			}
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
			{/* Row 1: Icon + Title + Message */}
			<div className="flex items-center gap-2">
				<Icon name={errorMessage ? "error" : "check_circle"} size={28} color={errorMessage ? "var(--md-ref-color-error)" : "var(--md-ref-color-primary)"} className="flex-shrink-0" />
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

			{breakSuggestions.length > 0 && (
				<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-2 space-y-2">
					<div className="text-[11px] font-medium text-[var(--md-ref-color-on-surface-variant)]">
						休憩アクティビティ提案
					</div>
					<div className="space-y-1">
						{breakSuggestions.map((activity) => (
							<div
								key={activity.id}
								className="flex items-center justify-between gap-2 rounded-md bg-[var(--md-ref-color-surface-container)] px-2 py-1"
							>
								<div className="min-w-0">
									<div className="text-xs font-medium truncate">{activity.title}</div>
									<div className="text-[11px] text-[var(--md-ref-color-on-surface-variant)] truncate">
										{activity.description}
									</div>
								</div>
								<Button
									size="small"
									variant="tonal"
									disabled={isProcessing}
									onClick={() => handleBreakSuggestionSelect(activity.id)}
									className="text-[11px]"
								>
									採用
								</Button>
							</div>
						))}
					</div>
				</div>
			)}

			{isBreakNotification(notification) && (
				<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] px-2 py-1 text-[11px] text-[var(--md-ref-color-on-surface-variant)]">
					休憩負債: <span className="font-semibold text-[var(--md-ref-color-on-surface)]">{breakDebtBalanceMinutes}分</span>
					{effectiveBreakMinutes != null && (
						<span className="ml-2">今回の推奨休憩: {effectiveBreakMinutes}分 (max {BREAK_DEBT_MAX_BREAK_MINUTES}分)</span>
					)}
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

export default ActionNotificationView;


