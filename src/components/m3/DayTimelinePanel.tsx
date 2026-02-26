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

import type React from "react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { TaskCard } from "./TaskCard";
import type { TaskOperation } from "./TaskOperations";
import type { Task } from "@/types/task";

const MIN_ZOOM_SCALE = 0.4;
const MAX_ZOOM_SCALE = 16;
const ZOOM_STEP = 0.1;

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
	/** Called when task operation is triggered from a timeline card */
	onTaskOperation?: (taskId: string, operation: TaskOperation) => void;
	/** Return false to disable status operation for specific tasks */
	canOperateTask?: (task: Task) => boolean;
	/** Empty state message */
	emptyMessage?: string;
	/** Additional class name for the container */
	className?: string;
	/** Test ID for the scroll container */
	testId?: string;
}

export function calculateLensShift(
	top: number,
	expandedTop: number | null,
	lensExtra: number,
): number {
	if (expandedTop === null || lensExtra <= 0) return top;
	return top > expandedTop ? top + lensExtra : top;
}

function parseIsoToDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveTaskTimelineRange(task: Task): { start: Date; end: Date } | null {
	const fallbackDurationMinutes = Math.max(1, task.requiredMinutes ?? 30);

	const fixedStart = parseIsoToDate(task.fixedStartAt);
	const fixedEnd = parseIsoToDate(task.fixedEndAt);
	if (fixedStart) {
		const end =
			fixedEnd ??
			new Date(
				fixedStart.getTime() +
					Math.max(1, task.requiredMinutes ?? task.elapsedMinutes ?? 30) * 60_000,
			);
		return end > fixedStart ? { start: fixedStart, end } : null;
	}

	if (
		task.kind === "flex_window" &&
		task.windowStartAt &&
		task.windowEndAt &&
		task.requiredMinutes
	) {
		const windowStart = parseIsoToDate(task.windowStartAt);
		const windowEnd = parseIsoToDate(task.windowEndAt);
		if (windowStart && windowEnd && windowEnd > windowStart) {
			const windowCenter = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
			const halfDuration = (task.requiredMinutes / 2) * 60 * 1000;
			const start = new Date(windowCenter.getTime() - halfDuration);
			const end = new Date(windowCenter.getTime() + halfDuration);
			return end > start ? { start, end } : null;
		}
	}

	const startedAt = parseIsoToDate(task.startedAt);
	const completedAt = parseIsoToDate(task.completedAt);
	const pausedAt = parseIsoToDate(task.pausedAt);
	const estimatedStartAt = parseIsoToDate(task.estimatedStartAt);
	const updatedAt = parseIsoToDate(task.updatedAt);
	const createdAt = parseIsoToDate(task.createdAt);

	if (task.state === "DONE" && completedAt) {
		const actualDurationMinutes = Math.max(
			1,
			task.elapsedMinutes || task.requiredMinutes || fallbackDurationMinutes,
		);
		const start = startedAt ?? new Date(completedAt.getTime() - actualDurationMinutes * 60_000);
		return completedAt > start ? { start, end: completedAt } : null;
	}

	if (task.state === "RUNNING" && startedAt) {
		const plannedEnd = new Date(startedAt.getTime() + fallbackDurationMinutes * 60_000);
		const end = plannedEnd > startedAt ? plannedEnd : new Date(startedAt.getTime() + 60_000);
		return { start: startedAt, end };
	}

	if (task.state === "PAUSED") {
		const start = startedAt ?? estimatedStartAt ?? updatedAt ?? createdAt;
		const end =
			pausedAt ??
			(start ? new Date(start.getTime() + Math.max(1, task.elapsedMinutes || 1) * 60_000) : null);
		if (start && end && end > start) {
			return { start, end };
		}
	}

	const fallbackStart = estimatedStartAt ?? parseIsoToDate(task.windowStartAt) ?? updatedAt ?? createdAt;
	if (!fallbackStart) return null;
	const fallbackEnd =
		parseIsoToDate(task.windowEndAt) ??
		new Date(fallbackStart.getTime() + fallbackDurationMinutes * 60_000);

	return fallbackEnd > fallbackStart ? { start: fallbackStart, end: fallbackEnd } : null;
}

/**
 * Calculate timeline segments with lane assignments.
 * Handles midnight-crossing tasks by splitting them into two segments.
 */
