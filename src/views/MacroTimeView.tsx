/**
 * MacroTimeView — Macro time timeline view
 *
 * Shows all tasks on a timeline based on their scheduled time.
 * Uses absolute timestamps (fixed events) or flexible windows.
 */

import { useMemo } from "react";
import { Icon } from "@/components/m3/Icon";
import { TaskTimelinePanel } from "@/components/m3/TaskTimelinePanel";
import { useTaskStore } from "@/hooks/useTaskStore";
import type { Task } from "@/types/task";

/**
 * Calculate macro view start time (earliest task start or current time)
 */
function calculateMacroStartTime(tasks: Task[]): number {
	const now = Date.now();
	const earliestStart = tasks.reduce((earliest: number | null, task) => {
		if (task.fixedStartAt) {
			const start = new Date(task.fixedStartAt).getTime();
			return earliest === null || start < earliest ? start : earliest;
		}
		return earliest;
	}, null);

	return earliestStart !== null && earliestStart < now ? earliestStart : now;
}

export default function MacroTimeView() {
	const taskStore = useTaskStore();

	// Calculate timeline metadata
	const timelineMetadata = useMemo(() => {
		const baseTime = calculateMacroStartTime(taskStore.tasks);
		// Calculate duration from earliest to latest task
		const maxEndTime = taskStore.tasks.reduce((max: number, task) => {
			if (task.fixedEndAt) {
				const end = new Date(task.fixedEndAt).getTime();
				return end > max ? end : max;
			}
			return max;
		}, baseTime);
		const durationMinutes = Math.max(120, Math.round((maxEndTime - baseTime) / (1000 * 60)));
		return {
			baseTime,
			durationMinutes,
		};
	}, [taskStore.tasks]);

	// Calculate totals
	const totals = useMemo(() => {
		let totalEstimated = 0;
		let totalElapsed = 0;
		let tasksWithEstimate = 0;

		taskStore.tasks.forEach(task => {
			if (task.requiredMinutes) {
				totalEstimated += task.requiredMinutes;
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

	return (
		<div className="h-full overflow-y-auto p-4 bg-[var(--md-ref-color-surface)]">
			<div className="max-w-7xl mx-auto px-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-4">
						<h1 className="text-2xl font-semibold tracking-tight text-[var(--md-ref-color-on-surface)]">マクロ時間タイムライン</h1>
					</div>
					<div className="text-sm text-[var(--md-ref-color-on-surface-variant)]">
						全タスク合計: {totals.totalEstimated}分 (残り{totals.totalRemaining}分)
					</div>
				</div>

				{/* Summary cards */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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

				{/* Main content: Timeline panel */}
				<TaskTimelinePanel
					tasks={taskStore.tasks}
					viewMode="macro"
					startTime={timelineMetadata.baseTime}
				/>

				{/* Empty state */}
				{taskStore.totalCount === 0 && (
					<div className="flex flex-col items-center justify-center py-16 text-[var(--md-ref-color-on-surface-variant)]">
						<Icon name="inbox" size={56} className="mb-4 opacity-40" />
						<p className="text-base font-medium mt-3">タスクがありません</p>
						<p className="text-sm mt-2 opacity-70">右のパネルからタスクを作成してください</p>
					</div>
				)}
			</div>
		</div>
	);
}
