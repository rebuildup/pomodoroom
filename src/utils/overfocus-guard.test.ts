import { beforeEach, describe, expect, it } from "vitest";
import {
	applyOverfocusCooldown,
	getOverfocusOverrideLogs,
} from "@/utils/overfocus-guard";

describe("overfocus guard", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("enforces minimum cooldown only when threshold is exceeded", () => {
		expect(
			applyOverfocusCooldown({
				streakLevel: 3,
				breakMinutes: 5,
				availableGapMinutes: 30,
				threshold: 3,
				minCooldownMinutes: 15,
			}),
		).toBe(5);

		expect(
			applyOverfocusCooldown({
				streakLevel: 4,
				breakMinutes: 5,
				availableGapMinutes: 30,
				threshold: 3,
				minCooldownMinutes: 15,
			}),
		).toBe(15);
	});

	it("logs explicit override and keeps original break", () => {
		const next = applyOverfocusCooldown({
			streakLevel: 6,
			breakMinutes: 5,
			availableGapMinutes: 30,
			threshold: 3,
			minCooldownMinutes: 20,
			overrideAcknowledged: true,
			overrideReason: "manual-continue",
		});

		expect(next).toBe(5);
		const logs = getOverfocusOverrideLogs();
		expect(logs).toHaveLength(1);
		expect(logs[0]?.reason).toBe("manual-continue");
	});
});
