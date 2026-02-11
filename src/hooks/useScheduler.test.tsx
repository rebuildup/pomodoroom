/**
 * Integration tests for useScheduler hook
 *
 * Tests Rust呼び出し型整合性:
 * - Schedule generation via cmd_schedule_generate
 * - Auto-fill via cmd_schedule_auto_fill
 * - Type safety and data conversion
 * - Error handling
 * - Mock mode fallback
 */

import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { ScheduleBlock } from "@/types/schedule";
import { useScheduler } from "./useScheduler";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

// Mock dev-mock-scheduler for non-Tauri environment
vi.mock("@/utils/dev-mock-scheduler", () => ({
	generateMockSchedule: vi.fn(() => []),
	createMockProjects: vi.fn(() => ({ tasks: [] })),
}));

describe("useScheduler", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		vi.clearAllMocks();
		// Ensure Tauri environment is detected
		Object.defineProperty(window, "__TAURI__", {
			// @ts-ignore - TS doesn't know about __TAURI__
			value: {},
			writable: true,
			configurable: true,
		});

		// Create fresh DOM container for each test
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	const cleanup = () => {
		root.unmount();
		container.remove();
	};

	describe("generateSchedule", () => {
		it("should invoke cmd_schedule_generate with correct parameters", async () => {
			const mockBlocks = [
				{
					id: "block-1",
					task_id: "task-1",
					start_time: "2024-01-15T09:00:00",
					end_time: "2024-01-15T09:25:00",
					task_title: "Focus session",
					lane: 0,
				},
			];

			// Use mockImplementation to properly return the value
			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocks));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				// Store scheduler result globally for test access
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			// Wait for render
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15");

			expect(invoke).toHaveBeenCalledWith("cmd_schedule_generate", {
				dateIso: "2024-01-15",
				calendarEventsJson: null,
			});

			cleanup();
		});

		it("should convert backend response to ScheduleBlock format", async () => {
			const mockBlocks = [
				{
					id: "block-1",
					task_id: "task-1",
					start_time: "2024-01-15T09:00:00",
					end_time: "2024-01-15T09:25:00",
					task_title: "Focus session",
					lane: 0,
				},
				{
					id: "block-2",
					task_id: "task-2",
					start_time: "2024-01-15T09:30:00",
					end_time: "2024-01-15T09:55:00",
					task_title: "Another task",
					lane: 1,
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocks));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15");
			// Wait for state update to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			const expectedBlocks: ScheduleBlock[] = [
				{
					id: "block-1",
					blockType: "focus",
					taskId: "task-1",
					startTime: "2024-01-15T09:00:00",
					endTime: "2024-01-15T09:25:00",
					locked: false,
					label: "Focus session",
					lane: 0,
				},
				{
					id: "block-2",
					blockType: "focus",
					taskId: "task-2",
					startTime: "2024-01-15T09:30:00",
					endTime: "2024-01-15T09:55:00",
					locked: false,
					label: "Another task",
					lane: 1,
				},
			];

			expect(scheduler.blocks).toEqual(expectedBlocks);

			cleanup();
		});

		it("should handle calendar events conversion correctly", async () => {
			const mockCalendarEvents: ScheduleBlock[] = [
				{
					id: "cal-1",
					blockType: "calendar",
					startTime: "2024-01-15T10:00:00",
					endTime: "2024-01-15T11:00:00",
					locked: true,
					label: "Meeting",
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve([]));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15", mockCalendarEvents);

			expect(invoke).toHaveBeenCalledWith("cmd_schedule_generate", {
				dateIso: "2024-01-15",
				calendarEventsJson: [
					{
						id: "cal-1",
						title: "Meeting",
						start_time: "2024-01-15T10:00:00",
						end_time: "2024-01-15T11:00:00",
					},
				],
			});

			cleanup();
		});

		it("should handle errors and set error state", async () => {
			const error = new Error("Backend connection failed");
			vi.mocked(invoke).mockImplementation(() => Promise.reject(error));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.error || "no error"}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15");
			// Wait for error state to update
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(scheduler.error).toBe("Failed to generate schedule: Backend connection failed");
			expect(scheduler.blocks).toEqual([]);

			cleanup();
		});
	});

	describe("autoFill", () => {
		it("should invoke cmd_schedule_auto_fill with correct parameters", async () => {
			const mockBlocks = [
				{
					id: "fill-1",
					task_id: "task-1",
					start_time: "2024-01-15T14:00:00",
					end_time: "2024-01-15T14:25:00",
					task_title: "Auto-filled task",
					lane: 0,
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocks));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.autoFill("2024-01-15");

			expect(invoke).toHaveBeenCalledWith("cmd_schedule_auto_fill", {
				dateIso: "2024-01-15",
				calendarEventsJson: null,
			});

			cleanup();
		});

		it("should convert auto-fill response to ScheduleBlock format", async () => {
			const mockBlocks = [
				{
					id: "fill-1",
					task_id: "task-1",
					start_time: "2024-01-15T14:00:00",
					end_time: "2024-01-15T14:25:00",
					task_title: "Auto-filled task",
					lane: 0,
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocks));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.autoFill("2024-01-15");
			// Wait for state update to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(scheduler.blocks).toEqual([
				{
					id: "fill-1",
					blockType: "focus",
					taskId: "task-1",
					startTime: "2024-01-15T14:00:00",
					endTime: "2024-01-15T14:25:00",
					locked: false,
					label: "Auto-filled task",
					lane: 0,
				},
			]);

			cleanup();
		});
	});

	describe("clearSchedule", () => {
		it("should clear blocks and error state", async () => {
			const mockBlocks = [
				{
					id: "block-1",
					task_id: "task-1",
					start_time: "2024-01-15T09:00:00",
					end_time: "2024-01-15T09:25:00",
					task_title: "Task",
					lane: 0,
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocks));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15");
			// Wait for state update to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(scheduler.blocks.length).toBeGreaterThan(0);

			scheduler.clearSchedule();

			expect(scheduler.blocks).toEqual([]);
			expect(scheduler.error).toBe(null);

			cleanup();
		});
	});

	describe("isMockMode", () => {
		it("should detect Tauri environment and disable mock mode", async () => {
			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.isMockMode ? "mock" : "tauri"}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			expect(scheduler.isMockMode).toBe(false);

			cleanup();
		});
	});

	describe("type safety", () => {
		it("should handle missing lane field with default value", async () => {
			const mockBlocksWithoutLane = [
				{
					id: "block-1",
					task_id: "task-1",
					start_time: "2024-01-15T09:00:00",
					end_time: "2024-01-15T09:25:00",
					task_title: "Task without lane",
					// lane field missing
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocksWithoutLane));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15");
			// Wait for state update to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(scheduler.blocks[0]?.lane).toBe(0); // default value

			cleanup();
		});

		it("should handle blockType always as focus for backend response", async () => {
			const mockBlocks = [
				{
					id: "block-1",
					task_id: "task-1",
					start_time: "2024-01-15T09:00:00",
					end_time: "2024-01-15T09:25:00",
					task_title: "Task",
					lane: 0,
				},
			];

			vi.mocked(invoke).mockImplementation(() => Promise.resolve(mockBlocks));

			function SchedulerHarness() {
				const scheduler = useScheduler();
				(window as any).__testSchedulerResult = scheduler;
				return <div>{scheduler.blocks.length}</div>;
			}

			root.render(<SchedulerHarness />);
			await new Promise(resolve => setTimeout(resolve, 0));

			const scheduler = (window as any).__testSchedulerResult;

			await scheduler.generateSchedule("2024-01-15");
			// Wait for state update to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(scheduler.blocks[0]?.blockType).toBe("focus");

			cleanup();
		});
	});
});
