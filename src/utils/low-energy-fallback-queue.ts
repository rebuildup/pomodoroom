import type { EnergyLevel } from "@/types/task";

export interface LowEnergyTaskLike {
	id: string;
	title: string;
	energy: EnergyLevel;
	requiredMinutes?: number | null;
	priority?: number | null;
	state?: string;
	tags?: readonly string[];
}

export interface LowEnergyQueueEntry {
	task: LowEnergyTaskLike;
	score: number;
	reason: string;
	actionable: boolean;
}

export interface LowEnergyQueueContext {
	pressureValue: number;
}

export type LowEnergyStartAction = {
	start_task: {
		id: string;
		resume: boolean;
		ignoreEnergyMismatch: boolean;
		mismatchDecision: "rejected";
	};
};

const FEEDBACK_KEY = "low_energy_queue_feedback";

function getRequiredMinutes(task: LowEnergyTaskLike): number {
	const raw = task.requiredMinutes ?? 25;
	return Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 25;
}

function isEligibleLowEnergyTask(task: LowEnergyTaskLike): boolean {
	const tags = task.tags ?? [];
	const requiredMinutes = getRequiredMinutes(task);
	return (
		task.energy === "low" ||
		requiredMinutes <= 30 ||
		tags.includes("quick") ||
		tags.includes("admin") ||
		tags.includes("recovery-mode") ||
		tags.includes("light") ||
		tags.includes("chore")
	);
}

interface FeedbackRecord {
	accepted: number;
	rejected: number;
}

function readFeedbackMap(): Record<string, FeedbackRecord> {
	if (typeof window === "undefined" || !window.localStorage) return {};
	try {
		const parsed = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) ?? "{}");
		if (!parsed || typeof parsed !== "object") return {};
		return parsed as Record<string, FeedbackRecord>;
	} catch {
		return {};
	}
}

function writeFeedbackMap(map: Record<string, FeedbackRecord>): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(map));
}

export function recordLowEnergyQueueFeedback(taskId: string, decision: "accepted" | "rejected"): void {
	const map = readFeedbackMap();
	const current = map[taskId] ?? { accepted: 0, rejected: 0 };
	if (decision === "accepted") current.accepted += 1;
	else current.rejected += 1;
	map[taskId] = current;
	writeFeedbackMap(map);
}

export function buildLowEnergyFallbackQueue(
	tasks: readonly LowEnergyTaskLike[],
	context: LowEnergyQueueContext,
	limit: number = 3,
): LowEnergyQueueEntry[] {
	const feedback = readFeedbackMap();
	const candidates = tasks
		.filter((task) => task.state === undefined || task.state === "READY" || task.state === "PAUSED")
		.filter((task) => isEligibleLowEnergyTask(task))
		.map((task) => {
			const requiredMinutes = getRequiredMinutes(task);
			const feedbackScore = (feedback[task.id]?.accepted ?? 0) * 16 - (feedback[task.id]?.rejected ?? 0) * 10;
			const energyPenalty = task.energy === "low" ? 0 : task.energy === "medium" ? 15 : 40;
			const durationPenalty = requiredMinutes <= 20 ? 0 : requiredMinutes <= 30 ? 8 : requiredMinutes <= 45 ? 20 : 35;
			const pressurePenalty = context.pressureValue >= 70 ? (task.energy === "low" ? 0 : 15) : 0;
			const priorityBonus = Math.max(-8, Math.min(8, Math.round(((task.priority ?? 50) - 50) / 6)));
			const score = Math.max(
				0,
				Math.min(100, Math.round(100 - energyPenalty - durationPenalty - pressurePenalty + priorityBonus + feedbackScore)),
			);
			const reason = feedbackScore > 0
				? "Preferred from past accepted low-energy suggestions"
				: requiredMinutes <= 20
					? "Short low-cognitive task"
					: "Fits low-energy fallback context";
			return {
				task,
				score,
				reason,
				actionable: true,
			};
		})
		.sort((a, b) => b.score - a.score);

	return candidates.slice(0, Math.max(1, limit));
}

export function createLowEnergyStartAction(entry: LowEnergyQueueEntry): LowEnergyStartAction {
	return {
		start_task: {
			id: entry.task.id,
			resume: entry.task.state === "PAUSED",
			ignoreEnergyMismatch: false,
			mismatchDecision: "rejected",
		},
	};
}

export function shouldTriggerLowEnergySuggestion(input: {
	pressureValue: number;
	mismatchScore?: number;
	currentCapacity?: EnergyLevel;
}): boolean {
	if (input.currentCapacity === "low") return true;
	if (input.pressureValue >= 70) return true;
	if ((input.mismatchScore ?? 0) >= 65) return true;
	return false;
}

export function __resetLowEnergyQueueFeedbackForTests(): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	window.localStorage.removeItem(FEEDBACK_KEY);
}
