/**
 * Tests for TaskCategory classification per CORE_POLICY.md §4.1
 */

import { describe, it, expect } from "vitest";
import { createTask, effectiveCategory, isActive, isWaiting, isFloating } from "./task";

describe("TaskCategory classification (CORE_POLICY.md §4.1)", () => {
	describe("effectiveCategory", () => {
		it("returns 'active' for RUNNING tasks", () => {
			const task = createTask({ title: "Test task" });
			task.state = "RUNNING";
			expect(effectiveCategory(task)).toBe("active");
			expect(isActive(task)).toBe(true);
			expect(isWaiting(task)).toBe(false);
			expect(isFloating(task)).toBe(false);
		});

		it("returns 'floating' for DONE tasks", () => {
			const task = createTask({ title: "Test task" });
			task.state = "DONE";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isActive(task)).toBe(false);
			expect(isWaiting(task)).toBe(false);
			expect(isFloating(task)).toBe(true);
		});

		it("returns 'wait' for PAUSED tasks", () => {
			const task = createTask({ title: "Test task" });
			task.state = "PAUSED";
			expect(effectiveCategory(task)).toBe("wait");
			expect(isActive(task)).toBe(false);
			expect(isWaiting(task)).toBe(true);
			expect(isFloating(task)).toBe(false);
		});

		it("returns 'active' for READY tasks with normal priority", () => {
			const task = createTask({ title: "Test task", priority: 50, energy: "medium" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("active");
			expect(isActive(task)).toBe(true);
		});

		it("returns 'floating' for READY tasks with low energy", () => {
			const task = createTask({ title: "Test task", priority: 50, energy: "low" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isFloating(task)).toBe(true);
		});

		it("returns 'floating' for READY tasks with low priority", () => {
			const task = createTask({ title: "Test task", priority: 20, energy: "medium" });
			task.state = "READY";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isFloating(task)).toBe(true);
		});

		it("returns 'active' for DRIFTING tasks with normal priority", () => {
			const task = createTask({ title: "Test task", priority: 50, energy: "medium" });
			task.state = "DRIFTING";
			expect(effectiveCategory(task)).toBe("active");
			expect(isActive(task)).toBe(true);
		});

		it("returns 'floating' for DRIFTING tasks with low priority", () => {
			const task = createTask({ title: "Test task", priority: 20, energy: "medium" });
			task.state = "DRIFTING";
			expect(effectiveCategory(task)).toBe("floating");
			expect(isFloating(task)).toBe(true);
		});

		it("handles null priority as default (50)", () => {
			const task = createTask({ title: "Test task", priority: null, energy: "medium" });
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
			const task = createTask({ title: "Active task" });
			task.state = "RUNNING";
			expect(effectiveCategory(task)).toBe("active");
		});

		it("Wait: External block/waiting", () => {
			const task = createTask({ title: "Waiting task" });
			task.state = "PAUSED";
			expect(effectiveCategory(task)).toBe("wait");
		});

		it("Floating: Low energy gap fillers", () => {
			const task = createTask({ title: "Gap filler" });
			task.state = "READY";
			task.priority = 10;
			task.energy = "low";
			expect(effectiveCategory(task)).toBe("floating");
		});
	});
});
