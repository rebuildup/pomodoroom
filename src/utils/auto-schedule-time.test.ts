import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Task } from "@/types/task";
import {
	recalculateEstimatedStarts,
	getDisplayStartTime,
	buildProjectedTasksWithAutoBreaks,
} from "@/utils/auto-schedule-time";

function makeTask(overrides: Partial<Task>): Task {
	const now = "2026-02-14T00:00:00.000Z";
	return {
		id: overrides.id ?? "t1",
		title: overrides.title ?? "task",
		description: overrides.description,
		state: overrides.state ?? "READY",
		priority: overrides.priority ?? 0,
		project: overrides.project ?? null,
		kind: overrides.kind ?? "duration_only",
		requiredMinutes: overrides.requiredMinutes ?? 25,
		fixedStartAt: overrides.fixedStartAt ?? null,
		fixedEndAt: overrides.fixedEndAt ?? null,
		windowStartAt: overrides.windowStartAt ?? null,
		windowEndAt: overrides.windowEndAt ?? null,
		estimatedStartAt: overrides.estimatedStartAt ?? null,
		tags: overrides.tags ?? [],
		estimatedPomodoros: overrides.estimatedPomodoros ?? 1,
		completedPomodoros: overrides.completedPomodoros ?? 0,
		completed: overrides.completed ?? false,
		category: overrides.category ?? "active",
		createdAt: overrides.createdAt ?? now,
		elapsedMinutes: overrides.elapsedMinutes ?? 0,
		group: overrides.group ?? null,
		energy: overrides.energy ?? "medium",
		updatedAt: overrides.updatedAt ?? now,
		completedAt: overrides.completedAt ?? null,
		pausedAt: overrides.pausedAt ?? null,
		startedAt: overrides.startedAt ?? null,
		projectIds: overrides.projectIds ?? [],
		groupIds: overrides.groupIds ?? [],
		estimatedMinutes: overrides.estimatedMinutes ?? null,
	};
}

describe("auto schedule estimatedStartAt", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T09:07:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("recalculates READY/PAUSED tasks and keeps explicit scheduled tasks fixed", () => {
		const fixed = makeTask({
			id: "fixed",
			kind: "fixed_event",
			fixedStartAt: "2026-02-14T10:00:00.000Z",
			fixedEndAt: "2026-02-14T11:00:00.000Z",
			requiredMinutes: 60,
			estimatedStartAt: null,
		});

		const readyA = makeTask({ id: "a", requiredMinutes: 30, estimatedStartAt: null });
		const pausedB = makeTask({
			id: "b",
			state: "PAUSED",
			requiredMinutes: 45,
			estimatedStartAt: null,
		});

		const result = recalculateEstimatedStarts([readyA, fixed, pausedB]);
		const a = result.find((t) => t.id === "a");
		const b = result.find((t) => t.id === "b");
		const f = result.find((t) => t.id === "fixed");

		expect(a?.estimatedStartAt).toBe("2026-02-14T09:15:00.000Z");
		expect(b?.estimatedStartAt).toBe("2026-02-14T11:00:00.000Z");
		expect(f?.fixedStartAt).toBe("2026-02-14T10:00:00.000Z");
		expect(f?.estimatedStartAt).toBeNull();
	});

	it("does not alter RUNNING or DONE estimatedStartAt", () => {
		const running = makeTask({
			id: "r",
			state: "RUNNING",
			estimatedStartAt: "2026-02-14T08:00:00.000Z",
		});
		const done = makeTask({
			id: "d",
			state: "DONE",
			estimatedStartAt: "2026-02-14T07:00:00.000Z",
			completed: true,
		});
		const ready = makeTask({ id: "x", estimatedStartAt: null });

		const result = recalculateEstimatedStarts([running, done, ready]);

		expect(result.find((t) => t.id === "r")?.estimatedStartAt).toBe("2026-02-14T08:00:00.000Z");
		expect(result.find((t) => t.id === "d")?.estimatedStartAt).toBe("2026-02-14T07:00:00.000Z");
		expect(result.find((t) => t.id === "x")?.estimatedStartAt).toBeTruthy();
	});

	it("display start time priority is fixed/window/estimated", () => {
		const base = makeTask({});
		const all = [base];

		expect(
			getDisplayStartTime(
				{
					...base,
					fixedStartAt: "2026-02-14T12:00:00.000Z",
					estimatedStartAt: "2026-02-14T09:00:00.000Z",
				},
				all,
			),
		).toBe("2026-02-14T12:00:00.000Z");

		expect(
			getDisplayStartTime(
				{
					...base,
					fixedStartAt: null,
					windowStartAt: "2026-02-14T11:00:00.000Z",
					estimatedStartAt: "2026-02-14T09:00:00.000Z",
				},
				all,
			),
		).toBe("2026-02-14T11:00:00.000Z");

		expect(
			getDisplayStartTime(
				{
					...base,
					fixedStartAt: null,
					windowStartAt: null,
					estimatedStartAt: "2026-02-14T09:00:00.000Z",
				},
				all,
			),
		).toBe("2026-02-14T09:00:00.000Z");
	});
});

