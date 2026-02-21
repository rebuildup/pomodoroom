import { describe, expect, it } from "vitest";
import { applyOverfocusCooldown } from "@/utils/overfocus-guard";

describe("overfocus guard", () => {
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

	// Override logging removed - database-only architecture
});
