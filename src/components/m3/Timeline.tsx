/**
 * Material 3 Timeline Component
 *
 * Horizontal timeline with day navigation and time blocks.
 * Displays schedule for a single day with current time indicator.
 *
 * Reference: https://m3.material.io/components/lists/overview
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { TimeBlock } from './TimeBlock';
import type { ScheduleBlock } from '@/types';

export interface TimelineProps {
	/**
	 * Schedule blocks to display
	 */
	blocks: ScheduleBlock[];

	/**
	 * Current date for the timeline
	 */
	date?: Date;

	/**
	 * Current time (for indicator)
	 */
	currentTime?: Date;

	/**
	 * Start hour (default 0)
	 */
	startHour?: number;

	/**
	 * End hour (default 24)
	 */
	endHour?: number;

	/**
	 * Block click handler
	 */
	onBlockClick?: (block: ScheduleBlock) => void;

	/**
	 * Empty slot click handler (for adding new blocks)
	 */
	onEmptySlotClick?: (time: Date) => void;

	/**
	 * Whether to show the current time indicator
	 */
	showCurrentTimeIndicator?: boolean;

	/**
	 * Height of each hour slot (default 64px)
	 */
	hourHeight?: number;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

/**
 * Timeline Component
 *
 * @example
 * ```tsx
 * <Timeline
 *   blocks={scheduleBlocks}
 *   date={new Date()}
 *   currentTime={new Date()}
 *   onBlockClick={(block) => console.log(block)}
 *   onEmptySlotClick={(time) => console.log(time)}
 * />
 * ```
 */
