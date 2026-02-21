import type { EnergyLevel } from "@/types/task";

export interface EnergyMismatchTaskLike {
	id: string;
	title: string;
	energy: EnergyLevel;
	requiredMinutes?: number | null;
	priority?: number | null;
	state?: string;
	tags?: string[];
}

export interface EnergyMismatchContext {
	pressureValue: number;
	now?: Date;
	threshold?: number;
}

export interface EnergyMismatchEvaluation {
	shouldWarn: boolean;
	score: number;
	threshold: number;
	reasons: string[];
	suggestedSegmentMinutes: number;
	currentCapacity: EnergyLevel;
}

export interface RankedAlternative {
	task: EnergyMismatchTaskLike;
	score: number;
	actionable: boolean;
	reason: string;
}

type FeedbackDecision = "accepted" | "rejected";

const DEFAULT_THRESHOLD = 60;

function energyToIndex(level: EnergyLevel): number {
	switch (level) {
		case "low":
			return 0;
		case "medium":
			return 1;
		case "high":
			return 2;
	}
}

function getRequiredMinutes(task: EnergyMismatchTaskLike): number {
	const raw = task.requiredMinutes ?? 25;
	return Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : 25;
}

export function inferCurrentCapacity(pressureValue: number, now: Date = new Date()): EnergyLevel {
	const hour = now.getHours();

	if (pressureValue >= 80) return "low";
	if (pressureValue >= 60) return hour >= 18 ? "low" : "medium";
	if (hour >= 22 || hour < 7) return "low";
	if (hour >= 9 && hour < 12 && pressureValue <= 35) return "high";
	if (hour >= 13 && hour < 17 && pressureValue <= 45) return "high";
	return "medium";
}

export function evaluateTaskEnergyMismatch(
	task: EnergyMismatchTaskLike,
	context: EnergyMismatchContext,
): EnergyMismatchEvaluation {
	const now = context.now ?? new Date();
	const threshold = context.threshold ?? DEFAULT_THRESHOLD;
	const requiredMinutes = getRequiredMinutes(task);
	const currentCapacity = inferCurrentCapacity(context.pressureValue, now);
	const demand = energyToIndex(task.energy);
	const capacity = energyToIndex(currentCapacity);
	const gap = Math.max(0, demand - capacity);
	const reasons: string[] = [];
	let score = 0;

	if (gap > 0) {
		score += gap * 35;
		reasons.push(`Energy gap: task=${task.energy}, current=${currentCapacity}`);
	}

	if (context.pressureValue >= 70 && task.energy !== "low") {
		score += 20;
		reasons.push(`High pressure (${context.pressureValue}) vs non-low task`);
	} else if (context.pressureValue >= 50 && task.energy === "high") {
		score += 12;
		reasons.push(`Moderate pressure (${context.pressureValue}) with high-energy task`);
	}

	const hour = now.getHours();
	if ((hour >= 21 || hour < 7) && task.energy === "high") {
		score += 20;
		reasons.push("Late-night high-energy task");
	} else if ((hour >= 22 || hour < 6) && task.energy === "medium") {
		score += 10;
		reasons.push("Late-night medium-energy task");
	}

	if (requiredMinutes >= 60 && currentCapacity === "low") {
		score += 15;
		reasons.push(`Long session (${requiredMinutes}m) in low capacity`);
	} else if (requiredMinutes >= 90) {
		score += 8;
		reasons.push(`Very long session (${requiredMinutes}m)`);
	}

	if (task.tags?.includes("quick") && requiredMinutes <= 20) {
		score -= 8;
	}

	const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
	const suggestedSegmentMinutes = currentCapacity === "low" ? 20 : currentCapacity === "medium" ? 35 : 50;

	return {
		shouldWarn: clampedScore >= threshold,
		score: clampedScore,
		threshold,
		reasons,
		suggestedSegmentMinutes,
		currentCapacity,
	};
}

export function rankAlternativeTasks(
	tasks: readonly EnergyMismatchTaskLike[],
	currentTaskId: string,
	context: EnergyMismatchContext,
	limit: number = 3,
): RankedAlternative[] {
	const scored = tasks
		.filter((task) => task.id !== currentTaskId)
		.filter((task) => task.state === undefined || task.state === "READY" || task.state === "PAUSED")
		.map((task) => {
			const mismatch = evaluateTaskEnergyMismatch(task, context);
			const requiredMinutes = getRequiredMinutes(task);
			const priority = task.priority ?? 50;
			const quickBonus = requiredMinutes <= 25 ? 10 : 0;
			const priorityBonus = Math.max(-10, Math.min(10, Math.round((priority - 50) / 5)));
			const score = Math.max(0, Math.min(100, 100 - mismatch.score + quickBonus + priorityBonus));
			return {
				task,
				score,
				actionable: score >= 45,
				reason: mismatch.shouldWarn
					? `Lower mismatch (${mismatch.score}) than current context`
					: `Good fit for ${mismatch.currentCapacity} capacity now`,
			};
		})
		.sort((a, b) => b.score - a.score);

	return scored.slice(0, Math.max(1, limit));
}

interface FeedbackStats {
	accepted: number;
	rejected: number;
}

function readFeedbackStats(): FeedbackStats {
	// No persistence - database-only architecture
	return { accepted: 0, rejected: 0 };
}

function writeFeedbackStats(_stats: FeedbackStats): void {
	// No-op - database-only architecture
}

export function trackEnergyMismatchFeedback(decision: FeedbackDecision): void {
	const stats = readFeedbackStats();
	if (decision === "accepted") {
		stats.accepted += 1;
	} else {
		stats.rejected += 1;
	}
	writeFeedbackStats(stats);
}

export function getEnergyMismatchFeedbackStats(): {
	accepted: number;
	rejected: number;
	total: number;
	falsePositiveRate: number;
} {
	const stats = readFeedbackStats();
	const total = stats.accepted + stats.rejected;
	const falsePositiveRate = total === 0 ? 0 : stats.rejected / total;
	return {
		accepted: stats.accepted,
		rejected: stats.rejected,
		total,
		falsePositiveRate,
	};
}

export function __resetEnergyMismatchFeedbackForTests(): void {
	// No-op - database-only architecture
}
