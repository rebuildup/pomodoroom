import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useScheduler } from "./useScheduler";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

vi.mock("@/utils/dev-mock-scheduler", () => ({
	generateMockSchedule: vi.fn(() => []),
	createMockProjects: vi.fn(() => ({ tasks: [] })),
}));

describe("useScheduler", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	beforeEach(() => {
		mockInvoke.mockReset();
		Object.defineProperty(window, "__TAURI__", {
			value: {},
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls backend generate command and maps result blocks", async () => {
		// Mock for ensureRecurringTasksForDate (cache_get calls)
		mockInvoke
			.mockResolvedValueOnce({ data: null, is_stale: false }) // fixed events cache
			.mockResolvedValueOnce({ data: null, is_stale: false }) // macro tasks cache
			// Mock for cmd_schedule_generate
			.mockResolvedValueOnce([
				{
					id: "block-1",
					task_id: "task-1",
					block_type: "focus",
					start_time: "2024-01-15T09:00:00",
					end_time: "2024-01-15T09:25:00",
					task_title: "Focus session",
					lane: 0,
				},
			]);

		const { result } = renderHook(() => useScheduler({ useMockMode: false }));

		await act(async () => {
			await result.current.generateSchedule("2024-01-15");
		});

		expect(mockInvoke).toHaveBeenCalledWith("cmd_schedule_generate", {
			dateIso: "2024-01-15",
			calendarEventsJson: null,
		});
		expect(result.current.blocks[0]).toMatchObject({
			id: "block-1",
			taskId: "task-1",
			blockType: "focus",
			label: "Focus session",
		});
	});

	it("sets error when backend auto-fill fails", async () => {
		// Mock for ensureRecurringTasksForDate (cache_get calls)
		mockInvoke
			.mockResolvedValueOnce({ data: null, is_stale: false }) // fixed events cache
			.mockResolvedValueOnce({ data: null, is_stale: false }) // macro tasks cache
			// Mock for cmd_schedule_auto_fill - this should fail
			.mockRejectedValueOnce(new Error("backend unavailable"));

		const { result } = renderHook(() => useScheduler({ useMockMode: false }));

		await act(async () => {
			await result.current.autoFill("2024-01-15");
		});

		await waitFor(() => {
			expect(result.current.error).toContain("backend unavailable");
		});
	});

	it("keeps break block type in replan preview", async () => {
		mockInvoke.mockResolvedValueOnce([
			{
				id: "block-break-1",
				task_id: "break-task-1",
				block_type: "break",
				start_time: "2024-01-15T09:10:00Z",
				end_time: "2024-01-15T09:15:00Z",
				task_title: "Break",
				lane: 0,
			},
		]);

		const { result } = renderHook(() => useScheduler({ useMockMode: false }));
		const nextCalendarEvents = [
			{
				id: "cal-1",
				blockType: "calendar" as const,
				startTime: "2024-01-15T09:00:00Z",
				endTime: "2024-01-15T09:30:00Z",
				locked: true,
				label: "Meeting",
			},
		];

		const preview = await result.current.previewReplanOnCalendarUpdates(
			"2024-01-15",
			[],
			nextCalendarEvents,
		);

		expect(preview.proposedBlocks.some((b) => b.blockType === "break")).toBe(true);
	});
});
