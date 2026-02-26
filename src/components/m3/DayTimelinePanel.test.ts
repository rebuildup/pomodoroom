import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@/types/task";
import DayTimelinePanel, { calculateTimelineSegments, calculateLensShift } from "./DayTimelinePanel";

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

describe("calculateTimelineSegments", () => {
	it("creates a segment for DONE task using completedAt and requiredMinutes", () => {
		const task = makeTask({
			id: "done-task",
			state: "DONE",
			requiredMinutes: 40,
			completedAt: "2026-02-14T10:40:00.000Z",
		});

		const segments = calculateTimelineSegments([task], 60, 20);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.task.id).toBe("done-task");
	});

	it("creates a segment for RUNNING task using startedAt", () => {
		const task = makeTask({
			id: "running-task",
			state: "RUNNING",
			startedAt: "2026-02-14T09:00:00.000Z",
			requiredMinutes: 30,
		});

		const segments = calculateTimelineSegments([task], 60, 20);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.task.id).toBe("running-task");
	});

	it("creates a segment for READY task using estimatedStartAt", () => {
		const task = makeTask({
			id: "estimated-task",
			state: "READY",
			estimatedStartAt: "2026-02-14T15:00:00.000Z",
			requiredMinutes: 20,
		});

		const segments = calculateTimelineSegments([task], 60, 20);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.task.id).toBe("estimated-task");
	});
});

describe("calculateLensShift", () => {
	it("shifts positions below expanded segment by lens extra", () => {
		expect(calculateLensShift(100, 200, 50)).toBe(100);
		expect(calculateLensShift(201, 200, 50)).toBe(251);
	});
});

describe("DayTimelinePanel wheel zoom", () => {
	it("registers wheel listener with passive false", () => {
		const addEventListenerSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");

		render(
			createElement(DayTimelinePanel, {
				tasks: [
					makeTask({
						id: "zoom-task",
						state: "READY",
						estimatedStartAt: "2026-02-14T09:00:00.000Z",
					}),
				],
			}),
		);

		const timelineContainer = screen.getByTestId("day-timeline-panel");
		const wheelCallIndex = addEventListenerSpy.mock.calls.findIndex(
			(call, index) =>
				call[0] === "wheel" &&
				(addEventListenerSpy.mock.instances[index] as unknown) === timelineContainer &&
				typeof call[2] === "object" &&
				call[2] !== null &&
				"passive" in call[2],
		);

		expect(wheelCallIndex).toBeGreaterThanOrEqual(0);
		const wheelOptions = addEventListenerSpy.mock.calls[wheelCallIndex]?.[2] as AddEventListenerOptions;
		expect(wheelOptions.passive).toBe(false);

		addEventListenerSpy.mockRestore();
	});
});
