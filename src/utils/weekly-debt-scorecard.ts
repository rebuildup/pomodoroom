/**
 * Weekly Schedule Debt Scorecard
 *
 * Summarizes debt from deferred tasks, skipped breaks, and overrun blocks.
 * Provides a unified debt score with trend analysis and action suggestions.
 */

export interface DebtComponent {
	category: "deferred_tasks" | "skipped_breaks" | "overrun_blocks" | "late_starts";
	minutes: number;
	count: number;
	weight: number;
	contribution: number;
}

export interface WeeklyDebtSnapshot {
	weekStart: string;
	weekEnd: string;
	totalScore: number;
	maxScore: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	components: DebtComponent[];
	trendDirection: "improving" | "stable" | "worsening";
	trendChange: number;
}

export interface DebtScorecardInput {
	deferredTaskMinutes: number;
	deferredTaskCount: number;
	skippedBreakMinutes: number;
	skippedBreakCount: number;
	overrunMinutes: number;
	overrunCount: number;
	lateStartMinutes: number;
	lateStartCount: number;
	previousScore?: number;
}

export interface DebtActionSuggestion {
	priority: number;
	action: string;
	category: DebtComponent["category"];
	estimatedReduction: number;
	deepLink?: string;
}

const COMPONENT_WEIGHTS: Record<DebtComponent["category"], number> = {
	deferred_tasks: 1.0,
	skipped_breaks: 1.2,
	overrun_blocks: 0.8,
	late_starts: 0.5,
};

const RISK_THRESHOLDS = {
	low: 30,
	medium: 60,
	high: 90,
	critical: Infinity,
};

const STORAGE_KEY = "pomodoroom-weekly-debt-history-v1";
const MAX_HISTORY_WEEKS = 12;

function getWeekStart(date: Date = new Date()): string {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1);
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d.toISOString();
}

function getWeekEnd(weekStart: string): string {
	const start = new Date(weekStart);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	end.setHours(23, 59, 59, 999);
	return end.toISOString();
}

export function calculateDebtScore(input: DebtScorecardInput): number {
	const deferredScore = input.deferredTaskMinutes * COMPONENT_WEIGHTS.deferred_tasks;
	const breakScore = input.skippedBreakMinutes * COMPONENT_WEIGHTS.skipped_breaks;
	const overrunScore = input.overrunMinutes * COMPONENT_WEIGHTS.overrun_blocks;
	const lateScore = input.lateStartMinutes * COMPONENT_WEIGHTS.late_starts;

	return Math.round(deferredScore + breakScore + overrunScore + lateScore);
}

export function getRiskLevel(score: number): WeeklyDebtSnapshot["riskLevel"] {
	if (score < RISK_THRESHOLDS.low) return "low";
	if (score < RISK_THRESHOLDS.medium) return "medium";
	if (score < RISK_THRESHOLDS.high) return "high";
	return "critical";
}

export function calculateTrendDirection(
	currentScore: number,
	previousScore?: number,
): { direction: WeeklyDebtSnapshot["trendDirection"]; change: number } {
	if (previousScore === undefined || previousScore === null) {
		return { direction: "stable", change: 0 };
	}

	const change = currentScore - previousScore;
	const percentageChange = previousScore > 0 ? (change / previousScore) * 100 : 0;

	if (percentageChange < -10) {
		return { direction: "improving", change };
	}
	if (percentageChange > 10) {
		return { direction: "worsening", change };
	}
	return { direction: "stable", change };
}

export function buildDebtComponents(input: DebtScorecardInput): DebtComponent[] {
	const components: DebtComponent[] = [];

	if (input.deferredTaskMinutes > 0 || input.deferredTaskCount > 0) {
		const weight = COMPONENT_WEIGHTS.deferred_tasks;
		const contribution = input.deferredTaskMinutes * weight;
		components.push({
			category: "deferred_tasks",
			minutes: input.deferredTaskMinutes,
			count: input.deferredTaskCount,
			weight,
			contribution,
		});
	}

	if (input.skippedBreakMinutes > 0 || input.skippedBreakCount > 0) {
		const weight = COMPONENT_WEIGHTS.skipped_breaks;
		const contribution = input.skippedBreakMinutes * weight;
		components.push({
			category: "skipped_breaks",
			minutes: input.skippedBreakMinutes,
			count: input.skippedBreakCount,
			weight,
			contribution,
		});
	}

	if (input.overrunMinutes > 0 || input.overrunCount > 0) {
		const weight = COMPONENT_WEIGHTS.overrun_blocks;
		const contribution = input.overrunMinutes * weight;
		components.push({
			category: "overrun_blocks",
			minutes: input.overrunMinutes,
			count: input.overrunCount,
			weight,
			contribution,
		});
	}

	if (input.lateStartMinutes > 0 || input.lateStartCount > 0) {
		const weight = COMPONENT_WEIGHTS.late_starts;
		const contribution = input.lateStartMinutes * weight;
		components.push({
			category: "late_starts",
			minutes: input.lateStartMinutes,
			count: input.lateStartCount,
			weight,
			contribution,
		});
	}

	return components.sort((a, b) => b.contribution - a.contribution);
}

