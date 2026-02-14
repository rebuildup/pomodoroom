/**
 * Material 3 Timeline View
 *
 * Full schedule timeline view with day navigation.
 * Wraps Timeline component with day navigation controls.
 * Integrates with Google Calendar for event display.
 *
 * Reference: https://m3.material.io/components/navigation-drawer/overview
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Timeline } from '@/components/m3/Timeline';
import { Icon } from '@/components/m3/Icon';
import { TextField } from '@/components/m3/TextField';
import type { ScheduleBlock } from '@/types';
import { useCachedGoogleCalendar, getEventsForDate } from '@/hooks/useCachedGoogleCalendar';
import { mergeScheduleWithCalendar } from '@/utils/calendarUtils';
import { useScheduler } from '@/hooks/useScheduler';

export interface M3TimelineViewProps {
	/**
	 * Schedule blocks to display (task blocks only)
	 * If not provided, useScheduler will be used to generate schedule
	 */
	blocks?: ScheduleBlock[];

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
	 * Whether to show Google Calendar events
	 */
	showCalendarEvents?: boolean;

	/**
	 * Whether to use auto-scheduler for schedule generation
	 */
	useAutoScheduler?: boolean;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

/**
 * Helper to check if two dates are the same day
 */
const isSameDay = (d1: Date, d2: Date): boolean => {
	return (
		d1.getDate() === d2.getDate() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getFullYear() === d2.getFullYear()
	);
};

/**
 * Format date for display
 */
const formatDateDisplay = (date: Date): string => {
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	if (isSameDay(date, today)) return 'Today';
	if (isSameDay(date, yesterday)) return 'Yesterday';
	if (isSameDay(date, tomorrow)) return 'Tomorrow';

	return date.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
	});
};

/**
 * Format secondary date info
 */
