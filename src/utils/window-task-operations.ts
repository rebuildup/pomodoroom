import { invoke } from "@tauri-apps/api/core";
import type { Task } from "@/types/task";
import type { TaskOperation } from "@/components/m3/TaskOperations";

function dispatchTaskRefresh() {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent("tasks:refresh"));
}

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

