/**
 * Material 3 Timeline View Component
 *
 * Displays timeline items (events, tasks, sessions) chronologically.
 * Shows current time indicator, supports item click and drag-to-move.
 *
 * Features:
 * - 24-hour timeline with time labels
 * - Color-coded items by type/source
 * - Current time indicator with pulse animation
 * - Drag and drop support for rescheduling
 * - Smooth animations and transitions
 *
 * @example
 * ```tsx
 * <TimelineView
 *   items={timelineItems}
 *   currentTime={new Date()}
 *   onItemClick={handleItemClick}
 *   onItemMove={handleItemMove}
 * />
 * ```
 */

import React, { useState, useMemo } from "react";
import { Icon } from "./Icon";
import type { TimelineItem, TaskProposal } from "@/types";

export interface M3TimelineViewProps {
	/** Timeline items to display */
	items: TimelineItem[];
	/** Current time for indicator */
	currentTime: Date;
	/** Date to display (default: today) */
	date?: Date;
	/** Called when an item is clicked */
	onItemClick?: (item: TimelineItem) => void;
	/** Called when an item is moved to new time */
	onItemMove?: (itemId: string, newStartTime: string, newEndTime: string) => void;
	/** Called when a task is selected from proposals */
	onTaskSelect?: (task: TimelineItem) => void;
	/** Called when a proposal is accepted */
	onProposalAccept?: (proposal: TaskProposal) => void;
	/** Called when a proposal is rejected */
	onProposalReject?: (proposal: TaskProposal) => void;
	/** Custom className for styling */
	className?: string;
	/** Show compact mode */
	compact?: boolean;
	/** Hour range to display (default: 6-22) */
	hourStart?: number;
	hourEnd?: number;
}

/**
 * Get item color classes based on type and source.
 */
function getItemColors(item: TimelineItem): { bg: string; border: string; text: string; icon: string } {
	// Completed items get green accent
	if (item.completed) {
		return {
			bg: "bg-green-500/10",
			border: "border-green-500/30",
			text: "text-green-400",
			icon: "check_circle",
		};
	}

	// Color by source
	switch (item.source) {
		case "google":
			return {
				bg: "bg-purple-500/10",
				border: "border-purple-500/30",
				text: "text-purple-400",
				icon: "calendar_month",
			};
		case "notion":
			return {
				bg: "bg-gray-500/10",
				border: "border-gray-500/30",
				text: "text-gray-400",
				icon: "description",
			};
		case "linear":
			return {
				bg: "bg-blue-500/10",
				border: "border-blue-500/30",
				text: "text-blue-400",
				icon: "timeline",
			};
		case "github":
			return {
				bg: "bg-gray-600/10",
				border: "border-gray-600/30",
				text: "text-gray-300",
				icon: "link",
			};
		case "manual":
		case "local":
		default:
			if (item.type === "session") {
				return {
					bg: "bg-blue-500/10",
					border: "border-blue-500/30",
					text: "text-blue-400",
					icon: "timer",
				};
			}
			return {
				bg: "bg-gray-500/10",
				border: "border-gray-500/30",
				text: "text-gray-400",
				icon: "label",
			};
	}
}

/**
 * Format time as HH:mm
 */