const formatSecondaryDate = (date: Date): string => {
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
};

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
	blocks: propBlocks,
	initialDate,
	onBlockClick,
	onEmptySlotClick,
	onDateChange,
	showCurrentTimeIndicator = true,
	startHour = 6,
	endHour = 24,
	showCalendarEvents = true,
	useAutoScheduler = true,
	className = '',
}) => {
	const [currentDate, setCurrentDate] = useState<Date>(() => initialDate ?? new Date());
	const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

	// Scheduler integration
	const scheduler = useScheduler();

	// Google Calendar integration
	const calendar = useCachedGoogleCalendar();

	// Convert calendar events to ScheduleBlock format for scheduler
	const calendarBlocksForScheduler = useMemo<ScheduleBlock[]>(() => {
		if (!showCalendarEvents) return [];
		return calendar.events
			.map(event => {
				const startDateTime = event.start.dateTime ?? event.start.date;
				const endDateTime = event.end.dateTime ?? event.end.date;
				
				if (!startDateTime || !endDateTime) return null;
				
				const dateStr = currentDate.toISOString().slice(0, 10);
				if (!startDateTime.startsWith(dateStr)) return null;

				return {
					id: `calendar-${event.id}`,
					blockType: 'calendar' as const,
					startTime: startDateTime,
					endTime: endDateTime,
					locked: true,
					label: event.summary ?? '(No title)',
					lane: 2,
				} as ScheduleBlock;
			})
			.filter((block): block is ScheduleBlock => block !== null);
	}, [calendar.events, currentDate, showCalendarEvents]);

	// Get calendar events for display
	const calendarEvents = useMemo(() => {
		if (!showCalendarEvents) return [];
		return getEventsForDate(calendar.events, currentDate);
	}, [calendar.events, currentDate, showCalendarEvents]);

	// Auto-generate schedule when date changes (if auto-scheduler is enabled)
	useEffect(() => {
		if (!useAutoScheduler || propBlocks !== undefined) return;

		const dateIso = currentDate.toISOString().slice(0, 10);
		scheduler.generateSchedule(dateIso, calendarBlocksForScheduler);
	}, [currentDate, useAutoScheduler, propBlocks, scheduler, calendarBlocksForScheduler]);

	// Use provided blocks or scheduler blocks
	const taskBlocks = propBlocks ?? scheduler.blocks;

	// Merge task blocks with calendar events for display
	const allBlocks = useMemo(() => {
		if (!showCalendarEvents) return taskBlocks;
		return mergeScheduleWithCalendar(taskBlocks, calendarEvents);
	}, [taskBlocks, calendarEvents, showCalendarEvents]);

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

	// Check if date is today
	const isToday = useMemo(() => {
		const now = new Date();
		return (
			currentDate.getDate() === now.getDate() &&
			currentDate.getMonth() === now.getMonth() &&
			currentDate.getFullYear() === now.getFullYear()
		);
	}, [currentDate]);

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

				{/* Status indicator */}
				<div className="w-[136px] flex items-center justify-end gap-2">
					{scheduler.isLoading && (
						<div className="flex items-center gap-1 text-xs text-[var(--md-ref-color-on-surface-variant)]">
							<Icon name="autorenew" size={16} className="animate-spin" />
							<span>Generating...</span>
						</div>
					)}
					{scheduler.isMockMode && !scheduler.isLoading && (
						<div className="flex items-center gap-1 text-xs text-[var(--md-ref-color-tertiary)]" title="Using mock scheduler for development">
							<Icon name="science" size={16} />
							<span>Mock</span>
						</div>
					)}
					{scheduler.error && (
						<div className="flex items-center gap-1 text-xs text-[var(--md-ref-color-error)]" title={scheduler.error}>
							<Icon name="error" size={16} />
							<span className="truncate max-w-[100px]">Error</span>
						</div>
					)}
				</div>
			</header>

			{/* Main content: 2-column layout */}
			<div className="flex flex-1 overflow-hidden">
				{/* Left: Timeline (larger) */}
				<div className="flex-1 min-w-0">
					<Timeline
						blocks={allBlocks}
						date={currentDate}
						currentTime={currentTime}
						startHour={startHour}
						endHour={endHour}
						onBlockClick={onBlockClick}
						onEmptySlotClick={onEmptySlotClick}
						showCurrentTimeIndicator={showCurrentTimeIndicator}
					/>
				</div>

				{/* Right: Edit/Create panel (smaller) */}
				<div className="w-[320px] border-l border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-lowest)] overflow-y-auto">
					<div className="p-4 space-y-4">
						{/* Add new block section */}
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container)]">
							<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)] mb-3">
								<Icon name="add" size={20} className="mr-2" />
								新しい予定を追加
							</h3>

							{/* Quick add form */}
							<div className="space-y-3">
								<TextField
									label="タイトル"
									placeholder="予定名を入力..."
									variant="underlined"
									onChange={(value: string) => {
										// TODO: Implement quick add
										console.log('Add task:', value);
									}}
								/>

								<div className="grid grid-cols-2 gap-2">
									<div>
										<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
											開始
										</label>
										<input
											type="time"
											className="w-full px-2 py-1 text-sm bg-[var(--md-ref-color-surface-container-low)] border-b border-[var(--md-ref-color-outline-variant)] text-[var(--md-ref-color-on-surface)]"
											onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
												// TODO: Implement start time
												console.log('Start time:', e.target.value);
											}}
										/>
									</div>
									<div>
										<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
											終了
										</label>
										<input
											type="time"
											className="w-full px-2 py-1 text-sm bg-[var(--md-ref-color-surface-container-low)] border-b border-[var(--md-ref-color-outline-variant)] text-[var(--md-ref-color-on-surface)]"
											onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
												// TODO: Implement end time
												console.log('End time:', e.target.value);
											}}
										/>
									</div>
								</div>

								{/* Duration picker */}
								<div>
									<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
										所要時間
									</label>
									<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden">
										{[
											{ value: "15", label: "15分" },
											{ value: "25", label: "25分" },
											{ value: "45", label: "45分" },
											{ value: "60", label: "60分" },
										].map((option) => (
											<button
												key={option.value}
												type="button"
												onClick={() => {
													// TODO: Set duration
													console.log('Set duration:', option.value);
												}}
												className={`
													no-pill h-8 px-3 text-xs font-medium
													flex items-center justify-center
													transition-all duration-150
													${false
														? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
														: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
													}
												`}
											>
												{option.label}
											</button>
										))}
									</div>
								</div>

								{/* Type selector */}
								<div>
									<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
										種類
									</label>
									<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden">
										{[
											{ value: "task", label: "タスク" },
											{ value: "event", label: "予定" },
											{ value: "break", label: "休憩" },
										].map((option, index) => {
											const isFirst = index === 0;
											const isLast = index === 2;
											return (
												<button
													key={option.value}
													type="button"
													className={`
														no-pill relative h-8 px-3 text-xs font-medium
														flex items-center justify-center
														transition-all duration-150
														${isFirst ? 'rounded-l-full' : ''}
														${isLast ? 'rounded-r-full' : ''}
														${!isFirst ? 'border-l border-[var(--md-ref-color-outline-variant)]' : ''}
														${false
															? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
															: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
														}
													`}
												>
													{option.label}
												</button>
											);
										})}
									</div>
								</div>

								{/* Action button */}
								<button
									type="button"
									onClick={() => {
										// TODO: Implement block creation
										console.log('Create block');
									}}
									className="w-full h-10 px-4 rounded-full text-sm font-medium transition-colors"
									style={{
										backgroundColor: 'var(--md-ref-color-primary)',
										color: 'var(--md-ref-color-on-primary)',
									}}
								>
									追加
								</button>
							</div>
						</div>

						/* Stats summary */
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container)]">
							<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)] mb-3">
								<Icon name="analytics" size={20} className="mr-2" />
								今日のまとめ
							</h3>
							<div className="space-y-2">
								<div className="flex justify-between text-sm">
									<span className="text-[var(--md-ref-color-on-surface-variant)]">予定数</span>
									<span className="text-[var(--md-ref-color-on-surface)] font-medium">
										{allBlocks.filter(b => b.blockType === 'task').length}
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-[var(--md-ref-color-on-surface-variant)]">予定時間</span>
									<span className="text-[var(--md-ref-color-on-surface)] font-medium">
										{Math.round(allBlocks.reduce((acc, b) => {
											const start = new Date(b.startTime).getTime();
											const end = new Date(b.endTime).getTime();
											return acc + (end - start) / (1000 * 60);
										}, 0))}分
									</span>
								</div>
								<div className="flex justify-between text-sm">
									<span className="text-[var(--md-ref-color-on-surface-variant)]">空き時間</span>
									<span className="text-[var(--md-ref-color-on-surface)] font-medium">
										{Math.round(24 * 60 - allBlocks.reduce((acc, b) => {
											const start = new Date(b.startTime).getTime();
											const end = new Date(b.endTime).getTime();
											return acc + (end - start) / (1000 * 60);
										}, 0))}分
									</span>
								</div>
							</div>
						</div>

						{/* Quick filters */}
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container)]">
							<h3 className="text-sm font-medium text-[var(--md-ref-color-on-surface)] mb-3">
								<Icon name="filter_list" size={20} className="mr-2" />
								フィルター
							</h3>
							<div className="space-y-2">
								{[
									{ label: "全て", active: true },
									{ label: "タスクのみ", active: false },
									{ label: "予定のみ", active: false },
									{ label: "休憩", active: false },
								].map((filter, index) => (
									<button
										key={index}
										type="button"
										onClick={() => {
											// TODO: Implement filter
											console.log('Filter:', filter.label);
										}}
										className={`
											no-pill w-full px-3 py-2 text-left text-sm
											rounded-lg transition-colors
											${filter.active
												? 'bg-[var(--md-ref-color-primary-container)] text-[var(--md-ref-color-on-primary-container)]'
												: 'hover:bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface)]'
											}
										`}
									>
										{filter.label}
									</button>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default M3TimelineView;
