import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetEnergyMismatchFeedbackForTests,
	evaluateTaskEnergyMismatch,
	getEnergyMismatchFeedbackStats,
	rankAlternativeTasks,
	trackEnergyMismatchFeedback,
} from "./task-energy-mismatch";

describe("task-energy-mismatch", () => {
	beforeEach(() => {
		__resetEnergyMismatchFeedbackForTests();
	});

	it("triggers warning above threshold for high-demand task in low-capacity context", () => {
		const result = evaluateTaskEnergyMismatch(
			{ id: "t1", title: "Deep architecture", energy: "high", requiredMinutes: 90, priority: 50, state: "READY", tags: [] },
			{ pressureValue: 85, now: new Date("2026-02-15T22:30:00.000Z") },
		);

		expect(result.shouldWarn).toBe(true);
		expect(result.score).toBeGreaterThanOrEqual(result.threshold);
		expect(result.reasons.length).toBeGreaterThan(0);
	});

	it("does not trigger warning below threshold in balanced context", () => {
		const result = evaluateTaskEnergyMismatch(
			{ id: "t2", title: "Routine update", energy: "medium", requiredMinutes: 25, priority: 50, state: "READY", tags: [] },
			{ pressureValue: 20, now: new Date("2026-02-15T10:00:00.000Z") },
		);

		expect(result.shouldWarn).toBe(false);
		expect(result.score).toBeLessThan(result.threshold);
	});

	it("ranks alternatives by lower mismatch and actionability", () => {
		const alternatives = rankAlternativeTasks(
			[
				{ id: "current", title: "Deep architecture", energy: "high", requiredMinutes: 90, priority: 50, state: "READY", tags: ["deep"] },
				{ id: "a", title: "Quick email", energy: "low", requiredMinutes: 15, priority: 40, state: "READY", tags: ["quick"] },
				{ id: "b", title: "Docs touch-up", energy: "medium", requiredMinutes: 30, priority: 60, state: "READY", tags: [] },
			],
			"current",
			{ pressureValue: 80, now: new Date("2026-02-15T22:30:00.000Z") },
			2,
		);

		expect(alternatives).toHaveLength(2);
		expect(alternatives[0]?.task.id).toBe("a");
		expect(alternatives[0]?.actionable).toBe(true);
	});

	it("tracks accepted/rejected outcomes for false-positive monitoring", () => {
		trackEnergyMismatchFeedback("accepted");
		trackEnergyMismatchFeedback("rejected");
		trackEnergyMismatchFeedback("rejected");

		const stats = getEnergyMismatchFeedbackStats();
		expect(stats.accepted).toBe(1);
		expect(stats.rejected).toBe(2);
		expect(stats.total).toBe(3);
		expect(stats.falsePositiveRate).toBeCloseTo(2 / 3, 4);
	});
});
