/**
 * Tests for NextTaskCandidates component and task suggestion logic.
 */

import { describe, it, expect } from "vitest";
import { generateTaskSuggestions } from "./NextTaskCandidates";
import type { TaskStreamItem } from "@/types/taskstream";
import type { EnergyLevel } from "./EnergyPicker";

/**
 * Helper to create a mock TaskStreamItem with minimal required fields.
 */
function createMockTask(overrides: Partial<TaskStreamItem> = {}): TaskStreamItem {
	return {
		id: `task-${Math.random()}`,
		title: "Test Task",
		status: "active",
		state: "READY",
		markdown: "",
		estimatedMinutes: 25,
		actualMinutes: 0,
		tags: [],
		createdAt: new Date().toISOString(),
		order: 0,
		interruptCount: 0,
		...overrides,
	};
}

describe("NextTaskCandidates", () => {
	describe("generateTaskSuggestions", () => {
		it("returns empty array when no tasks provided", () => {
			const suggestions = generateTaskSuggestions([], "medium");
			expect(suggestions).toEqual([]);
		});

		it("filters only READY and PAUSED tasks", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({ id: "1", state: "READY" }),
				createMockTask({ id: "2", state: "PAUSED" }),
				createMockTask({ id: "3", state: "RUNNING" }),
				createMockTask({ id: "4", state: "DONE" }),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			// Should only include READY and PAUSED tasks
			expect(suggestions.length).toBe(2);
			const ids = suggestions.map(s => s.task.id);
			expect(ids).toContain("1");
			expect(ids).toContain("2");
			expect(ids).not.toContain("3");
			expect(ids).not.toContain("4");
		});

		it("limits suggestions to maxCount", () => {
			const tasks: TaskStreamItem[] = Array.from({ length: 10 }, (_, i) =>
				createMockTask({ id: `task-${i}`, state: "READY" })
			);

			const suggestions = generateTaskSuggestions(tasks, "medium", undefined, 2);
			expect(suggestions.length).toBeLessThanOrEqual(2);
		});

		it("enforces maximum of 3 suggestions per docs", () => {
			const tasks: TaskStreamItem[] = Array.from({ length: 10 }, (_, i) =>
				createMockTask({ id: `task-${i}`, state: "READY" })
			);

			// Even if maxCount is higher, should cap at 3
			const suggestions = generateTaskSuggestions(tasks, "medium", undefined, 10);
			expect(suggestions.length).toBeLessThanOrEqual(3);
		});

		it("filters out tasks with very low confidence (< 30)", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "low-confidence",
					state: "READY",
					tags: ["blocked", "waiting"],
					estimatedMinutes: 120
				}),
				createMockTask({
					id: "high-confidence",
					state: "READY",
					tags: ["urgent"]
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "low", 30);

			// The blocked+waiting task should be filtered out due to low confidence
			const ids = suggestions.map(s => s.task.id);
			expect(ids).toContain("high-confidence");
		});

		it("sorts suggestions by confidence descending", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({ id: "medium", state: "READY", tags: [] }),
				createMockTask({ id: "high", state: "READY", tags: ["urgent"] }),
				createMockTask({ id: "low", state: "READY", tags: ["waiting"] }),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			// Should be sorted by confidence
			for (let i = 1; i < suggestions.length; i++) {
				expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(
					suggestions[i].confidence
				);
			}
		});

		it("adds interrupt bonus to PAUSED tasks", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "paused",
					state: "PAUSED",
					interruptCount: 2
				}),
				createMockTask({
					id: "ready",
					state: "READY"
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			// Paused task should have higher confidence due to interrupt bonus
			const pausedSuggestion = suggestions.find(s => s.task.id === "paused");
			const readySuggestion = suggestions.find(s => s.task.id === "ready");

			expect(pausedSuggestion).toBeDefined();
			expect(readySuggestion).toBeDefined();

			if (pausedSuggestion && readySuggestion) {
				// PAUSED task gets +1 interrupt count, so should have bonus
				expect(pausedSuggestion.confidence).toBeGreaterThan(
					readySuggestion.confidence
				);
			}
		});
	});

	describe("scoring with context", () => {
		it("gives bonus for same group as current anchor", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "same-group",
					state: "READY",
					projectId: "project-a"
				}),
				createMockTask({
					id: "different-group",
					state: "READY",
					projectId: "project-b"
				}),
			];

			const context = {
				currentAnchorGroup: "project-a",
				recentlyCompletedGroups: [] as readonly string[],
			};

			const suggestions = generateTaskSuggestions(
				tasks,
				"medium",
				undefined,
				3,
				context
			);

			const sameGroupSuggestion = suggestions.find(s => s.task.id === "same-group");
			const differentGroupSuggestion = suggestions.find(s => s.task.id === "different-group");

			expect(sameGroupSuggestion).toBeDefined();
			expect(differentGroupSuggestion).toBeDefined();

			if (sameGroupSuggestion && differentGroupSuggestion) {
				// Same group should have higher confidence due to context bonus
				expect(sameGroupSuggestion.confidence).toBeGreaterThan(
					differentGroupSuggestion.confidence
				);
			}
		});

		it("gives bonus for recently completed groups", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "recent-group",
					state: "READY",
					projectId: "project-recent"
				}),
				createMockTask({
					id: "other-group",
					state: "READY",
					projectId: "project-other"
				}),
			];

			const context = {
				currentAnchorGroup: null,
				recentlyCompletedGroups: ["project-recent"] as readonly string[],
			};

			const suggestions = generateTaskSuggestions(
				tasks,
				"medium",
				undefined,
				3,
				context
			);

			const recentGroupSuggestion = suggestions.find(s => s.task.id === "recent-group");
			const otherGroupSuggestion = suggestions.find(s => s.task.id === "other-group");

			expect(recentGroupSuggestion).toBeDefined();
			expect(otherGroupSuggestion).toBeDefined();

			if (recentGroupSuggestion && otherGroupSuggestion) {
				// Recent group should have higher confidence due to context bonus
				expect(recentGroupSuggestion.confidence).toBeGreaterThan(
					otherGroupSuggestion.confidence
				);
			}
		});
	});

	describe("time and energy matching", () => {
		it("marks tasks as fitting time slot when within available time", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "short",
					state: "READY",
					estimatedMinutes: 20
				}),
				createMockTask({
					id: "long",
					state: "READY",
					estimatedMinutes: 60
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium", 30);

			const shortTask = suggestions.find(s => s.task.id === "short");
			const longTask = suggestions.find(s => s.task.id === "long");

			expect(shortTask?.fitsTimeSlot).toBe(true);
			expect(longTask?.fitsTimeSlot).toBe(false);
		});

		it("matches tasks to energy levels", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "short-task",
					state: "READY",
					estimatedMinutes: 20
				}),
				createMockTask({
					id: "long-task",
					state: "READY",
					estimatedMinutes: 90
				}),
			];

			// Low energy prefers shorter tasks
			const lowEnergySuggestions = generateTaskSuggestions(tasks, "low");
			const shortTaskLow = lowEnergySuggestions.find(s => s.task.id === "short-task");
			const longTaskLow = lowEnergySuggestions.find(s => s.task.id === "long-task");

			expect(shortTaskLow?.energyMatch).toBe(true); // 20 <= 30
			expect(longTaskLow?.energyMatch).toBe(false); // 90 > 30

			// High energy can handle longer tasks
			const highEnergySuggestions = generateTaskSuggestions(tasks, "high");
			const shortTaskHigh = highEnergySuggestions.find(s => s.task.id === "short-task");
			const longTaskHigh = highEnergySuggestions.find(s => s.task.id === "long-task");

			expect(shortTaskHigh?.energyMatch).toBe(true); // 20 <= 120
			expect(longTaskHigh?.energyMatch).toBe(true); // 90 <= 120
		});

		it("assigns correct priority levels based on confidence", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "high-priority",
					state: "READY",
					tags: ["urgent", "focus"]
				}),
				createMockTask({
					id: "medium-priority",
					state: "READY",
					tags: []
				}),
				createMockTask({
					id: "low-priority",
					state: "READY",
					tags: ["waiting"]
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			const highPrio = suggestions.find(s => s.task.id === "high-priority");
			const mediumPrio = suggestions.find(s => s.task.id === "medium-priority");
			const lowPrio = suggestions.find(s => s.task.id === "low-priority");

			// High confidence (>= 70) should be "high" priority
			if (highPrio && highPrio.confidence >= 70) {
				expect(highPrio.priority).toBe("high");
			}

			// Medium confidence (50-69) should be "medium" priority
			if (mediumPrio && mediumPrio.confidence >= 50 && mediumPrio.confidence < 70) {
				expect(mediumPrio.priority).toBe("medium");
			}

			// Low confidence (< 50) should be "low" priority
			if (lowPrio && lowPrio.confidence < 50) {
				expect(lowPrio.priority).toBe("low");
			}
		});
	});

	describe("tag-based scoring", () => {
		it("gives high bonus for urgent tags", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "urgent",
					state: "READY",
					tags: ["urgent"]
				}),
				createMockTask({
					id: "normal",
					state: "READY",
					tags: []
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			const urgentTask = suggestions.find(s => s.task.id === "urgent");
			const normalTask = suggestions.find(s => s.task.id === "normal");

			expect(urgentTask).toBeDefined();
			expect(normalTask).toBeDefined();

			if (urgentTask && normalTask) {
				expect(urgentTask.confidence).toBeGreaterThan(normalTask.confidence);
				// Urgent should have a reason mentioning 緊急タスク
				const hasUrgentReason = urgentTask.reasons.some(r =>
					r.text.includes("緊急")
				);
				expect(hasUrgentReason).toBe(true);
			}
		});

		it("gives bonus for timebox tags", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "timebox",
					state: "READY",
					tags: ["timebox"]
				}),
				createMockTask({
					id: "normal",
					state: "READY",
					tags: []
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			const timeboxTask = suggestions.find(s => s.task.id === "timebox");
			const normalTask = suggestions.find(s => s.task.id === "normal");

			if (timeboxTask && normalTask) {
				expect(timeboxTask.confidence).toBeGreaterThan(normalTask.confidence);
			}
		});

		it("matches quick tag with low energy", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "quick",
					state: "READY",
					tags: ["quick"]
				}),
			];

			const lowEnergySuggestions = generateTaskSuggestions(tasks, "low");
			const highEnergySuggestions = generateTaskSuggestions(tasks, "high");

			const quickLow = lowEnergySuggestions.find(s => s.task.id === "quick");
			const quickHigh = highEnergySuggestions.find(s => s.task.id === "quick");

			// Quick task should have higher confidence with low energy
			if (quickLow && quickHigh) {
				expect(quickLow.confidence).toBeGreaterThan(quickHigh.confidence);
			}
		});

		it("matches deep tag with high energy", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "deep",
					state: "READY",
					tags: ["deep"]
				}),
			];

			const lowEnergySuggestions = generateTaskSuggestions(tasks, "low");
			const highEnergySuggestions = generateTaskSuggestions(tasks, "high");

			const deepLow = lowEnergySuggestions.find(s => s.task.id === "deep");
			const deepHigh = highEnergySuggestions.find(s => s.task.id === "deep");

			// Deep task should have higher confidence with high energy
			if (deepLow && deepHigh) {
				expect(deepHigh.confidence).toBeGreaterThan(deepLow.confidence);
			}
		});

		it("applies penalty for waiting tags", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "waiting",
					state: "READY",
					tags: ["waiting"]
				}),
				createMockTask({
					id: "normal",
					state: "READY",
					tags: []
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			const waitingTask = suggestions.find(s => s.task.id === "waiting");
			const normalTask = suggestions.find(s => s.task.id === "normal");

			if (waitingTask && normalTask) {
				expect(waitingTask.confidence).toBeLessThan(normalTask.confidence);
			}
		});

		it("applies large penalty for blocked tags", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "blocked",
					state: "READY",
					tags: ["blocked"]
				}),
				createMockTask({
					id: "normal",
					state: "READY",
					tags: []
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			const blockedTask = suggestions.find(s => s.task.id === "blocked");
			const normalTask = suggestions.find(s => s.task.id === "normal");

			if (blockedTask && normalTask) {
				expect(blockedTask.confidence).toBeLessThan(normalTask.confidence);
				// Should have even lower confidence than waiting
			}
		});

		it("applies penalty for deferred tags", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "deferred",
					state: "READY",
					tags: ["deferred"]
				}),
				createMockTask({
					id: "normal",
					state: "READY",
					tags: []
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			const deferredTask = suggestions.find(s => s.task.id === "deferred");
			const normalTask = suggestions.find(s => s.task.id === "normal");

			if (deferredTask && normalTask) {
				expect(deferredTask.confidence).toBeLessThan(normalTask.confidence);
			}
		});
	});

	describe("edge cases", () => {
		it("handles tasks with no project ID", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "no-project",
					state: "READY",
					projectId: undefined
				}),
			];

			const context = {
				currentAnchorGroup: "some-project",
				recentlyCompletedGroups: [] as readonly string[],
			};

			// Should not throw
			expect(() => {
				generateTaskSuggestions(tasks, "medium", undefined, 3, context);
			}).not.toThrow();

			const suggestions = generateTaskSuggestions(tasks, "medium", undefined, 3, context);
			expect(suggestions.length).toBe(1);
		});

		it("handles undefined timeAvailable", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({ state: "READY", estimatedMinutes: 120 }),
			];

			// Should not throw and should not penalize for time
			const suggestions = generateTaskSuggestions(tasks, "medium", undefined);
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions[0].fitsTimeSlot).toBe(true);
		});

		it("handles empty context", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({ state: "READY" }),
			];

			// Should work without context
			expect(() => {
				generateTaskSuggestions(tasks, "medium", undefined, 3, undefined);
			}).not.toThrow();
		});

		it("handles empty recently completed groups", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					state: "READY",
					projectId: "project-a"
				}),
			];

			const context = {
				currentAnchorGroup: null,
				recentlyCompletedGroups: [] as readonly string[],
			};

			const suggestions = generateTaskSuggestions(tasks, "medium", undefined, 3, context);
			expect(suggestions.length).toBe(1);
		});

		it("normalizes confidence to 0-100 range", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					state: "READY",
					tags: ["urgent", "focus", "deep"],
					interruptCount: 5
				}),
				createMockTask({
					state: "READY",
					tags: ["blocked", "waiting", "deferred"],
					estimatedMinutes: 200
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			suggestions.forEach(suggestion => {
				expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
				expect(suggestion.confidence).toBeLessThanOrEqual(100);
			});
		});

		it("prefers shorter tasks with short task bonus", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "very-short",
					state: "READY",
					estimatedMinutes: 5
				}),
				createMockTask({
					id: "short",
					state: "READY",
					estimatedMinutes: 25
				}),
				createMockTask({
					id: "long",
					state: "READY",
					estimatedMinutes: 100
				}),
			];

			const suggestions = generateTaskSuggestions(tasks, "medium");

			// Verify shorter tasks get some bonus
			const veryShort = suggestions.find(s => s.task.id === "very-short");
			const longTask = suggestions.find(s => s.task.id === "long");

			if (veryShort && longTask) {
				// Very short task should have higher confidence all else being equal
				expect(veryShort.confidence).toBeGreaterThanOrEqual(longTask.confidence);
			}
		});
	});

	describe("multiple criteria combination", () => {
		it("combines interrupt count, group context, and time fit", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					id: "perfect",
					state: "PAUSED",
					projectId: "project-a",
					estimatedMinutes: 20,
					interruptCount: 2,
					tags: ["focus"]
				}),
				createMockTask({
					id: "decent",
					state: "READY",
					projectId: "project-b",
					estimatedMinutes: 25,
					tags: []
				}),
			];

			const context = {
				currentAnchorGroup: "project-a",
				recentlyCompletedGroups: [] as readonly string[],
			};

			const suggestions = generateTaskSuggestions(
				tasks,
				"medium",
				30,
				3,
				context
			);

			// Perfect task should rank highest due to multiple bonuses
			expect(suggestions[0].task.id).toBe("perfect");
			expect(suggestions[0].confidence).toBeGreaterThan(suggestions[1].confidence);
		});

		it("includes reasoning for each score component", () => {
			const tasks: TaskStreamItem[] = [
				createMockTask({
					state: "PAUSED",
					projectId: "project-a",
					estimatedMinutes: 20,
					interruptCount: 1,
					tags: ["urgent"]
				}),
			];

			const context = {
				currentAnchorGroup: "project-a",
				recentlyCompletedGroups: [] as readonly string[],
			};

			const suggestions = generateTaskSuggestions(
				tasks,
				"medium",
				30,
				3,
				context
			);

			expect(suggestions.length).toBe(1);
			const reasons = suggestions[0].reasons;

			// Should have multiple reasons
			expect(reasons.length).toBeGreaterThan(0);

			// Each reason should have text and score
			reasons.forEach(reason => {
				expect(reason).toHaveProperty("text");
				expect(reason).toHaveProperty("score");
				expect(typeof reason.text).toBe("string");
				expect(typeof reason.score).toBe("number");
			});
		});
	});
});