import { describe, expect, it } from "vitest";
import {
	buildDailyCognitiveLoadStats,
	estimateCognitiveLoadIndex,
	estimateCognitiveLoadFromTaskSequence,
	getSchedulerCognitiveLoadSignal,
	recommendBreakMinutesFromCognitiveLoad,
} from "./cognitive-load-estimator";

describe("cognitive-load-estimator", () => {
	it("computes weighted switch index from switch frequency and heterogeneity", () => {
		const low = estimateCognitiveLoadIndex([
			{ completedAt: "2026-02-15T09:00:00.000Z", project: "A", task: "one", interrupted: false },
			{ completedAt: "2026-02-15T09:30:00.000Z", project: "A", task: "two", interrupted: false },
		]);
		const high = estimateCognitiveLoadIndex([
			{ completedAt: "2026-02-15T09:00:00.000Z", project: "A", task: "one", interrupted: true },
			{ completedAt: "2026-02-15T09:20:00.000Z", project: "B", task: "two", interrupted: true },
			{ completedAt: "2026-02-15T09:40:00.000Z", project: "C", task: "three", interrupted: true },
		]);

		expect(high.index).toBeGreaterThan(low.index);
		expect(high.switchCount).toBeGreaterThan(0);
	});

	it("increases recommended break when index spikes", () => {
		expect(recommendBreakMinutesFromCognitiveLoad(8, 20)).toBe(8);
		expect(recommendBreakMinutesFromCognitiveLoad(8, 70)).toBeGreaterThan(8);
		expect(recommendBreakMinutesFromCognitiveLoad(8, 90)).toBeGreaterThan(
			recommendBreakMinutesFromCognitiveLoad(8, 70),
		);
	});

	it("builds daily stats payload with index and spike indicator", () => {
		const stats = buildDailyCognitiveLoadStats(
			[
				{ completedAt: "2026-02-15T09:00:00.000Z", project: "A", task: "one", interrupted: true },
				{ completedAt: "2026-02-15T09:20:00.000Z", project: "B", task: "two", interrupted: true },
			],
			new Date("2026-02-15T23:00:00.000Z"),
		);

		expect(stats.index).toBeGreaterThanOrEqual(0);
		expect(stats.recommendedBreakMinutes).toBeGreaterThanOrEqual(5);
		expect(typeof stats.spike).toBe("boolean");
	});

	it("provides scheduler-consumable normalized signal", () => {
		const signal = getSchedulerCognitiveLoadSignal(80);
		expect(signal).toBeGreaterThan(0.7);
		expect(signal).toBeLessThanOrEqual(1);
	});

	it("estimates sequence cognitive load from planned task switches", () => {
		const low = estimateCognitiveLoadFromTaskSequence([
			{ project: "A", tags: ["deep"] },
			{ project: "A", tags: ["deep"] },
			{ project: "A", tags: ["deep"] },
		]);
		const high = estimateCognitiveLoadFromTaskSequence([
			{ project: "A", tags: ["deep"] },
			{ project: "B", tags: ["meeting"] },
			{ project: "C", tags: ["admin"] },
		]);

		expect(high).toBeGreaterThan(low);
	});
});