export function generateDebtScorecard(input: DebtScorecardInput): WeeklyDebtSnapshot {
	const totalScore = calculateDebtScore(input);
	const components = buildDebtComponents(input);
	const { direction, change } = calculateTrendDirection(totalScore, input.previousScore);

	return {
		weekStart: getWeekStart(),
		weekEnd: getWeekEnd(getWeekStart()),
		totalScore,
		maxScore: 150,
		riskLevel: getRiskLevel(totalScore),
		components,
		trendDirection: direction,
		trendChange: change,
	};
}

export function suggestDebtActions(scorecard: WeeklyDebtSnapshot): DebtActionSuggestion[] {
	const suggestions: DebtActionSuggestion[] = [];

	// Sort components by contribution
	const sortedComponents = [...scorecard.components].sort(
		(a, b) => b.contribution - a.contribution,
	);

	for (const component of sortedComponents.slice(0, 3)) {
		switch (component.category) {
			case "deferred_tasks":
				suggestions.push({
					priority: suggestions.length + 1,
					action: "Review deferred tasks and reschedule top 3",
					category: component.category,
					estimatedReduction: Math.round(component.contribution * 0.4),
					deepLink: "focus://tasks?filter=deferred",
				});
				break;
			case "skipped_breaks":
				suggestions.push({
					priority: suggestions.length + 1,
					action: "Take a recovery break this session",
					category: component.category,
					estimatedReduction: Math.round(component.contribution * 0.3),
					deepLink: "focus://timer?action=break",
				});
				break;
			case "overrun_blocks":
				suggestions.push({
					priority: suggestions.length + 1,
					action: "Split long tasks into smaller segments",
					category: component.category,
					estimatedReduction: Math.round(component.contribution * 0.25),
					deepLink: "focus://tasks?action=split",
				});
				break;
			case "late_starts":
				suggestions.push({
					priority: suggestions.length + 1,
					action: "Set earlier start reminders",
					category: component.category,
					estimatedReduction: Math.round(component.contribution * 0.2),
					deepLink: "focus://settings?section=notifications",
				});
				break;
		}
	}

	return suggestions.slice(0, 3);
}

// Historical tracking for trend analysis
interface DebtHistoryEntry {
	weekStart: string;
	score: number;
	riskLevel: WeeklyDebtSnapshot["riskLevel"];
}

export function loadDebtHistory(): DebtHistoryEntry[] {
	try {
		if (typeof window === "undefined" || !window.localStorage) return [];
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as DebtHistoryEntry[];
		if (!Array.isArray(parsed)) return [];
		return parsed.slice(-MAX_HISTORY_WEEKS);
	} catch {
		return [];
	}
}

export function saveDebtHistory(history: DebtHistoryEntry[]): void {
	if (typeof window === "undefined" || !window.localStorage) return;
	const trimmed = history.slice(-MAX_HISTORY_WEEKS);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function recordWeeklyDebt(scorecard: WeeklyDebtSnapshot): void {
	const history = loadDebtHistory();
	const existingIndex = history.findIndex((h) => h.weekStart === scorecard.weekStart);

	const entry: DebtHistoryEntry = {
		weekStart: scorecard.weekStart,
		score: scorecard.totalScore,
		riskLevel: scorecard.riskLevel,
	};

	if (existingIndex >= 0) {
		history[existingIndex] = entry;
	} else {
		history.push(entry);
	}

	saveDebtHistory(history);
}

export function getPreviousWeekScore(): number | undefined {
	const history = loadDebtHistory();
	if (history.length < 2) return undefined;

	const currentWeekStart = getWeekStart();
	const currentIndex = history.findIndex((h) => h.weekStart === currentWeekStart);

	if (currentIndex > 0) {
		return history[currentIndex - 1].score;
	}
	if (currentIndex === -1 && history.length > 0) {
		return history[history.length - 1].score;
	}

	return undefined;
}

export function getDebtTrendWeeks(weeks: number = 4): DebtHistoryEntry[] {
	const history = loadDebtHistory();
	return history.slice(-weeks);
}

export function formatDebtScorecardSummary(scorecard: WeeklyDebtSnapshot): string {
	const lines: string[] = [
		`Weekly Debt Score: ${scorecard.totalScore}/${scorecard.maxScore} (${scorecard.riskLevel.toUpperCase()})`,
		`Trend: ${scorecard.trendDirection} (${scorecard.trendChange >= 0 ? "+" : ""}${scorecard.trendChange})`,
		"",
		"Debt Breakdown:",
	];

	for (const component of scorecard.components) {
		const pct = ((component.contribution / scorecard.totalScore) * 100).toFixed(1);
		lines.push(
			`  - ${component.category.replace("_", " ")}: ${component.minutes}min (${component.count}x) = ${pct}%`,
		);
	}

	return lines.join("\n");
}

export function __resetDebtHistoryForTests(): void {
	if (typeof window !== "undefined" && window.localStorage) {
		localStorage.removeItem(STORAGE_KEY);
	}
}
