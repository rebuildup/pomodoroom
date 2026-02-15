/**
 * DayTimelinePanel - 24-hour timeline with task cards
 *
 * Displays tasks on a vertical timeline with:
 * - Time labels (00:00 - 23:00)
 * - Hour guide lines
 * - Lane-based layout for overlapping tasks
 * - Midnight-crossing task splitting
 * - Current time indicator bar
 *
 * Used by RecurringTaskEditor, CalendarSidePanel, etc.
 */

import React, { useMemo, useState, useEffect } from "react";
import { TaskCard } from "./TaskCard";
import type { Task } from "@/types/task";

export interface TimelineSegment {
	key: string;
	top: number;
	height: number;
	bottom: number;
	task: Task;
	lane: number;
	totalLanes: number;
}

export interface DayTimelinePanelProps {
	/** Tasks to display on the timeline */
	tasks: Task[];
	/** Height of each hour in pixels (default: 60) */
	hourHeight?: number;
	/** Width of the time labels column in pixels (default: 48) */
	timeLabelWidth?: number;
	/** Minimum task card height in pixels (default: 50) */
	minCardHeight?: number;
	/** Gap between lanes in pixels (default: 4) */
	laneGap?: number;
	/** Whether task cards are draggable (default: false) */
	draggable?: boolean;
	/** Called when a task card is clicked/selected */
	onTaskSelect?: (task: Task) => void;
	/** Empty state message */
	emptyMessage?: string;
	/** Additional class name for the container */
	className?: string;
	/** Test ID for the scroll container */
	testId?: string;
}

/**
 * Calculate timeline segments with lane assignments.
 * Handles midnight-crossing tasks by splitting them into two segments.
 */
export function calculateTimelineSegments(
	tasks: Task[],
	hourHeight: number = 60,
	minCardHeight: number = 50
): TimelineSegment[] {
	const rawSegments: Omit<TimelineSegment, "lane" | "totalLanes">[] = [];
	const dayMinutes = 24 * 60;

	tasks.forEach((task) => {
		const startTime = task.fixedStartAt || task.windowStartAt;
		const endTime = task.fixedEndAt || task.windowEndAt;
		if (!startTime) return;

		const start = new Date(startTime);
		const end = endTime ? new Date(endTime) : new Date(start.getTime() + 30 * 60 * 1000);

		const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
		const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

		const startToPixels = (date: Date) => {
			const hours = date.getHours();
			const minutes = date.getMinutes();
			return (hours * 60 + minutes) * (hourHeight / 60);
		};

		if (startDate.getTime() < endDate.getTime()) {
			// Task crosses midnight - split into two segments
			const top1 = startToPixels(start);
			const height1 = Math.max(minCardHeight, dayMinutes * (hourHeight / 60) - top1);

			rawSegments.push({
				key: `${task.id}-part1`,
				top: top1,
				height: height1,
				bottom: dayMinutes * (hourHeight / 60),
				task,
			});

			const bottom2 = startToPixels(end);
			const height2 = Math.max(minCardHeight, bottom2);

			rawSegments.push({
				key: `${task.id}-part2`,
				top: 0,
				height: height2,
				bottom: bottom2,
				task,
			});
		} else {
			const top = startToPixels(start);
			const bottom = startToPixels(end);
			const height = Math.max(minCardHeight, bottom - top);

			rawSegments.push({
				key: task.id,
				top,
				height,
				bottom,
				task,
			});
		}
	});

	// Sort by start time (top), then by duration (longer first for same start)
	rawSegments.sort((a, b) => {
		if (a.top !== b.top) return a.top - b.top;
		return b.height - a.height;
	});

	// Helper function to check if two segments overlap
	const overlaps = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) => {
		return a.top < b.bottom && a.bottom > b.top;
	};

	// Assign lanes using greedy algorithm
	const lanes: { top: number; bottom: number }[][] = [];
	const segmentLanes: number[] = [];

	rawSegments.forEach((segment) => {
		let assignedLane = -1;
		for (let i = 0; i < lanes.length; i++) {
			const hasOverlap = lanes[i].some((existing) => overlaps(segment, existing));
			if (!hasOverlap) {
				assignedLane = i;
				break;
			}
		}

		if (assignedLane === -1) {
			assignedLane = lanes.length;
			lanes.push([]);
		}

		lanes[assignedLane].push({ top: segment.top, bottom: segment.bottom });
		segmentLanes.push(assignedLane);
	});

	// For each segment, calculate how many lanes are active during its time range
	const result: TimelineSegment[] = rawSegments.map((segment, index) => {
		const overlappingLanes = new Set<number>();
		rawSegments.forEach((other, otherIndex) => {
			if (overlaps(segment, other)) {
				overlappingLanes.add(segmentLanes[otherIndex]);
			}
		});

		return {
			...segment,
			lane: segmentLanes[index],
			totalLanes: Math.max(1, overlappingLanes.size),
		};
	});

	return result;
}