export function calculateTimelineSegments(
	tasks: Task[],
	hourHeight: number = 60,
	minCardHeight: number = 50,
): TimelineSegment[] {
	const rawSegments: Omit<TimelineSegment, "lane" | "totalLanes">[] = [];
	const dayMinutes = 24 * 60;

	tasks.forEach((task) => {
		const resolvedRange = resolveTaskTimelineRange(task);
		if (!resolvedRange) return;
		const start = resolvedRange.start;
		const end = resolvedRange.end;

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
			const bottom1 = top1 + height1;

			rawSegments.push({
				key: `${task.id}-part1`,
				top: top1,
				height: height1,
				bottom: bottom1,
				task,
			});

			const rawBottom2 = startToPixels(end);
			const height2 = Math.max(minCardHeight, rawBottom2);
			const bottom2 = height2;

			rawSegments.push({
				key: `${task.id}-part2`,
				top: 0,
				height: height2,
				bottom: bottom2,
				task,
			});
		} else {
			const top = startToPixels(start);
			const rawBottom = startToPixels(end);
			const height = Math.max(minCardHeight, rawBottom - top);
			const bottom = top + height;

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

	// Build connected overlap groups and assign group max lane count.
	const groupByIndex = new Array<number>(rawSegments.length).fill(-1);
	const groupTotalLanes = new Map<number, number>();
	let groupId = 0;
	for (let i = 0; i < rawSegments.length; i++) {
		if (groupByIndex[i] !== -1) continue;
		const stack = [i];
		groupByIndex[i] = groupId;
		let maxLane = segmentLanes[i];
		while (stack.length > 0) {
			const current = stack.pop();
			if (current === undefined) continue;
			for (let j = 0; j < rawSegments.length; j++) {
				if (groupByIndex[j] !== -1) continue;
				if (!overlaps(rawSegments[current], rawSegments[j])) continue;
				groupByIndex[j] = groupId;
				maxLane = Math.max(maxLane, segmentLanes[j]);
				stack.push(j);
			}
		}
		groupTotalLanes.set(groupId, Math.max(1, maxLane + 1));
		groupId += 1;
	}

	const result: TimelineSegment[] = rawSegments.map((segment, index) => ({
		...segment,
		lane: segmentLanes[index],
		totalLanes: groupTotalLanes.get(groupByIndex[index]) ?? 1,
	}));

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
	onTaskOperation,
	canOperateTask,
	emptyMessage = "",
	className = "",
	testId = "day-timeline-panel",
}) => {
	const [zoomScale, setZoomScale] = useState(1);
	const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const effectiveHourHeight = hourHeight * zoomScale;

	const segments = useMemo(
		() => calculateTimelineSegments(tasks, effectiveHourHeight, minCardHeight),
		[tasks, effectiveHourHeight, minCardHeight],
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
		return (hours * 60 + minutes) * (effectiveHourHeight / 60);
	}, [currentTime, effectiveHourHeight]);

	const expandedSegment = useMemo(() => {
		if (!expandedTaskId) return null;
		const candidates = segments
			.filter((segment) => segment.task.id === expandedTaskId)
			.sort((a, b) => a.top - b.top);
		return candidates[0] ?? null;
	}, [expandedTaskId, segments]);

	const expandedCardHeight = Math.max(minCardHeight, 220);
	const lensExtra = useMemo(() => {
		if (!expandedSegment) return 0;
		return Math.max(0, expandedCardHeight - expandedSegment.height);
	}, [expandedSegment, expandedCardHeight]);

	const shiftByLens = (top: number): number =>
		calculateLensShift(top, expandedSegment?.top ?? null, lensExtra);

	const totalHeight = 24 * effectiveHourHeight + lensExtra;
	const timeLabels = Array.from({ length: 24 }, (_, i) => i);

	const handleWheelZoom = useCallback((event: WheelEvent) => {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
		setZoomScale((prev) => {
			const next = prev + delta;
			return Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, Math.round(next * 100) / 100));
		});
	}, []);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		container.addEventListener("wheel", handleWheelZoom, { passive: false });
		return () => {
			container.removeEventListener("wheel", handleWheelZoom);
		};
	}, [handleWheelZoom]);

	return (
		<div className={`min-h-0 flex-1 flex flex-col overflow-hidden ${className}`}>
			<div
				data-testid={testId}
				ref={scrollContainerRef}
				className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hover-y"
			>
				<div className="flex">
					{/* Time labels column */}
					<div className="flex-shrink-0 relative" style={{ width: timeLabelWidth, minHeight: totalHeight }}>
						{timeLabels.map((hour) => (
							<div
								key={hour}
								className="absolute left-0 right-0 text-[10px] text-[var(--md-ref-color-on-surface-variant)] text-right pr-2"
								style={{ top: shiftByLens(hour * effectiveHourHeight), height: effectiveHourHeight }}
							>
								{String(hour).padStart(2, "0")}:00
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
								style={{ top: shiftByLens(hour * effectiveHourHeight) }}
							/>
						))}

						{/* Current time indicator bar */}
						<div
							className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
							style={{ top: shiftByLens(currentTimePosition) }}
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
							const isExpanded = expandedTaskId === segment.task.id;
							const canOperate = canOperateTask
								? canOperateTask(segment.task)
								: Boolean(onTaskOperation);
							const displayTop = shiftByLens(segment.top);
							const displayHeight = isExpanded
								? Math.max(segment.height, expandedCardHeight)
								: segment.height;

							return (
								<div
									key={segment.key}
									className="absolute"
									style={{
										top: displayTop,
										height: displayHeight,
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
										statusClickMode={canOperate ? "operation" : "expand"}
										expandOnClick={true}
										expanded={isExpanded}
										onExpandedChange={(_taskId, expanded) => {
											setExpandedTaskId(expanded ? segment.task.id : null);
											if (expanded) {
												onTaskSelect?.(segment.task);
											}
										}}
										onOperation={canOperate ? onTaskOperation : undefined}
										className="h-full"
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{tasks.length === 0 && emptyMessage && (
				<div className="mt-2 text-center text-sm text-[var(--md-ref-color-on-surface-variant)]">
					{emptyMessage}
				</div>
			)}
		</div>
	);
};

export default DayTimelinePanel;
