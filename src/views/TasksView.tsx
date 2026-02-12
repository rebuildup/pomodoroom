/**
 * TasksView — Task list view for managing tasks
 *
 * Shows tasks in a list format with:
 * - Checkboxes for task selection
 * - Task status (READY/RUNNING/PAUSED/DONE)
 * - Time remaining display
 * - Quick actions via TaskOperations
 *
 * Features:
 * - Checkbox on left for task selection
 * - Click on task to open details
 * - Visual hierarchy with proper spacing
 */

import { useMemo } from "react";
import { Icon } from "@/components/m3/Icon";
import { TaskTimeRemaining } from "@/components/m3/TaskTimeRemaining";
import { CompactTaskOperations, type TaskOperation } from "@/components/m3/TaskOperations";
import { useTaskStore } from "@/hooks/useTaskStore";
import type { Task } from "@/types/task";
import { useTaskStateMap } from "@/hooks/useTaskState";

export default function TasksView() {
	const taskStore = useTaskStore();
	const { canTransition, transition } = useTaskStateMap();

	// Group tasks by state
	const readyTasks = useMemo(() => taskStore.getTasksByState("READY"), [taskStore.tasks]);
	const runningTasks = useMemo(() => taskStore.getTasksByState("RUNNING"), [taskStore.tasks]);
	const pausedTasks = useMemo(() => taskStore.getTasksByState("PAUSED"), [taskStore.tasks]);
	const doneTasks = useMemo(() => taskStore.getTasksByState("DONE"), [taskStore.tasks]);

	// Handle task click to show details (placeholder)
	const handleTaskClick = (task: Task) => {
		console.log("[TasksView] Task clicked:", task.id);
		// TODO: Open task detail drawer or modal
	};

	// Handle task operation (start/pause/complete)
	const handleTaskOperation = async (taskId: string, operation: TaskOperation) => {
		console.log("[TasksView] Operation:", operation, "on task:", taskId);

		switch (operation) {
			case "start":
				if (!canTransition(taskId, "RUNNING")) {
					console.warn("[TasksView] Cannot start task - invalid transition");
					return;
				}
				await transition(taskId, "RUNNING", "start");
				break;
			case "pause":
				if (!canTransition(taskId, "PAUSED")) {
					console.warn("[TasksView] Cannot pause task - invalid transition");
					return;
				}
				await transition(taskId, "PAUSED", "pause");
				break;
			case "complete":
				if (!canTransition(taskId, "DONE")) {
					console.warn("[TasksView] Cannot complete task - invalid transition");
					return;
				}
				await transition(taskId, "DONE", "complete");
				break;
		}
	};

	// Handle operation callback for CompactTaskOperations
	const handleOperationCallback = async (props: { taskId: string; operation: TaskOperation }) => {
		await handleTaskOperation(props.taskId, props.operation);
	};

	// Render single task item
	const renderTask = (task: Task, stateLabel: string, stateColor: string) => (
		<div
			key={task.id}
			className="flex items-start gap-3 p-3 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors duration-150"
		>
			{/* Checkbox */}
			<button
				type="button"
				className="mt-1 flex-shrink-0 w-5 h-5 rounded border-2 border-[var(--md-ref-color-outline)] flex items-center justify-center"
				onClick={() => handleTaskClick(task)}
				aria-label={`Select task: ${task.title}`}
			>
				<Icon name={task.completed ? "check_box" : "check_box_outline"} size={20} />
			</button>

			{/* Task content */}
			<div className="flex-1 min-w-0">
				<div className="flex-1">
					{/* Status indicator */}
					<div className={`w-2 h-2 rounded-full mt-1 ${stateColor}`} />

					{/* Task info */}
					<div className="flex-1">
						<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">{task.title}</h3>
						{task.description && (
							<p className="text-xs text-[var(--md-ref-color-on-surface-variant)] mt-0.5 line-clamp-2">
								{task.description}
							</p>
						)}

						{/* Tags */}
						{task.tags.length > 0 && (
							<div className="flex flex-wrap gap-1 mt-1">
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

						{/* Time remaining */}
						<TaskTimeRemaining task={task} className="mt-1" />

						{/* Task operations */}
						<CompactTaskOperations
							task={{ id: task.id, state: task.state as any, priority: task.priority ?? null, estimatedMinutes: task.estimatedMinutes } as import("@/hooks/useTaskOperations").TaskData}
							onOperation={handleOperationCallback}
							size="small"
						/>
					</div>

					{/* Meta info */}
					<div className="flex flex-col items-end gap-1 ml-auto text-xs text-[var(--md-ref-color-on-surface-variant)]">
						<span className="font-medium">{stateLabel}</span>
						{task.project && <span className="opacity-70">{task.project}</span>}
						{task.priority !== undefined && task.priority !== null && (
							<span className={`px-1.5 py-0.5 rounded ${getPriorityColor(task.priority)}`}>
								<Icon name="flag" size={12} />
								{task.priority}
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);

	const getPriorityColor = (priority: number | null): string => {
		if (priority === null || priority === 0) return "text-gray-400";
		if (priority >= 80) return "text-red-400";
		if (priority >= 50) return "text-orange-400";
		return "text-yellow-400";
	};

	return (
		<div className="h-full overflow-y-auto p-4 bg-[var(--md-ref-color-surface)]">
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-xl font-semibold text-[var(--md-ref-color-on-surface)]">タスク</h1>
				<div className="text-sm text-[var(--md-ref-color-on-surface-variant)]">
					{taskStore.totalCount} タスク中 {doneTasks.length} 完了
				</div>
			</div>

			{/* Task sections */}
			<div className="space-y-4">
				{/* Ready tasks */}
				{readyTasks.length > 0 && (
					<section>
						<h2 className="text-sm font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2 flex items-center gap-2">
							<Icon name="radio_button_unchecked" size={16} />
							準備中 ({readyTasks.length})
						</h2>
						<div className="space-y-2">
							{readyTasks.map((task) => renderTask(task, "READY", "text-blue-400"))}
						</div>
					</section>
				)}

				{/* Running tasks */}
				{runningTasks.length > 0 && (
					<section>
						<h2 className="text-sm font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2 flex items-center gap-2">
							<Icon name="play_arrow" size={16} className="text-green-400" />
							実行中 ({runningTasks.length})
						</h2>
						<div className="space-y-2">
							{runningTasks.map((task) => renderTask(task, "RUNNING", "text-green-400"))}
						</div>
					</section>
				)}

				{/* Paused tasks */}
				{pausedTasks.length > 0 && (
					<section>
						<h2 className="text-sm font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2 flex items-center gap-2">
							<Icon name="pause" size={16} className="text-orange-400" />
							一時停止 ({pausedTasks.length})
						</h2>
						<div className="space-y-2">
							{pausedTasks.map((task) => renderTask(task, "PAUSED", "text-orange-400"))}
						</div>
					</section>
				)}

				{/* Done tasks */}
				{doneTasks.length > 0 && (
					<section>
						<h2 className="text-sm font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2 flex items-center gap-2">
							<Icon name="check_circle" size={16} className="text-purple-400" />
							完了 ({doneTasks.length})
						</h2>
						<div className="space-y-2">
							{doneTasks.map((task) => renderTask(task, "DONE", "text-gray-400"))}
						</div>
					</section>
				)}

				{/* Empty state */}
				{taskStore.totalCount === 0 && (
					<div className="flex flex-col items-center justify-center h-64 text-[var(--md-ref-color-on-surface-variant)]">
						<Icon name="checklist" size={48} className="mb-4 opacity-50" />
						<p className="text-sm">タスクがありません</p>
						<p className="text-xs text-[var(--md-ref-color-on-surface-variant)] mt-2">
							左の「作成」ボタンからタスクを作成してください
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
