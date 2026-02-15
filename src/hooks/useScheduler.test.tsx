import { describe, it, expect, beforeEach, vi } from "vitest";
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
		mockInvoke.mockReset();
		Object.defineProperty(window, "__TAURI__", {
			value: {},
			writable: true,
			configurable: true,
		});
	});

	it("calls backend generate command and maps result blocks", async () => {
		mockInvoke.mockResolvedValueOnce([
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
		mockInvoke.mockRejectedValueOnce(new Error("backend unavailable"));
		const { result } = renderHook(() => useScheduler({ useMockMode: false }));

		await act(async () => {
			await result.current.autoFill("2024-01-15");
		});

		await waitFor(() => {
			expect(result.current.error).toContain("backend unavailable");
		});
	});
});
