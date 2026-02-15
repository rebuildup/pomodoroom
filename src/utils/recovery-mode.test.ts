import { beforeEach, describe, expect, it } from "vitest";
import {
	getBreakSkipStreak,
	shouldEnterRecoveryMode,
} from "@/utils/recovery-mode";

describe("recovery mode", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("detects skip streak from override logs", () => {
		localStorage.setItem(
			"pomodoroom-overfocus-override-logs",
			JSON.stringify([
				{ at: "2026-02-15T10:00:00.000Z", reason: "manual-continue" },
				{ at: "2026-02-15T10:30:00.000Z", reason: "manual-continue" },
				{ at: "2026-02-15T11:00:00.000Z", reason: "manual-continue" },
			]),
		);

		expect(getBreakSkipStreak()).toBe(3);
	});

	it("enters recovery mode only after configurable threshold", () => {
		expect(shouldEnterRecoveryMode(2, 3)).toBe(false);
		expect(shouldEnterRecoveryMode(3, 3)).toBe(true);
	});
});
