/**
 * Material 3 Task Board Component
 *
 * Kanban-style task board with three columns: Ready, Doing, Done.
 * Supports drag-and-drop task management with filters and search.
 *
 * Reference: https://m3.material.io/components/lists/overview
 */

import React, { useState, useMemo } from "react";
import {
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
	DragEndEvent,
	DragOverEvent,
	PointerSensor,
	closestCenter,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Icon } from "./Icon";
import { ColumnHeader, type ColumnId } from "./ColumnHeader";
import { TaskCard } from "./TaskCard";
import type { Task, TaskState } from "@/types/schedule";

export interface TaskBoardProps {
	/** All tasks to display */
	tasks: Task[];
	/** Callback when task state changes */
	onTaskStateChange?: (taskId: string, newState: TaskState) => void;
	/** Callback when tasks are reordered */
	onTasksReorder?: (tasks: Task[]) => void;
	/** Callback when task is clicked */
	onTaskClick?: (task: Task) => void;
	/** Additional CSS class */
	className?: string;
	/** Locale for labels (default: en) */
	locale?: "en" | "ja";
}

/**
 * Map task state to column ID.
 */
function stateToColumn(state: TaskState): ColumnId {
	switch (state) {
		case "READY":
			return "ready";
		case "RUNNING":
		case "PAUSED":
			return "doing";
		case "DONE":
			return "done";
		default:
			return "ready";
	}
}

/**
 * Map column ID to task state.
 */
function columnToState(columnId: ColumnId): TaskState {
	switch (columnId) {
		case "ready":
			return "READY";
		case "doing":
			return "RUNNING";
		case "done":
			return "DONE";
	}
}

/**
 * Filter options.
 */
interface FilterOptions {
	searchQuery: string;
	showOnlyPriority: boolean;
	minPriority: number;
}

/**
 * Material 3 Task Board.
 *
 * Kanban board with drag-and-drop task management.
 *
 * @example
 * ```tsx
 * <TaskBoard
 *   tasks={tasks}
 *   onTaskStateChange={(id, state) => updateTaskState(id, state)}
 *   onTaskClick={(task) => openTaskDetail(task)}
 * />
 * ```
 */
