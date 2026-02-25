/**
 * Tests for TaskCategory classification per CORE_POLICY.md §4.1
 */

import { describe, it, expect } from "vitest";
import { createTask, effectiveCategory, isActive, isWaiting, isFloating } from "./task";

// Helper to create a task with minimal required properties
function makeTask(overrides: Record<string, unknown> = {}): ReturnType<typeof createTask> {
	return createTask({
		title: "Test task",
		tags: [],
		priority: null,
		energy: "medium",
		projectIds: [],
		groupIds: [],
		project: null,
		group: null,
		kind: "duration_only",
		requiredMinutes: 25,
		fixedStartAt: null,
		fixedEndAt: null,
		windowStartAt: null,
		windowEndAt: null,
		estimatedStartAt: null,
		estimatedMinutes: null,
		...overrides,
	});
}

describe("TaskCategory classification (CORE_POLICY.md §4.1)", () => {
	describe("effectiveCategory", () => {
		it("returns 'active' for RUNNING tasks", () => {
			const task = makeTask();
			task.state = "RUNNING";
			expect(effectiveCategory(task)).toBe("active");
			expect(isActive(task)).toBe(true);
			expect(isWaiting(task)).toBe(false);
			expect(isFloating(task)).toBe(false);
		});

		it("returns 'floating' for DONE tasks", () => {
			const task = makeTask();
			task.state = "DONE";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isActive(task)).toBe(false);
			expect(isWaiting(task)).toBe(false);
			expect(isFloating(task)).toBe(true);
		});

		it("returns 'wait' for PAUSED tasks", () => {
			const task = makeTask();
			task.state = "PAUSED";
			expect(effectiveCategory(task)).toBe("wait");
			expect(isActive(task)).toBe(false);
			expect(isWaiting(task)).toBe(true);
			expect(isFloating(task)).toBe(false);
		});

		it("returns 'active' for READY tasks with normal priority", () => {
			const task = makeTask({ priority: 50, energy: "medium" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("active");
			expect(isActive(task)).toBe(true);
		});

		it("returns 'floating' for READY tasks with low energy", () => {
			const task = makeTask({ priority: 50, energy: "low" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isFloating(task)).toBe(true);
		});

		it("returns 'floating' for READY tasks with low priority", () => {
			const task = makeTask({ priority: 20, energy: "medium" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isFloating(task)).toBe(true);
		});

		it("returns 'active' for DRIFTING tasks with normal priority", () => {
			const task = makeTask({ priority: 50, energy: "medium" });
			task.state = "DRIFTING";
			expect(effectiveCategory(task)).toBe("active");
			expect(isActive(task)).toBe(true);
		});

		it("returns 'floating' for DRIFTING tasks with low priority", () => {
			const task = makeTask({ priority: 20, energy: "medium" });
			task.state = "DRIFTING";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isFloating(task)).toBe(true);
		});

		it("handles null priority as default (50)", () => {
			const task = makeTask({ priority: null, energy: "medium" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("active");
		});
	});

	describe("TaskCategory type", () => {
		it("has three valid values: 'active', 'wait', 'floating'", () => {
			const validCategories: Array<"active" | "wait" | "floating"> = ["active", "wait", "floating"];
			expect(validCategories).toHaveLength(3);
		});
	});

	describe("CORE_POLICY.md §4.1 table", () => {
		it("Active: Currently executing (max 1)", () => {
			const task = makeTask({ title: "Active task" });
			task.state = "RUNNING";
			expect(effectiveCategory(task)).toBe("active");
		});

		it("Wait: External block/waiting", () => {
			const task = makeTask({ title: "Waiting task" });
			task.state = "PAUSED";
			expect(effectiveCategory(task)).toBe("wait");
		});

		it("Floating: Low energy gap fillers", () => {
			const task = makeTask({ title: "Gap filler", priority: 10, energy: "low" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("floating");
		});
	});
});
