import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/types/task";
import {
	clearProjectedTasksCache,
	createSchedulingCacheKey,
	selectDueScheduledTask,
	selectNextBoardTasks,
} from "@/utils/next-board-tasks";

function makeTask(overrides: Partial<Task>): Task {
	const now = "2026-02-14T12:00:00.000Z";
	return {
		id: overrides.id ?? "t1",
		title: overrides.title ?? "Task",
		description: undefined,
		estimatedPomodoros: 1,
		completedPomodoros: 0,
		completed: false,
		state: overrides.state ?? "READY",
		kind: "duration_only",
		requiredMinutes: 25,
		fixedStartAt: null,
		fixedEndAt: null,
		windowStartAt: null,
		windowEndAt: null,
		estimatedStartAt: null,
		tags: [],
		priority: null,
		category: "active",
		createdAt: now,
		elapsedMinutes: 0,
		project: null,
		group: null,
		energy: "medium",
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
		startedAt: null,
		projectIds: [],
		groupIds: [],
		estimatedMinutes: null,
		...overrides,
	};
}

describe("selectNextBoardTasks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
		clearProjectedTasksCache();
	});

	afterEach(() => {
		vi.useRealTimers();
		clearProjectedTasksCache();
	});

	it("prefers upcoming tasks over past tasks", () => {
		const tasks: Task[] = [
			makeTask({ id: "past", fixedStartAt: "2026-02-14T11:30:00.000Z", state: "READY" }),
			makeTask({ id: "future", fixedStartAt: "2026-02-14T12:30:00.000Z", state: "READY" }),
		];

		const next = selectNextBoardTasks(tasks, 2);
		const futureIdx = next.findIndex((task) => task.id === "future");
		const pastIdx = next.findIndex((task) => task.id === "past");
		expect(futureIdx).not.toBe(-1);
		expect(futureIdx).toBeLessThan(pastIdx === -1 ? Number.MAX_SAFE_INTEGER : pastIdx);
	});

	it("excludes synthetic auto-generated split tasks from next candidates", () => {
		const tasks: Task[] = [
			makeTask({
				id: "a",
				fixedStartAt: "2026-02-14T12:00:00.000Z",
				requiredMinutes: 30,
				state: "READY",
			}),
			makeTask({
				id: "b",
				fixedStartAt: "2026-02-14T12:45:00.000Z",
				requiredMinutes: 30,
				state: "READY",
			}),
		];

		const next = selectNextBoardTasks(tasks, 3);
		// Only auto-split-focus segments should be excluded
	// Only auto-split-focus segments should be excluded
	// Break tasks (kind === "break") are shown as real scheduled activities
	expect(next.some((task) => task.tags.includes("auto-split-focus"))).toBe(false);
	});

	it("excludes DONE tasks from results", () => {
		const tasks: Task[] = [
			makeTask({ id: "done-task", fixedStartAt: "2026-02-14T11:00:00.000Z", state: "DONE" }),
			makeTask({ id: "ready-task", fixedStartAt: "2026-02-14T13:00:00.000Z", state: "READY" }), // future task
		];

		const next = selectNextBoardTasks(tasks, 3);
		// DONE task should be excluded
		expect(next.some((task) => task.id === "done-task")).toBe(false);
		// Only READY/PAUSED tasks should be included
		expect(
			next.every(
				(task) => task.state === "READY" || task.state === "PAUSED" || task.kind === "break",
			),
		).toBe(true);
	});
});

describe("selectDueScheduledTask", () => {
	it("returns earliest due READY/PAUSED task", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
		const tasks: Task[] = [
			makeTask({ id: "future", fixedStartAt: "2026-02-14T12:10:00.000Z", state: "READY" }),
			makeTask({ id: "due-paused", fixedStartAt: "2026-02-14T11:40:00.000Z", state: "PAUSED" }),
			makeTask({ id: "due-ready", fixedStartAt: "2026-02-14T11:50:00.000Z", state: "READY" }),
			makeTask({ id: "due-done", fixedStartAt: "2026-02-14T11:30:00.000Z", state: "DONE" }),
		];
		const due = selectDueScheduledTask(tasks, Date.now());
		// Should return due-paused (earliest non-DONE task)
		expect(due?.id).toBe("due-paused");
		vi.useRealTimers();
	});

	it("excludes DONE tasks from results", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
		const tasks: Task[] = [
			makeTask({ id: "done-task", fixedStartAt: "2026-02-14T11:30:00.000Z", state: "DONE" }),
			makeTask({ id: "ready-task", fixedStartAt: "2026-02-14T11:50:00.000Z", state: "READY" }),
		];
		const due = selectDueScheduledTask(tasks, Date.now());
		// Should return ready-task, not done-task
		expect(due?.id).toBe("ready-task");
		vi.useRealTimers();
	});

	it("ignores stale ended fixed/window tasks for due selection", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
		const tasks: Task[] = [
			makeTask({
				id: "stale-fixed",
				kind: "fixed_event",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				fixedEndAt: "2026-02-14T09:30:00.000Z",
				state: "READY",
			}),
			makeTask({
				id: "stale-window",
				kind: "flex_window",
				windowStartAt: "2026-02-14T10:00:00.000Z",
				windowEndAt: "2026-02-14T10:30:00.000Z",
				state: "PAUSED",
			}),
			makeTask({
				id: "still-due",
				kind: "fixed_event",
				fixedStartAt: "2026-02-14T11:40:00.000Z",
				fixedEndAt: "2026-02-14T12:20:00.000Z",
				state: "READY",
			}),
		];
		const due = selectDueScheduledTask(tasks, Date.now());
		expect(due?.id).toBe("still-due");
		vi.useRealTimers();
	});
});

describe("createSchedulingCacheKey", () => {
	it("returns same key for identical scheduling properties", () => {
		const tasks1 = [
			makeTask({ id: "a", fixedStartAt: "2026-02-14T12:00:00.000Z", state: "READY" }),
		];
		const tasks2 = [
			makeTask({ id: "a", fixedStartAt: "2026-02-14T12:00:00.000Z", state: "READY" }),
		];
		expect(createSchedulingCacheKey(tasks1)).toBe(createSchedulingCacheKey(tasks2));
	});

	it("returns different key for different scheduling properties", () => {
		const tasks1 = [
			makeTask({ id: "a", fixedStartAt: "2026-02-14T12:00:00.000Z", state: "READY" }),
		];
		const tasks2 = [
			makeTask({ id: "a", fixedStartAt: "2026-02-14T13:00:00.000Z", state: "READY" }),
		];
		expect(createSchedulingCacheKey(tasks1)).not.toBe(createSchedulingCacheKey(tasks2));
	});

	it("ignores non-scheduling properties", () => {
		const tasks1 = [makeTask({ id: "a", title: "Task A", state: "READY", description: "desc1" })];
		const tasks2 = [makeTask({ id: "a", title: "Task B", state: "READY", description: "desc2" })];
		expect(createSchedulingCacheKey(tasks1)).toBe(createSchedulingCacheKey(tasks2));
	});
});
