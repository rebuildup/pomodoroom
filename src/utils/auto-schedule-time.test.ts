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
    const pausedB = makeTask({ id: "b", state: "PAUSED", requiredMinutes: 45, estimatedStartAt: null });

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
    const running = makeTask({ id: "r", state: "RUNNING", estimatedStartAt: "2026-02-14T08:00:00.000Z" });
    const done = makeTask({ id: "d", state: "DONE", estimatedStartAt: "2026-02-14T07:00:00.000Z", completed: true });
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
        { ...base, fixedStartAt: "2026-02-14T12:00:00.000Z", estimatedStartAt: "2026-02-14T09:00:00.000Z" },
        all,
      ),
    ).toBe("2026-02-14T12:00:00.000Z");

    expect(
      getDisplayStartTime(
        { ...base, fixedStartAt: null, windowStartAt: "2026-02-14T11:00:00.000Z", estimatedStartAt: "2026-02-14T09:00:00.000Z" },
        all,
      ),
    ).toBe("2026-02-14T11:00:00.000Z");

    expect(
      getDisplayStartTime(
        { ...base, fixedStartAt: null, windowStartAt: null, estimatedStartAt: "2026-02-14T09:00:00.000Z" },
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

  it("extends break length as uninterrupted focus streak grows", () => {
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
    expect((breaks[1]?.requiredMinutes ?? 0)).toBeGreaterThan(breaks[0]?.requiredMinutes ?? 0);
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
    expect((breaks[1]?.requiredMinutes ?? 0)).toBeLessThanOrEqual(12);
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
    const hasReadyTask = projected.some((t) => t.id.startsWith("ready-task") || t.id.includes("ready-task"));

    expect(doneTask).toBeDefined();
    expect(doneTask?.state).toBe("DONE");
    expect(hasReadyTask).toBe(true);
  });
});