function formatTime(date: Date): string {
	return date.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

/**
 * Format date as "Mon, Jan 12"
 */
function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

/**
 * Get item duration in minutes
 */
function getDurationMinutes(item: TimelineItem): number {
	const start = new Date(item.startTime);
	const end = new Date(item.endTime);
	return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * Format duration for display
 */
function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Material 3 Timeline View.
 *
 * Displays a vertical timeline with time labels and items.
 * Supports drag and drop for rescheduling items.
 */
export const M3TimelineView: React.FC<M3TimelineViewProps> = ({
	items,
	currentTime,
	date = new Date(),
	onItemClick,
	onItemMove,
	className = "",
	compact = false,
	hourStart = 6,
	hourEnd = 22,
}) => {
	const [draggedItem, setDraggedItem] = useState<TimelineItem | null>(null);
	const [dragOverHour, setDragOverHour] = useState<number | null>(null);

	// Generate hours for the day
	const hours = useMemo(() => {
		const result: Date[] = [];
		for (let i = hourStart; i <= hourEnd; i++) {
			const hour = new Date(date);
			hour.setHours(i, 0, 0, 0);
			result.push(hour);
		}
		return result;
	}, [date, hourStart, hourEnd]);

	// Group items by hour
	const itemsByHour = useMemo(() => {
		const map = new Map<number, TimelineItem[]>();
		hours.forEach((h) => map.set(h.getHours(), []));

		items.forEach((item) => {
			const itemDate = new Date(item.startTime);
			const hour = itemDate.getHours();
			if (hour >= hourStart && hour <= hourEnd) {
				const hourItems = map.get(hour) ?? [];
				hourItems.push(item);
				map.set(hour, hourItems);
			}
		});

		return map;
	}, [items, hours, hourStart, hourEnd]);

	// Check if two dates are in the same hour
	const isSameHour = (a: Date, b: Date): boolean => {
		return (
			a.getHours() === b.getHours() &&
			a.getDate() === b.getDate() &&
			a.getMonth() === b.getMonth() &&
			a.getFullYear() === b.getFullYear()
		);
	};

	// Drag handlers
	const handleDragStart = (item: TimelineItem) => {
		if (item.source === "google") return; // Don't allow dragging Google events
		setDraggedItem(item);
	};

	const handleDragEnd = () => {
		setDraggedItem(null);
		setDragOverHour(null);
	};

	const handleDragOver = (hour: number) => {
		if (draggedItem) {
			setDragOverHour(hour);
		}
	};

	const handleDrop = (hour: number) => {
		if (!draggedItem || !onItemMove) return;

		const oldStart = new Date(draggedItem.startTime);
		const oldEnd = new Date(draggedItem.endTime);
		const duration = oldEnd.getTime() - oldStart.getTime();

		const newStart = new Date(date);
		newStart.setHours(hour, 0, 0, 0);

		const newEnd = new Date(newStart.getTime() + duration);

		onItemMove(draggedItem.id, newStart.toISOString(), newEnd.toISOString());
		setDraggedItem(null);
		setDragOverHour(null);
	};

	const itemHeight = compact ? "h-12" : "h-16";
	const timeWidth = compact ? "w-14" : "w-16";

	return (
		<div className={`flex flex-col ${className}`.trim()}>
			{/* Header with date */}
			<div className="flex items-center justify-between mb-4 px-1">
				<div className="flex items-center gap-2">
					<Icon name="schedule" size={18} className="text-blue-400" />
					<h3 className="text-base font-semibold text-gray-200">{formatDate(date)}</h3>
				</div>
				{items.length > 0 && (
					<span className="text-sm text-gray-500">{items.length} items</span>
				)}
			</div>

			{/* Timeline content */}
			<div className="flex bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
				{/* Time labels column */}
				<div
					className={`${timeWidth} flex-shrink-0 border-r border-gray-700/50 bg-gray-800/50`}
				>
					{hours.map((hour) => {
						const isCurrent = isSameHour(hour, currentTime);
						return (
							<div
								key={hour.getHours()}
								className={`${itemHeight} flex items-center justify-center px-2 text-xs tabular-nums transition-colors ${
									isCurrent ? "text-blue-400 font-medium" : "text-gray-500"
								}`}
							>
								{formatTime(hour)}
							</div>
						);
					})}
				</div>

				{/* Timeline items */}
				<div className="flex-1 min-w-0">
					{hours.map((hour) => {
						const hourNum = hour.getHours();
						const hourItems = itemsByHour.get(hourNum) ?? [];
						const isCurrent = isSameHour(hour, currentTime);
						const isDragOver = dragOverHour === hourNum;

						return (
							<div
								key={hourNum}
								className={`${itemHeight} border-b border-gray-700/30 relative transition-colors ${
									isCurrent ? "bg-blue-500/5" : ""
								} ${isDragOver ? "bg-blue-500/10" : ""}`}
								onDragOver={() => handleDragOver(hourNum)}
								onDrop={() => handleDrop(hourNum)}
							>
								{/* Current time indicator */}
								{isCurrent && (
									<div className="absolute left-0 right-0 top-0 h-px bg-blue-500 z-10">
										<div className="absolute left-0 top-0 w-2 h-2 bg-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
									</div>
								)}

								{/* Items for this hour */}
								<div className="px-3 py-1 flex flex-col gap-1 overflow-y-auto max-h-full">
									{hourItems.map((item) => {
										const colors = getItemColors(item);
										const isDragging = draggedItem?.id === item.id;
										const canDrag = item.source !== "google";

										return (
											<button
												key={item.id}
												type="button"
												draggable={canDrag}
												onClick={() => onItemClick?.(item)}
												onDragStart={() => handleDragStart(item)}
												onDragEnd={handleDragEnd}
												className={`${colors.bg} ${colors.border} border rounded-lg px-3 py-2 text-left transition-all w-full ${
													isDragging ? "opacity-50 scale-95" : "hover:opacity-80 hover:scale-[1.01]"
												} ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
											>
												<div className="flex items-start gap-2">
													<Icon
														name={colors.icon as any}
														size={14}
														className={colors.text + " mt-0.5 flex-shrink-0"}
													/>
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2">
															<span className={`text-sm font-medium text-gray-200 truncate`}>
																{item.title}
															</span>
															{item.completed && (
																<Icon name="check" size={12} className="text-green-400 flex-shrink-0" />
															)}
														</div>
														<div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
															<span className="flex items-center gap-1">
																<Icon name="schedule" size={10} />
																{formatDuration(getDurationMinutes(item))}
															</span>
															{item.priority !== undefined && item.priority > 70 && (
																<span className="flex items-center gap-1 text-orange-400">
																	<Icon name="flag" size={10} />
																	Priority
																</span>
															)}
														</div>
														{item.description && !compact && (
															<p className="text-xs text-gray-400 mt-1 truncate">
																{item.description}
															</p>
														)}
														{item.tags && item.tags.length > 0 && !compact && (
															<div className="flex flex-wrap gap-1 mt-1.5">
																{item.tags.slice(0, 2).map((tag) => (
																	<span
																		key={tag}
																		className="px-1.5 py-0.5 bg-gray-700/30 rounded text-xs text-gray-500"
																	>
																		#{tag}
																	</span>
																))}
																{item.tags.length > 2 && (
																	<span className="px-1.5 py-0.5 bg-gray-700/30 rounded text-xs text-gray-600">
																		+{item.tags.length - 2}
																	</span>
																)}
															</div>
														)}
													</div>
												</div>
											</button>
										);
									})}

									{/* Empty slot indicator */}
									{hourItems.length === 0 && draggedItem && (
										<div className="h-8 rounded-lg border-2 border-dashed border-blue-500/30 flex items-center justify-center text-xs text-blue-400/70">
											Drop here
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-4 mt-3 px-2 text-xs text-gray-500">
				<span className="flex items-center gap-1.5">
					<div className="w-2 h-2 rounded-sm bg-purple-500/30 border border-purple-500/30" />
					Events
				</span>
				<span className="flex items-center gap-1.5">
					<div className="w-2 h-2 rounded-sm bg-blue-500/30 border border-blue-500/30" />
					Sessions
				</span>
				<span className="flex items-center gap-1.5">
					<div className="w-2 h-2 rounded-sm bg-gray-500/30 border border-gray-500/30" />
					Tasks
				</span>
				{items.some((i) => i.completed) && (
					<span className="flex items-center gap-1.5">
						<div className="w-2 h-2 rounded-sm bg-green-500/30 border border-green-500/30" />
						Done
					</span>
				)}
			</div>
		</div>
	);
};

export default M3TimelineView;
