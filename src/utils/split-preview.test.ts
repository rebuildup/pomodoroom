import { describe, expect, it } from "vitest";
import {
	buildInitialSplitPreview,
	validateSplitPreview,
	type SplitPreviewItem,
} from "./split-preview";

describe("split-preview", () => {
	it("builds a focus/break plan that matches total minutes", () => {
		const items = buildInitialSplitPreview({
			title: "Implement API",
			totalMinutes: 95,
			focusBlockMinutes: 50,
			breakMinutes: 10,
		});

		expect(items.map((item) => item.kind)).toEqual(["focus", "break", "focus"]);
		expect(items.reduce((sum, item) => sum + item.durationMinutes, 0)).toBe(95);
		expect(items[0]?.title).toContain("Implement API");
	});

	it("reports localized errors for invalid order and total mismatch", () => {
		const invalid: SplitPreviewItem[] = [
			{ id: "break-1", kind: "break", title: "Break (1)", durationMinutes: 3 },
			{ id: "break-2", kind: "break", title: "Break (2)", durationMinutes: 3 },
		];

		const result = validateSplitPreview(invalid, 30);

		expect(result.isValid).toBe(false);
		expect(result.issues.some((issue) => issue.message.includes("最初のセグメント"))).toBe(true);
		expect(result.issues.some((issue) => issue.message.includes("連続"))).toBe(true);
		expect(result.issues.some((issue) => issue.field === "total")).toBe(true);
	});
});
