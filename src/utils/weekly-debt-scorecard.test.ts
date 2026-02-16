import { describe, expect, it, beforeEach } from "vitest";
import {
	calculateDebtScore,
	getRiskLevel,
	calculateTrendDirection,
	buildDebtComponents,
	generateDebtScorecard,
	suggestDebtActions,
	loadDebtHistory,
	saveDebtHistory,
	recordWeeklyDebt,
	getPreviousWeekScore,
	__resetDebtHistoryForTests,
	type DebtScorecardInput,
} from "./weekly-debt-scorecard";

describe("calculateDebtScore", () => {
	it("returns 0 for empty input", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 0,
			deferredTaskCount: 0,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		expect(calculateDebtScore(input)).toBe(0);
	});

	it("calculates score with deferred tasks", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 50,
			deferredTaskCount: 2,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		expect(calculateDebtScore(input)).toBe(50);
	});

	it("applies weight multipliers correctly", () => {
		const input1: DebtScorecardInput = {
			deferredTaskMinutes: 10,
			deferredTaskCount: 1,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const input2: DebtScorecardInput = {
			deferredTaskMinutes: 0,
			deferredTaskCount: 0,
			skippedBreakMinutes: 10,
			skippedBreakCount: 1,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		// Skipped breaks have weight 1.2, deferred tasks have weight 1.0
		expect(calculateDebtScore(input2)).toBeGreaterThan(calculateDebtScore(input1));
		expect(calculateDebtScore(input2)).toBe(12); // 10 * 1.2
	});

	it("combines multiple debt sources", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 15,
			skippedBreakCount: 3,
			overrunMinutes: 20,
			overrunCount: 1,
			lateStartMinutes: 10,
			lateStartCount: 2,
		};
		// 30*1.0 + 15*1.2 + 20*0.8 + 10*0.5 = 30 + 18 + 16 + 5 = 69
		expect(calculateDebtScore(input)).toBe(69);
	});
});

describe("getRiskLevel", () => {
	it("returns low for score under 30", () => {
		expect(getRiskLevel(0)).toBe("low");
		expect(getRiskLevel(29)).toBe("low");
	});

	it("returns medium for score 30-59", () => {
		expect(getRiskLevel(30)).toBe("medium");
		expect(getRiskLevel(59)).toBe("medium");
	});

	it("returns high for score 60-89", () => {
		expect(getRiskLevel(60)).toBe("high");
		expect(getRiskLevel(89)).toBe("high");
	});

	it("returns critical for score 90+", () => {
		expect(getRiskLevel(90)).toBe("critical");
		expect(getRiskLevel(150)).toBe("critical");
	});
});

describe("calculateTrendDirection", () => {
	it("returns stable when no previous score", () => {
		const result = calculateTrendDirection(50, undefined);
		expect(result.direction).toBe("stable");
		expect(result.change).toBe(0);
	});

	it("returns improving when score decreases significantly", () => {
		const result = calculateTrendDirection(40, 50);
		expect(result.direction).toBe("improving");
		expect(result.change).toBe(-10);
	});

	it("returns worsening when score increases significantly", () => {
		const result = calculateTrendDirection(60, 50);
		expect(result.direction).toBe("worsening");
		expect(result.change).toBe(10);
	});

	it("returns stable for small changes", () => {
		const result = calculateTrendDirection(52, 50);
		expect(result.direction).toBe("stable");
		expect(result.change).toBe(2);
	});
});

describe("buildDebtComponents", () => {
	it("returns empty array for no debt", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 0,
			deferredTaskCount: 0,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		expect(buildDebtComponents(input)).toEqual([]);
	});

	it("sorts components by contribution descending", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 50,
			deferredTaskCount: 2,
			skippedBreakMinutes: 100,
			skippedBreakCount: 5,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const components = buildDebtComponents(input);
		expect(components.length).toBe(2);
		expect(components[0].category).toBe("skipped_breaks");
		expect(components[1].category).toBe("deferred_tasks");
	});

	it("includes all component metadata", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 25,
			deferredTaskCount: 3,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const components = buildDebtComponents(input);
		expect(components[0]).toEqual({
			category: "deferred_tasks",
			minutes: 25,
			count: 3,
			weight: 1.0,
			contribution: 25,
		});
	});
});

