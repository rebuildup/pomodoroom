import { describe, expect, it } from "vitest";
import type { Task } from "@/types/task";
import { getNextTaskStartMs, getNextTaskCountdownMs } from "@/utils/next-task-countdown";

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

describe("next-task-countdown", () => {
	it("returns the earliest upcoming start among READY/PAUSED tasks", () => {
		const tasks: Task[] = [
			makeTask({ id: "a", state: "READY", estimatedStartAt: "2026-02-14T12:20:00.000Z" }),
			makeTask({ id: "b", state: "PAUSED", fixedStartAt: "2026-02-14T12:10:00.000Z" }),
			makeTask({ id: "c", state: "RUNNING", estimatedStartAt: "2026-02-14T12:05:00.000Z" }),
		];

		const nextMs = getNextTaskStartMs(tasks, Date.parse("2026-02-14T12:00:00.000Z"));
		expect(nextMs).toBe(Date.parse("2026-02-14T12:10:00.000Z"));
	});

	it("clamps countdown at zero when next start is in the past", () => {
		const tasks: Task[] = [
			makeTask({ id: "a", state: "READY", estimatedStartAt: "2026-02-14T11:55:00.000Z" }),
		];

		const ms = getNextTaskCountdownMs(tasks, Date.parse("2026-02-14T12:00:00.000Z"));
		expect(ms).toBe(0);
	});
});

