import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/types/task";
import { selectDueScheduledTask, selectNextBoardTasks } from "@/utils/next-board-tasks";

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
		...overrides,
	};
}

describe("selectNextBoardTasks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("prefers upcoming tasks over past tasks", () => {
		const tasks: Task[] = [
			makeTask({ id: "past", fixedStartAt: "2026-02-14T11:30:00.000Z", state: "READY" }),
			makeTask({ id: "future", fixedStartAt: "2026-02-14T12:30:00.000Z", state: "READY" }),
		];

		const next = selectNextBoardTasks(tasks, 2);
		expect(next[0]?.id).toBe("future");
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
		];
		const due = selectDueScheduledTask(tasks, Date.now());
		expect(due?.id).toBe("due-paused");
		vi.useRealTimers();
	});
});
