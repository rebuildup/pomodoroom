/**
 * Material 3 Task Card Component
 *
 * Draggable card for tasks in the kanban board.
 * Shows task title, priority, tags, and progress.
 *
 * Reference: https://m3.material.io/components/cards/overview
 */

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./Icon";
import type { Task } from "@/types/schedule";

export interface TaskCardProps {
	/** Task data */
	task: Task;
	/** Whether the card is being dragged */
	isDragging?: boolean;
	/** Callback when card is clicked */
	onClick?: (task: Task) => void;
	/** Callback when task state change is requested */
	onStateChange?: (taskId: string, newState: Task["state"]) => void;
	/** Additional CSS class */
	className?: string;
}

/**
 * Get priority color class.
 */
function getPriorityColor(priority?: number): string {
	if (priority === undefined) return "text-gray-500";
	if (priority >= 80) return "text-red-400";
	if (priority >= 50) return "text-orange-400";
	if (priority >= 20) return "text-yellow-400";
	return "text-green-400";
}

/**
 * Get priority icon.
 */
function getPriorityIcon(priority?: number): "flag" | "local_fire_department" {
	if (priority === undefined) return "flag";
	return priority >= 80 ? "local_fire_department" : "flag";
}

/**
 * Format progress as fraction.
 */
function formatProgress(task: Task): string {
	return `${task.completedPomodoros}/${task.estimatedPomodoros}`;
}

/**
 * Material 3 Task Card.
 *
 * Draggable card displaying task information.
 *
 * @example
 * ```tsx
 * <TaskCard
 *   task={task}
 *   onClick={(t) => console.log(t.id)}
 *   onStateChange={(id, state) => updateState(id, state)}
 * />
 * ```
 */
export const TaskCard: React.FC<TaskCardProps> = ({
	task,
	isDragging = false,
	onClick,
	onStateChange,
	className = "",
}) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging: isSortableDragging,
	} = useSortable({
		id: task.id,
		disabled: false,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging || isSortableDragging ? 0.5 : 1,
	};

	const priorityColor = getPriorityColor(task.priority);
	const priorityIcon = getPriorityIcon(task.priority);

	// Determine available state transitions based on current state
	const getAvailableActions = () => {
		switch (task.state) {
			case "READY":
				return [
					{ icon: "play_arrow", label: "Start", state: "RUNNING" as const },
				];
			case "RUNNING":
				return [
					{ icon: "check", label: "Complete", state: "DONE" as const },
					{ icon: "pause", label: "Pause", state: "PAUSED" as const },
				];
			case "PAUSED":
				return [
					{ icon: "play_arrow", label: "Resume", state: "RUNNING" as const },
				];
			case "DONE":
				return [];
			default:
				return [];
		}
	};

	const actions = getAvailableActions();

	return (
		<div
			ref={setNodeRef}
			style={style}
			onClick={() => onClick?.(task)}
			className={`
				flex flex-col gap-2 p-3 rounded-lg
				bg-[var(--md-ref-color-surface-container-low)]
				border border-[var(--md-ref-color-outline-variant)]
				cursor-grab active:cursor-grabbing
				hover:bg-[var(--md-ref-color-surface-container)]
				transition-colors duration-150 ease-out
				${className}
			`.trim()}
		>
			{/* Drag handle and header */}
			<div className="flex items-start gap-2">
				<button
					type="button"
					className="mt-0.5 text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]"
					{...attributes}
					{...listeners}
					aria-label="Drag task"
				>
					<Icon name="drag_indicator" size={16} />
				</button>

				<div className="flex-1 min-w-0">
					<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)] truncate">
						{task.title}
					</h3>
					{task.description && (
						<p className="text-xs text-[var(--md-ref-color-on-surface-variant)] truncate mt-0.5">
							{task.description}
						</p>
					)}
				</div>

				{/* Priority indicator */}
				{task.priority !== undefined && (
					<div className={`flex items-center gap-1 ${priorityColor}`} title={`Priority: ${task.priority}`}>
						<Icon name={priorityIcon} size={16} />
						<span className="text-xs font-medium">{task.priority}</span>
					</div>
				)}
			</div>

			{/* Tags */}
			{task.tags.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{task.tags.slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="px-2 py-0.5 text-xs rounded-full bg-[var(--md-ref-color-secondary-container)] text-[var(--md-ref-color-on-secondary-container)]"
						>
							{tag}
						</span>
					))}
					{task.tags.length > 3 && (
						<span className="px-2 py-0.5 text-xs rounded-full bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)]">
							+{task.tags.length - 3}
						</span>
					)}
				</div>
			)}

			{/* Progress and actions */}
			<div className="flex items-center justify-between">
				{/* Progress indicator */}
				<div className="flex items-center gap-1.5 text-xs text-[var(--md-ref-color-on-surface-variant)]">
					<Icon name="timer" size={14} />
					<span>{formatProgress(task)}</span>
				</div>

				{/* Action buttons */}
				<div className="flex items-center gap-1">
					{actions.map((action) => (
						<button
							key={action.state}
							type="button"
							onClick={() => onStateChange?.(task.id, action.state)}
							className="p-1 rounded-full hover:bg-[var(--md-ref-color-secondary-container)] hover:text-[var(--md-ref-color-on-secondary-container)] transition-colors"
							title={action.label}
							aria-label={action.label}
						>
							<Icon name={action.icon as any} size={18} />
						</button>
					))}
				</div>
			</div>
		</div>
	);
};

export default TaskCard;
