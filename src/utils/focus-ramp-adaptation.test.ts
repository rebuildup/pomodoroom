import { describe, expect, it, beforeEach, vi } from "vitest";
import { applyCompletionRateToStageOffset } from "@/utils/focus-ramp-adaptation";

describe("focus ramp adaptation", () => {
	beforeEach(() => {
		// localStorage cleared - database-only architecture
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-15T09:00:00.000Z"));
	});

	it("upshifts stage offset at the upshift boundary", () => {
		const next = applyCompletionRateToStageOffset(0, 0.8);
		expect(next).toBe(1);
	});

	it("downshifts stage offset at the downshift boundary", () => {
		const next = applyCompletionRateToStageOffset(0, 0.5);
		expect(next).toBe(-1);
	});
});
