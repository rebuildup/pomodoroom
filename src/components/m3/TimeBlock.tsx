/**
 * Material 3 Time Block Component
 *
 * Individual time block for schedule timeline.
 * Displays task/event information with M3 styling.
 * Supports drag-to-reschedule for non-locked blocks.
 *
 * Reference: https://m3.material.io/components/cards/overview
 */

import React from 'react';
import { Icon, type MSIconName } from './Icon';
import type { ScheduleBlock } from '@/types';

/**
 * Time change event for drag operations.
 */
export interface TimeBlockChangeEvent {
	/** Block ID */
	blockId: string;
	/** New start time (ISO string) */
	newStartTime: string;
	/** New end time (ISO string) */
	newEndTime: string;
}

export interface TimeBlockProps {
	/**
	 * Schedule block data
	 */
	block: ScheduleBlock;

	/**
	 * Block title (defaults to block.label)
	 */
	title?: string;

	/**
	 * Block subtitle/description
	 */
	subtitle?: string;

	/**
	 * Click handler
	 */
	onClick?: () => void;

	/**
	 * Whether block is currently active
	 */
	isActive?: boolean;

	/**
	 * Whether block is completed
	 */
	isCompleted?: boolean;

	/**
	 * Whether block is locked (fixed event)
	 */
	isLocked?: boolean;

	/**
	 * Icon to display
	 */
	icon?: MSIconName;

	/**
	 * Background color (overrides default)
	 */
	backgroundColor?: string;

	/**
	 * Text color (overrides default)
	 */
	textColor?: string;

	/**
	 * Whether block is draggable (for non-calendar blocks)
	 */
	isDraggable?: boolean;

	/**
	 * Drag handle callback
	 */
	onDragStart?: (e: React.MouseEvent) => void;

	/**
	 * Additional CSS class
	 */
	className?: string;

	/**
	 * Inline style for custom positioning (width, left)
	 */
	style?: React.CSSProperties;
}

/**
 * Time Block for Timeline
 *
 * @example
 * ```tsx
 * <TimeBlock
 *   block={{ id: '1', blockType: 'focus', startTime: '...', endTime: '...', locked: false }}
 *   title="Focus Session"
 *   subtitle="Project A"
 *   icon="timer"
 *   onClick={() => console.log('clicked')}
 * />
 * ```
 */
export const TimeBlock: React.FC<TimeBlockProps> = ({
	block,
	title,
	subtitle,
	onClick,
	isActive = false,
	isCompleted = false,
	isLocked,
	icon,
	backgroundColor,
	textColor,
	isDraggable,
	onDragStart,
	className = '',
	style,
}) => {
	// Compute values that can't be safely reordered in default params
	const effectiveIsLocked = isLocked ?? block.locked;
	const effectiveIsDraggable = isDraggable ?? (!effectiveIsLocked && block.blockType !== 'calendar');

	// Get default styling based on block type
	const getDefaultStyles = () => {
		if (backgroundColor || textColor) {
			return { backgroundColor, textColor };
		}

		switch (block.blockType) {
			case 'focus':
				return {
					backgroundColor: 'var(--md-ref-color-primary-container)',
					textColor: 'var(--md-ref-color-on-primary-container)',
				};
			case 'break':
				return {
					backgroundColor: 'var(--md-ref-color-secondary-container)',
					textColor: 'var(--md-ref-color-on-secondary-container)',
				};
			case 'routine':
				return {
					backgroundColor: 'var(--md-ref-color-tertiary-container)',
					textColor: 'var(--md-ref-color-on-tertiary-container)',
				};
			case 'calendar':
				return {
					backgroundColor: 'var(--md-ref-color-surface-container-high)',
					textColor: 'var(--md-ref-color-on-surface)',
				};
			default:
				return {
					backgroundColor: 'var(--md-ref-color-surface-container)',
					textColor: 'var(--md-ref-color-on-surface)',
				};
		}
	};

	const styles = getDefaultStyles();

	// Get default icon based on block type
	const getDefaultIcon = (): MSIconName => {
		if (icon) return icon;

		switch (block.blockType) {
			case 'focus':
				return 'timer';
			case 'break':
				return 'free_breakfast';
			case 'routine':
				return 'schedule';
			case 'calendar':
				return 'calendar_month';
			default:
				return 'schedule';
		}
	};

	const blockIcon = getDefaultIcon();
	const displayTitle = title ?? block.label ?? '';
	const displaySubtitle = subtitle;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if ((e.key === 'Enter' || e.key === ' ') && onClick) {
			e.preventDefault();
			onClick();
		}
	};

	return (
		<div
			className={`
				relative flex items-center gap-2 px-3 py-2 rounded-lg
				transition-all duration-150 ease-out
				${effectiveIsLocked && !onClick ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02] hover:shadow-md'}
				${isActive ? 'ring-2 ring-[var(--md-ref-color-primary)]' : ''}
				${isCompleted ? 'opacity-60' : ''}
				${className}
			`.trim()}
			style={{
				backgroundColor: styles.backgroundColor,
				color: styles.textColor,
				...style,
			}}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			role="button"
			tabIndex={onClick ? 0 : -1}
			aria-label={`${displayTitle} ${formatTimeRange(block.startTime, block.endTime)}${isCompleted ? ', completed' : ''}${effectiveIsLocked ? ', locked' : ''}`}
		>
			{/* Icon (omit for calendar blocks to keep it minimal) */}
			{block.blockType !== 'calendar' && (
				<span className="flex-shrink-0" aria-hidden="true">
					<Icon name={blockIcon} size={18} />
				</span>
			)}

			{/* Content */}
			<div className="flex-1 min-w-0 text-left">
				{displayTitle && (
					<span className="block text-sm font-medium truncate">
						{displayTitle}
					</span>
				)}
				{displaySubtitle && (
					<span className="block text-xs opacity-80 truncate">
						{displaySubtitle}
					</span>
				)}
			</div>

			{/* Drag handle for non-locked blocks */}
			{effectiveIsDraggable && (
				<span
					className="flex-shrink-0 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100 p-1"
					onMouseDown={onDragStart}
					aria-label="Drag to reschedule"
					tabIndex={0}
					role="button"
				>
					<Icon name="drag_indicator" size={18} aria-hidden="true" />
				</span>
			)}

			{/* Lock indicator (omit for calendar blocks) */}
			{block.blockType !== 'calendar' && effectiveIsLocked && !effectiveIsDraggable && (
				<span className="flex-shrink-0 opacity-60" aria-label="Locked" role="img">
					<Icon name="lock" size={14} />
				</span>
			)}

			{/* Completed indicator */}
			{isCompleted && (
				<span className="flex-shrink-0" aria-label="Completed" role="img">
					<Icon name="check_circle" size={18} filled />
				</span>
			)}
		</div>
	);
};

/**
 * Format time range for accessibility
 */
function formatTimeRange(startTime: string, endTime: string): string {
	const start = new Date(startTime);
	const end = new Date(endTime);

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
		});
	};

	return `${formatTime(start)} to ${formatTime(end)}`;
}

export default TimeBlock;
