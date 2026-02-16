import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTaskStore } from "./useTaskStore";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

describe("useTaskStore", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockInvoke.mockResolvedValue([]);
		localStorage.clear();
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

	it("falls back to localStorage tasks when SQLite load fails", async () => {
		localStorage.setItem(
			"pomodoroom-tasks",
			JSON.stringify([
				{
					id: "local-1",
					title: "Local Task",
					state: "READY",
					priority: 40,
					project: null,
					tags: [],
					estimatedPomodoros: 1,
					completedPomodoros: 0,
					completed: false,
					category: "active",
					createdAt: "2025-01-01T00:00:00.000Z",
					kind: "duration_only",
					requiredMinutes: null,
					fixedStartAt: null,
					fixedEndAt: null,
					windowStartAt: null,
					windowEndAt: null,
					estimatedStartAt: null,
					elapsedMinutes: 0,
					energy: "medium",
					group: null,
					updatedAt: "2025-01-01T00:00:00.000Z",
					completedAt: null,
					pausedAt: null,
				},
			]),
		);
		mockInvoke.mockRejectedValue(new Error("sqlite unavailable"));

		const { result } = renderHook(() => useTaskStore());

		await waitFor(() => {
			expect(result.current.tasks.length).toBeGreaterThan(0);
		});
		expect(result.current.tasks[0]?.id).toBe("local-1");
	});
});