export const Timeline: React.FC<TimelineProps> = ({
	blocks,
	date = new Date(),
	currentTime = new Date(),
	startHour = 0,
	endHour = 24,
	onBlockClick,
	onEmptySlotClick,
	showCurrentTimeIndicator = true,
	hourHeight = 64,
	className = '',
}) => {
	const [hoveredHour, setHoveredHour] = useState<number | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Generate hours for the day
	const hours = useMemo(() => {
		const result: Date[] = [];
		for (let i = startHour; i < endHour; i++) {
			const hour = new Date(date);
			hour.setHours(i, 0, 0, 0);
			result.push(hour);
		}
		return result;
	}, [date, startHour, endHour]);

	// Group blocks by hour and calculate positions
	const blockPositions = useMemo(() => {
		const positions: Map<
			string,
			{ block: ScheduleBlock; top: number; height: number; lane: number }[]
		> = new Map();

		// Initialize empty array for each hour
		for (let i = startHour; i < endHour; i++) {
			positions.set(`hour-${i}`, []);
		}

		blocks.forEach((block) => {
			const startDate = new Date(block.startTime);
			const endDate = new Date(block.endTime);

			// Check if block is on the same day
			if (
				startDate.getDate() !== date.getDate() ||
				startDate.getMonth() !== date.getMonth() ||
				startDate.getFullYear() !== date.getFullYear()
			) {
				return;
			}

			const startHourNum = startDate.getHours();
			const startMinute = startDate.getMinutes();
			const endHourNum = endDate.getHours();

			// Calculate top position (pixels from top of timeline)
			const top =
				(startHourNum - startHour) * hourHeight +
				(startMinute / 60) * hourHeight;

			// Calculate height
			const duration = endDate.getTime() - startDate.getTime();
			const height = (duration / (1000 * 60 * 60)) * hourHeight;

			// Find available lane (simple algorithm: assign to first available)
			const lane = block.lane ?? 0;

			// Store position for each hour the block spans
			for (let h = startHourNum; h <= endHourNum; h++) {
				if (h < startHour || h >= endHour) continue;

				const hourKey = `hour-${h}`;
				const hourPositions = positions.get(hourKey) ?? [];
				hourPositions.push({ block, top, height, lane });
				positions.set(hourKey, hourPositions);
			}
		});

		return positions;
	}, [blocks, date, startHour, endHour, hourHeight]);

	// Find current time position
	const currentTimePosition = useMemo(() => {
		if (!showCurrentTimeIndicator) return null;

		const now = currentTime;
		if (
			now.getDate() !== date.getDate() ||
			now.getMonth() !== date.getMonth() ||
			now.getFullYear() !== date.getFullYear()
		) {
			return null;
		}

		const hour = now.getHours();
		const minute = now.getMinutes();

		if (hour < startHour || hour >= endHour) return null;

		const top = (hour - startHour) * hourHeight + (minute / 60) * hourHeight;
		return top;
	}, [currentTime, date, startHour, endHour, hourHeight, showCurrentTimeIndicator]);

	// Auto-scroll to current time on mount
	useEffect(() => {
		if (currentTimePosition !== null && scrollRef.current) {
			const scrollTop = currentTimePosition - scrollRef.current.clientHeight / 2;
			scrollRef.current.scrollTo({
				top: Math.max(0, scrollTop),
				behavior: 'smooth',
			});
		}
	}, [currentTimePosition]);

	// Format time as HH:mm
	const formatTime = (hour: number): string => {
		return `${hour.toString().padStart(2, '0')}:00`;
	};

	// Handle empty slot click
	const handleEmptySlotClick = useCallback(
		(hour: number) => {
			if (!onEmptySlotClick) return;

			const slotTime = new Date(date);
			slotTime.setHours(hour, 0, 0, 0);
			onEmptySlotClick(slotTime);
		},
		[date, onEmptySlotClick]
	);

	// Check if a block is currently active
	const isBlockActive = useCallback(
		(block: ScheduleBlock): boolean => {
			const now = currentTime;
			const start = new Date(block.startTime);
			const end = new Date(block.endTime);
			return now >= start && now < end;
		},
		[currentTime]
	);

	return (
		<div
			className={`
				flex flex-col overflow-hidden
				bg-[var(--md-ref-color-surface)]
				${className}
			`.trim()}
		>
			{/* Timeline content */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto"
				style={{ maxHeight: 'calc(100vh - 200px)' }}
			>
				<div className="flex">
					{/* Time labels column */}
					<div
						className="flex-shrink-0 border-r border-[var(--md-ref-color-outline-variant)]"
						style={{ width: '64px' }}
					>
						{hours.map((hour) => (
							<div
								key={hour.getHours()}
								className="relative"
								style={{ height: `${hourHeight}px` }}
							>
								<span
									className="absolute top-0 right-2 text-xs tabular-nums"
									style={{
										color: 'var(--md-ref-color-on-surface-variant)',
									}}
								>
									{formatTime(hour.getHours())}
								</span>
							</div>
						))}
					</div>

					{/* Timeline grid */}
					<div className="flex-1 relative">
						{hours.map((hour) => {
							const hourNum = hour.getHours();
							const hourKey = `hour-${hourNum}`;
							const hourBlocks = blockPositions.get(hourKey) ?? [];
							const isCurrentHour =
								currentTime.getHours() === hourNum &&
								currentTime.getDate() === date.getDate() &&
								currentTime.getMonth() === date.getMonth() &&
								currentTime.getFullYear() === date.getFullYear();

							return (
								<div
									key={hourNum}
									className={`
										relative border-b border-[var(--md-ref-color-outline-variant)]
										transition-colors duration-150
									`.trim()}
									style={{ height: `${hourHeight}px` }}
									onMouseEnter={() => setHoveredHour(hourNum)}
									onMouseLeave={() => setHoveredHour(null)}
								>
									{/* Current hour highlight */}
									{isCurrentHour && (
										<div
											className="absolute inset-0 pointer-events-none"
											style={{
												backgroundColor:
													'var(--md-ref-color-primary-container)',
												opacity: 0.1,
											}}
										/>
									)}

									{/* Empty slot click area */}
									{onEmptySlotClick && hourBlocks.length === 0 && (
										<button
											onClick={() => handleEmptySlotClick(hourNum)}
											className={`
												absolute inset-0 w-full h-full
												transition-colors duration-150
												${hoveredHour === hourNum ? 'bg-[var(--md-ref-color-surface-container-high)]' : ''}
											`.trim()}
											aria-label={`Add task at ${formatTime(hourNum)}`}
										>
											<span
												className={`
													absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
													opacity-0 transition-opacity duration-150
													${hoveredHour === hourNum ? 'opacity-40' : ''}
												`.trim()}
												style={{
													color:
														'var(--md-ref-color-on-surface-variant)',
												}}
											>
												<Icon name="add" size={20} />
											</span>
										</button>
									)}

									{/* Time blocks for this hour */}
									{hourBlocks.map(({ block, top, height, lane }, index) => (
										<div
											key={`${block.id}-${index}`}
											className="absolute px-1"
											style={{
												top: `${top % hourHeight}px`,
												height: `${Math.min(height, hourHeight * 24 - top)}px`,
												left: `${lane * 8}px`,
												width: `calc(100% - ${lane * 8 + 8}px)`,
											}}
										>
											<TimeBlock
												block={block}
												onClick={() => onBlockClick?.(block)}
												isActive={isBlockActive(block)}
												style={{ width: '100%', height: '100%' }}
											/>
										</div>
									))}
								</div>
							);
						})}

						{/* Current time indicator */}
						{currentTimePosition !== null && (
							<div
								className="absolute left-0 right-0 z-10 pointer-events-none"
								style={{ top: `${currentTimePosition}px` }}
							>
								<div
									className="h-0.5 w-full"
									style={{
										backgroundColor:
											'var(--md-ref-color-primary)',
									}}
								/>
								<div
									className="absolute left-0 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
									style={{
										backgroundColor:
											'var(--md-ref-color-primary)',
									}}
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default Timeline;
