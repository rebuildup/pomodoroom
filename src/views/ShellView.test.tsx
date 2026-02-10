/**
 * Tests for ShellView helper functions and logic.
 */

import { describe, it, expect } from "vitest";
import type { Task } from "@/types/task";
import type { TaskState } from "@/types/task-state";
import type { TaskStreamItem } from "@/types/taskstream";
import { STATE_TO_STATUS_MAP } from "@/types/taskstream";

/**
 * Helper to create a mock Task with minimal required fields.
 * This mirrors the Task type structure.
 */
function createMockTask(overrides: Partial<Task> = {}): Task {
	const now = new Date().toISOString();
	return {
		id: `task-${Math.random()}`,
		title: "Test Task",
		description: "Test description",
		state: "READY" as TaskState,
		estimatedMinutes: 25,
		elapsedMinutes: 0,
		project: null,
		group: null,
		tags: [],
		energy: "medium",
		priority: 0,
		createdAt: now,
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
		estimatedPomodoros: 1,
		completedPomodoros: 0,
		completed: false,
		category: "active",
		...overrides,
	};
}

/**
 * Convert Task to TaskStreamItem for NextTaskCandidates compatibility.
 * This is the same function used in ShellView.tsx.
 */
function taskToTaskStreamItem(task: Task): TaskStreamItem {
	return {
		id: task.id,
		title: task.title,
		status: STATE_TO_STATUS_MAP[task.state],
		state: task.state,
		markdown: task.description,
		estimatedMinutes: task.estimatedMinutes ?? 25,
		actualMinutes: task.elapsedMinutes,
		projectId: task.project ?? undefined,
		tags: task.tags,
		createdAt: task.createdAt,
		order: 0,
		interruptCount: 0,
	};
}

