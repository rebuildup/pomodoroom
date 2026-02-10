/**
 * useTaskDragDrop - Custom hook for task drag and drop operations.
 *
 * Provides drag data structure and drop handlers for scheduling tasks
 * from TaskPool/BacklogPanel to TimelineBar.
 *
 * Issue #9
 */
import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task, ScheduleBlock } from "@/types/schedule";

// ─── Types ────────────────────────────────────────────────────────────────

export type DragSource = "pool" | "backlog" | "timeline";

export interface DragData {
	taskId: string;
	source: DragSource;
	task?: Task;
	block?: ScheduleBlock;
}

export interface DropResult {
	taskId: string;
	targetTime: string; // ISO time string
	targetLane: number;
	durationMinutes: number;
}

export interface UseTaskDragDropOptions {
	/** Called when a task is dropped on the timeline */
	onTaskScheduled?: (result: DropResult) => void;
	/** Called when a timeline block is moved */
	onBlockMoved?: (blockId: string, newTime: string, newLane: number) => void;
	/** Called when a task is moved back to pool */
	onTaskUnscheduled?: (taskId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Snap time to nearest 15-minute increment
 */
function snapTo15Minutes(date: Date): Date {
	const minutes = date.getMinutes();
	const snapped = Math.round(minutes / 15) * 15;
	date.setMinutes(snapped, 0, 0);
	return date;
}

/**
 * Calculate duration in minutes based on estimated pomodoros
 * Each pomodoro = 25 minutes focus + 5 minutes break = 30 minutes total
 */
function calculateDuration(estimatedPomodoros: number): number {
	return estimatedPomodoros * 30;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useTaskDragDrop(options: UseTaskDragDropOptions = {}) {
	const { onTaskScheduled, onBlockMoved, onTaskUnscheduled } = options;

	/**
	 * Handle dragging a task from pool/backlog
	 */
	const handleDragStart = useCallback((task: Task, source: DragSource) => {
		const dragData: DragData = {
			taskId: task.id,
			source,
			task,
		};
		// Store drag data in a global variable for dnd-kit
		(window as unknown as Record<string, DragData>).__pomodoroom_drag_data = dragData;
	}, []);

	/**
	 * Handle dragging a timeline block
	 */
	const handleBlockDragStart = useCallback((block: ScheduleBlock) => {
		const dragData: DragData = {
			taskId: block.taskId ?? block.id,
			source: "timeline",
			block,
		};
		(window as unknown as Record<string, DragData>).__pomodoroom_drag_data = dragData;
	}, []);

	/**
	 * Handle dropping a task/block on the timeline
	 */
	const handleDropOnTimeline = useCallback(async (
		dropTime: Date,
		lane: number,
		getDragData: () => DragData | null
	) => {
		const dragData = getDragData();
		if (!dragData) return;

		// Snap to 15-minute increment
		const snappedTime = snapTo15Minutes(dropTime);
		const targetTime = snappedTime.toISOString();

		if (dragData.source === "timeline" && dragData.block) {
			// Moving existing block
			await handleBlockMove(dragData.block, targetTime, lane);
		} else if (dragData.task) {
			// Scheduling new task from pool/backlog
			await handleTaskSchedule(dragData.task, targetTime, lane);
		}

		// Clear drag data
		delete (window as unknown as Record<string, unknown>).__pomodoroom_drag_data;
	}, []);

	/**
	 * Schedule a task to a specific time slot
	 */
	const handleTaskSchedule = useCallback(async (
		task: Task,
		targetTime: string,
		targetLane: number
	) => {
		const duration = calculateDuration(task.estimatedPomodoros);

		try {
			// Calculate end time
			const startTime = new Date(targetTime);
			const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

			// Create a schedule block for this task
			const block: Omit<ScheduleBlock, "id"> = {
				blockType: "focus",
				taskId: task.id,
				startTime: targetTime,
				endTime: endTime.toISOString(),
				locked: false,
				label: task.title,
				lane: targetLane,
			};

			// Call backend to create the schedule block
			await invoke("cmd_schedule_create_block", {
				blockJson: block,
			});

			onTaskScheduled?.({
				taskId: task.id,
				targetTime,
				targetLane,
				durationMinutes: duration,
			});
		} catch (error) {
			console.error("Failed to schedule task:", error);
		}
	}, [onTaskScheduled]);

	/**
	 * Move an existing block to a new time/lane
	 */
	const handleBlockMove = useCallback(async (
		block: ScheduleBlock,
		newTime: string,
		newLane: number
	) => {
		const duration = new Date(block.endTime).getTime() - new Date(block.startTime).getTime();
		const endTime = new Date(new Date(newTime).getTime() + duration).toISOString();

		try {
			await invoke("cmd_schedule_update_block", {
				id: block.id,
				startTime: newTime,
				endTime: endTime,
				lane: newLane,
			});

			onBlockMoved?.(block.id, newTime, newLane);
		} catch (error) {
			console.error("Failed to move block:", error);
		}
	}, [onBlockMoved]);

	/**
	 * Unschedule a task (move back to pool)
	 */
	const handleUnscheduleTask = useCallback(async (taskId: string, blockId: string) => {
		try {
			await invoke("cmd_schedule_delete_block", { id: blockId });
			onTaskUnscheduled?.(taskId);
		} catch (error) {
			console.error("Failed to unschedule task:", error);
		}
	}, [onTaskUnscheduled]);

	/**
	 * Get stored drag data
	 */
	const getDragData = useCallback((): DragData | null => {
		return (window as unknown as Record<string, DragData | undefined>).__pomodoroom_drag_data ?? null;
	}, []);

	return {
		handleDragStart,
		handleBlockDragStart,
		handleDropOnTimeline,
		handleUnscheduleTask,
		getDragData,
		snapTo15Minutes,
		calculateDuration,
	};
}
