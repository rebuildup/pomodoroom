/**
 * TaskTimelinePanel — Timeline with task blocks
 *
 * Features:
 * - Timeline with time labels and task blocks
 * - Supports daily view (relative time from 6:00) and macro view (absolute timestamps)
 */

import { useMemo } from "react";
import { TaskTimeRemaining } from "./TaskTimeRemaining";
import type { Task } from "@/types/task";

type ViewMode = "daily" | "macro";

interface TaskTimelinePanelProps {
	tasks: Task[];
	viewMode: ViewMode;
	date?: Date;           // for daily view
	startTime?: number;     // for macro view (base timestamp)
}

const DEFAULT_TASK_MINUTES = 60;

/**
 * Calculate the start position (in minutes) for a task on the timeline.
 */
function calculateBlockStart(tasks: Task[], currentIndex: number): number {
	let offset = 0;
	for (let i = 0; i < currentIndex; i++) {
		offset += tasks[i].requiredMinutes || DEFAULT_TASK_MINUTES;
	}
	return offset;
}

/**
 * Calculate daily view start time (6:00 AM)
 */
function calculateDailyStartTime(date: Date): number {
	const d = new Date(date);
	d.setHours(6, 0, 0, 0);
	return d.getTime();
}

/**
 * Generate time labels for the timeline (6:00 - 18:00 for daily view)
 */
function generateTimeLabels(): { label: string; offsetMinutes: number }[] {
	const labels: { label: string; offsetMinutes: number }[] = [];
	for (let hour = 6; hour < 18; hour++) {
		labels.push({
			label: `${String(hour).padStart(2, '0')}:00`,
			offsetMinutes: (hour - 6) * 60,
		});
	}
	return labels;
}

/**
 * Get state-based color class for timeline blocks
 */
function getBlockColorClass(state: Task["state"]): string {
	switch (state) {
		case "READY":
			return "bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]";
		case "RUNNING":
			return "bg-[var(--md-sys-color-running)] border-[var(--md-sys-color-outline)]";
		case "PAUSED":
			return "bg-[var(--md-sys-color-paused)] border-[var(--md-sys-color-outline)]";
		case "DONE":
			return "bg-[var(--md-sys-color-done)] border-[var(--md-sys-color-outline)]";
		default:
			return "bg-[var(--md-sys-color-surface-container-low)] border-[var(--md-sys-color-outline-variant)]";
	}
}

export function TaskTimelinePanel({
	tasks,
	viewMode,
	date,
	startTime,
}: TaskTimelinePanelProps) {
	// Calculate timeline metadata
	const timelineMetadata = useMemo(() => {
		if (viewMode === "daily") {
			// Daily view: relative time from 6:00 AM
			const baseDate = date || new Date();
			const baseTime = calculateDailyStartTime(baseDate);
			return {
				baseTime,
				durationMinutes: 12 * 60, // 12 hours (6:00 - 18:00)
				timeLabels: generateTimeLabels(),
			};
		} else {
			// Macro view: absolute time from earliest task
			const baseTime = startTime || Date.now();
			const maxEndTime = tasks.reduce((max, task) => {
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
				timeLabels: [], // TODO: generate for macro view
			};
		}
	}, [viewMode, tasks, date, startTime]);

	// Calculate task blocks
	const timelineBlocks = useMemo(() => {
		return tasks.map((task, index) => {
			const startOffset = calculateBlockStart(tasks, index);
			const width = task.requiredMinutes || DEFAULT_TASK_MINUTES;
			return {
				task,
				startOffset,
				width,
			};
		});
	}, [tasks]);

	return (
		<div className="border border-[var(--md-ref-color-outline-variant)] rounded-xl p-4 bg-[var(--md-ref-color-surface-container-low)]">
			{/* Timeline */}
			<div className="relative">
				{/* Time labels */}
				<div className="relative mb-2" style={{ height: "24px" }}>
					{timelineMetadata.timeLabels.map(({ label, offsetMinutes }) => (
						<div
							key={label}
							className="absolute top-0 text-xs text-[var(--md-ref-color-on-surface-variant)]"
							style={{ left: `${offsetMinutes}px` }}
						>
							{label}
						</div>
					))}
				</div>

				{/* Task blocks */}
				<div className="relative" style={{ height: "48px" }}>
					{timelineBlocks.map(({ task, startOffset, width }) => (
						<div
							key={task.id}
							className={`
								timeline-block
								${getBlockColorClass(task.state)}
							`}
							style={{
								left: `${startOffset}px`,
								width: `${Math.max(width, 30)}px`, // minimum width for visibility
							}}
							data-state={task.state}
						>
							<TaskTimeRemaining task={task} allTasks={tasks} />
							<span className="text-xs font-medium truncate">{task.title}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
