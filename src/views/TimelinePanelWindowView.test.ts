import { describe, expect, it } from "vitest";
import type { Task } from "@/types/task";
import {
	buildTimelineTasksFromScheduleBlocks,
	filterTasksByDate,
	filterTasksByRange,
	type RawScheduleBlock,
} from "./TimelinePanelWindowView";

function makeTask(overrides: Partial<Task>): Task {
	const now = "2026-02-14T12:00:00.000Z";
	return {
		id: overrides.id ?? "task-1",
		title: overrides.title ?? "Sample Task",
		description: undefined,
		estimatedPomodoros: 1,
		completedPomodoros: 0,
		completed: false,
		state: overrides.state ?? "READY",
		kind: overrides.kind ?? "duration_only",
		requiredMinutes: overrides.requiredMinutes ?? 25,
		fixedStartAt: overrides.fixedStartAt ?? null,
		fixedEndAt: overrides.fixedEndAt ?? null,
		windowStartAt: overrides.windowStartAt ?? null,
		windowEndAt: overrides.windowEndAt ?? null,
		estimatedStartAt: overrides.estimatedStartAt ?? null,
		tags: [],
		priority: null,
		category: "active",
		createdAt: overrides.createdAt ?? now,
		elapsedMinutes: overrides.elapsedMinutes ?? 0,
		project: null,
		group: null,
		energy: "medium",
		updatedAt: overrides.updatedAt ?? now,
		completedAt: overrides.completedAt ?? null,
		pausedAt: overrides.pausedAt ?? null,
		startedAt: overrides.startedAt ?? null,
		projectIds: [],
		groupIds: [],
		estimatedMinutes: null,
	};
}

describe("buildTimelineTasksFromScheduleBlocks", () => {
	it("includes break blocks as timeline tasks", () => {
		const blocks: RawScheduleBlock[] = [
			{
				id: "b-1",
				block_type: "break",
				start_time: "2026-02-14T10:00:00.000Z",
				end_time: "2026-02-14T10:10:00.000Z",
				task_id: null,
				label: "Break",
			},
		];

		const tasks = buildTimelineTasksFromScheduleBlocks([], blocks, Date.parse("2026-02-14T12:00:00.000Z"));
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.kind).toBe("break");
		expect(tasks[0]?.title).toBe("Break");
		expect(tasks[0]?.fixedStartAt).toBe("2026-02-14T10:00:00.000Z");
		expect(tasks[0]?.fixedEndAt).toBe("2026-02-14T10:10:00.000Z");
	});

	it("prefers real task data when block references task_id", () => {
		const real = makeTask({
			id: "t-1",
			title: "Deep Work",
			kind: "duration_only",
		});
		const blocks: RawScheduleBlock[] = [
			{
				id: "b-1",
				block_type: "focus",
				start_time: "2026-02-14T09:00:00.000Z",
				end_time: "2026-02-14T09:25:00.000Z",
				task_id: "t-1",
				label: "Focus",
			},
		];

		const tasks = buildTimelineTasksFromScheduleBlocks([real], blocks, Date.parse("2026-02-14T08:00:00.000Z"));
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.id).toBe("t-1");
		expect(tasks[0]?.title).toBe("Deep Work");
		expect(tasks[0]?.fixedStartAt).toBe("2026-02-14T09:00:00.000Z");
		expect(tasks[0]?.fixedEndAt).toBe("2026-02-14T09:25:00.000Z");
	});
});

describe("filterTasksByRange", () => {
	it("keeps tasks that overlap the window", () => {
		const inRange = makeTask({
			id: "in",
			fixedStartAt: "2026-02-14T09:00:00.000Z",
			fixedEndAt: "2026-02-14T09:25:00.000Z",
		});
		const outRange = makeTask({
			id: "out",
			fixedStartAt: "2026-02-14T02:00:00.000Z",
			fixedEndAt: "2026-02-14T02:25:00.000Z",
		});

		const filtered = filterTasksByRange([inRange, outRange], {
			windowStartMs: Date.parse("2026-02-14T08:00:00.000Z"),
			windowEndMs: Date.parse("2026-02-14T12:00:00.000Z"),
		});

		expect(filtered.map((task) => task.id)).toEqual(["in"]);
	});
});

describe("filterTasksByDate", () => {
	it("returns tasks for the full selected day", () => {
		const selectedDate = new Date("2026-02-14T12:00:00");
		selectedDate.setHours(12, 0, 0, 0);
		const dayStart = new Date(selectedDate);
		dayStart.setHours(0, 0, 0, 0);
		const nextDayStart = new Date(dayStart);
		nextDayStart.setDate(nextDayStart.getDate() + 1);

		const early = makeTask({
			id: "early",
			fixedStartAt: new Date(dayStart.getTime() + 15 * 60_000).toISOString(),
			fixedEndAt: new Date(dayStart.getTime() + 45 * 60_000).toISOString(),
		});
		const late = makeTask({
			id: "late",
			fixedStartAt: new Date(dayStart.getTime() + 22 * 60 * 60_000).toISOString(),
			fixedEndAt: new Date(dayStart.getTime() + (22 * 60 + 30) * 60_000).toISOString(),
		});
		const nextDay = makeTask({
			id: "next",
			fixedStartAt: new Date(nextDayStart.getTime() + 60 * 60_000).toISOString(),
			fixedEndAt: new Date(nextDayStart.getTime() + 90 * 60_000).toISOString(),
		});

		const filtered = filterTasksByDate([early, late, nextDay], selectedDate);

		expect(filtered.map((task) => task.id)).toEqual(["early", "late"]);
	});
});