export const TaskBoard: React.FC<TaskBoardProps> = ({
	tasks,
	onTaskStateChange,
	onTasksReorder,
	onTaskClick,
	className = "",
	locale = "en",
}) => {
	// Filter state
	const [filters, setFilters] = useState<FilterOptions>({
		searchQuery: "",
		showOnlyPriority: false,
		minPriority: 0,
	});
	const [showFilters, setShowFilters] = useState(false);

	// Drag and drop sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Group tasks by column
	const columns = useMemo(() => {
		const filtered = tasks.filter((task) => {
			// Search filter
			if (filters.searchQuery) {
				const query = filters.searchQuery.toLowerCase();
				const matchTitle = task.title.toLowerCase().includes(query);
				const matchDesc = task.description?.toLowerCase().includes(query);
				const matchTags = task.tags.some((tag) => tag.toLowerCase().includes(query));
				if (!matchTitle && !matchDesc && !matchTags) return false;
			}

			// Priority filter
			if (filters.showOnlyPriority && (task.priority || 0) < filters.minPriority) {
				return false;
			}

			return true;
		});

		const grouped: Record<ColumnId, Task[]> = {
			ready: [],
			doing: [],
			done: [],
		};

		for (const task of filtered) {
			const column = stateToColumn(task.state);
			grouped[column].push(task);
		}

		return grouped;
	}, [tasks, filters]);

	// Drag end handler
	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over) return;

		const activeId = active.id as string;
		const overId = over.id as string;

		// Find the active task
		const activeTask = tasks.find((t) => t.id === activeId);
		if (!activeTask) return;

		// Check if dropped over a column
		if (["ready", "doing", "done"].includes(overId)) {
			const newColumn = overId as ColumnId;
			const newState = columnToState(newColumn);
			if (activeTask.state !== newState) {
				onTaskStateChange?.(activeId, newState);
			}
		}
	};

	// Clear all filters
	const clearFilters = () => {
		setFilters({
			searchQuery: "",
			showOnlyPriority: false,
			minPriority: 0,
		});
	};

	// Check if any filters are active
	const hasActiveFilters = filters.searchQuery || filters.showOnlyPriority;

	return (
		<div className={`flex flex-col h-full ${className}`.trim()}>
			{/* Header with search and filters */}
			<div className="flex items-center gap-2 p-4 border-b border-[var(--md-ref-color-outline-variant)]">
				<div className="flex-1 relative">
					<Icon
						name="search"
						size={20}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-ref-color-on-surface-variant)]"
					/>
					<input
						type="text"
						value={filters.searchQuery}
						onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
						placeholder={locale === "ja" ? "タスクを検索..." : "Search tasks..."}
						className={`
							w-full pl-10 pr-4 py-2 rounded-full
							bg-[var(--md-ref-color-surface-container-high)]
							text-[var(--md-ref-color-on-surface)]
							placeholder:text-[var(--md-ref-color-on-surface-variant)]
							border border-transparent
							focus:border-[var(--md-ref-color-primary)]
							focus:outline-none
							transition-colors
						`.trim()}
					/>
				</div>

				<button
					type="button"
					onClick={() => setShowFilters(!showFilters)}
					className={`
						p-2 rounded-full
						${showFilters || hasActiveFilters
							? "bg-[var(--md-ref-color-secondary-container)] text-[var(--md-ref-color-on-secondary-container)]"
							: "hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)]"
						}
						transition-colors
					`}
					title={locale === "ja" ? "フィルター" : "Filters"}
					aria-label="Toggle filters"
				>
					<Icon name="filter_list" size={20} />
				</button>

				{hasActiveFilters && (
					<button
						type="button"
						onClick={clearFilters}
						className="text-xs text-[var(--md-ref-color-primary)] hover:underline"
					>
						{locale === "ja" ? "クリア" : "Clear"}
					</button>
				)}
			</div>

			{/* Filter panel */}
			{showFilters && (
				<div className="p-4 border-b border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
					<div className="flex items-center gap-4">
						<label className="flex items-center gap-2 text-sm text-[var(--md-ref-color-on-surface)]">
							<input
								type="checkbox"
								checked={filters.showOnlyPriority}
								onChange={(e) => setFilters({ ...filters, showOnlyPriority: e.target.checked })}
								className="rounded"
							/>
							{locale === "ja" ? "優先度のみ表示" : "Show only high priority"}
						</label>

						{filters.showOnlyPriority && (
							<input
								type="number"
								min={0}
								max={100}
								value={filters.minPriority}
								onChange={(e) => setFilters({ ...filters, minPriority: Number(e.target.value) })}
								className="w-20 px-2 py-1 rounded bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface)] border border-[var(--md-ref-color-outline-variant)]"
							/>
						)}
					</div>
				</div>
			)}

			{/* Kanban columns */}
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<div className="flex-1 grid grid-cols-3 gap-4 p-4 overflow-x-auto">
					{(["ready", "doing", "done"] as ColumnId[]).map((columnId) => (
						<div
							key={columnId}
							className={`
								flex flex-col h-full
								bg-[var(--md-ref-color-surface-container-low)]
								rounded-lg overflow-hidden
							`.trim()}
						>
							{/* Column header */}
							<ColumnHeader
								columnId={columnId}
								taskCount={columns[columnId].length}
								locale={locale}
							/>

							{/* Task list */}
							<div className="flex-1 overflow-y-auto p-2 space-y-2">
								{columns[columnId].map((task) => (
									<TaskCard
										key={task.id}
										task={task}
										onClick={onTaskClick}
										onStateChange={onTaskStateChange}
									/>
								))}

								{/* Empty state */}
								{columns[columnId].length === 0 && (
									<div className="flex flex-col items-center justify-center h-full py-8 text-[var(--md-ref-color-on-surface-variant)]">
										<Icon name="inbox" size={32} className="mb-2 opacity-50" />
										<span className="text-sm">
											{locale === "ja" ? "タスクなし" : "No tasks"}
										</span>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</DndContext>
		</div>
	);
};

export default TaskBoard;
