/**
 * Integration tests for useTimeline hook
 *
 * Tests 実データパイプライン:
 * - Task fetching via cmd_task_list
 * - Calendar event fetching via cmd_google_calendar_list_events / cmd_schedule_list_blocks
 * - Gap detection via cmd_timeline_detect_gaps
 * - Proposal generation via cmd_timeline_generate_proposals
 * - Priority calculation via cmd_calculate_priority / cmd_calculate_priorities
 * - Type safety and data conversion
 */

import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import type { TimelineItem } from "@/types";
import { useTimeline } from "./useTimeline";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

// Mock googleCalendarAdapter
vi.mock("@/utils/googleCalendarAdapter", () => ({
	eventToTimeRange: vi.fn((event: any) => ({
		start_time: event.start?.dateTime || event.start?.date,
		end_time: event.end?.dateTime || event.end?.date,
	})),
}));

describe("useTimeline", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(window, "__TAURI__", {
			// @ts-ignore - TS doesn't know about __TAURI__
			value: {},
			writable: true,
			configurable: true,
		});

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root?.unmount();
		container?.remove();
	});

	// Shared TimelineHarness component for all tests
	function TimelineHarness() {
		const timeline = useTimeline();
		(window as any).__testTimelineResult = timeline;
		return <div>{Object.keys(timeline).length}</div>;
	}

	describe("getTasks", () => {
		it("should invoke cmd_task_list with correct parameters", async () => {
			const mockTasks = [
				{
					id: "task-1",
					title: "Test task",
					description: "Test description",
					created_at: "2024-01-15T09:00:00",
					updated_at: "2024-01-15T09:00:00",
					completed: false,
					priority: 80,
					tags: ["test"],
					estimated_pomodoros: 2,
					completed_pomodoros: 1,
					state: "READY",
					project_id: "project-1",
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockTasks));

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const tasks = await timeline.getTasks();

			expect(invoke).toHaveBeenCalledWith("cmd_task_list", {
				projectId: null,
				category: "active",
			});
			expect(tasks.length).toBe(1);
		});

		it("should convert backend task to TimelineItem format", async () => {
			const mockTasks = [
				{
					id: "task-1",
					title: "Review PRs",
					description: "Review pending pull requests",
					created_at: "2024-01-15T09:00:00",
					updated_at: "2024-01-15T10:00:00",
					completed: false,
					priority: 90,
					tags: ["review", "urgent"],
					estimated_pomodoros: 3,
					completed_pomodoros: 1,
					state: "RUNNING",
					project_id: "proj-1",
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockTasks));

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const tasks = await timeline.getTasks();

			// Verify key fields - startTime/endTime format may vary by JS environment
			expect(tasks[0].id).toBe("task-1");
			expect(tasks[0].type).toBe("task");
			expect(tasks[0].source).toBe("local");
			expect(tasks[0].title).toBe("Review PRs");
			expect(tasks[0].description).toBe("Review pending pull requests");
			expect(tasks[0].completed).toBe(false);
			expect(tasks[0].priority).toBe(90);
			expect(tasks[0].deadline).toBe(undefined);
			expect(tasks[0].tags).toEqual(["review", "urgent"]);
			expect(tasks[0].url).toBe(undefined);
			// Verify metadata object
			expect(tasks[0].metadata).toBeDefined();
			expect(tasks[0].metadata.estimated_pomodoros).toBe(3);
			expect(tasks[0].metadata.completed_pomodoros).toBe(1);
			expect(tasks[0].metadata.estimated_minutes).toBe(undefined);
			expect(tasks[0].metadata.elapsed_minutes).toBe(undefined);
			expect(tasks[0].metadata.state).toBe("RUNNING");
			expect(tasks[0].metadata.project_id).toBe("proj-1");
			// Verify startTime/endTime are valid ISO strings
			expect(tasks[0].startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(tasks[0].endTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it("should handle errors and return empty array", async () => {
			const error = new Error("Database connection failed");
			vi.mocked(invoke).mockImplementation(() => Promise.reject(error));

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const tasks = await timeline.getTasks();
			expect(tasks).toEqual([]);
		});
	});

	describe("detectGaps", () => {
		it("should invoke cmd_timeline_detect_gaps with events", async () => {
			const events = [
				{ start_time: "2024-01-15T09:00:00", end_time: "2024-01-15T10:00:00" },
				{ start_time: "2024-01-15T11:00:00", end_time: "2024-01-15T12:00:00" },
			];

			const mockGaps = [
				{
					start_time: "2024-01-15T10:00:00",
					end_time: "2024-01-15T11:00:00",
					duration: 60,
					size: "medium",
				},
			];

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_timeline_detect_gaps") {
					return Promise.resolve(mockGaps);
				}
				return Promise.resolve([]);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const gaps = await timeline.detectGaps(events);
			expect(invoke).toHaveBeenCalledWith("cmd_timeline_detect_gaps", {
				eventsJson: events,
			});
			expect(gaps.length).toBe(1);
		});

		it("should return whole day as gap when no events provided", async () => {
			vi.mocked(invoke).mockImplementation(() => Promise.resolve([]));

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const gaps = await timeline.detectGaps([]);

			expect(gaps.length).toBe(1);
			expect(gaps[0].size).toBe("large");
			expect(gaps[0].duration).toBeGreaterThan(60 * 24 - 1); // Almost full day
		});
	});

	describe("calculatePriority", () => {
		it("should invoke cmd_calculate_priority with task", async () => {
			const task: TimelineItem = {
				id: "task-1",
				type: "task",
				source: "local",
				title: "Test task",
				startTime: "2024-01-15T09:00:00",
				endTime: "2024-01-15T09:30:00",
				priority: 50,
			};

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_calculate_priority") {
					return Promise.resolve(85);
				}
				return Promise.resolve(undefined);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const priority = await timeline.calculatePriority(task);

			expect(invoke).toHaveBeenCalledWith("cmd_calculate_priority", {
				taskJson: task,
			});
			expect(priority).toBe(85);
		});

		it("should return fallback priority on error", async () => {
			const task: TimelineItem = {
				id: "task-1",
				type: "task",
				source: "local",
				title: "Test task",
				startTime: "2024-01-15T09:00:00",
				endTime: "2024-01-15T09:30:00",
				priority: 70,
			};

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_calculate_priority") {
					return Promise.reject(new Error("Calculation failed"));
				}
				return Promise.resolve(undefined);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const priority = await timeline.calculatePriority(task);
			// Should return existing priority as fallback
			expect(priority).toBe(70);
		});

		it("should return default 50 when no existing priority", async () => {
			const task: TimelineItem = {
				id: "task-1",
				type: "task",
				source: "local",
				title: "Test task",
				startTime: "2024-01-15T09:00:00",
				endTime: "2024-01-15T09:30:00",
				priority: null,
			};

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_calculate_priority") {
					return Promise.reject(new Error("Calculation failed"));
				}
				return Promise.resolve(undefined);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const priority = await timeline.calculatePriority(task);
			expect(priority).toBe(50); // default fallback
		});
	});

	describe("calculatePriorities", () => {
		it("should invoke cmd_calculate_priorities with tasks", async () => {
			const tasks: TimelineItem[] = [
				{
					id: "task-1",
					type: "task",
					source: "local",
					title: "Task 1",
					startTime: "2024-01-15T09:00:00",
					endTime: "2024-01-15T09:30:00",
					priority: 50,
				},
				{
					id: "task-2",
					type: "task",
					source: "local",
					title: "Task 2",
					startTime: "2024-01-15T10:00:00",
					endTime: "2024-01-15T10:30:00",
					priority: 60,
				},
			];

			const mockPriorities = [
				{ task_id: "task-1", priority: 75 },
				{ task_id: "task-2", priority: 85 },
			];

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_calculate_priorities") {
					return Promise.resolve(mockPriorities);
				}
				return Promise.resolve([]);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const priorities = await timeline.calculatePriorities(tasks);

			expect(invoke).toHaveBeenCalledWith("cmd_calculate_priorities", {
				tasksJson: tasks,
			});
			expect(priorities).toEqual([
				{ taskId: "task-1", priority: 75 },
				{ taskId: "task-2", priority: 85 },
			]);
		});

		it("should return fallback priorities on error", async () => {
			const tasks: TimelineItem[] = [
				{
					id: "task-1",
					type: "task",
					source: "local",
					title: "Task 1",
					startTime: "2024-01-15T09:00:00",
					endTime: "2024-01-15T09:30:00",
					priority: 50,
				},
				{
					id: "task-2",
					type: "task",
					source: "local",
					title: "Task 2",
					startTime: "2024-01-15T10:00:00",
					endTime: "2024-01-15T10:30:00",
					priority: null,
				},
			];

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_calculate_priorities") {
					return Promise.reject(new Error("Batch calculation failed"));
				}
				return Promise.resolve([]);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const priorities = await timeline.calculatePriorities(tasks);

			expect(priorities).toEqual([
				{ taskId: "task-1", priority: 50 }, // existing priority
				{ taskId: "task-2", priority: 50 }, // default fallback
			]);
		});
	});

	describe("updateTaskPriorities", () => {
		it("should update tasks with calculated priorities", async () => {
			const tasks: TimelineItem[] = [
				{
					id: "task-1",
					type: "task",
					source: "local",
					title: "Task 1",
					startTime: "2024-01-15T09:00:00",
					endTime: "2024-01-15T09:30:00",
					priority: 50,
				},
				{
					id: "task-2",
					type: "task",
					source: "local",
					title: "Task 2",
					startTime: "2024-01-15T10:00:00",
					endTime: "2024-01-15T10:30:00",
					priority: 60,
				},
			];

			const mockPriorities = [
				{ task_id: "task-1", priority: 80 },
				{ task_id: "task-2", priority: 90 },
			];

			vi.mocked(invoke).mockImplementation((cmd: string) => {
				if (cmd === "cmd_calculate_priorities") {
					return Promise.resolve(mockPriorities);
				}
				return Promise.resolve([]);
			});

			root.render(<TimelineHarness />);
			await waitFor(() => expect((window as any).__testTimelineResult).toBeDefined());

			const timeline = (window as any).__testTimelineResult;

			const updatedTasks = await timeline.updateTaskPriorities(tasks);

			expect(updatedTasks[0].priority).toBe(80);
			expect(updatedTasks[1].priority).toBe(90);
			// Other fields should remain unchanged
			expect(updatedTasks[0].id).toBe("task-1");
			expect(updatedTasks[0].title).toBe("Task 1");
		});
	});
});
