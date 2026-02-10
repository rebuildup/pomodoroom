import { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import type { TimelineItem } from '../types';

interface TimelineViewProps {
	items: TimelineItem[];
	currentTime: Date;
	date?: Date;
	onItemClick?: (item: TimelineItem) => void;
	onItemMove?: (itemId: string, newStartTime: string, newEndTime: string) => void;
}

/**
 * Timeline view component displaying items chronologically
 * Flat design with clear visual hierarchy (SHIG principle)
 * Supports drag and drop for rescheduling items
 */
export function TimelineView({ items, currentTime, date = new Date(), onItemClick, onItemMove }: TimelineViewProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [draggedItem, setDraggedItem] = useState<TimelineItem | null>(null);

	// DnD sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // 8px movement required to start drag
			},
		})
	);

	// Handle drag start
	const handleDragStart = (event: DragStartEvent) => {
		const { active } = event;
		const item = items.find(i => i.id === active.id);
		if (item) {
			setActiveId(active.id as string);
			setDraggedItem(item);
		}
	};

	// Handle drag end
	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);
		setDraggedItem(null);

		if (!over) return;

		const draggedItemId = active.id as string;
		const dropZoneId = over.id as string;

		// Parse drop zone ID (format: "hour-{hour}-{minute}")
		if (dropZoneId.startsWith('hour-')) {
			const parts = dropZoneId.split('-');
			const hourStr = parts[2];
			const minuteStr = parts[3];
			if (!hourStr || !minuteStr) return;

			const newHour = parseInt(hourStr, 10);
			const newMinute = parseInt(minuteStr, 10);

			// Get the dragged item
			const item = items.find(i => i.id === draggedItemId);
			if (!item) return;

			// Calculate duration
			const startDate = new Date(item.startTime);
			const endDate = new Date(item.endTime);
			const duration = endDate.getTime() - startDate.getTime();

			// Create new start time
			const newStartDate = new Date(date);
			newStartDate.setHours(newHour, newMinute, 0, 0);

			// Create new end time
			const newEndDate = new Date(newStartDate.getTime() + duration);

			// Notify parent
			onItemMove?.(draggedItemId, newStartDate.toISOString(), newEndDate.toISOString());
		}
	};

	// Generate hours for the day
	const hours: Date[] = [];
	for (let i = 0; i < 24; i++) {
		const hour = new Date(date);
		hour.setHours(i, 0, 0, 0);
		hours.push(hour);
	}

	// Group items by hour
	const itemsByHour = new Map<number, TimelineItem[]>();
	hours.forEach(hour => itemsByHour.set(hour.getHours(), []));

	items.forEach(item => {
		const itemHour = new Date(item.startTime).getHours();
		const hourItems = itemsByHour.get(itemHour) ?? [];
		hourItems.push(item);
		itemsByHour.set(itemHour, hourItems);
	});

	// Format time as HH:mm
	const formatTime = (hour: number): string => {
		return `${hour.toString().padStart(2, '0')}:00`;
	};

	const isSameHour = (a: Date, b: Date): boolean => {
		return a.getHours() === b.getHours() &&
			a.getDate() === b.getDate() &&
			a.getMonth() === b.getMonth() &&
			a.getFullYear() === b.getFullYear();
	};

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<div className="h-full overflow-y-auto">
				<div className="flex">
					{/* Time labels column */}
					<div className="w-16 flex-shrink-0 border-r border-[var(--color-border)]">
						{hours.map(hour => (
							<div
								key={hour.getHours()}
								className="h-16 px-2 text-xs text-[var(--color-text-muted)] tabular-nums"
							>
								{formatTime(hour.getHours())}
							</div>
						))}
					</div>

					{/* Timeline content */}
					<div className="flex-1 min-w-0">
					{hours.map(hour => {
						const hourNum = hour.getHours();
						const hourItems = itemsByHour.get(hourNum) ?? [];
						const isCurrent = isSameHour(hour, currentTime);

						return (
							<div
								key={hourNum}
								className={`h-16 border-b border-[var(--color-border)] relative ${
									isCurrent ? 'bg-[var(--color-accent-primary)]/5' : ''
								}`}
							>
								{/* Current time indicator */}
								{isCurrent && (
									<div className="absolute left-0 right-0 top-0 h-px bg-[var(--color-accent-primary)] z-10" />
								)}

								{/* Items for this hour */}
								<div className="px-3 py-1 space-y-1">
									{hourItems.map(item => (
										<DraggableTimelineItem
											key={item.id}
											item={item}
											onClick={() => onItemClick?.(item)}
											isDragging={activeId === item.id}
										/>
									))}

									{/* Empty slot indicator - also a drop zone */}
									{hourItems.length === 0 && !isCurrent && (
										<DropZone
											hour={hourNum}
											minute={0}
											isActive={activeId !== null}
										/>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
			</div>

			{/* Drag overlay */}
			<DragOverlay>
				{draggedItem && (
					<div className="opacity-50 cursor-grabbing">
						<TimelineItemCard
							item={draggedItem}
							isDragging
						/>
					</div>
				)}
			</DragOverlay>
		</DndContext>
	);
}

interface DropZoneProps {
	hour: number;
	minute: number;
	isActive: boolean;
}

function DropZone({ hour, minute, isActive }: DropZoneProps) {
	const { setNodeRef } = useDroppable({
		id: `hour-${hour}-${minute}`,
	});

	return (
		<div
			ref={setNodeRef}
			className={`h-6 rounded-sm border border-dashed ${
				isActive
					? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
					: 'border-[var(--color-border)]'
			} flex items-center justify-center text-xs text-[var(--color-text-muted)] transition-colors`}
		>
			Available
		</div>
	);
}

interface DraggableTimelineItemProps {
	item: TimelineItem;
	onClick?: () => void;
	isDragging: boolean;
}

function DraggableTimelineItem({ item, onClick, isDragging }: DraggableTimelineItemProps) {
	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: item.id,
		disabled: item.source === 'google', // Don't allow dragging Google Calendar events
	});

	const style = transform ? {
		transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
	} : undefined;

	return (
		<div ref={setNodeRef} style={style} {...listeners} {...attributes}>
			<TimelineItemCard
				item={item}
				onClick={onClick}
				isDragging={isDragging}
			/>
		</div>
	);
}

interface TimelineItemCardProps {
	item: TimelineItem;
	onClick?: () => void;
	isDragging?: boolean;
}

function TimelineItemCard({ item, onClick, isDragging = false }: TimelineItemCardProps) {
	const getBorderColor = () => {
		if (item.completed) return 'border-[var(--color-status-active)]';
		if (item.source === 'google') return 'border-[var(--color-accent-primary)]';
		if (item.source === 'notion') return 'border-[var(--color-accent-secondary)]';
		if (item.source === 'linear') return 'border-purple-400';
		return 'border-[var(--color-border)]';
	};

	const getBgColor = () => {
		if (item.completed) return 'bg-[var(--color-status-active)]/10';
		return 'bg-[var(--color-surface)]';
	};

	return (
		<button
			onClick={onClick}
			className={`${getBgColor()} ${getBorderColor()} ${
				isDragging ? 'cursor-grabbing opacity-50' : 'hover:opacity-80'
			} border rounded-sm px-3 py-1.5 text-left transition-opacity w-full text-sm ${
				item.source !== 'google' ? 'cursor-grab' : 'cursor-default'
			}`}
		>
			<div className="flex items-center gap-2">
				<span className="font-medium text-[var(--color-text-primary)] truncate">
					{item.title}
				</span>
				{item.completed && (
					<span className="text-[var(--color-status-active)]">✓</span>
				)}
				{item.priority && item.priority > 70 && (
					<span className="text-[var(--color-accent-danger)] text-xs">!</span>
				)}
			</div>
			{item.description && (
				<div className="text-xs text-[var(--color-text-secondary)] truncate">
					{item.description}
				</div>
			)}
		</button>
	);
}