describe("generateDebtScorecard", () => {
	it("generates complete scorecard", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const scorecard = generateDebtScorecard(input);

		expect(scorecard.totalScore).toBe(30);
		expect(scorecard.riskLevel).toBe("medium");
		expect(scorecard.components.length).toBe(1);
		expect(scorecard.weekStart).toBeDefined();
		expect(scorecard.weekEnd).toBeDefined();
	});

	it("includes trend when previous score provided", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
			previousScore: 50,
		};
		const scorecard = generateDebtScorecard(input);
		expect(scorecard.trendDirection).toBe("improving");
	});
});

describe("suggestDebtActions", () => {
	it("suggests up to 3 actions", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 15,
			skippedBreakCount: 3,
			overrunMinutes: 20,
			overrunCount: 1,
			lateStartMinutes: 10,
			lateStartCount: 2,
		};
		const scorecard = generateDebtScorecard(input);
		const actions = suggestDebtActions(scorecard);
		expect(actions.length).toBeLessThanOrEqual(3);
	});

	it("prioritizes highest contribution categories", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 0,
			deferredTaskCount: 0,
			skippedBreakMinutes: 100,
			skippedBreakCount: 5,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const scorecard = generateDebtScorecard(input);
		const actions = suggestDebtActions(scorecard);
		expect(actions[0].category).toBe("skipped_breaks");
	});

	it("includes deep links for actions", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const scorecard = generateDebtScorecard(input);
		const actions = suggestDebtActions(scorecard);
		expect(actions[0].deepLink).toBeDefined();
	});
});

describe("debt history", () => {
	beforeEach(() => {
		__resetDebtHistoryForTests();
	});

	it("starts with empty history", () => {
		expect(loadDebtHistory()).toEqual([]);
	});

	it("saves and loads history", () => {
		const history = [{ weekStart: "2024-01-01T00:00:00.000Z", score: 50, riskLevel: "medium" as const }];
		saveDebtHistory(history);
		expect(loadDebtHistory()).toEqual(history);
	});

	it("records weekly debt", () => {
		const input: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const scorecard = generateDebtScorecard(input);
		recordWeeklyDebt(scorecard);

		const history = loadDebtHistory();
		expect(history.length).toBe(1);
		expect(history[0].score).toBe(30);
		expect(history[0].riskLevel).toBe("medium");
	});

	it("updates existing week entry", () => {
		const input1: DebtScorecardInput = {
			deferredTaskMinutes: 30,
			deferredTaskCount: 2,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const scorecard1 = generateDebtScorecard(input1);
		recordWeeklyDebt(scorecard1);

		const input2: DebtScorecardInput = {
			deferredTaskMinutes: 50,
			deferredTaskCount: 3,
			skippedBreakMinutes: 0,
			skippedBreakCount: 0,
			overrunMinutes: 0,
			overrunCount: 0,
			lateStartMinutes: 0,
			lateStartCount: 0,
		};
		const scorecard2 = generateDebtScorecard(input2);
		recordWeeklyDebt(scorecard2);

		const history = loadDebtHistory();
		expect(history.length).toBe(1);
		expect(history[0].score).toBe(50);
	});

	it("gets previous week score", () => {
		expect(getPreviousWeekScore()).toBeUndefined();

		// Manually set up history with multiple weeks
		const history = [
			{ weekStart: "2024-01-01T00:00:00.000Z", score: 40, riskLevel: "medium" as const },
			{ weekStart: "2024-01-08T00:00:00.000Z", score: 50, riskLevel: "medium" as const },
		];
		saveDebtHistory(history);

		// Mock current week to match second entry
		expect(getPreviousWeekScore()).toBeDefined();
	});
});
