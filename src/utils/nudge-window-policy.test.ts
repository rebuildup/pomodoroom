import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetNudgePolicyForTests,
	dequeueReplayableNudge,
	enqueueDeferredNudge,
	evaluateNudgeWindow,
	getNudgeMetrics,
	getNudgePolicyConfig,
	recordNudgeOutcome,
	setNudgePolicyConfig,
} from "./nudge-window-policy";

describe("nudge-window-policy", () => {
	beforeEach(() => {
		__resetNudgePolicyForTests();
	});

	it("applies configurable suppression rules", () => {
		setNudgePolicyConfig({ suppressDuringRunningFocus: true, deferMinutes: 10 });
		const decision = evaluateNudgeWindow(
			{ title: "Nudge", message: "msg", buttons: [{ label: "Later", action: { dismiss: null } }] },
			{ hasRunningFocus: true, now: new Date("2026-02-15T10:00:00.000Z") },
			getNudgePolicyConfig(),
		);
		expect(decision).toBe("defer");
	});

	it("replays deferred nudges only after replay time and safe window", () => {
		enqueueDeferredNudge(
			{ title: "Deferred", message: "msg", buttons: [{ label: "ok", action: { dismiss: null } }] },
			new Date("2026-02-15T10:00:00.000Z"),
			5,
		);

		const tooEarly = dequeueReplayableNudge({ hasRunningFocus: false, now: new Date("2026-02-15T10:03:00.000Z") });
		expect(tooEarly).toBeNull();

		const replay = dequeueReplayableNudge({ hasRunningFocus: false, now: new Date("2026-02-15T10:07:00.000Z") });
		expect(replay?.title).toBe("Deferred");
	});

	it("tracks acceptance metrics", () => {
		recordNudgeOutcome("shown");
		recordNudgeOutcome("shown");
		recordNudgeOutcome("accepted");
		recordNudgeOutcome("dismissed");
		const metrics = getNudgeMetrics();
		expect(metrics.shown).toBe(2);
		expect(metrics.accepted).toBe(1);
		expect(metrics.dismissed).toBe(1);
		expect(metrics.acceptanceRate).toBeCloseTo(0.5, 4);
	});
});
