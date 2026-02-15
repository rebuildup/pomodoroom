import { invoke } from "@tauri-apps/api/core";
import type { Task } from "@/types/task";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import {
	evaluateTaskEnergyMismatch,
	rankAlternativeTasks,
	type EnergyMismatchTaskLike,
} from "@/utils/task-energy-mismatch";

function dispatchTaskRefresh() {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent("tasks:refresh"));
}

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

export async function runWindowTaskOperation(
	task: Task | undefined,
	operation: TaskOperation,
): Promise<void> {
	if (!task) return;

	switch (operation) {
		case "start": {
			if (task.state === "PAUSED") {
				await invoke("cmd_task_resume", { id: task.id });
			} else {
				const rawTasks = await invoke<any[]>("cmd_task_list");
				const pressureValue = estimatePressureValue(rawTasks ?? []);
				const target = toEnergyMismatchTask(task);
				const mismatch = evaluateTaskEnergyMismatch(target, { pressureValue });
				if (mismatch.shouldWarn) {
					const alternatives = rankAlternativeTasks(
						(rawTasks ?? []).map(toEnergyMismatchTask),
						target.id,
						{ pressureValue },
						3,
					).filter((candidate) => candidate.actionable);

					await invoke("cmd_show_action_notification", {
						notification: {
							title: "エネルギーミスマッチ警告",
							message: `${target.title} は現在の状態とミスマッチの可能性があります（${mismatch.score}/${mismatch.threshold}）。`,
							buttons: [
								{
									label: "このまま開始",
									action: {
										start_task: {
											id: target.id,
											resume: false,
											ignoreEnergyMismatch: true,
											mismatchDecision: "accepted",
										},
									},
								},
								...alternatives.map((candidate) => ({
									label: `代替: ${candidate.task.title}`,
									action: {
										start_task: {
											id: candidate.task.id,
											resume: false,
											ignoreEnergyMismatch: false,
											mismatchDecision: "rejected",
										},
									},
								})),
								{ label: "キャンセル", action: { dismiss: null } },
							].slice(0, 5),
						},
					});
					return;
				}

				await invoke("cmd_task_start", { id: task.id });
			}
			break;
		}
		case "resume":
			await invoke("cmd_task_resume", { id: task.id });
			break;
		case "pause":
			await invoke("cmd_task_pause", { id: task.id });
			break;
		case "complete":
			await invoke("cmd_task_complete", { id: task.id });
			break;
		case "extend":
			await invoke("cmd_task_extend", { id: task.id, minutes: 15 });
			break;
		case "postpone":
		case "defer":
			await invoke("cmd_task_postpone", { id: task.id });
			break;
		case "delete":
			await invoke("cmd_task_delete", { id: task.id });
			break;
	}

	dispatchTaskRefresh();
}

