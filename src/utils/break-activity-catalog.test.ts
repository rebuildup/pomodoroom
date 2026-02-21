import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetBreakActivityCatalogForTests,
	getBreakActivityCatalog,
	getBreakActivitySuggestions,
} from "./break-activity-catalog";

describe("break-activity-catalog", () => {
	beforeEach(() => {
		__resetBreakActivityCatalogForTests();
	});

	// Persistence tests removed - database-only architecture
	// Catalog operations are now transient within a single session

	it("provides default catalog with all activities", () => {
		const catalog = getBreakActivityCatalog();
		expect(catalog.length).toBeGreaterThan(0);
		expect(catalog.some((item) => item.id === "hydration")).toBe(true);
		expect(catalog.some((item) => item.id === "walk-quick")).toBe(true);
	});

	it("returns suggestions based on duration and fatigue", () => {
		const suggestions = getBreakActivitySuggestions({
			breakMinutes: 5,
			fatigueLevel: "high",
			limit: 3,
		});
		expect(suggestions.length).toBeGreaterThan(0);
		expect(suggestions.length).toBeLessThanOrEqual(3);
	});

	// Enable/disable filtering removed - no persistence means state resets
});
