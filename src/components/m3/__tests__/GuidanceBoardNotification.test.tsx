import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GuidanceBoard } from "@/components/m3/GuidanceBoard";
import type { Task as V2Task } from "@/types/task";

function makeNextTask(overrides: Partial<V2Task> = {}): V2Task {
	const now = "2026-02-14T12:00:00.000Z";
	return {
		id: overrides.id ?? "next-1",
		title: overrides.title ?? "Auto Task",
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
		estimatedStartAt: overrides.estimatedStartAt ?? "2026-02-14T12:10:00.000Z",
		tags: [],
		priority: null,
		category: "active",
		createdAt: now,
		group: null,
		project: null,
		energy: "medium",
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
		elapsedMinutes: overrides.elapsedMinutes ?? 0,
		projectIds: [],
		groupIds: [],
		estimatedMinutes: null,
		...overrides,
	};
}

const baselineProps = {
	activeTimerRemainingMs: 0,
	activeTimerTotalMs: null,
	isTimerActive: false,
	runningTasks: [],
	ambientCandidates: [],
};

describe("GuidanceBoard next section notifications", () => {
	it("calls start notification when the START control is tapped", () => {
		const onNotify = vi.fn();
		render(
			<GuidanceBoard
				{...baselineProps}
				nextTasks={[makeNextTask()]}
				onRequestStartNotification={onNotify}
			/>
		);

		fireEvent.click(screen.getByText("Auto Task"));
		fireEvent.click(screen.getByRole("button", { name: "開始" }));
		expect(onNotify).toHaveBeenCalledWith("next-1");
	});

	it("calls postpone notification when the 先送り control is tapped", () => {
		const onPostpone = vi.fn();
		render(
			<GuidanceBoard
				{...baselineProps}
				nextTasks={[makeNextTask()]}
				onRequestPostponeNotification={onPostpone}
			/>
		);

		fireEvent.click(screen.getByText("Auto Task"));
		fireEvent.click(screen.getByRole("button", { name: "先送り" }));
		expect(onPostpone).toHaveBeenCalledWith("next-1");
	});

	it("keeps timer panel in active mode even when no running task card is present", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-14T12:00:00.000Z"));
		render(
			<GuidanceBoard
				{...baselineProps}
				isTimerActive={true}
				activeTimerRemainingMs={5000}
				nextTasks={[makeNextTask({ estimatedStartAt: "2026-02-14T12:10:00.000Z" })]}
			/>
		);

		expect(screen.getByText("00:00")).toBeInTheDocument();
		expect(screen.getByText(":05")).toBeInTheDocument();
		vi.useRealTimers();
	});
});