export const DayTimelinePanel: React.FC<DayTimelinePanelProps> = ({
	tasks,
	hourHeight = 60,
	timeLabelWidth = 48,
	minCardHeight = 50,
	laneGap = 4,
	draggable = false,
	onTaskSelect,
	emptyMessage = "表示する予定がありません",
	className = "",
	testId = "day-timeline-panel",
}) => {
	const segments = useMemo(
		() => calculateTimelineSegments(tasks, hourHeight, minCardHeight),
		[tasks, hourHeight, minCardHeight]
	);

	// Current time state for the indicator bar
	const [currentTime, setCurrentTime] = useState(() => new Date());

	// Update current time every minute
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 60 * 1000); // Update every minute
		return () => clearInterval(interval);
	}, []);

	// Calculate current time position in pixels
	const currentTimePosition = useMemo(() => {
		const hours = currentTime.getHours();
		const minutes = currentTime.getMinutes();
		return (hours * 60 + minutes) * (hourHeight / 60);
	}, [currentTime, hourHeight]);

	const totalHeight = 24 * hourHeight;
	const timeLabels = Array.from({ length: 24 }, (_, i) => i);

	return (
		<div className={`min-h-0 flex-1 flex flex-col overflow-hidden ${className}`}>
			<div
				data-testid={testId}
				className="min-h-0 flex-1 overflow-y-auto"
			>
				<div className="flex">
					{/* Time labels column */}
					<div className="flex-shrink-0" style={{ width: timeLabelWidth }}>
						{timeLabels.map((hour) => (
							<div
								key={hour}
								className="text-[10px] text-[var(--md-ref-color-on-surface-variant)] text-right pr-2"
								style={{ height: hourHeight, marginTop: -1 }}
							>
								{String(hour).padStart(2, '0')}:00
							</div>
						))}
					</div>

					{/* TaskCards area */}
					<div className="flex-1 relative" style={{ minHeight: totalHeight }}>
						{/* Hour guide lines */}
						{timeLabels.map((hour) => (
							<div
								key={`guide-${hour}`}
								className="absolute left-0 right-0 border-t border-[var(--md-ref-color-outline-variant)] opacity-30"
								style={{ top: hour * hourHeight }}
							/>
						))}

						{/* Current time indicator bar */}
						<div
							className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
							style={{ top: currentTimePosition }}
						>
							{/* Time label dot */}
							<div
								className="absolute rounded-full bg-[var(--md-ref-color-primary)]"
								style={{ width: 8, height: 8, left: -4 }}
							/>
							{/* Horizontal line */}
							<div className="flex-1 h-[2px] bg-[var(--md-ref-color-primary)]" />
						</div>

						{/* Task cards */}
						{segments.map((segment) => {
							const leftPercent = (segment.lane / segment.totalLanes) * 100;
							const widthPercent = 100 / segment.totalLanes;

							return (
								<div
									key={segment.key}
									className="absolute"
									style={{
										top: segment.top,
										height: segment.height,
										minHeight: minCardHeight,
										left: `calc(${leftPercent}% + ${laneGap / 2}px)`,
										width: `calc(${widthPercent}% - ${laneGap}px)`,
									}}
								>
									<TaskCard
										task={segment.task}
										draggable={draggable}
										density="compact"
										operationsPreset="none"
										showStatusControl={true}
										expandOnClick={true}
										expanded={false}
										onExpandedChange={() => onTaskSelect?.(segment.task)}
										className="h-full"
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{tasks.length === 0 && (
				<div className="mt-2 text-center text-sm text-[var(--md-ref-color-on-surface-variant)]">
					{emptyMessage}
				</div>
			)}
		</div>
	);
};

export default DayTimelinePanel;
