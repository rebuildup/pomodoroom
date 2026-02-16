import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTaskOperations } from "./useTaskOperations";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

describe("useTaskOperations", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockInvoke.mockResolvedValue(undefined);
	});

	it("calls cmd_task_start for startTask", async () => {
		const { result } = renderHook(() =>
			useTaskOperations({ enableUndo: true, refreshAfterOperation: false }),
		);

		await waitFor(() => {
			expect(result.current.isTauri).toBe(true);
		});

		await act(async () => {
			const response = await result.current.startTask("task-1");
			expect(response.success).toBe(true);
			expect(response.newState).toBe("RUNNING");
		});

		expect(mockInvoke).toHaveBeenCalledWith("cmd_task_start", { id: "task-1" });
	});

	it("records undo entry after completeTask", async () => {
		const { result } = renderHook(() =>
			useTaskOperations({ enableUndo: true, refreshAfterOperation: false }),
		);

		await waitFor(() => {
			expect(result.current.isTauri).toBe(true);
		});

		await act(async () => {
			const response = await result.current.completeTask("task-1");
			expect(response.success).toBe(true);
			expect(response.newState).toBe("DONE");
		});

		expect(result.current.getUndoCount("task-1")).toBe(1);
		expect(mockInvoke).toHaveBeenCalledWith("cmd_task_complete", { id: "task-1" });
	});
});
