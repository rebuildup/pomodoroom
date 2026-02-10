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

function StatusBadge({ status, compact }: StatusBadgeProps) {
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
}

// ─── Ready Item (plan/routine/defer → READY state) ───────────────────────────

interface ReadyItemProps {
	item: TaskStreamItemType;
	onAction: (taskId: string, action: StreamAction) => void;
	onClick?: () => void;
	compact?: boolean;
}

function ReadyItem({ item, onAction, onClick, compact }: ReadyItemProps) {
	const isRoutine = item.status === 'routine';
	const isDeferred = item.status === 'defer';
	const colors = TASK_STATUS_COLORS[item.status];
	const { name: iconName } = getTaskIcon(item.status);

	const handleStart = (e: React.MouseEvent) => {
		e.stopPropagation();
		onAction(item.id, 'start');
	};

	const handleDefer = (e: React.MouseEvent) => {
		e.stopPropagation();
		onAction(item.id, 'defer');
	};

	const handleReplan = (e: React.MouseEvent) => {
		e.stopPropagation();
		onAction(item.id, 'replan');
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
		>
			{/* Status icon */}
			<span className={`shrink-0 ${colors.text}`}>
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
				>
					@{item.projectId.replace(/^p-/, '')}
				</span>
			)}

			{/* Start button */}
			<button
				type="button"
				onClick={handleStart}
				className={`
					shrink-0 p-1.5 rounded-full
					text-[var(--md-ref-color-primary)]
					hover:bg-[var(--md-ref-color-primary-container)]
					hover:text-[var(--md-ref-color-on-primary-container)]
					transition-colors duration-150 ease-in-out
				`.trim()}
				title={TRANSITION_LABELS.READY.RUNNING.en}
			>
				<Icon name="play_arrow" size={compact ? 18 : 20} />
			</button>

			{/* Defer button (plan only, hover) */}
			{item.status === 'plan' && (
				<button
					type="button"
					onClick={handleDefer}
					className={`
						shrink-0 p-1.5 rounded-full
						text-[var(--md-ref-color-on-surface-variant)]
						hover:bg-[var(--md-ref-color-secondary-container)]
						hover:text-[var(--md-ref-color-on-secondary-container)]
						opacity-0 group-hover:opacity-100
						transition-all duration-150 ease-in-out
					`.trim()}
					title={TRANSITION_LABELS.READY.READY.en}
				>
					<Icon name="skip_next" size={compact ? 18 : 20} />
				</button>
			)}

			{/* Replan button (defer only, hover) */}
			{isDeferred && (
				<button
					type="button"
					onClick={handleReplan}
					className={`
						shrink-0 p-1.5 rounded-full
						text-[var(--md-ref-color-on-surface-variant)]
						hover:bg-[var(--md-ref-color-tertiary-container)]
						hover:text-[var(--md-ref-color-on-tertiary-container)]
						opacity-0 group-hover:opacity-100
						transition-all duration-150 ease-in-out
					`.trim()}
					title="Replan"
				>
					<Icon name="refresh" size={compact ? 18 : 20} />
				</button>
			)}
		</div>
	);
}

// ─── Log Item (completed tasks) ──────────────────────────────────────────────

interface LogItemProps {
	item: TaskStreamItemType;
	compact?: boolean;
}

function LogItem({ item, compact }: LogItemProps) {
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
		>
			{/* Completed icon */}
			<span className="shrink-0 text-[var(--md-ref-color-on-surface-variant)]">
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
				>
					⚡{item.interruptCount}
				</span>
			)}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export const TaskStreamItem: React.FC<TaskStreamItemProps> = ({
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
};

export default TaskStreamItem;
