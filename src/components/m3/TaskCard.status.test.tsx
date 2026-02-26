import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@/types/task";
import { TaskCard } from "./TaskCard";

vi.mock("@dnd-kit/sortable", () => ({
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: () => {},
		transform: null,
		transition: null,
		isDragging: false,
	}),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
	const now = "2026-02-14T12:00:00.000Z";
	return {
		id: overrides.id ?? "task-1",
		title: overrides.title ?? "Sample Task",
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
		priority: 50,
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

describe("TaskCard status control", () => {
	it("toggles expand by default when expandOnClick is enabled", () => {
		const onOperation = vi.fn();
		const onExpandedChange = vi.fn();
		const task = makeTask({ state: "READY" });

		render(
			<TaskCard
				task={task}
				draggable={false}
				expandOnClick={true}
				onOperation={onOperation}
				onExpandedChange={onExpandedChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "radio_button_unchecked" }));

		expect(onExpandedChange).toHaveBeenCalledWith(task.id, true);
		expect(onOperation).not.toHaveBeenCalled();
	});

	it("can trigger operation from status button even when expandOnClick is enabled", () => {
		const onOperation = vi.fn();
		const onExpandedChange = vi.fn();
		const task = makeTask({ state: "READY" });

		render(
			<TaskCard
				task={task}
				draggable={false}
				expandOnClick={true}
				statusClickMode="operation"
				onOperation={onOperation}
				onExpandedChange={onExpandedChange}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "radio_button_unchecked" }));

		expect(onOperation).toHaveBeenCalledWith(task.id, "start");
		expect(onExpandedChange).not.toHaveBeenCalled();
	});

	it("toggles expansion when clicking card body in operation mode", () => {
		const onOperation = vi.fn();
		const onExpandedChange = vi.fn();
		const task = makeTask({ state: "READY" });

		render(
			<TaskCard
				task={task}
				draggable={false}
				expandOnClick={true}
				statusClickMode="operation"
				onOperation={onOperation}
				onExpandedChange={onExpandedChange}
			/>,
		);

		fireEvent.click(screen.getByText("Sample Task"));

		expect(onExpandedChange).toHaveBeenCalledWith(task.id, true);
		expect(onOperation).not.toHaveBeenCalled();
	});
});