describe("ShellView", () => {
	describe("taskToTaskStreamItem", () => {
		it("converts basic task fields correctly", () => {
			const task = createMockTask({
				id: "task-123",
				title: "Test Task Title",
				state: "READY",
				estimatedMinutes: 30,
				elapsedMinutes: 10,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.id).toBe("task-123");
			expect(streamItem.title).toBe("Test Task Title");
			expect(streamItem.state).toBe("READY");
			expect(streamItem.estimatedMinutes).toBe(30);
			expect(streamItem.actualMinutes).toBe(10);
		});

		it("maps state to status correctly using STATE_TO_STATUS_MAP", () => {
			const states: TaskState[] = ["READY", "RUNNING", "PAUSED", "DONE"];

			states.forEach(state => {
				const task = createMockTask({ state });
				const streamItem = taskToTaskStreamItem(task);

				expect(streamItem.status).toBe(STATE_TO_STATUS_MAP[state]);
				expect(streamItem.state).toBe(state);
			});
		});

		it("defaults estimatedMinutes to 25 when null", () => {
			const task = createMockTask({
				estimatedMinutes: null,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.estimatedMinutes).toBe(25);
		});

		it("preserves estimatedMinutes when provided", () => {
			const task = createMockTask({
				estimatedMinutes: 45,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.estimatedMinutes).toBe(45);
		});

		it("converts null project to undefined projectId", () => {
			const task = createMockTask({
				project: null,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.projectId).toBeUndefined();
		});

		it("converts project string to projectId", () => {
			const task = createMockTask({
				project: "project-abc",
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.projectId).toBe("project-abc");
		});

		it("converts description to markdown field", () => {
			const task = createMockTask({
				description: "Task description in markdown",
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.markdown).toBe("Task description in markdown");
		});

		it("handles undefined description", () => {
			const task = createMockTask({
				description: undefined,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.markdown).toBeUndefined();
		});

		it("copies tags array correctly", () => {
			const task = createMockTask({
				tags: ["urgent", "focus", "quick"],
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.tags).toEqual(["urgent", "focus", "quick"]);
		});

		it("handles empty tags array", () => {
			const task = createMockTask({
				tags: [],
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.tags).toEqual([]);
		});

		it("sets order to 0", () => {
			const task = createMockTask();
			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.order).toBe(0);
		});

		it("sets interruptCount to 0", () => {
			const task = createMockTask();
			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.interruptCount).toBe(0);
		});

		it("preserves createdAt timestamp", () => {
			const timestamp = "2025-01-15T10:30:00.000Z";
			const task = createMockTask({
				createdAt: timestamp,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.createdAt).toBe(timestamp);
		});

		it("maps actualMinutes from elapsedMinutes", () => {
			const task = createMockTask({
				elapsedMinutes: 15,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.actualMinutes).toBe(15);
		});

		it("handles zero elapsedMinutes", () => {
			const task = createMockTask({
				elapsedMinutes: 0,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.actualMinutes).toBe(0);
		});
	});

	describe("edge cases and validation", () => {
		it("handles all state transitions correctly", () => {
			const states: TaskState[] = ["READY", "RUNNING", "PAUSED", "DONE"];

			states.forEach(state => {
				const task = createMockTask({ state });
				const streamItem = taskToTaskStreamItem(task);

				// Verify state mapping is consistent
				expect(streamItem.state).toBe(state);
				expect(STATE_TO_STATUS_MAP[state]).toBeDefined();
			});
		});

		it("handles READY state correctly", () => {
			const task = createMockTask({ state: "READY" });
			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("READY");
			expect(streamItem.status).toBe(STATE_TO_STATUS_MAP["READY"]);
		});

		it("handles RUNNING state correctly", () => {
			const task = createMockTask({ state: "RUNNING" });
			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("RUNNING");
			expect(streamItem.status).toBe(STATE_TO_STATUS_MAP["RUNNING"]);
		});

		it("handles PAUSED state correctly", () => {
			const task = createMockTask({ state: "PAUSED" });
			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("PAUSED");
			expect(streamItem.status).toBe(STATE_TO_STATUS_MAP["PAUSED"]);
		});

		it("handles DONE state correctly", () => {
			const task = createMockTask({ state: "DONE" });
			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("DONE");
			expect(streamItem.status).toBe(STATE_TO_STATUS_MAP["DONE"]);
		});

		it("handles very large estimatedMinutes", () => {
			const task = createMockTask({
				estimatedMinutes: 500,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.estimatedMinutes).toBe(500);
		});

		it("handles very large elapsedMinutes", () => {
			const task = createMockTask({
				elapsedMinutes: 300,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.actualMinutes).toBe(300);
		});

		it("preserves all required TaskStreamItem fields", () => {
			const task = createMockTask();
			const streamItem = taskToTaskStreamItem(task);

			// Verify all required fields are present
			expect(streamItem).toHaveProperty("id");
			expect(streamItem).toHaveProperty("title");
			expect(streamItem).toHaveProperty("status");
			expect(streamItem).toHaveProperty("state");
			expect(streamItem).toHaveProperty("estimatedMinutes");
			expect(streamItem).toHaveProperty("actualMinutes");
			expect(streamItem).toHaveProperty("tags");
			expect(streamItem).toHaveProperty("createdAt");
			expect(streamItem).toHaveProperty("order");
			expect(streamItem).toHaveProperty("interruptCount");
		});
	});

	describe("integration scenarios", () => {
		it("converts PAUSED task for Ambient display", () => {
			const task = createMockTask({
				id: "ambient-task",
				title: "Interrupted Task",
				state: "PAUSED",
				pausedAt: "2025-01-15T10:30:00.000Z",
				project: "project-abc",
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("PAUSED");
			expect(streamItem.projectId).toBe("project-abc");
			// Note: pausedAt is not included in TaskStreamItem, handled separately
		});

		it("converts READY task for suggestion", () => {
			const task = createMockTask({
				id: "ready-task",
				title: "Next Task",
				state: "READY",
				tags: ["urgent", "quick"],
				estimatedMinutes: 15,
				project: "project-xyz",
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("READY");
			expect(streamItem.tags).toContain("urgent");
			expect(streamItem.tags).toContain("quick");
			expect(streamItem.estimatedMinutes).toBe(15);
			expect(streamItem.projectId).toBe("project-xyz");
		});

		it("converts RUNNING task as anchor", () => {
			const task = createMockTask({
				id: "anchor-task",
				title: "Current Task",
				state: "RUNNING",
				estimatedMinutes: 25,
				elapsedMinutes: 10,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("RUNNING");
			expect(streamItem.estimatedMinutes).toBe(25);
			expect(streamItem.actualMinutes).toBe(10);
		});

		it("converts completed task", () => {
			const task = createMockTask({
				id: "done-task",
				title: "Completed Task",
				state: "DONE",
				completedAt: "2025-01-15T11:00:00.000Z",
				elapsedMinutes: 25,
			});

			const streamItem = taskToTaskStreamItem(task);

			expect(streamItem.state).toBe("DONE");
			expect(streamItem.actualMinutes).toBe(25);
		});

		it("handles batch conversion of multiple tasks", () => {
			const tasks = [
				createMockTask({ id: "1", state: "READY" }),
				createMockTask({ id: "2", state: "PAUSED" }),
				createMockTask({ id: "3", state: "RUNNING" }),
			];

			const streamItems = tasks.map(taskToTaskStreamItem);

			expect(streamItems).toHaveLength(3);
			expect(streamItems[0].id).toBe("1");
			expect(streamItems[1].id).toBe("2");
			expect(streamItems[2].id).toBe("3");
		});
	});

	describe("compatibility with NextTaskCandidates", () => {
		it("produces TaskStreamItem compatible with generateTaskSuggestions", () => {
			const task = createMockTask({
				id: "compatible-task",
				title: "Compatible Task",
				state: "READY",
				estimatedMinutes: 30,
				tags: ["urgent"],
				project: "project-test",
			});

			const streamItem = taskToTaskStreamItem(task);

			// Verify it has all fields needed by generateTaskSuggestions
			expect(streamItem.state).toBe("READY");
			expect(streamItem.estimatedMinutes).toBe(30);
			expect(streamItem.tags).toContain("urgent");
			expect(streamItem.projectId).toBe("project-test");
			expect(streamItem.interruptCount).toBe(0);
		});

		it("converts task with null estimatedMinutes to valid default", () => {
			const task = createMockTask({
				estimatedMinutes: null,
				state: "READY",
			});

			const streamItem = taskToTaskStreamItem(task);

			// Should have a valid estimatedMinutes for scoring
			expect(streamItem.estimatedMinutes).toBe(25);
			expect(typeof streamItem.estimatedMinutes).toBe("number");
		});
	});
});