import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTaskStore } from "./useTaskStore";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

// Mock Tauri event API
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
	unlisten: vi.fn(),
}));

describe("useTaskStore", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockInvoke.mockResolvedValue([]);
		// localStorage cleared - database-only architecture
		Object.defineProperty(window, "__TAURI__", {
			value: {},
			writable: true,
			configurable: true,
		});
	});

	it("loads tasks from cmd_task_list on mount", async () => {
		const rows = [
			{
				id: "task-1",
				title: "Task 1",
				description: null,
				state: "READY",
				priority: 50,
				project_id: null,
				tags: [],
				estimated_pomodoros: 1,
				completed_pomodoros: 0,
				completed: false,
				category: "active",
				created_at: "2025-01-01T00:00:00.000Z",
				updated_at: "2025-01-01T00:00:00.000Z",
				elapsed_minutes: 0,
				energy: "medium",
			},
		];
		mockInvoke.mockImplementation((command: string) => {
			if (command === "cmd_task_list") return Promise.resolve(rows);
			return Promise.resolve(undefined);
		});

		const { result } = renderHook(() => useTaskStore());

		await waitFor(() => {
			expect(result.current.tasks).toHaveLength(1);
		});
		expect(mockInvoke).toHaveBeenCalledWith("cmd_task_list");
		expect(result.current.tasks[0]?.id).toBe("task-1");
	});
});
