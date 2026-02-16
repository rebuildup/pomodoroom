import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetBreakActivityCatalogForTests,
	getBreakActivityCatalog,
	getBreakActivitySuggestions,
	recordBreakActivityFeedback,
	togglePinBreakActivity,
	upsertBreakActivity,
} from "./break-activity-catalog";

describe("break-activity-catalog", () => {
	beforeEach(() => {
		__resetBreakActivityCatalogForTests();
	});

	it("provides editable catalog entries", () => {
		const created = upsertBreakActivity({
			id: "custom-breath",
			title: "4-7-8 Breathing",
			description: "Slow breathing cycle",
			durationBucket: 5,
			tags: ["mindful"],
		});

		expect(created.title).toBe("4-7-8 Breathing");
		expect(getBreakActivityCatalog().some((item) => item.id === "custom-breath")).toBe(true);
	});

	it("ranks pinned preferences higher", () => {
		togglePinBreakActivity("walk-quick", true);
		const suggestions = getBreakActivitySuggestions({ breakMinutes: 5, fatigueLevel: "high", limit: 3 });
		expect(suggestions[0]?.id).toBe("walk-quick");
	});

	it("rotates suggestions to avoid immediate repetition", () => {
		const first = getBreakActivitySuggestions({ breakMinutes: 10, fatigueLevel: "medium", limit: 2 });
		const second = getBreakActivitySuggestions({ breakMinutes: 10, fatigueLevel: "medium", limit: 2 });
		expect(second[0]?.id).not.toBe(first[0]?.id);
	});

	it("preference feedback improves ranking", () => {
		recordBreakActivityFeedback("hydration", "selected");
		recordBreakActivityFeedback("hydration", "selected");
		const suggestions = getBreakActivitySuggestions({ breakMinutes: 5, fatigueLevel: "high", limit: 3 });
		expect(suggestions.some((item) => item.id === "hydration")).toBe(true);
	});
});
