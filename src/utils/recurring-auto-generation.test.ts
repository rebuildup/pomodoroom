import { describe, expect, it } from "vitest";
import {
	buildRecurringAutoTasks,
	findRecurringDuplicateTaskIds,
	type RecurringLifeEntry,
	type RecurringMacroEntry,
} from "@/utils/recurring-auto-generation";
import type { Task } from "@/types/task";

describe("buildRecurringAutoTasks", () => {
	it("creates today's life task and avoids duplicates by marker", () => {
		const date = new Date("2026-02-16T09:00:00+09:00"); // Monday
		const life: RecurringLifeEntry[] = [
			{
				id: "life-1",
				name: "朝の準備",
				startTime: "07:30",
				durationMinutes: 30,
				repeat: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
				enabled: true,
			},
		];

		const first = buildRecurringAutoTasks({
			date,
			lifeEntries: life,
			macroEntries: [],
			existingTasks: [],
		});
		expect(first).toHaveLength(1);
		expect(first[0]?.kind).toBe("fixed_event");

		const second = buildRecurringAutoTasks({
			date,
			lifeEntries: life,
			macroEntries: [],
			existingTasks: [{ description: first[0]?.description }],
		});
		expect(second).toHaveLength(0);
	});

	it("creates macro daily task and skips invalid window", () => {
		const date = new Date("2026-02-16T09:00:00+09:00");
		const macro: RecurringMacroEntry[] = [
			{
				id: "m1",
				title: "日次レビュー",
				cadence: "daily",
				windowStartAt: "2026-02-01T20:00",
				windowEndAt: "2026-02-01T21:00",
				estimatedMinutes: 45,
				repeat: { type: "weekdays", weekdays: [1] },
				enabled: true,
			},
			{
				id: "m2",
				title: "broken",
				cadence: "daily",
				windowStartAt: "",
				windowEndAt: "",
				estimatedMinutes: 20,
				repeat: { type: "weekdays", weekdays: [1] },
				enabled: true,
			},
		];

		const drafts = buildRecurringAutoTasks({
			date,
			lifeEntries: [],
			macroEntries: macro,
			existingTasks: [],
		});

		expect(drafts).toHaveLength(1);
		expect(drafts[0]?.kind).toBe("flex_window");
		expect(drafts[0]?.title).toBe("日次レビュー");
	});
});

describe("findRecurringDuplicateTaskIds", () => {
	it("returns only duplicate recurring task ids and keeps latest updated", () => {
		const base: Omit<Task, "id" | "title" | "description" | "updatedAt" | "createdAt"> = {
			estimatedPomodoros: 1,
			completedPomodoros: 0,
			completed: false,
			state: "READY",
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
			elapsedMinutes: 0,
			project: null,
			group: null,
			energy: "medium",
			completedAt: null,
			pausedAt: null,
		};

		const tasks: Task[] = [
			{
				...base,
				id: "keep",
				title: "A",
				description: "[recurring:life:x:2026-02-14] Auto",
				createdAt: "2026-02-14T00:00:00.000Z",
				updatedAt: "2026-02-14T10:00:00.000Z",
			},
			{
				...base,
				id: "delete",
				title: "A dup",
				description: "[recurring:life:x:2026-02-14] Auto",
				createdAt: "2026-02-14T00:00:00.000Z",
				updatedAt: "2026-02-14T09:00:00.000Z",
			},
			{
				...base,
				id: "normal",
				title: "Normal",
				description: "manual task",
				createdAt: "2026-02-14T00:00:00.000Z",
				updatedAt: "2026-02-14T08:00:00.000Z",
			},
		];

		expect(findRecurringDuplicateTaskIds(tasks)).toEqual(["delete"]);
	});
});
