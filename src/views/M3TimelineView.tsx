/**
 * Material 3 Timeline View
 *
 * Full schedule timeline view with day navigation.
 * Wraps Timeline component with day navigation controls.
 *
 * Reference: https://m3.material.io/components/navigation-drawer/overview
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Timeline } from '@/components/m3/Timeline';
import { Icon } from '@/components/m3/Icon';
import type { ScheduleBlock } from '@/types';

export interface M3TimelineViewProps {
	/**
	 * Schedule blocks to display
	 */
	blocks: ScheduleBlock[];

	/**
	 * Initial date for the timeline
	 */
	initialDate?: Date;

	/**
	 * Block click handler
	 */
	onBlockClick?: (block: ScheduleBlock) => void;

	/**
	 * Empty slot click handler (for adding new blocks)
	 */
	onEmptySlotClick?: (time: Date) => void;

	/**
	 * Date change handler
	 */
	onDateChange?: (date: Date) => void;

	/**
	 * Whether to show the current time indicator
	 */
	showCurrentTimeIndicator?: boolean;

	/**
	 * Start hour (default 6)
	 */
	startHour?: number;

	/**
	 * End hour (default 24)
	 */
	endHour?: number;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

/**
 * M3 Timeline View
 *
 * @example
 * ```tsx
 * <M3TimelineView
 *   blocks={scheduleBlocks}
 *   onBlockClick={(block) => console.log(block)}
 *   onEmptySlotClick={(time) => console.log(time)}
 * />
 * ```
 */
export const M3TimelineView: React.FC<M3TimelineViewProps> = ({
	blocks,
	initialDate = new Date(),
	onBlockClick,
	onEmptySlotClick,
	onDateChange,
	showCurrentTimeIndicator = true,
	startHour = 6,
	endHour = 24,
	className = '',
}) => {
	const [currentDate, setCurrentDate] = useState<Date>(initialDate);
	const [currentTime, setCurrentTime] = useState<Date>(new Date());

	// Update current time every minute
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(new Date());
		}, 60000);

		return () => clearInterval(interval);
	}, []);

	// Navigate to previous day
	const goToPreviousDay = useCallback(() => {
		setCurrentDate((prev) => {
			const newDate = new Date(prev);
			newDate.setDate(newDate.getDate() - 1);
			return newDate;
		});
	}, []);

	// Navigate to next day
	const goToNextDay = useCallback(() => {
		setCurrentDate((prev) => {
			const newDate = new Date(prev);
			newDate.setDate(newDate.getDate() + 1);
			return newDate;
		});
	}, []);

	// Go to today
	const goToToday = useCallback(() => {
		setCurrentDate(new Date());
	}, []);

	// Notify parent of date change
	useEffect(() => {
		onDateChange?.(currentDate);
	}, [currentDate, onDateChange]);

	// Format date for display
	const formatDateDisplay = (date: Date): string => {
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const isToday =
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear();

		const isYesterday =
			date.getDate() === yesterday.getDate() &&
			date.getMonth() === yesterday.getMonth() &&
			date.getFullYear() === yesterday.getFullYear();

		const isTomorrow =
			date.getDate() === tomorrow.getDate() &&
			date.getMonth() === tomorrow.getMonth() &&
			date.getFullYear() === tomorrow.getFullYear();

		if (isToday) return 'Today';
		if (isYesterday) return 'Yesterday';
		if (isTomorrow) return 'Tomorrow';

		return date.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
		});
	};

	// Format secondary date info
	const formatSecondaryDate = (date: Date): string => {
		return date.toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
		});
	};

	// Check if date is today
	const isToday =
		currentDate.getDate() === new Date().getDate() &&
		currentDate.getMonth() === new Date().getMonth() &&
		currentDate.getFullYear() === new Date().getFullYear();

	return (
		<div
			className={`
				flex flex-col h-full
				bg-[var(--md-ref-color-surface)]
				${className}
			`.trim()}
		>
			{/* Header with day navigation */}
			<header
				className={`
					flex items-center justify-between
					px-4 py-3
					border-b border-[var(--md-ref-color-outline-variant)]
					bg-[var(--md-ref-color-surface)]
				`.trim()}
			>
				{/* Navigation buttons */}
				<div className="flex items-center gap-2">
					<button
						onClick={goToPreviousDay}
						className={`
							flex items-center justify-center
							w-10 h-10 rounded-full
							transition-all duration-150 ease-out
							bg-[var(--md-ref-color-surface-container-high)]
							hover:bg-[var(--md-ref-color-surface-container-highest)]
							text-[var(--md-ref-color-on-surface-variant)]
							hover:text-[var(--md-ref-color-on-surface)]
						`.trim()}
						aria-label="Previous day"
					>
						<Icon name="chevron_left" size={24} />
					</button>

					<button
						onClick={goToToday}
						className={`
							px-4 py-2 rounded-full
							transition-all duration-150 ease-out
							${isToday
								? 'bg-[var(--md-ref-color-primary-container)] text-[var(--md-ref-color-on-primary-container)]'
								: 'bg-[var(--md-ref-color-surface-container-high)] hover:bg-[var(--md-ref-color-surface-container-highest)] text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]'
							}
						`.trim()}
						aria-label="Go to today"
					>
						<span
							className="text-sm font-medium"
							style={{ font: 'var(--md-sys-typescale-label-large)' }}
						>
							Today
						</span>
					</button>

					<button
						onClick={goToNextDay}
						className={`
							flex items-center justify-center
							w-10 h-10 rounded-full
							transition-all duration-150 ease-out
							bg-[var(--md-ref-color-surface-container-high)]
							hover:bg-[var(--md-ref-color-surface-container-highest)]
							text-[var(--md-ref-color-on-surface-variant)]
							hover:text-[var(--md-ref-color-on-surface)]
						`.trim()}
						aria-label="Next day"
					>
						<Icon name="chevron_right" size={24} />
					</button>
				</div>

				{/* Date display */}
				<div className="text-center">
					<h2
						className="text-lg font-medium"
						style={{ font: 'var(--md-sys-typescale-title-medium)' }}
					>
						{formatDateDisplay(currentDate)}
					</h2>
					<p
						className="text-sm opacity-70"
						style={{ font: 'var(--md-sys-typescale-body-medium)' }}
					>
						{formatSecondaryDate(currentDate)}
					</p>
				</div>

				{/* Placeholder for balance */}
				<div className="w-[136px]" />
			</header>

			{/* Timeline */}
			<div className="flex-1 overflow-hidden">
				<Timeline
					blocks={blocks}
					date={currentDate}
					currentTime={currentTime}
					startHour={startHour}
					endHour={endHour}
					onBlockClick={onBlockClick}
					onEmptySlotClick={onEmptySlotClick}
					showCurrentTimeIndicator={showCurrentTimeIndicator}
				/>
			</div>
		</div>
	);
};

export default M3TimelineView;
