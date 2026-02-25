import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetNudgePolicyForTests,
	evaluateNudgeWindow,
	getNudgePolicyConfig,
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

	// Deferred nudge queue persistence removed - database-only architecture
	// Metrics tracking removed - database-only architecture
});
