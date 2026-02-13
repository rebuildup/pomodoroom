/**
 * DailyTimeView — Daily time timeline view
 *
 * Shows tasks on a timeline from 6:00 AM to 6:00 PM.
 * Tasks are positioned by their elapsed time.
 */

import { useMemo } from "react";
import { Icon } from "@/components/m3/Icon";
import { TaskTimelinePanel } from "@/components/m3/TaskTimelinePanel";
import { useTaskStore } from "@/hooks/useTaskStore";
import { useProjects } from "@/hooks/useProjects";
import type { Task } from "@/types/task";
import type { CreateTaskInput } from "@/hooks/useTaskStore";

/**
 * Calculate daily view start time (6:00 AM)
 */
function calculateDailyStartTime(date: Date): number {
	return date.setHours(6, 0, 0, 0).getTime();
}

export default function DailyTimeView() {
	const taskStore = useTaskStore();
	const { projects, loading } = useProjects();

	// Use today's date for the timeline
	const [selectedDate, setSelectedDate] = useState(new Date());

	// Calculate timeline metadata
	const timelineMetadata = useMemo(() => {
		const baseTime = calculateDailyStartTime(selectedDate);
		const durationMinutes = 12 * 60; // 12 hours (6:00 - 18:00)
		return {
			baseTime,
			durationMinutes,
		};
	}, [selectedDate]);

	// Calculate totals
	const totals = useMemo(() => {
		let totalEstimated = 0;
		let totalElapsed = 0;
		let tasksWithEstimate = 0;

		taskStore.tasks.forEach(task => {
			if (task.estimatedMinutes) {
				totalEstimated += task.estimatedMinutes;
				totalElapsed += task.elapsedMinutes || 0;
				tasksWithEstimate++;
			}
		});

		const totalRemaining = Math.max(0, totalEstimated - totalElapsed);
		const avgRemaining = tasksWithEstimate > 0 ? Math.round(totalRemaining / tasksWithEstimate) : 0;

		return {
			totalEstimated,
			totalElapsed,
			totalRemaining,
			avgRemaining,
			tasksWithEstimate,
		};
	}, [taskStore.tasks]);

	const handleCreateTask = (data: CreateTaskInput) => {
		taskStore.createTask(data);
	};

	const handleTaskOperation = async (taskId: string, operation: string) => {
		switch (operation) {
			case "start":
			case "pause":
			case "complete":
				// TODO: Implement task operations
				break;
		}
	};

	return (
		<div className="h-full overflow-y-auto p-4 bg-[var(--md-ref-color-surface)]">
			<div className="max-w-7xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						<h1 className="text-2xl font-semibold tracking-tight text-[var(--md-ref-color-on-surface)]">生活時間タイムライン</h1>
					</div>
					<div className="text-sm text-[var(--md-ref-color-on-surface-variant)]">
						{totals.totalRemaining}分残り ({totals.avgRemaining}分平均)
					</div>
				</div>

				{/* Summary cards */}
				<div className="grid grid-cols-4 gap-3 mb-6">
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">総予定時間</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.totalEstimated}<span className="text-base font-normal ml-1">分</span></div>
					</div>
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">経過時間</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.totalElapsed}<span className="text-base font-normal ml-1">分</span></div>
					</div>
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">残り時間</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.totalRemaining}<span className="text-base font-normal ml-1">分</span></div>
					</div>
					<div className="px-5 py-4 rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
						<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">タスク予定</div>
						<div className="text-3xl font-bold tracking-tight text-[var(--md-ref-color-on-surface)]">{totals.tasksWithEstimate}<span className="text-base font-normal ml-1">件</span></div>
					</div>
				</div>

				{/* Date selector */}
				<div className="mb-6 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => {
								const newDate = new Date(selectedDate);
								newDate.setDate(newDate.getDate() - 1);
								setSelectedDate(newDate);
							}}
							className="p-2 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
							aria-label="Previous day"
						>
							<Icon name="chevron_left" size={20} className="text-[var(--md-ref-color-on-surface)]" />
						</button>
						<button
							type="button"
							onClick={() => {
								const newDate = new Date(selectedDate);
								newDate.setDate(newDate.getDate() + 1);
								setSelectedDate(newDate);
							}}
							className="p-2 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
							aria-label="Next day"
						>
							<Icon name="chevron_right" size={20} className="text-[var(--md-ref-color-on-surface)]" />
						</button>
					</div>
					<div className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
						{selectedDate.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
					</div>
				</div>

				{/* Main content: Timeline panel */}
				<TaskTimelinePanel
					tasks={taskStore.tasks}
					onCreateTask={handleCreateTask}
					viewMode="daily"
					date={selectedDate}
				/>

				{/* Empty state */}
				{taskStore.totalCount === 0 && (
					<div className="flex flex-col items-center justify-center py-16 text-[var(--md-ref-color-on-surface-variant)]">
						<Icon name="hourglass_empty" size={56} className="mb-4 opacity-40" />
						<p className="text-base font-medium mt-3">タスクがありません</p>
						<p className="text-sm mt-2 opacity-70">右のパネルからタスクを作成してください</p>
					</div>
				)}
			</div>
		</div>
	);
}
