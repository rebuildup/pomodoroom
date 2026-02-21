import { describe, expect, it } from "vitest";
import { shouldEnterRecoveryMode } from "@/utils/recovery-mode";

describe("recovery mode", () => {
	// Skip streak detection removed - database-only architecture

	it("enters recovery mode only after configurable threshold", () => {
		expect(shouldEnterRecoveryMode(2, 3)).toBe(false);
		expect(shouldEnterRecoveryMode(3, 3)).toBe(true);
	});
});
