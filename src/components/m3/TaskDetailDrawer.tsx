/**
 * Material 3 TaskDetailDrawer Component
 *
 * Slide-out drawer for viewing task details with M3 styling.
 * Features:
 * - Slide-in animation from right (Modal/Bottom Sheet pattern)
 * - Close on backdrop click, ESC key, or close button
 * - Mobile responsive (full screen on mobile, fixed width on desktop)
 * - Read-only view with edit button to open TaskDialog
 * - Displays: title, description, tags, project, progress, timestamps, state
 *
 * Reference: https://m3.material.io/components/bottom-sheets/overview
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon, type MSIconName } from './Icon';
import type { Project } from '@/types';
import type { Task as TaskType } from '@/types/schedule';
import type { TaskStreamItem as TaskStreamItemType } from '@/types/taskstream';
import { TASK_STATUS_COLORS } from '@/types/taskstream';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TaskDetailItem = TaskType | TaskStreamItemType;

export interface TaskDetailDrawerProps {
	/**
	 * Whether the drawer is open
	 */
	isOpen: boolean;

	/**
	 * Close callback
	 */
	onClose: () => void;

	/**
	 * Task to display (Task or TaskStreamItem)
	 */
	task?: TaskDetailItem | null;

	/**
	 * Projects for lookup
	 */
	projects?: Project[];

	/**
	 * Edit callback (opens edit dialog)
	 */
	onEdit?: () => void;

	/**
	 * Additional CSS class
	 */
	className?: string;

	/**
	 * Drawer width (desktop only)
	 */
	width?: string | number;
}

// ─── Helper Types ─────────────────────────────────────────────────────────────

function isTaskStreamItem(item: TaskDetailItem): item is TaskStreamItemType {
	return 'status' in item && 'state' in item;
}

