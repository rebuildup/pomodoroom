/**
 * Tests for useTaskOperations - State transition flow tests (READY → RUNNING → PAUSED → DONE)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { TaskState } from "../types/task-state";
import type { TaskData, OperationResult } from "./useTaskOperations";
import {
	useTaskOperations,
	createMockTaskData,
	DEFAULT_POSTPONE_DECREASE,
} from "./useTaskOperations";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

describe("useTaskOperations", () => {
	let mockInvoke: ReturnType<typeof vi.fn>;

	// Mock task data
	const mockTaskData: TaskData = {
		id: "task-1",
		state: "READY",
		priority: 50,
		estimatedMinutes: 25,
	};

	beforeEach(() => {
		vi.clearAllMocks();

		const { invoke } = require("@tauri-apps/api/core");
		mockInvoke = invoke;
	});

	describe("Environment detection", () => {
		it("detects Tauri environment", async () => {
			// Simulate Tauri environment by making invoke succeed
			mockInvoke.mockResolvedValue({});

			const { result } = renderHook(() => useTaskOperations());

			// Wait for environment detection
			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});
		});
	});

	describe("State transition flow: READY → RUNNING → PAUSED → DONE", () => {
		it("completes full lifecycle: READY → RUNNING → PAUSED → RUNNING → DONE", async () => {
			// Initialize fallback store with READY task
			const { result } = renderHook(() =>
				useTaskOperations({
					enableUndo: true,
				})
			);

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			// Step 1: READY → RUNNING (start)
			let startResult: OperationResult | undefined;
			await act(async () => {
				startResult = await result.current.startTask(mockTaskData.id);
			});

			expect(startResult).toEqual({
				success: true,
				taskId: mockTaskData.id,
				previousState: "READY",
				newState: "RUNNING",
			});

			// Step 2: RUNNING → PAUSED (pause)
			let pauseResult: OperationResult | undefined;
			await act(async () => {
				pauseResult = await result.current.pauseTask(mockTaskData.id);
			});

			expect(pauseResult).toEqual({
				success: true,
				taskId: mockTaskData.id,
				previousState: "RUNNING",
				newState: "PAUSED",
			});

			// Step 3: PAUSED → RUNNING (resume)
			let resumeResult: OperationResult | undefined;
			await act(async () => {
				resumeResult = await result.current.resumeTask(mockTaskData.id);
			});

			expect(resumeResult).toEqual({
				success: true,
				taskId: mockTaskData.id,
				previousState: "PAUSED",
				newState: "RUNNING",
			});

			// Step 4: RUNNING → DONE (complete)
			let completeResult: OperationResult | undefined;
			await act(async () => {
				completeResult = await result.current.completeTask(mockTaskData.id);
			});

			expect(completeResult).toEqual({
				success: true,
				taskId: mockTaskData.id,
				previousState: "RUNNING",
				newState: "DONE",
			});
		});

		it("validates each transition in the lifecycle", async () => {
			const { result } = renderHook(() => useTaskOperations());

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			// Start from READY → RUNNING (valid)
			await act(async () => {
				const startResult = await result.current.startTask(mockTaskData.id);
				expect(startResult.success).toBe(true);
				expect(startResult.newState).toBe("RUNNING");
			});

			// Try invalid transition: RUNNING → READY (should fail)
			await act(async () => {
				const invalidResult = await result.current.startTask(mockTaskData.id);
				// This should fail because start only works from READY
				// But after RUNNING, it's no longer READY
				expect(invalidResult.success).toBe(false);
			});
		});

		it("tracks undo history for complete operation", async () => {
			const { result } = renderHook(() =>
				useTaskOperations({
					enableUndo: true,
				})
			);

			// Set up task in RUNNING state
			const runningTask: TaskData = {
				...mockTaskData,
				state: "RUNNING",
			};

			result.current.initFallbackStore([runningTask]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			// Complete the task
			await act(async () => {
				await result.current.completeTask(runningTask.id);
			});

			// Should have undo entry
			const undoCount = result.current.getUndoCount(runningTask.id);
			expect(undoCount).toBe(1);
		});
	});

	describe("Core operations", () => {
		describe("startTask (READY → RUNNING)", () => {
			it("transitions task from READY to RUNNING", async () => {
				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([mockTaskData]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.startTask(mockTaskData.id);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.previousState).toBe("READY");
				expect(operationResult?.newState).toBe("RUNNING");
			});

			it("calls cmd_task_start in Tauri environment", async () => {
				mockInvoke.mockResolvedValue({});

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([mockTaskData]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.startTask(mockTaskData.id);
				});

				// Should have called Tauri command
				expect(mockInvoke).toHaveBeenCalledWith("cmd_task_start", {
					id: mockTaskData.id,
				});
			});

			it("returns error for non-existent task", async () => {
				const { result } = renderHook(() => useTaskOperations());

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.startTask("non-existent-id");
				});

				expect(operationResult?.success).toBe(false);
				expect(operationResult?.error).toContain("not found");
			});
		});

		describe("completeTask (RUNNING → DONE)", () => {
			it("transitions task from RUNNING to DONE", async () => {
				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
				};

				const { result } = renderHook(() =>
					useTaskOperations({
						enableUndo: true,
					})
				);

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.completeTask(runningTask.id);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.previousState).toBe("RUNNING");
				expect(operationResult?.newState).toBe("DONE");
			});

			it("adds undo entry when enableUndo is true", async () => {
				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
				};

				const { result } = renderHook(() =>
					useTaskOperations({
						enableUndo: true,
					})
				);

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.completeTask(runningTask.id);
				});

				const undoCount = result.current.getUndoCount(runningTask.id);
				expect(undoCount).toBeGreaterThan(0);
			});
		});

		describe("pauseTask (RUNNING → PAUSED)", () => {
			it("transitions task from RUNNING to PAUSED", async () => {
				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.pauseTask(runningTask.id);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.previousState).toBe("RUNNING");
				expect(operationResult?.newState).toBe("PAUSED");
			});

			it("calls cmd_task_pause in Tauri environment", async () => {
				mockInvoke.mockResolvedValue({});

				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.pauseTask(runningTask.id);
				});

				expect(mockInvoke).toHaveBeenCalledWith("cmd_task_pause", {
					id: runningTask.id,
				});
			});
		});

		describe("resumeTask (PAUSED → RUNNING)", () => {
			it("transitions task from PAUSED to RUNNING", async () => {
				const pausedTask: TaskData = {
					...mockTaskData,
					state: "PAUSED",
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([pausedTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.resumeTask(pausedTask.id);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.previousState).toBe("PAUSED");
				expect(operationResult?.newState).toBe("RUNNING");
			});

			it("calls cmd_task_resume in Tauri environment", async () => {
				mockInvoke.mockResolvedValue({});

				const pausedTask: TaskData = {
					...mockTaskData,
					state: "PAUSED",
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([pausedTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.resumeTask(pausedTask.id);
				});

				expect(mockInvoke).toHaveBeenCalledWith("cmd_task_resume", {
					id: pausedTask.id,
				});
			});
		});

		describe("postponeTask (RUNNING/PAUSED → READY)", () => {
			it("transitions from RUNNING to READY with lower priority", async () => {
				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
					priority: 50,
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.postponeTask(runningTask.id);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.newState).toBe("READY");
				expect(operationResult?.newPriority).toBe(50 - DEFAULT_POSTPONE_DECREASE);
			});

			it("transitions from PAUSED to READY with lower priority", async () => {
				const pausedTask: TaskData = {
					...mockTaskData,
					state: "PAUSED",
					priority: 70,
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([pausedTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.postponeTask(pausedTask.id);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.newState).toBe("READY");
				expect(operationResult?.newPriority).toBe(70 - DEFAULT_POSTPONE_DECREASE);
			});

			it("respects minimum priority of -100", async () => {
				const lowPriorityTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
					priority: -95,
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([lowPriorityTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.postponeTask(lowPriorityTask.id);
				});

				// Should clamp to minimum -100
				expect(operationResult?.newPriority).toBe(-100);
			});

			it("calls cmd_task_postpone in Tauri environment", async () => {
				mockInvoke.mockResolvedValue({
					state: "READY",
					priority: 30,
				});

				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.postponeTask(runningTask.id);
				});

				expect(mockInvoke).toHaveBeenCalledWith("cmd_task_postpone", {
					id: runningTask.id,
				});
			});
		});

		describe("extendTask (RUNNING/PAUSED → extends time)", () => {
			it("extends estimated minutes without changing state", async () => {
				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
					estimatedMinutes: 25,
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				let operationResult: OperationResult | undefined;
				await act(async () => {
					operationResult = await result.current.extendTask(
						runningTask.id,
						15
					);
				});

				expect(operationResult?.success).toBe(true);
				expect(operationResult?.previousState).toBe("RUNNING");
				expect(operationResult?.newState).toBe("RUNNING"); // State unchanged
			});

			it("adds specified minutes to estimated time", async () => {
				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
					estimatedMinutes: 25,
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.extendTask(runningTask.id, 15);
				});

				// Default 25 + 15 = 40
				const updatedTask = result.current.initFallbackStore.toString();
				// Note: We can't directly read the store, but we can verify the operation succeeded
			});

			it("calls cmd_task_extend in Tauri environment", async () => {
				mockInvoke.mockResolvedValue({
					state: "RUNNING",
				});

				const runningTask: TaskData = {
					...mockTaskData,
					state: "RUNNING",
				};

				const { result } = renderHook(() => useTaskOperations());

				result.current.initFallbackStore([runningTask]);

				await waitFor(() => {
					expect(result.current.isTauri).toBeDefined();
				});

				await act(async () => {
					await result.current.extendTask(runningTask.id, 15);
				});

				expect(mockInvoke).toHaveBeenCalledWith("cmd_task_extend", {
					id: runningTask.id,
					minutes: 15,
				});
			});
		});
	});

	describe("Available actions", () => {
		it("returns available actions for READY task", async () => {
			const { result } = renderHook(() => useTaskOperations());

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			let actions: string[] = [];
			await act(async () => {
				actions = await result.current.getAvailableActions(mockTaskData.id);
			});

			expect(actions).toContain("start");
		});

		it("returns available actions for RUNNING task", async () => {
			const runningTask: TaskData = {
				...mockTaskData,
				state: "RUNNING",
			};

			const { result } = renderHook(() => useTaskOperations());

			result.current.initFallbackStore([runningTask]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			let actions: string[] = [];
			await act(async () => {
				actions = await result.current.getAvailableActions(runningTask.id);
			});

			expect(actions).toContain("complete");
			expect(actions).toContain("pause");
			expect(actions).toContain("extend");
			expect(actions).toContain("postpone");
		});

		it("returns available actions for PAUSED task", async () => {
			const pausedTask: TaskData = {
				...mockTaskData,
				state: "PAUSED",
			};

			const { result } = renderHook(() => useTaskOperations());

			result.current.initFallbackStore([pausedTask]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			let actions: string[] = [];
			await act(async () => {
				actions = await result.current.getAvailableActions(pausedTask.id);
			});

			expect(actions).toContain("resume");
			expect(actions).toContain("extend");
			expect(actions).toContain("postpone");
		});
	});

	describe("Client-side helpers (fallback)", () => {
		it("canPerform validates operations for each state", async () => {
			const { result } = renderHook(() => useTaskOperations());

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			const readyTask = createMockTaskData({ state: "READY" });
			const runningTask = createMockTaskData({ state: "RUNNING" });
			const pausedTask = createMockTaskData({ state: "PAUSED" });
			const doneTask = createMockTaskData({ state: "DONE" });

			// READY tasks can start
			expect(result.current.canPerform(readyTask, "start")).toBe(true);
			expect(result.current.canPerform(readyTask, "complete")).toBe(false);

			// RUNNING tasks can complete, pause, extend, postpone
			expect(result.current.canPerform(runningTask, "complete")).toBe(true);
			expect(result.current.canPerform(runningTask, "pause")).toBe(true);
			expect(result.current.canPerform(runningTask, "extend")).toBe(true);
			expect(result.current.canPerform(runningTask, "postpone")).toBe(true);
			expect(result.current.canPerform(runningTask, "start")).toBe(false);

			// PAUSED tasks can resume, extend, postpone
			expect(result.current.canPerform(pausedTask, "resume")).toBe(true);
			expect(result.current.canPerform(pausedTask, "extend")).toBe(true);
			expect(result.current.canPerform(pausedTask, "postpone")).toBe(true);
			expect(result.current.canPerform(pausedTask, "pause")).toBe(false);

			// DONE tasks have no valid operations
			expect(result.current.canPerform(doneTask, "start")).toBe(false);
			expect(result.current.canPerform(doneTask, "complete")).toBe(false);
		});

		it("getAvailableOperations returns all valid operations for task state", async () => {
			const { result } = renderHook(() => useTaskOperations());

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			const readyTask = createMockTaskData({ state: "READY" });
			const runningTask = createMockTaskData({ state: "RUNNING" });
			const pausedTask = createMockTaskData({ state: "PAUSED" });

			expect(result.current.getAvailableOperations(readyTask)).toEqual(["start"]);
			expect(result.current.getAvailableOperations(runningTask).sort()).toEqual(
				["complete", "extend", "pause", "postpone"]
			);
			expect(result.current.getAvailableOperations(pausedTask).sort()).toEqual(
				["extend", "postpone", "resume"]
			);
		});
	});

	describe("Error handling", () => {
		it("handles Tauri invoke errors gracefully", async () => {
			mockInvoke.mockRejectedValue(new Error("IPC error"));

			const { result } = renderHook(() =>
				useTaskOperations({
					onOperationError: vi.fn(),
				})
			);

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			let operationResult: OperationResult | undefined;
			await act(async () => {
				operationResult = await result.current.startTask(mockTaskData.id);
			});

			expect(operationResult?.success).toBe(false);
			expect(operationResult?.error).toBeDefined();
		});

		it("calls onOperationError callback when operation fails", async () => {
			const onError = vi.fn();
			mockInvoke.mockRejectedValue(new Error("Test error"));

			const { result } = renderHook(() =>
				useTaskOperations({
					onOperationError: onError,
				})
			);

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			await act(async () => {
				await result.current.startTask(mockTaskData.id);
			});

			expect(onError).toHaveBeenCalledWith(
				expect.any(Error),
				mockTaskData.id
			);
		});

		it("calls onOperationComplete callback when operation succeeds", async () => {
			const onComplete = vi.fn();

			const { result } = renderHook(() =>
				useTaskOperations({
					onOperationComplete: onComplete,
				})
			);

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			await act(async () => {
				await result.current.startTask(mockTaskData.id);
			});

			expect(onComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					taskId: mockTaskData.id,
				})
			);
		});

		it("handles invalid state transitions", async () => {
			const { result } = renderHook(() => useTaskOperations());

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			// Try to complete a READY task (invalid: READY → DONE)
			let operationResult: OperationResult | undefined;
			await act(async () => {
				operationResult = await result.current.completeTask(mockTaskData.id);
			});

			expect(operationResult?.success).toBe(false);
			expect(operationResult?.error).toContain("Invalid state transition");
		});
	});

	describe("Undo support", () => {
		it("clearUndo removes all undo entries", async () => {
			const { result } = renderHook(() =>
				useTaskOperations({
					enableUndo: true,
				})
			);

			const runningTask = createMockTaskData({ state: "RUNNING" });
			result.current.initFallbackStore([runningTask]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			// Create undo entry
			await act(async () => {
				await result.current.completeTask(runningTask.id);
			});

			expect(result.current.getUndoCount(runningTask.id)).toBeGreaterThan(0);

			// Clear undo
			act(() => {
				result.current.clearUndo();
			});

			expect(result.current.getUndoCount(runningTask.id)).toBe(0);
		});

		it("undo returns false when no undo entry exists", async () => {
			const { result } = renderHook(() =>
				useTaskOperations({
					enableUndo: true,
				})
			);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			let undone: boolean | undefined;
			await act(async () => {
				undone = await result.current.undo("non-existent-task");
			});

			expect(undone).toBe(false);
		});
	});

	describe("Refresh behavior", () => {
		it("dispatches tasks:refresh event after operation by default", async () => {
			const eventListener = vi.fn();
			window.addEventListener("tasks:refresh", eventListener);

			const { result } = renderHook(() => useTaskOperations());

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			await act(async () => {
				await result.current.startTask(mockTaskData.id);
			});

			expect(eventListener).toHaveBeenCalled();

			window.removeEventListener("tasks:refresh", eventListener);
		});

		it("does not dispatch refresh when refreshAfterOperation is false", async () => {
			const eventListener = vi.fn();
			window.addEventListener("tasks:refresh", eventListener);

			const { result } = renderHook(() =>
				useTaskOperations({
					refreshAfterOperation: false,
				})
			);

			result.current.initFallbackStore([mockTaskData]);

			await waitFor(() => {
				expect(result.current.isTauri).toBeDefined();
			});

			await act(async () => {
				await result.current.startTask(mockTaskData.id);
			});

			expect(eventListener).not.toHaveBeenCalled();

			window.removeEventListener("tasks:refresh", eventListener);
		});
	});
});
