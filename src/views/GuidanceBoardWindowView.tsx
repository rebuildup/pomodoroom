import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { GuidanceBoard } from "@/components/m3/GuidanceBoard";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import { showActionNotification } from "@/hooks/useActionNotification";
import { useTaskStore } from "@/hooks/useTaskStore";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { toCandidateIso, toTimeLabel } from "@/utils/notification-time";
import { selectNextBoardTasks } from "@/utils/next-board-tasks";
import { runWindowTaskOperation } from "@/utils/window-task-operations";

export default function GuidanceBoardWindowView() {
	const taskStore = useTaskStore();
	const timer = useTauriTimer();

	const runningTasks = taskStore.getTasksByState("RUNNING");
	const readyTasks = taskStore.getTasksByState("READY");
	const pausedTasks = taskStore.getTasksByState("PAUSED");

	const nextSlotTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
	const ambientCandidatesList = [...pausedTasks.slice(0, 1), ...readyTasks.slice(0, 1)];
	const ambientCandidates = ambientCandidatesList.map((task) => ({
		...task,
		reason: task.state === "PAUSED" ? "一時停止中" : "候補",
		state: task.state,
		autoScheduledStartAt: task.fixedStartAt ?? task.windowStartAt ?? task.estimatedStartAt ?? nextSlotTime,
	}));

	const nextTasks = selectNextBoardTasks(taskStore.tasks, 3);

	const onTaskOperation = useCallback(
		(taskId: string, operation: TaskOperation) => {
			(async () => {
				const task = taskStore.getTask(taskId);
				try {
					await runWindowTaskOperation(task, operation);
				} catch (error) {
					console.error("[GuidanceBoardWindowView] Task operation failed:", error);
				}
			})();
		},
		[taskStore],
	);

	const onRequestStartNotification = useCallback(
		(taskId: string) => {
			const task = taskStore.getTask(taskId);
			if (!task) return;
			showActionNotification({
				title: "タスク開始",
				message: task.title,
				buttons: [
					{ label: "開始", action: { start_task: { id: task.id, resume: task.state === "PAUSED" } } },
					{ label: "あとで", action: { start_later_pick: { id: task.id } } },
				],
			}).catch((error) => {
				console.error("[GuidanceBoardWindowView] start notification failed:", error);
			});
		},
		[taskStore],
	);

	const onRequestInterruptNotification = useCallback(
		(taskId: string) => {
			const task = taskStore.getTask(taskId);
			if (!task) return;
			const nowMs = Date.now();
			const c15 = toCandidateIso(nowMs + 15 * 60_000);
			const c30 = toCandidateIso(nowMs + 30 * 60_000);
			showActionNotification({
				title: "タスク中断",
				message: `${task.title} の再開時刻を選択してください`,
				buttons: [
					{ label: `15分後 (${toTimeLabel(c15)})`, action: { interrupt_task: { id: task.id, resume_at: c15 } } },
					{ label: `30分後 (${toTimeLabel(c30)})`, action: { interrupt_task: { id: task.id, resume_at: c30 } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			}).catch((error) => {
				console.error("[GuidanceBoardWindowView] interrupt notification failed:", error);
			});
		},
		[taskStore],
	);

	const onRequestPostponeNotification = useCallback(
		(taskId: string) => {
			const task = taskStore.getTask(taskId);
			if (!task) return;
			const nowMs = Date.now();
			const c15 = toCandidateIso(nowMs + 15 * 60_000);
			const c30 = toCandidateIso(nowMs + 30 * 60_000);
			showActionNotification({
				title: "タスク先送り",
				message: `${task.title} をいつに先送りしますか`,
				buttons: [
					{ label: `15分後 (${toTimeLabel(c15)})`, action: { defer_task_until: { id: task.id, defer_until: c15 } } },
					{ label: `30分後 (${toTimeLabel(c30)})`, action: { defer_task_until: { id: task.id, defer_until: c30 } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			}).catch((error) => {
				console.error("[GuidanceBoardWindowView] postpone notification failed:", error);
			});
		},
		[taskStore],
	);

	const onAmbientClick = useCallback(async (taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task) return;
		if (task.state === "PAUSED") {
			await invoke("cmd_task_resume", { id: task.id });
		} else {
			await invoke("cmd_task_start", { id: task.id });
		}
		window.dispatchEvent(new CustomEvent("tasks:refresh"));
	}, [taskStore]);

	return (
		<DetachedWindowShell title="Guidance Board">
			<div className="h-full">
				<GuidanceBoard
					activeTimerRemainingMs={timer.remainingMs}
					activeTimerTotalMs={timer.totalSeconds * 1000}
					isTimerActive={timer.isActive}
					runningTasks={runningTasks}
					ambientCandidates={ambientCandidates}
					onAmbientClick={onAmbientClick}
					onRequestStartNotification={onRequestStartNotification}
					onRequestInterruptNotification={onRequestInterruptNotification}
					onRequestPostponeNotification={onRequestPostponeNotification}
					onOperation={onTaskOperation}
					nextTasks={nextTasks}
				/>
			</div>
		</DetachedWindowShell>
	);
}
