import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetLowEnergyQueueFeedbackForTests,
	buildLowEnergyFallbackQueue,
	createLowEnergyStartAction,
	recordLowEnergyQueueFeedback,
	shouldTriggerLowEnergySuggestion,
} from "./low-energy-fallback-queue";

const baseTasks = [
	{ id: "h1", title: "Deep work", energy: "high", requiredMinutes: 90, state: "READY", tags: ["deep"], priority: 60 },
	{ id: "m1", title: "Docs", energy: "medium", requiredMinutes: 30, state: "READY", tags: ["docs"], priority: 50 },
	{ id: "l1", title: "Inbox zero", energy: "low", requiredMinutes: 15, state: "READY", tags: ["quick"], priority: 40 },
] as const;

describe("low-energy-fallback-queue", () => {
	beforeEach(() => {
		__resetLowEnergyQueueFeedbackForTests();
	});

	it("keeps queue non-empty when eligible tasks exist", () => {
		const queue = buildLowEnergyFallbackQueue(baseTasks, { pressureValue: 75 });
		expect(queue.length).toBeGreaterThan(0);
		expect(queue.some((entry) => entry.task.id === "l1")).toBe(true);
	});

	it("returns one-click start action for top suggestion", () => {
		const queue = buildLowEnergyFallbackQueue(baseTasks, { pressureValue: 80 });
		const action = createLowEnergyStartAction(queue[0]);
		expect(action.start_task.id).toBe(queue[0]?.task.id);
		expect(action.start_task.resume).toBe(false);
	});

	it("improves queue ordering from feedback loop", () => {
		recordLowEnergyQueueFeedback("m1", "accepted");
		recordLowEnergyQueueFeedback("m1", "accepted");
		recordLowEnergyQueueFeedback("l1", "rejected");

		const queue = buildLowEnergyFallbackQueue(baseTasks, { pressureValue: 70 });
		expect(queue[0]?.task.id).toBe("m1");
	});

	it("triggers auto-suggestion when fatigue indicators spike", () => {
		expect(shouldTriggerLowEnergySuggestion({ pressureValue: 82, mismatchScore: 70 })).toBe(true);
		expect(shouldTriggerLowEnergySuggestion({ pressureValue: 35, mismatchScore: 20 })).toBe(false);
	});
});
