/**
 * Tests for useTaskStore - Tauri invoke mock + SQLite integration tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import type { Task } from "../types/task";
import type { TaskState } from "../types/task-state";
import { useTaskStore } from "./useTaskStore";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

describe("useTaskStore", () => {
	let mockInvoke: ReturnType<typeof vi.fn>;

	// Mock task data
	const mockTasks: Task[] = [
		{
			id: "task-1",
			title: "Task 1",
			description: "Description 1",
			state: "READY",
			priority: 80,
			project: null,
			tags: [],
			estimatedPomodoros: 2,
			completedPomodoros: 0,
			completed: false,
			category: "active",
			createdAt: "2025-01-01T00:00:00.000Z",
			estimatedMinutes: 50,
			elapsedMinutes: 0,
			energy: "high",
			group: null,
			updatedAt: "2025-01-01T00:00:00.000Z",
			completedAt: null,
			pausedAt: null,
		},
		{
			id: "task-2",
			title: "Task 2",
			description: "Description 2",
			state: "RUNNING",
			priority: 50,
			project: null,
			tags: ["urgent"],
			estimatedPomodoros: 1,
			completedPomodoros: 0,
			completed: false,
			category: "active",
			createdAt: "2025-01-02T00:00:00.000Z",
			estimatedMinutes: 25,
			elapsedMinutes: 10,
			energy: "medium",
			group: null,
			updatedAt: "2025-01-02T00:00:00.000Z",
			completedAt: null,
			pausedAt: null,
		},
		{
			id: "task-3",
			title: "Task 3",
			description: "Description 3",
			state: "PAUSED",
			priority: 30,
			project: null,
			tags: [],
			estimatedPomodoros: 1,
			completedPomodoros: 0,
			completed: false,
			category: "active",
			createdAt: "2025-01-03T00:00:00.000Z",
			estimatedMinutes: 25,
			elapsedMinutes: 5,
			energy: "low",
			group: null,
			updatedAt: "2025-01-03T00:00:00.000Z",
			completedAt: null,
			pausedAt: "2025-01-03T00:05:00.000Z",
		},
		{
			id: "task-4",
			title: "Task 4",
			description: "Description 4",
			state: "DONE",
			priority: 0,
			project: null,
			tags: [],
			estimatedPomodoros: 1,
			completedPomodoros: 1,
			completed: true,
			category: "active",
			createdAt: "2025-01-04T00:00:00.000Z",
			estimatedMinutes: 25,
			elapsedMinutes: 25,
			energy: "medium",
			group: null,
			updatedAt: "2025-01-04T00:25:00.000Z",
			completedAt: "2025-01-04T00:25:00.000Z",
			pausedAt: null,
		},
	];

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Get mocked invoke function
		mockInvoke = invoke as ReturnType<typeof vi.fn>;

		// Clear localStorage
		localStorage.clear();
	});

	describe("Task retrieval from SQLite", () => {
		it("loads tasks from SQLite via cmd_task_list", async () => {
			// Mock successful task list response
			mockInvoke.mockResolvedValue(mockTasks.map(task => ({
				id: task.id,
				title: task.title,
				description: task.description,
				state: task.state,
				priority: task.priority,
				project_id: task.project,
				tags: task.tags,
				estimated_pomodoros: task.estimatedPomodoros,
				completed_pomodoros: task.completedPomodoros,
				completed: task.completed,
				category: task.category,
				created_at: task.createdAt,
				estimated_minutes: task.estimatedMinutes,
				elapsed_minutes: task.elapsedMinutes,
				energy: task.energy,
				group: task.group,
				updated_at: task.updatedAt,
				completed_at: task.completedAt,
				paused_at: task.pausedAt,
			})));

			const { result } = renderHook(() => useTaskStore());

			// Wait for async loadTasksFromSqlite to complete
			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			// Verify cmd_task_list was called
			expect(mockInvoke).toHaveBeenCalledWith("cmd_task_list");

			// Verify all tasks are loaded
			expect(result.current.tasks.map(t => t.id)).toEqual(
				expect.arrayContaining(["task-1", "task-2", "task-3", "task-4"])
			);
		});

		it("falls back to localStorage on SQLite error", async () => {
			// Set up localStorage with fallback tasks
			const fallbackTasks = [mockTasks[0]];
			localStorage.setItem(
				"pomodoroom-tasks",
				JSON.stringify(fallbackTasks)
			);

			// Mock SQLite error
			mockInvoke.mockRejectedValue(new Error("SQLite connection failed"));

			const { result } = renderHook(() => useTaskStore());

			// Wait for fallback to localStorage
			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(1);
			});

			// Verify fallback task is loaded
			expect(result.current.tasks[0].id).toBe("task-1");
		});

		it("returns empty array when no tasks exist", async () => {
			// Mock empty task list
			mockInvoke.mockResolvedValue([]);

			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(0);
			});

			expect(result.current.totalCount).toBe(0);
		});
	});

	describe("CRUD operations", () => {
		beforeEach(async () => {
			// Initialize with mock tasks
			mockInvoke.mockResolvedValue(mockTasks);
			const { result } = renderHook(() => useTaskStore());
			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});
		});

		it("creates task via cmd_task_create and updates state", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			// Reset mock to track new calls
			mockInvoke.mockClear();

			// Create new task
			act(() => {
				result.current.createTask({
					title: "New Task",
					description: "New Description",
					state: "READY",
					tags: [],
					category: "active",
					estimatedMinutes: 30,
					elapsedMinutes: 0,
					priority: 70,
					project: null,
					group: null,
					energy: "medium",
					completed: false,
					estimatedPomodoros: 2,
					completedPomodoros: 0,
					updatedAt: "",
					completedAt: null,
					pausedAt: null,
				});
			});

			// Verify cmd_task_create was called
			expect(mockInvoke).toHaveBeenCalledWith(
				"cmd_task_create",
				expect.objectContaining({
					taskJson: expect.objectContaining({
						title: "New Task",
						state: "READY",
					}),
				})
			);

			// Verify optimistic update
			expect(result.current.tasks).toHaveLength(5);
		});

		it("rolls back create operation on error", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const originalCount = result.current.tasks.length;

			// Mock create failure
			mockInvoke.mockRejectedValue(new Error("Create failed"));

			act(() => {
				result.current.createTask({
					title: "Failed Task",
					description: "Should be rolled back",
					state: "READY",
					tags: [],
					category: "active",
					estimatedMinutes: 25,
					elapsedMinutes: 0,
					priority: 50,
					project: null,
					group: null,
					energy: "medium",
					completed: false,
					estimatedPomodoros: 1,
					completedPomodoros: 0,
					updatedAt: "",
					completedAt: null,
					pausedAt: null,
				});
			});

			// Wait for rollback
			await waitFor(() => {
				expect(result.current.tasks.length).toBe(originalCount);
			});
		});

		it("updates task via cmd_task_update", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const taskId = "task-1";
			const originalTitle = result.current.tasks.find(t => t.id === taskId)?.title;

			mockInvoke.mockClear();

			act(() => {
				result.current.updateTask(taskId, { title: "Updated Title" });
			});

			// Verify cmd_task_update was called
			expect(mockInvoke).toHaveBeenCalledWith(
				"cmd_task_update",
				expect.objectContaining({
					id: taskId,
					taskJson: expect.objectContaining({
						title: "Updated Title",
					}),
				})
			);

			// Verify optimistic update
			expect(result.current.tasks.find(t => t.id === taskId)?.title).toBe(
				"Updated Title"
			);
			expect(
				result.current.tasks.find(t => t.id === taskId)?.title
			).not.toBe(originalTitle);
		});

		it("deletes task via cmd_task_delete", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const taskId = "task-1";

			mockInvoke.mockClear();

			act(() => {
				result.current.deleteTask(taskId);
			});

			// Verify cmd_task_delete was called
			expect(mockInvoke).toHaveBeenCalledWith("cmd_task_delete", { id: taskId });

			// Verify optimistic delete
			expect(result.current.tasks.find(t => t.id === taskId)).toBeUndefined();
		});
	});

	describe("Anchor/Ambient derivation", () => {
		it("identifies anchor task (first RUNNING task)", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.anchorTask).toBeTruthy();
			});

			expect(result.current.anchorTask?.id).toBe("task-2");
			expect(result.current.anchorTask?.state).toBe("RUNNING");
		});

		it("identifies ambient tasks (PAUSED tasks)", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			expect(result.current.ambientTasks).toHaveLength(1);
			expect(result.current.ambientTasks[0].id).toBe("task-3");
			expect(result.current.ambientTasks[0].state).toBe("PAUSED");
		});

		it("identifies ready tasks (READY tasks)", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			expect(result.current.readyTasks).toHaveLength(1);
			expect(result.current.readyTasks[0].id).toBe("task-1");
			expect(result.current.readyTasks[0].state).toBe("READY");
		});

		it("identifies done tasks (DONE tasks)", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			expect(result.current.doneTasks).toHaveLength(1);
			expect(result.current.doneTasks[0].id).toBe("task-4");
			expect(result.current.doneTasks[0].state).toBe("DONE");
		});

		it("sorts ready tasks by priority (descending) then createdAt", async () => {
			// Add tasks with different priorities
			const priorityTasks: Task[] = [
				{
					...mockTasks[0],
					id: "low-priority",
					priority: 10,
					createdAt: "2025-01-05T00:00:00.000Z",
				},
				{
					...mockTasks[0],
					id: "high-priority",
					priority: 90,
					createdAt: "2025-01-06T00:00:00.000Z",
				},
				{
					...mockTasks[0],
					id: "medium-priority",
					priority: 50,
					createdAt: "2025-01-07T00:00:00.000Z",
				},
			];

			const mixedTasks = [...mockTasks, ...priorityTasks];
			mockInvoke.mockResolvedValue(mixedTasks);

			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.readyTasks.length).toBeGreaterThan(1);
			});

			const readyTasks = result.current.readyTasks.filter(
				t => ["low-priority", "high-priority", "medium-priority"].includes(t.id)
			);

			// Should be sorted: high (90) > medium (50) > low (10)
			expect(readyTasks[0].id).toBe("high-priority");
			expect(readyTasks[1].id).toBe("medium-priority");
			expect(readyTasks[2].id).toBe("low-priority");
		});
	});

	describe("Computed values", () => {
		it("calculates total count", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			expect(result.current.totalCount).toBe(4);
		});

		it("calculates running count", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			expect(result.current.runningCount).toBe(1);
		});

		it("calculates completed count", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			expect(result.current.completedCount).toBe(1);
		});
	});

	describe("Query operations", () => {
		it("getTask returns task by id", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const task = result.current.getTask("task-2");
			expect(task).toBeTruthy();
			expect(task?.id).toBe("task-2");
			expect(task?.title).toBe("Task 2");
		});

		it("getTask returns undefined for non-existent id", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const task = result.current.getTask("non-existent");
			expect(task).toBeUndefined();
		});

		it("getAllTasks returns copy of tasks array", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const allTasks = result.current.getAllTasks();
			expect(allTasks).toHaveLength(4);
			expect(allTasks).toEqual(result.current.tasks);

			// Verify it's a copy, not same reference
			expect(allTasks).not.toBe(result.current.tasks);
		});

		it("getTasksByState filters by state", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			const readyTasks = result.current.getTasksByState("READY");
			expect(readyTasks).toHaveLength(1);
			expect(readyTasks[0].id).toBe("task-1");

			const runningTasks = result.current.getTasksByState("RUNNING");
			expect(runningTasks).toHaveLength(1);
			expect(runningTasks[0].id).toBe("task-2");

			const doneTasks = result.current.getTasksByState("DONE");
			expect(doneTasks).toHaveLength(1);
			expect(doneTasks[0].id).toBe("task-4");
		});
	});

	describe("State transitions (delegated to useTaskStateMap)", () => {
		it("getState returns null for untracked task", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			// Tasks loaded from SQLite don't have state machines initially
			const state = result.current.getState("task-1");
			expect(state).toBeNull();
		});

		it("canTransition validates transitions", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			// Before first transition, machine doesn't exist
			expect(result.current.canTransition("task-1", "RUNNING")).toBe(false);

			// After transition, machine exists
			act(() => {
				result.current.transition("task-1", "RUNNING", "start");
			});

			// Now transitions are tracked
			expect(result.current.canTransition("task-1", "RUNNING")).toBe(true);
			expect(result.current.canTransition("task-1", "DONE")).toBe(true);
			expect(result.current.canTransition("task-1", "PAUSED")).toBe(true);
		});

		it("reset removes state machine for task", async () => {
			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.tasks).toHaveLength(4);
			});

			// Create state machine by transitioning
			act(() => {
				result.current.transition("task-1", "RUNNING", "start");
			});

			expect(result.current.getState("task-1")).toBe("RUNNING");

			// Reset the task
			act(() => {
				result.current.reset("task-1");
			});

			// State should be back to initial
			expect(result.current.getState("task-1")).toBeNull();
		});
	});

	describe("Migration (localStorage to SQLite)", () => {
		it("marks as migrated when no localStorage tasks exist", async () => {
			localStorage.setItem("pomodoroom-tasks-migrated", "false");

			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.isMigrated).toBe(true);
			});

			// Migration flag should be set
			expect(localStorage.getItem("pomodoroom-tasks-migrated")).toBe("true");
		});

		it("does not migrate when already migrated", async () => {
			localStorage.setItem("pomodoroom-tasks-migrated", "true");

			const { result } = renderHook(() => useTaskStore());

			await waitFor(() => {
				expect(result.current.isMigrated).toBe(true);
			});

			// Migration should not trigger cmd_task_create calls for migration
			const createCalls = mockInvoke.mock.calls.filter(
				call => call[0] === "cmd_task_create"
			);
			expect(createCalls.length).toBe(0);
		});
	});
});
