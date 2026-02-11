/**
 * Material 3 TaskStreamItem Component
 *
 * Individual task item for TaskStream with M3 styling.
 * Supports different states: READY, RUNNING, PAUSED, DONE.
 * Features:
 * - Timeline-style layout
 * - Task actions (start, complete, pause, resume, defer)
 * - Status indicators
 * - Hover actions
 *
 * Reference: https://m3.material.io/components/lists/overview
 */

import React from 'react';
import { Icon, type MSIconName } from './Icon';
import type { TaskStreamItem as TaskStreamItemType, StreamAction } from '@/types/taskstream';
import { TASK_STATUS_COLORS } from '@/types/taskstream';
import { TRANSITION_LABELS } from '@/types/task-state';

export interface TaskStreamItemProps {
	/**
	 * Task item data
	 */
	item: TaskStreamItemType;

	/**
	 * Action callback
	 */
	onAction: (taskId: string, action: StreamAction) => void;

	/**
	 * Click callback (for opening details)
	 */
	onClick?: () => void;

	/**
	 * Whether to show compact variant
	 */
	compact?: boolean;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
}

function formatTime(iso: string | undefined): string {
	if (!iso) return '';
	const date = new Date(iso);
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getTaskIcon(status: TaskStreamItemType['status']): { name: MSIconName; filled: boolean } {
	switch (status) {
		case 'plan':
		case 'routine':
		case 'defer':
			return { name: 'radio_button_unchecked', filled: false };
		case 'doing':
			return { name: 'play_arrow', filled: false };
		case 'log':
			return { name: 'check_circle', filled: true };
		case 'interrupted':
			return { name: 'pause', filled: false };
		default:
			return { name: 'circle', filled: false };
	}
}

// ─── Status Badge ───────────────────────────────────────────────────────────

interface StatusBadgeProps {
	status: TaskStreamItemType['status'];
	compact?: boolean;
}

const StatusBadge = React.memo(({ status, compact }: StatusBadgeProps) => {
	const colors = TASK_STATUS_COLORS[status];

	const labels: Record<TaskStreamItemType['status'], string> = {
		plan: 'READY',
		doing: 'RUNNING',
		log: 'DONE',
		interrupted: 'PAUSED',
		routine: 'RTN',
		defer: 'DEFER',
	};

	return (
		<span
			className={`
				inline-flex items-center justify-center
				font-medium tracking-wide
				${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}
				rounded
				${colors.bg} ${colors.text} border ${colors.border}
			`.trim()}
		>
			{labels[status]}
		</span>
	);
});
StatusBadge.displayName = "StatusBadge";

// ─── Ready Item (plan/routine/defer → READY state) ───────────────────────────

interface ReadyItemProps {
	item: TaskStreamItemType;
	onAction: (taskId: string, action: StreamAction) => void;
	onClick?: () => void;
	compact?: boolean;
}

const ReadyItem = React.memo(({ item, onAction, onClick, compact }: ReadyItemProps) => {
	const isRoutine = item.status === 'routine';
	const isDeferred = item.status === 'defer';
	const colors = TASK_STATUS_COLORS[item.status];
	const { name: iconName } = getTaskIcon(item.status);

	const handleStart = () => {
		onAction(item.id, 'start');
	};

	const handleDefer = () => {
		onAction(item.id, 'defer');
	};

	const handleReplan = () => {
		onAction(item.id, 'replan');
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onClick?.();
		}
	};

	const handleButtonKeyDown = (e: React.KeyboardEvent, action: () => void) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			action();
		}
	};

	return (
		<div
			className={`
				group flex items-center gap-3
				hover:bg-[var(--md-ref-color-surface-container-high)]
				transition-colors duration-150 ease-in-out
				cursor-pointer
				${compact ? 'px-3 py-2' : 'px-4 py-3'}
			`.trim()}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			role="button"
			tabIndex={0}
			aria-label={`${item.title}. Status: ${item.status}. Estimated: ~${formatMinutes(item.estimatedMinutes)}`}
		>
			{/* Status icon */}
			<span className={`shrink-0 ${colors.text}`} aria-hidden="true">
				<Icon name={iconName} size={20} />
			</span>

			{/* Status badge for routine/defer */}
			{(isRoutine || isDeferred) && (
				<StatusBadge status={item.status} compact={compact} />
			)}

			{/* Title */}
			<span
				className={`
					flex-1 truncate
					text-[var(--md-ref-color-on-surface)]
					${compact ? 'text-sm' : 'text-base'}
				`.trim()}
				style={{ font: compact ? 'var(--md-sys-typescale-body-medium)' : 'var(--md-sys-typescale-body-large)' }}
			>
				{item.title}
			</span>

			{/* Estimate */}
			{item.estimatedMinutes > 0 && (
				<span
					className={`
						shrink-0 font-mono tabular-nums
						text-[var(--md-ref-color-on-surface-variant)]
						${compact ? 'text-xs' : 'text-sm'}
					`.trim()}
					aria-label={`Estimated time: ${formatMinutes(item.estimatedMinutes)}`}
				>
					~{formatMinutes(item.estimatedMinutes)}
				</span>
			)}

			{/* Project tag (hover) */}
			{item.projectId && (
				<span
					className={`
						shrink-0 text-xs font-medium
						text-[var(--md-ref-color-on-surface-variant)]
						opacity-0 group-hover:opacity-100
						transition-opacity duration-150 ease-in-out
					`.trim()}
					aria-label={`Project: ${item.projectId.replace(/^p-/, '')}`}
				>
					@{item.projectId.replace(/^p-/, '')}
				</span>
			)}

			{/* Start button */}
			<button
				type="button"
				onClick={(e) => { e.stopPropagation(); handleStart(); }}
				onKeyDown={(e) => handleButtonKeyDown(e, handleStart)}
				className={`
					shrink-0 p-1.5 rounded-full
					text-[var(--md-ref-color-primary)]
					hover:bg-[var(--md-ref-color-primary-container)]
					hover:text-[var(--md-ref-color-on-primary-container)]
					transition-colors duration-150 ease-in-out
				`.trim()}
				title={TRANSITION_LABELS.READY.RUNNING.en}
				aria-label={`Start ${item.title}`}
			>
				<Icon name="play_arrow" size={compact ? 18 : 20} aria-hidden="true" />
			</button>

			{/* Defer button (plan only, hover) */}
			{item.status === 'plan' && (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); handleDefer(); }}
					onKeyDown={(e) => handleButtonKeyDown(e, handleDefer)}
					className={`
						shrink-0 p-1.5 rounded-full
						text-[var(--md-ref-color-on-surface-variant)]
						hover:bg-[var(--md-ref-color-secondary-container)]
						hover:text-[var(--md-ref-color-on-secondary-container)]
						opacity-0 group-hover:opacity-100
						transition-all duration-150 ease-in-out
					`.trim()}
					title={TRANSITION_LABELS.READY.READY.en}
					aria-label={`Defer ${item.title}`}
				>
					<Icon name="skip_next" size={compact ? 18 : 20} aria-hidden="true" />
				</button>
			)}

			{/* Replan button (defer only, hover) */}
			{isDeferred && (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); handleReplan(); }}
					onKeyDown={(e) => handleButtonKeyDown(e, handleReplan)}
					className={`
						shrink-0 p-1.5 rounded-full
						text-[var(--md-ref-color-on-surface-variant)]
						hover:bg-[var(--md-ref-color-tertiary-container)]
						hover:text-[var(--md-ref-color-on-tertiary-container)]
						opacity-0 group-hover:opacity-100
						transition-all duration-150 ease-in-out
					`.trim()}
					title="Replan"
					aria-label={`Replan ${item.title}`}
				>
					<Icon name="refresh" size={compact ? 18 : 20} aria-hidden="true" />
				</button>
			)}
		</div>
	);
}, (prevProps, nextProps) => {
	return (
		prevProps.item.id === nextProps.item.id &&
		prevProps.item.title === nextProps.item.title &&
		prevProps.item.status === nextProps.item.status &&
		prevProps.item.estimatedMinutes === nextProps.item.estimatedMinutes &&
		prevProps.item.projectId === nextProps.item.projectId &&
		prevProps.compact === nextProps.compact
	);
});
ReadyItem.displayName = "ReadyItem";

