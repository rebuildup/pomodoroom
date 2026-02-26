import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarSidePanel } from "./CalendarSidePanel";

vi.mock("@/hooks/useCachedGoogleCalendar", () => ({
	useCachedGoogleCalendar: () => ({
		state: { isConnected: false, syncEnabled: false, isConnecting: false },
		isLoading: false,
		events: [],
		connectInteractive: vi.fn(async () => {}),
		fetchEvents: vi.fn(async () => []),
	}),
	getEventsForDate: () => [],
}));

vi.mock("@/hooks/useGoogleTasks", () => ({
	useGoogleTasks: () => ({
		state: { isConnected: false },
		tasklists: [],
		tasks: [],
		fetchTasklists: vi.fn(async () => []),
		setSelectedTasklists: vi.fn(async () => {}),
		fetchTasks: vi.fn(async () => []),
	}),
}));

vi.mock("@/hooks/useTaskStore", () => ({
	useTaskStore: () => ({
		tasks: [
			{
				id: "timeline-task-1",
				title: "Timeline task",
				description: undefined,
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
				estimatedStartAt: (() => {
					const d = new Date();
					d.setHours(9, 0, 0, 0);
					return d.toISOString();
				})(),
				tags: [],
				priority: null,
				category: "active",
				createdAt: (() => {
					const d = new Date();
					d.setHours(8, 0, 0, 0);
					return d.toISOString();
				})(),
				elapsedMinutes: 0,
				project: null,
				group: null,
				energy: "medium",
				updatedAt: (() => {
					const d = new Date();
					d.setHours(8, 0, 0, 0);
					return d.toISOString();
				})(),
				completedAt: null,
				pausedAt: null,
				startedAt: null,
				projectIds: [],
				groupIds: [],
				estimatedMinutes: null,
			},
		],
		importCalendarEvent: vi.fn(async () => {}),
		importTodoTask: vi.fn(async () => {}),
	}),
}));

vi.mock("@/components/GoogleCalendarSettingsModal", () => ({
	GoogleCalendarSettingsModal: () => null,
}));

describe("CalendarSidePanel timeline actions", () => {
	it("forwards timeline status clicks to onTaskOperation", () => {
		const onTaskOperation = vi.fn();
		const { container } = render(<CalendarSidePanel onTaskOperation={onTaskOperation} />);
		const statusButton = container.querySelector('[data-testid="calendar-today-timeline"] button');
		expect(statusButton).toBeTruthy();
		if (!statusButton) return;

		fireEvent.click(statusButton);
		expect(onTaskOperation).toHaveBeenCalledWith("timeline-task-1", "start");
	});
});