describe("buildProjectedTasksWithAutoBreaks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T09:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("inserts an auto break task between scheduled tasks", () => {
		const tasks = [
			makeTask({
				id: "focus-1",
				title: "Focus 1",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 30,
			}),
			makeTask({
				id: "focus-2",
				title: "Focus 2",
				fixedStartAt: "2026-02-14T09:50:00.000Z",
				requiredMinutes: 30,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const autoBreak = projected.find((t) => t.kind === "break");

		expect(autoBreak).toBeDefined();
		expect(autoBreak?.title).toContain("休憩");
		expect(autoBreak?.fixedStartAt).toBeTruthy();
		expect(autoBreak?.requiredMinutes).toBeGreaterThanOrEqual(5);
		expect(autoBreak?.requiredMinutes).toBeLessThanOrEqual(20);
	});

	it("keeps scheduled between-task break at 5 minutes under the default rhythm", () => {
		const tasks = [
			makeTask({
				id: "focus-1",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 25,
			}),
			makeTask({
				id: "focus-2",
				fixedStartAt: "2026-02-14T09:35:00.000Z",
				requiredMinutes: 45,
			}),
			makeTask({
				id: "focus-3",
				fixedStartAt: "2026-02-14T10:30:00.000Z",
				requiredMinutes: 60,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const breaks = projected
			.filter((t) => t.kind === "break" && !t.tags.includes("auto-split-break"))
			.sort((a, b) => {
				const aStart = Date.parse(a.fixedStartAt ?? "");
				const bStart = Date.parse(b.fixedStartAt ?? "");
				return aStart - bStart;
			});

		expect(breaks).toHaveLength(2);
		expect(breaks[0]?.requiredMinutes).toBe(5);
		expect(breaks[1]?.requiredMinutes).toBe(5);
	});

	it("marks break tags when context switching cognitive load spikes", () => {
		const lowSwitchTasks = [
			makeTask({
				id: "low-1",
				project: "A",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 30,
			}),
			makeTask({
				id: "low-2",
				project: "A",
				fixedStartAt: "2026-02-14T09:50:00.000Z",
				requiredMinutes: 30,
			}),
		];

		const highSwitchTasks = [
			makeTask({
				id: "high-1",
				project: "A",
				tags: ["deep"],
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 30,
			}),
			makeTask({
				id: "high-2",
				project: "B",
				tags: ["meeting"],
				fixedStartAt: "2026-02-14T09:50:00.000Z",
				requiredMinutes: 30,
			}),
		];

		const lowProjected = buildProjectedTasksWithAutoBreaks(lowSwitchTasks);
		const highProjected = buildProjectedTasksWithAutoBreaks(highSwitchTasks);

		const lowBreak = lowProjected.find(
			(t) => t.kind === "break" && !t.tags.includes("auto-split-break"),
		);
		const highBreak = highProjected.find(
			(t) => t.kind === "break" && !t.tags.includes("auto-split-break"),
		);

		expect(lowBreak?.requiredMinutes).toBe(5);
		expect(highBreak?.requiredMinutes).toBe(5);
		expect(highBreak?.tags).toContain("cognitive-load-spike");
	});

	it("resets break ramp after a large gap", () => {
		const tasks = [
			makeTask({
				id: "focus-1",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 60,
			}),
			makeTask({
				id: "focus-2",
				fixedStartAt: "2026-02-14T11:00:00.000Z",
				requiredMinutes: 60,
			}),
			makeTask({
				id: "focus-3",
				fixedStartAt: "2026-02-14T12:15:00.000Z",
				requiredMinutes: 60,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const breaks = projected
			.filter((t) => t.kind === "break" && !t.tags.includes("auto-split-break"))
			.sort((a, b) => {
				const aStart = Date.parse(a.fixedStartAt ?? "");
				const bStart = Date.parse(b.fixedStartAt ?? "");
				return aStart - bStart;
			});

		expect(breaks).toHaveLength(2);
		expect(breaks[1]?.requiredMinutes ?? 0).toBeLessThanOrEqual(12);
	});

	it("splits long tasks into focus segments with inserted break tasks", () => {
		const tasks = [
			makeTask({
				id: "deep-work",
				title: "Deep Work",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 120,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const splitFocus = projected.filter((t) => t.tags.includes("auto-split-focus"));
		const autoBreaks = projected.filter((t) => t.kind === "break");

		expect(splitFocus.length).toBeGreaterThanOrEqual(2);
		expect(autoBreaks.length).toBeGreaterThanOrEqual(1);
		expect(splitFocus[0]?.fixedStartAt).toBe("2026-02-14T09:00:00.000Z");
	});

	it("uses 15/30/60/75 focus rhythm with 5m breaks and 20m long break", () => {
		const tasks = [
			makeTask({
				id: "rhythm-focus",
				title: "Rhythm Focus",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 240,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const focusSegments = projected
			.filter((t) => t.id === "rhythm-focus" || t.id.startsWith("auto-split-rhythm-focus-"))
			.map((t) => {
				const start = Date.parse(t.fixedStartAt ?? "");
				const end = Date.parse(t.fixedEndAt ?? "");
				return Math.round((end - start) / 60_000);
			});
		const breakSegments = projected
			.filter((t) => t.kind === "break" && t.id.startsWith("auto-break-rhythm-focus-"))
			.map((t) => t.requiredMinutes ?? 0);

		expect(focusSegments.slice(0, 4)).toEqual([15, 30, 60, 75]);
		expect(breakSegments.slice(0, 4)).toEqual([5, 5, 5, 20]);
	});

	it("resets focus rhythm to 15 minutes after a fixed event", () => {
		const tasks = [
			makeTask({
				id: "deep-1",
				title: "Deep 1",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 120,
			}),
			makeTask({
				id: "meeting",
				title: "Meeting",
				kind: "fixed_event",
				fixedStartAt: "2026-02-14T11:15:00.000Z",
				fixedEndAt: "2026-02-14T12:00:00.000Z",
				requiredMinutes: 45,
			}),
			makeTask({
				id: "deep-2",
				title: "Deep 2",
				fixedStartAt: "2026-02-14T12:00:00.000Z",
				requiredMinutes: 120,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const postMeetingFirstFocus = projected.find(
			(t) => t.id === "deep-2" || t.id.startsWith("auto-split-deep-2-"),
		);
		const meetingSegments = projected.filter(
			(t) => t.id === "meeting" || t.id.startsWith("auto-split-meeting-"),
		);

		expect(meetingSegments).toHaveLength(1);
		const start = Date.parse(postMeetingFirstFocus?.fixedStartAt ?? "");
		const end = Date.parse(postMeetingFirstFocus?.fixedEndAt ?? "");
		expect(Math.round((end - start) / 60_000)).toBe(15);
	});

	it("inserts breaks even with back-to-back tasks and applies 20m after 75m", () => {
		const tasks = [
			makeTask({ id: "t15", title: "T15", requiredMinutes: 15, fixedStartAt: null }),
			makeTask({ id: "t30", title: "T30", requiredMinutes: 30, fixedStartAt: null }),
			makeTask({ id: "t60", title: "T60", requiredMinutes: 60, fixedStartAt: null }),
			makeTask({ id: "t75", title: "T75", requiredMinutes: 75, fixedStartAt: null }),
			makeTask({ id: "next", title: "Next", requiredMinutes: 30, fixedStartAt: null }),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const breaks = projected
			.filter((t) => t.kind === "break")
			.map((t) => t.requiredMinutes ?? 0);

		expect(breaks.slice(0, 4)).toEqual([5, 5, 5, 20]);
	});

	it("keeps requiredMinutes shared across split segments and uses numbered titles", () => {
		const tasks = [
			makeTask({
				id: "long-task",
				title: "Long Task",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 180,
			}),
		];
		const projected = buildProjectedTasksWithAutoBreaks(tasks);
		const focusSegments = projected
			.filter((t) => t.id.startsWith("auto-split-long-task-"))
			.sort((a, b) => (a.fixedStartAt ?? "").localeCompare(b.fixedStartAt ?? ""));

		expect(focusSegments.length).toBeGreaterThanOrEqual(2);
		for (const [idx, seg] of focusSegments.entries()) {
			expect(seg.requiredMinutes).toBe(180);
			expect(seg.title).toBe(`Long Task (${idx + 1})`);
		}
	});

	it("includes DONE tasks in projected results", () => {
		const tasks = [
			makeTask({
				id: "done-task",
				title: "Done Task",
				state: "DONE",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 30,
				completed: true,
			}),
			makeTask({
				id: "ready-task",
				title: "Ready Task",
				state: "READY",
				fixedStartAt: "2026-02-14T09:45:00.000Z",
				requiredMinutes: 30,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks);

		const doneTask = projected.find((t) => t.id === "done-task");
		// READY task may be auto-split, so check for any task with the ready-task prefix
		const hasReadyTask = projected.some(
			(t) => t.id.startsWith("ready-task") || t.id.includes("ready-task"),
		);

		expect(doneTask).toBeDefined();
		expect(doneTask?.state).toBe("DONE");
		expect(hasReadyTask).toBe(true);
	});

	it("starts from a higher focus stage when recent completion rate is high", () => {
		const doneFocusSegments = Array.from({ length: 10 }, (_, index) =>
			makeTask({
				id: `done-${index}`,
				state: "DONE",
				fixedStartAt: `2026-02-14T0${Math.floor(index / 2)}:${index % 2 === 0 ? "00" : "30"}:00.000Z`,
				requiredMinutes: 25,
				completed: true,
				completedAt: `2026-02-14T0${Math.floor(index / 2)}:${index % 2 === 0 ? "25" : "55"}:00.000Z`,
			}),
		);
		const nextTask = makeTask({
			id: "next-focus",
			fixedStartAt: "2026-02-14T10:00:00.000Z",
			requiredMinutes: 120,
			state: "READY",
		});

		const projected = buildProjectedTasksWithAutoBreaks([...doneFocusSegments, nextTask], {
			focusRamp: { enabled: true, resetPolicy: "daily" },
		});
		const firstNextSegment = projected.find(
			(t) => t.id === "next-focus" || t.id === "auto-split-next-focus-1",
		);

		// baseline stage is 15min; high completion ratio should upshift to stage 1 => 30min
		const start = Date.parse(firstNextSegment?.fixedStartAt ?? "");
		const end = Date.parse(firstNextSegment?.fixedEndAt ?? "");
		expect(Math.round((end - start) / 60_000)).toBe(30);
	});

	it("does not deadlock when enforced cooldown exceeds available gap", () => {
		const tasks = [
			makeTask({
				id: "focus-1",
				fixedStartAt: "2026-02-14T09:00:00.000Z",
				requiredMinutes: 15,
			}),
			makeTask({
				id: "focus-2",
				fixedStartAt: "2026-02-14T09:25:00.000Z",
				requiredMinutes: 15,
			}),
		];

		const projected = buildProjectedTasksWithAutoBreaks(tasks, {
			overfocusGuard: {
				enabled: true,
				threshold: 0,
				minCooldownMinutes: 15,
			},
		});

		const betweenBreak = projected.find(
			(t) => t.kind === "break" && !t.tags.includes("auto-split-break"),
		);
		const nextFocus = projected.find(
			(t) => t.id === "focus-2" || t.id.startsWith("auto-split-focus-2"),
		);

		expect(betweenBreak).toBeDefined();
		expect(betweenBreak?.requiredMinutes ?? 0).toBeLessThanOrEqual(10);
		expect(nextFocus).toBeDefined();
	});

	// Recovery mode test removed - database-only architecture
});
