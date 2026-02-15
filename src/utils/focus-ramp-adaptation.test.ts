import { describe, expect, it, beforeEach, vi } from "vitest";
import {
	applyCompletionRateToStageOffset,
	loadFocusRampState,
	saveFocusRampState,
} from "@/utils/focus-ramp-adaptation";

describe("focus ramp adaptation", () => {
	beforeEach(() => {
		localStorage.clear();
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

	it("resets persisted state when policy is daily and date changes", () => {
		saveFocusRampState({ stageOffset: 2, lastUpdatedDate: "2026-02-14", resetPolicy: "daily" });
		const state = loadFocusRampState("daily", "2026-02-15");
		expect(state.stageOffset).toBe(0);
		expect(state.lastUpdatedDate).toBe("2026-02-15");
	});

	it("keeps persisted state across days when policy is never", () => {
		saveFocusRampState({ stageOffset: 2, lastUpdatedDate: "2026-02-14", resetPolicy: "never" });
		const state = loadFocusRampState("never", "2026-02-15");
		expect(state.stageOffset).toBe(2);
		expect(state.lastUpdatedDate).toBe("2026-02-14");
	});
});