// ─── Log Item (completed tasks) ──────────────────────────────────────────────

interface LogItemProps {
	item: TaskStreamItemType;
	compact?: boolean;
}

const LogItem = React.memo(({ item, compact }: LogItemProps) => {
	const wasInterrupted = item.interruptCount > 0;
	const timeRange = item.startedAt && item.completedAt
		? `${formatTime(item.startedAt)}–${formatTime(item.completedAt)}`
		: '';

	return (
		<div
			className={`
				flex items-center gap-3
				opacity-60
				${compact ? 'px-3 py-2' : 'px-4 py-3'}
			`.trim()}
			role="listitem"
			aria-label={`${item.title} - Completed. Time: ${timeRange || 'N/A'}. Duration: ${formatMinutes(item.actualMinutes)}${wasInterrupted ? `. Interrupted ${item.interruptCount} times` : ''}`}
		>
			{/* Completed icon */}
			<span className="shrink-0 text-[var(--md-ref-color-on-surface-variant)]" aria-label="Completed">
				<Icon name="check_circle" size={20} filled />
			</span>

			{/* Title with strikethrough */}
			<span
				className={`
					flex-1 truncate line-through
					text-[var(--md-ref-color-on-surface-variant)]
					${compact ? 'text-sm' : 'text-base'}
				`.trim()}
				style={{ font: compact ? 'var(--md-sys-typescale-body-medium)' : 'var(--md-sys-typescale-body-large)' }}
			>
				{item.title}
			</span>

			{/* Time range */}
			{timeRange && (
				<span
					className={`
						shrink-0 font-mono tabular-nums
						text-[var(--md-ref-color-on-surface-variant)]
						${compact ? 'text-xs' : 'text-sm'}
					`.trim()}
					aria-label={`Time range: ${timeRange}`}
				>
					{timeRange}
				</span>
			)}

			{/* Actual time */}
			<span
				className={`
					shrink-0 font-mono tabular-nums
					text-[var(--md-ref-color-on-surface-variant)]
					${compact ? 'text-xs' : 'text-sm'}
				`.trim()}
				aria-label={`Actual duration: ${formatMinutes(item.actualMinutes)}`}
			>
				{formatMinutes(item.actualMinutes)}
			</span>

			{/* Interrupt indicator */}
			{wasInterrupted && (
				<span
					className={`
						shrink-0 text-xs font-medium
						text-[var(--md-ref-color-error)]
					`.trim()}
					aria-label={`Interrupted ${item.interruptCount} times`}
				>
					⚡{item.interruptCount}
				</span>
			)}
		</div>
	);
}, (prevProps, nextProps) => {
	return (
		prevProps.item.id === nextProps.item.id &&
		prevProps.item.title === nextProps.item.title &&
		prevProps.item.actualMinutes === nextProps.item.actualMinutes &&
		prevProps.item.interruptCount === nextProps.item.interruptCount &&
		prevProps.item.startedAt === nextProps.item.startedAt &&
		prevProps.item.completedAt === nextProps.item.completedAt &&
		prevProps.compact === nextProps.compact
	);
});
LogItem.displayName = "LogItem";

// ─── Main Component ─────────────────────────────────────────────────────────

export const TaskStreamItem: React.FC<TaskStreamItemProps> = React.memo(({
	item,
	onAction,
	onClick,
	compact = false,
	className = '',
}) => {
	// Render based on status
	if (item.status === 'log') {
		return <LogItem item={item} compact={compact} />;
	}

	return (
		<div className={className}>
			<ReadyItem
				item={item}
				onAction={onAction}
				onClick={onClick}
				compact={compact}
			/>
		</div>
	);
}, (prevProps, nextProps) => {
	// Only re-render if key props change
	return (
		prevProps.item.id === nextProps.item.id &&
		prevProps.item.status === nextProps.item.status &&
		prevProps.compact === nextProps.compact &&
		prevProps.className === nextProps.className
	);
});

TaskStreamItem.displayName = "TaskStreamItem";

export default TaskStreamItem;
