import type { Task, NextTaskCandidate, BreakSuggestion } from "../types";
import * as storage from "./storage";

export async function getNextTaskCandidate(): Promise<NextTaskCandidate | null> {
	const readyTasks = await storage.getTasksByState("READY");

	if (readyTasks.length === 0) {
		return null;
	}

	const candidates = readyTasks.map((task) => ({
		task,
		score: calculatePriorityScore(task),
		reasons: generateReasons(task),
	}));

	candidates.sort((a, b) => b.score - a.score);

	return candidates[0];
}

function calculatePriorityScore(task: Task): number {
	let score = task.priority * 10;

	if (task.dueDate) {
		const due = new Date(task.dueDate);
		const now = new Date();
		const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (daysUntilDue < 0) {
			score += 100;
		} else if (daysUntilDue <= 1) {
			score += 50;
		} else if (daysUntilDue <= 3) {
			score += 20;
		}
	}

	if (task.estimatedMinutes && task.estimatedMinutes <= 25) {
		score += 5;
	}

	return score;
}

function generateReasons(task: Task): string[] {
	const reasons: string[] = [];

	if (task.priority >= 8) {
		reasons.push("高優先度");
	}

	if (task.dueDate) {
		const due = new Date(task.dueDate);
		const now = new Date();
		const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (daysUntilDue < 0) {
			reasons.push("期限超過");
		} else if (daysUntilDue <= 1) {
			reasons.push("期限間近");
		}
	}

	if (task.estimatedMinutes && task.estimatedMinutes <= 25) {
		reasons.push("ポモドーロサイズ");
	}

	return reasons;
}

export function getBreakSuggestion(elapsedMinutes: number): BreakSuggestion | null {
	if (elapsedMinutes < 25) {
		return null;
	}

	const cycle = Math.floor(elapsedMinutes / 25);

	if (cycle % 4 === 0 && cycle > 0) {
		return {
			id: `break_${Date.now()}`,
			title: "長休憩",
			durationMinutes: 15,
			reason: "4ポモドーロ完了 - 長めの休憩を取りましょう",
		};
	}

	return {
		id: `break_${Date.now()}`,
		title: "短休憩",
		durationMinutes: 5,
		reason: "1ポモドーロ完了 - 短い休憩を取りましょう",
	};
}

export async function startTask(taskId: string): Promise<Task | null> {
	const task = await storage.getTaskById(taskId);
	if (!task || task.state !== "READY") {
		return null;
	}

	return storage.updateTask(taskId, { state: "RUNNING" });
}

export async function pauseTask(taskId: string): Promise<Task | null> {
	const task = await storage.getTaskById(taskId);
	if (!task || task.state !== "RUNNING") {
		return null;
	}

	return storage.updateTask(taskId, { state: "PAUSED" });
}

export async function completeTask(taskId: string): Promise<Task | null> {
	const task = await storage.getTaskById(taskId);
	if (!task || (task.state !== "RUNNING" && task.state !== "PAUSED")) {
		return null;
	}

	return storage.updateTask(taskId, { state: "DONE" });
}

export async function addElapsedMinutes(taskId: string, minutes: number): Promise<Task | null> {
	const task = await storage.getTaskById(taskId);
	if (!task) {
		return null;
	}

	return storage.updateTask(taskId, {
		elapsedMinutes: task.elapsedMinutes + minutes,
	});
}

export { storage };