function isTaskType(item: TaskDetailItem): item is TaskType {
	return 'completedPomodoros' in item;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getTaskStatusInfo(item: TaskDetailItem): { icon: MSIconName; label: string; color: string } {
	if (isTaskStreamItem(item)) {
		const colors = TASK_STATUS_COLORS[item.status];
		switch (item.status) {
			case 'plan':
				return { icon: 'radio_button_unchecked', label: 'READY', color: colors.text };
			case 'doing':
				return { icon: 'radio_button_checked', label: 'RUNNING', color: colors.text };
			case 'log':
				return { icon: 'check_circle', label: 'DONE', color: colors.text };
			case 'interrupted':
				return { icon: 'pause', label: 'PAUSED', color: colors.text };
			case 'routine':
				return { icon: 'update', label: 'ROUTINE', color: colors.text };
			case 'defer':
				return { icon: 'skip_next', label: 'DEFERRED', color: colors.text };
			default:
				return { icon: 'circle', label: 'UNKNOWN', color: colors.text };
		}
	}

	// Task type
	if (item.completed) {
		return { icon: 'check_circle', label: 'Completed', color: 'text-[var(--md-ref-color-primary)]' };
	}
	if (item.completedPomodoros > 0) {
		return { icon: 'radio_button_checked', label: 'In Progress', color: 'text-[var(--md-ref-color-primary)]' };
	}
	return { icon: 'circle', label: 'Not Started', color: 'text-[var(--md-ref-color-on-surface-variant)]' };
}

// ─── Info Item Component ─────────────────────────────────────────────────────────

interface InfoItemProps {
	icon: MSIconName;
	label: string;
	value: React.ReactNode;
	className?: string;
}

function InfoItem({ icon, label, value, className = '' }: InfoItemProps) {
	return (
		<div className={`flex items-start gap-3 ${className}`.trim()}>
			<div
				className={`
					shrink-0 w-5 h-5 flex items-center justify-center
					text-[var(--md-ref-color-on-surface-variant)]
				`.trim()}
			>
				<Icon name={icon} size={18} />
			</div>
			<div className="flex-1 min-w-0">
				<div
					className={`
						text-xs font-medium tracking-wide
						text-[var(--md-ref-color-on-surface-variant)]
					`.trim()}
					style={{ font: 'var(--md-sys-typescale-label-small)' }}
				>
					{label}
				</div>
				<div
					className={`
						text-sm
						text-[var(--md-ref-color-on-surface)]
						break-words
					`.trim()}
					style={{ font: 'var(--md-sys-typescale-body-medium)' }}
				>
					{value}
				</div>
			</div>
		</div>
	);
}

// ─── History Entry Component ────────────────────────────────────────────────────

interface HistoryEntryProps {
	timestamp: string;
	action: string;
	className?: string;
}

function HistoryEntry({ timestamp, action, className = '' }: HistoryEntryProps) {
	return (
		<div className={`flex items-start gap-3 ${className}`.trim()}>
			<div
				className={`
					shrink-0 w-1.5 h-1.5 rounded-full mt-1.5
					bg-[var(--md-ref-color-primary)]
				`.trim()}
			/>
			<span
				className={`
					shrink-0 text-xs font-mono tabular-nums
					text-[var(--md-ref-color-on-surface-variant)]
				`.trim()}
			>
				{formatDate(timestamp)}
			</span>
			<span
				className={`
					flex-1 text-sm
					text-[var(--md-ref-color-on-surface)]
				`.trim()}
				style={{ font: 'var(--md-sys-typescale-body-small)' }}
			>
				{action}
			</span>
		</div>
	);
}

// ─── Status Badge Component ─────────────────────────────────────────────────────

interface StatusBadgeProps {
	status: string;
	color: string;
}

function StatusBadge({ status, color }: StatusBadgeProps) {
	return (
		<span
			className={`
				inline-flex items-center px-2 py-1 rounded-full
				text-xs font-medium tracking-wide
				${color}
				bg-[var(--md-ref-color-secondary-container)]
			`.trim()}
			style={{ font: 'var(--md-sys-typescale-label-small)' }}
		>
			{status}
		</span>
	);
}

// ─── Tag Chip Component ────────────────────────────────────────────────────────

interface TagChipProps {
	tag: string;
}

function TagChip({ tag }: TagChipProps) {
	return (
		<span
			className={`
				inline-flex items-center gap-1
				px-2 py-1 rounded-full
				text-xs font-medium
				bg-[var(--md-ref-color-secondary-container)]
				text-[var(--md-ref-color-on-secondary-container)]
			`.trim()}
			style={{ font: 'var(--md-sys-typescale-label-small)' }}
		>
			<span className="leading-none">{tag}</span>
		</span>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
	isOpen,
	onClose,
	task,
	projects = [],
	onEdit,
	className = '',
	width = 440,
}) => {
	const [isMobile, setIsMobile] = useState(false);
	const drawerRef = useRef<HTMLDivElement>(null);

	// Detect mobile viewport
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 640);
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	// Keyboard shortcuts (ESC to close)
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	// Prevent body scroll when drawer is open
	useEffect(() => {
		if (!isOpen) return;

		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = '';
		};
	}, [isOpen]);

	// Focus trap
	useEffect(() => {
		if (!isOpen || !drawerRef.current) return;

		const drawer = drawerRef.current;
		const focusableElements = drawer.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		const handleTabKey = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return;

			if (e.shiftKey) {
				if (document.activeElement === firstElement) {
					e.preventDefault();
					lastElement?.focus();
				}
			} else {
				if (document.activeElement === lastElement) {
					e.preventDefault();
					firstElement?.focus();
				}
			}
		};

		firstElement?.focus();
		drawer.addEventListener('keydown', handleTabKey);
		return () => drawer.removeEventListener('keydown', handleTabKey);
	}, [isOpen]);

	// Handle backdrop click
	const handleBackdropClick = useCallback((e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}, [onClose]);

	if (!isOpen || !task) {
		return null;
	}

	// Get task status info
	const statusInfo = getTaskStatusInfo(task);

	// Get project name
	const projectName = task.projectId
		? projects.find((p) => p.id === task.projectId)?.name
		: null;

	// Generate history entries
	const historyEntries: Array<{ timestamp: string; action: string }> = [];

	if (task.createdAt) {
		historyEntries.push({
			timestamp: task.createdAt,
			action: 'Task created',
		});
	}

	if (isTaskStreamItem(task)) {
		if (task.startedAt) {
			historyEntries.push({
				timestamp: task.startedAt,
				action: 'Started working',
			});
		}
		if (task.completedAt) {
			historyEntries.push({
				timestamp: task.completedAt,
				action: 'Completed',
			});
		}
	}

	// Sort by timestamp (newest first)
	historyEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

	// Progress info
	const progressInfo = isTaskType(task)
		? `${task.completedPomodoros} / ${task.estimatedPomodoros} pomodoros`
		: isTaskStreamItem(task)
			? `Estimated: ${formatMinutes(task.estimatedMinutes)}`
			: null;

	const actualTime = isTaskStreamItem(task) && task.actualMinutes > 0
		? `Actual: ${formatMinutes(task.actualMinutes)}`
		: null;

	// Tags
	const tags = isTaskStreamItem(task) ? task.tags : (isTaskType(task) ? task.tags : []);

	return (
		<>
			{/* Backdrop */}
			<div
				className={`
					fixed inset-0 z-[100]
					bg-[var(--md-sys-color-scrim)]
					transition-opacity duration-300 ease-in-out
					${isOpen ? 'opacity-60' : 'opacity-0 pointer-events-none'}
				`.trim()}
				onClick={handleBackdropClick}
				aria-hidden="true"
			/>

			{/* Drawer */}
			<div
				ref={drawerRef}
				className={`
					fixed z-[101] top-0 bottom-0 right-0
					${isMobile ? 'w-full' : ''}
					shadow-[var(--md-sys-elevation-level-3)]
					transition-transform duration-300 ease-out
					${isOpen ? 'translate-x-0' : 'translate-x-full'}
					bg-[var(--md-ref-color-surface-container)]
					${className}
				`.trim()}
				style={!isMobile ? { width: typeof width === 'number' ? `${width}px` : width } : undefined}
				role="dialog"
				aria-modal="true"
				aria-labelledby="task-detail-title"
			>
				<div className="flex flex-col h-full">
					{/* Header */}
					<div
						className={`
							flex items-center justify-between
							px-6 py-4
							border-b border-[var(--md-ref-color-outline-variant)]
							shrink-0
						`.trim()}
					>
						<div className="flex items-center gap-3 flex-1 min-w-0">
							<Icon name={statusInfo.icon} size={20} className={statusInfo.color} />
							<StatusBadge status={statusInfo.label} color={statusInfo.color} />
						</div>
						<div className="flex items-center gap-1">
							{onEdit && (
								<button
									type="button"
									onClick={onEdit}
									className={`
										p-2 rounded-full
										text-[var(--md-ref-color-on-surface-variant)]
										hover:bg-[var(--md-ref-color-surface-container-high)]
										hover:text-[var(--md-ref-color-on-surface)]
										transition-colors duration-150 ease-in-out
									`.trim()}
									aria-label="Edit task"
								>
									<Icon name="edit" size={20} />
								</button>
							)}
							<button
								type="button"
								onClick={onClose}
								className={`
									p-2 rounded-full
									text-[var(--md-ref-color-on-surface-variant)]
									hover:bg-[var(--md-ref-color-surface-container-high)]
									hover:text-[var(--md-ref-color-on-surface)]
									transition-colors duration-150 ease-in-out
								`.trim()}
								aria-label="Close"
							>
								<Icon name="close" size={20} />
							</button>
						</div>
					</div>

					{/* Content */}
					<div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
						{/* Title */}
						<div>
							<h2
								id="task-detail-title"
								className={`
									text-xl font-medium
									text-[var(--md-ref-color-on-surface)]
								`.trim()}
								style={{ font: 'var(--md-sys-typescale-headline-small)' }}
							>
								{task.title}
							</h2>
						</div>

						{/* Description / Markdown */}
						{isTaskType(task) && task.description && (
							<div>
								<h3
									className={`
										text-sm font-medium tracking-wide mb-2
										text-[var(--md-ref-color-on-surface-variant)]
									`.trim()}
									style={{ font: 'var(--md-sys-typescale-label-medium)' }}
								>
									Description
								</h3>
								<div
									className={`
										text-sm whitespace-pre-wrap break-words
										text-[var(--md-ref-color-on-surface)]
									`.trim()}
									style={{ font: 'var(--md-sys-typescale-body-medium)' }}
								>
									{task.description}
								</div>
							</div>
						)}

						{isTaskStreamItem(task) && task.markdown && (
							<div>
								<h3
									className={`
										text-sm font-medium tracking-wide mb-2
										text-[var(--md-ref-color-on-surface-variant)]
									`.trim()}
									style={{ font: 'var(--md-sys-typescale-label-medium)' }}
								>
									Notes
								</h3>
								<div
									className={`
										text-sm whitespace-pre-wrap break-words
										text-[var(--md-ref-color-on-surface)]
									`.trim()}
									style={{ font: 'var(--md-sys-typescale-body-medium)' }}
								>
									{task.markdown}
								</div>
							</div>
						)}

						{/* Info Grid */}
						<div className="grid grid-cols-1 gap-4">
							{/* Project */}
							{projectName && (
								<InfoItem
									icon="folder_open"
									label="Project"
									value={projectName}
								/>
							)}

							{/* Progress */}
							{progressInfo && (
								<InfoItem
									icon="flag"
									label="Progress"
									value={
										<div className="flex flex-col gap-1">
											<span className="text-sm">{progressInfo}</span>
											{actualTime && (
												<span
													className={`
														text-xs
														text-[var(--md-ref-color-on-surface-variant)]
													`.trim()}
												>
													{actualTime}
												</span>
											)}
										</div>
									}
								/>
							)}

							{/* Tags */}
							{tags && tags.length > 0 && (
								<InfoItem
									icon="hashtag"
									label="Tags"
									value={
										<div className="flex flex-wrap gap-1.5">
											{tags.map((tag) => (
												<TagChip key={tag} tag={tag} />
											))}
										</div>
									}
								/>
							)}

							{/* Priority (Task type only) */}
							{isTaskType(task) && task.priority !== undefined && (
								<InfoItem
									icon="warning"
									label="Priority"
									value={
										<div className="flex items-center gap-2">
											<div
												className={`
													h-2 w-24 rounded-full
												`.trim()}
												style={{
													background: `linear-gradient(to right,
														var(--md-ref-color-error) 0%,
														var(--md-ref-color-error) ${(task.priority / 100) * 100}%,
														var(--md-ref-color-surface-container-highest) ${(task.priority / 100) * 100}%, 100%)`
												}}
											/>
											<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
												{task.priority}
											</span>
										</div>
									}
								/>
							)}

							{/* Created At */}
							{task.createdAt && (
								<InfoItem
									icon="calendar_month"
									label="Created"
									value={formatDate(task.createdAt)}
								/>
							)}

							{/* Interrupt count (TaskStreamItem only) */}
							{isTaskStreamItem(task) && task.interruptCount > 0 && (
								<InfoItem
									icon="warning"
									label="Interrupted"
									value={`${task.interruptCount} time${task.interruptCount > 1 ? 's' : ''}`}
								/>
							)}

							{/* Category (Task type only) */}
							{isTaskType(task) && (
								<InfoItem
									icon="circle"
									label="Category"
									value={task.category === 'active' ? 'Active Tasks' : 'Someday / Maybe'}
								/>
							)}

							{/* Routine days (TaskStreamItem only) */}
							{isTaskStreamItem(task) && task.routineDays && task.routineDays.length > 0 && (
								<InfoItem
									icon="schedule"
									label="Repeats on"
									value={
										<span className="capitalize">
											{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
												.filter((_, i) => task.routineDays?.includes(i))
												.join(', ')}
										</span>
									}
								/>
							)}
						</div>

						{/* History */}
						{historyEntries.length > 1 && (
							<div>
								<h3
									className={`
										text-sm font-medium tracking-wide mb-3 flex items-center gap-2
										text-[var(--md-ref-color-on-surface-variant)]
									`.trim()}
									style={{ font: 'var(--md-sys-typescale-label-medium)' }}
								>
									<Icon name="history" size={18} />
									History
								</h3>
								<div className="space-y-2">
									{historyEntries.map((entry, idx) => (
										<HistoryEntry
											key={idx}
											timestamp={entry.timestamp}
											action={entry.action}
										/>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Footer */}
					<div
						className={`
							flex items-center justify-between
							px-6 py-4
							border-t border-[var(--md-ref-color-outline-variant)]
							shrink-0
						`.trim()}
					>
						<span
							className={`
								text-xs font-mono tabular-nums
								text-[var(--md-ref-color-on-surface-variant)]
							`.trim()}
						>
							{task.id.slice(0, 8)}
						</span>
						{onEdit && (
							<button
								type="button"
								onClick={onEdit}
								className={`
									px-4 py-2 rounded-full
									text-sm font-medium
									bg-[var(--md-ref-color-primary)]
									text-[var(--md-ref-color-on-primary)]
									hover:bg-[var(--md-ref-color-primary-container)]
									hover:text-[var(--md-ref-color-on-primary-container)]
									transition-colors duration-150 ease-in-out
								`.trim()}
								style={{ font: 'var(--md-sys-typescale-label-large)' }}
							>
								Edit Task
							</button>
						)}
					</div>
				</div>
			</div>
		</>
	);
};

export default TaskDetailDrawer;
