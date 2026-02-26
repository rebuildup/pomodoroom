import { describe, expect, it } from "vitest";
import { buildReadyPriorityUpdates, shouldStartReadyReorderDrag } from "./ready-task-reorder";

describe("shouldStartReadyReorderDrag", () => {
	it("returns true for middle-click drag", () => {
		expect(shouldStartReadyReorderDrag({ button: 1, ctrlKey: false })).toBe(true);
	});

	it("returns true for ctrl+left drag", () => {
		expect(shouldStartReadyReorderDrag({ button: 0, ctrlKey: true })).toBe(true);
	});

	it("returns true for plain left drag", () => {
		expect(shouldStartReadyReorderDrag({ button: 0, ctrlKey: false })).toBe(true);
	});
});

describe("buildReadyPriorityUpdates", () => {
	it("creates descending priorities for ordered ready IDs", () => {
		const updates = buildReadyPriorityUpdates(["b", "c", "a"]);
		expect(updates).toEqual([
			{ id: "b", priority: 100 },
			{ id: "c", priority: 50 },
			{ id: "a", priority: 0 },
		]);
	});

	it("returns empty updates for empty input", () => {
		expect(buildReadyPriorityUpdates([])).toEqual([]);
	});
});
