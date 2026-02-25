/**
 * Material 3 TaskDetailDrawer Component
 *
 * Slide-out drawer for viewing and editing task details with M3 styling.
 * Phase2-4: Connected to useTaskStore for full editing capabilities.
 *
 * Features:
 * - Slide-in animation from right (Modal/Bottom Sheet pattern)
 * - Close on backdrop click, ESC key, or close button
 * - Mobile responsive (full screen on mobile, fixed width on desktop)
 * - Editable fields with inline editing mode
 * - State transition buttons (complete/extend/pause/resume)
 * - Delete task with confirmation dialog
 *
 * Reference: https://m3.material.io/components/bottom-sheets/overview
 */

import type React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Icon, type MSIconName } from "./Icon";
import { EnergyPicker, type EnergyLevel } from "./EnergyPicker";
import type { Project } from "@/types";
import type { Task as TaskType } from "@/types/schedule";
import type { TaskStreamItem as TaskStreamItemType } from "@/types/taskstream";
import { TASK_STATUS_COLORS } from "@/types/taskstream";
import type { Task } from "@/types/task";
import type { TaskState } from "@/types/task-state";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Union type for tasks that can be displayed in the detail drawer.
 * Supports both legacy Task (from schedule) and TaskStreamItem types,
 * as well as v2 Task from useTaskStore.
 */
export type TaskDetailItem = TaskType | TaskStreamItemType;

/**
 * Props for TaskDetailDrawer component.
 *
 * @property isOpen - Whether the drawer is open
 * @property onClose - Close callback
 * @property task - Task to display (Task or TaskStreamItem). v2 Task enables inline editing.
 * @property projects - Projects for lookup
 * @property onEdit - Edit callback (deprecated, use inline editing instead)
 * @property onUpdateTask - Task update callback for v2 Task from useTaskStore
 * @property onTransitionTask - Task transition callback for v2 Task from useTaskStore
 * @property onDeleteTask - Task delete callback for v2 Task from useTaskStore
 * @property canTransition - Can transition check for v2 Task from useTaskStore
 * @property className - Additional CSS class
 * @property width - Drawer width (desktop only)
 */
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
	 * When using v2 Task from useTaskStore, editing is enabled
	 */
	task?: TaskDetailItem | Task | null;

	/**
	 * Projects for lookup
	 */
	projects?: Project[];

	/**
	 * Edit callback (opens edit dialog) - DEPRECATED, use inline editing instead
	 */
	onEdit?: () => void;

	/**
	 * Task update callback (for v2 Task from useTaskStore)
	 */
	onUpdateTask?: (id: string, updates: Partial<Task>) => void;

	/**
	 * Task transition callback (for v2 Task from useTaskStore)
	 */
	onTransitionTask?: (id: string, to: TaskState, operation?: string) => void;

	/**
	 * Task delete callback (for v2 Task from useTaskStore)
	 */
	onDeleteTask?: (id: string) => void;

	/**
	 * Can transition check (for v2 Task from useTaskStore)
	 */
	canTransition?: (id: string, to: TaskState) => boolean;

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
	return "status" in item && "state" in item;
}

function isTaskType(item: TaskDetailItem): item is TaskType {
	return "completedPomodoros" in item;
}

/**
 * Check if item is v2 Task from useTaskStore (editable)
 */
function isV2Task(item: TaskDetailItem | Task): item is Task {
	return "energy" in item && "priority" in item && "deferCount" in item === false;
}

/**
 * Get defer count from negative priority (v2 Task)
 */
function getDeferCount(item: TaskDetailItem | Task): number {
	if (isV2Task(item)) {
		return Math.max(0, -(item.priority ?? 0));
	}
	return 0;
}

/**
 * Get energy color class
 */
function getEnergyColor(energy: EnergyLevel): string {
	switch (energy) {
		case "low":
			return "bg-green-500";
		case "medium":
			return "bg-yellow-500";
		case "high":
			return "bg-red-500";
		default:
			return "bg-gray-500";
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function getTaskStatusInfo(item: TaskDetailItem): {
	icon: MSIconName;
	label: string;
	color: string;
} {
	if (isTaskStreamItem(item)) {
		const colors = TASK_STATUS_COLORS[item.status];
		switch (item.status) {
			case "plan":
				return { icon: "radio_button_unchecked", label: "READY", color: colors.text };
			case "doing":
				return { icon: "radio_button_checked", label: "RUNNING", color: colors.text };
			case "log":
				return { icon: "check_circle", label: "DONE", color: colors.text };
			case "interrupted":
				return { icon: "pause", label: "PAUSED", color: colors.text };
			case "routine":
				return { icon: "update", label: "ROUTINE", color: colors.text };
			case "defer":
				return { icon: "skip_next", label: "DEFERRED", color: colors.text };
			default:
				return { icon: "circle", label: "UNKNOWN", color: colors.text };
		}
	}

	// Task type
	if (item.completed) {
		return {
			icon: "check_circle",
			label: "Completed",
			color: "text-[var(--md-ref-color-primary)]",
		};
	}
	if (item.completedPomodoros > 0) {
		return {
			icon: "radio_button_checked",
			label: "In Progress",
			color: "text-[var(--md-ref-color-primary)]",
		};
	}
	return {
		icon: "circle",
		label: "Not Started",
		color: "text-[var(--md-ref-color-on-surface-variant)]",
	};
}

// ─── Info Item Component ─────────────────────────────────────────────────────────

interface InfoItemProps {
	icon: MSIconName;
	label: string;
	value: React.ReactNode;
	className?: string;
}

function InfoItem({ icon, label, value, className = "" }: InfoItemProps) {
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
					style={{ font: "var(--md-sys-typescale-label-small)" }}
				>
					{label}
				</div>
				<div
					className={`
						text-sm
						text-[var(--md-ref-color-on-surface)]
						break-words
					`.trim()}
					style={{ font: "var(--md-sys-typescale-body-medium)" }}
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

function HistoryEntry({ timestamp, action, className = "" }: HistoryEntryProps) {
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
				style={{ font: "var(--md-sys-typescale-body-small)" }}
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
			style={{ font: "var(--md-sys-typescale-label-small)" }}
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
			style={{ font: "var(--md-sys-typescale-label-small)" }}
		>
			<span className="leading-none">{tag}</span>
		</span>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────────

/**
 * Material 3 Task Detail Drawer Component.
 *
 * A slide-out drawer component for viewing and editing task details with M3 styling.
 * Features:
 * - Read-only view with edit mode toggle
 * - Inline editing for title, description, estimated time, energy, tags
 * - State transition operations (Start, Complete, Pause, Extend, Defer)
 * - Mobile responsive with slide-in animation
 * - Close on backdrop click, ESC key, or close button
 *
 * @example
 * ```tsx
 * <TaskDetailDrawer
 *   isOpen={isOpen}
 *   task={selectedTask}
 *   projects={projects}
 *   onClose={handleClose}
 *   onUpdateTask={(id, updates) => updateTask(id, updates)}
 *   onTransitionTask={(id, to, op) => transitionTask(id, to, op)}
 *   onDeleteTask={(id) => deleteTask(id)}
 *   canTransition={(id, to) => canTransition(id, to)}
 * />
 * ```
 */
export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
	isOpen,
	onClose,
	task,
	projects = [],
	onEdit,
	onUpdateTask,
	onTransitionTask,
	onDeleteTask,
	canTransition,
	className = "",
	width = 440,
}) => {
	const [isMobile, setIsMobile] = useState(false);
	const drawerRef = useRef<HTMLDivElement>(null);

	// Inline editing state (Phase2-4)
	const [isEditing, setIsEditing] = useState(false);
	const [editedTitle, setEditedTitle] = useState("");
	const [editedDescription, setEditedDescription] = useState("");
	const [editedProject, setEditedProject] = useState<string | null>(null);
	const [editedEnergy, setEditedEnergy] = useState<EnergyLevel>("medium");
	const [editedTags, setEditedTags] = useState<string[]>([]);
	const [newTagInput, setNewTagInput] = useState("");
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Check if task is v2 Task (editable)
	const isV2 = !!task && isV2Task(task);
	const taskState =
		isV2 && task ? (task as Task).state : task && isTaskStreamItem(task) ? task.state : "READY";

	// Initialize edit fields when task changes or editing mode starts
	useEffect(() => {
		if (task) {
			setEditedTitle(task.title);
			if (isV2) {
				setEditedDescription((task as Task).description ?? "");
				setEditedProject((task as Task).project ?? null);
				setEditedEnergy((task as Task).energy);
				setEditedTags((task as Task).tags ?? []);
			} else if (isTaskType(task)) {
				setEditedDescription(task.description ?? "");
				setEditedTags(task.tags ?? []);
			} else if (isTaskStreamItem(task)) {
				setEditedTags(task.tags ?? []);
			}
		}
	}, [task, isV2]);

	// Reset editing state when drawer closes
	useEffect(() => {
		if (!isOpen) {
			setIsEditing(false);
			setShowDeleteConfirm(false);
		}
	}, [isOpen]);

	// Detect mobile viewport
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 640);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

	// Keyboard shortcuts (ESC to close)
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	// Prevent body scroll when drawer is open
	useEffect(() => {
		if (!isOpen) return;

		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	// Focus trap
	useEffect(() => {
		if (!isOpen || !drawerRef.current) return;

		const drawer = drawerRef.current;
		const focusableElements = drawer.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		);
		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		const handleTabKey = (e: KeyboardEvent) => {
			if (e.key !== "Tab") return;

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
		drawer.addEventListener("keydown", handleTabKey);
		return () => drawer.removeEventListener("keydown", handleTabKey);
	}, [isOpen]);

	// Handle backdrop click
	const handleBackdropClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === e.currentTarget) {
				// Cancel editing if in edit mode
				if (isEditing) {
					setIsEditing(false);
				} else {
					onClose();
				}
			}
		},
		[onClose, isEditing],
	);

	// Save edits (Phase2-4)
	const handleSaveEdits = useCallback(() => {
		if (!task || !isV2 || !onUpdateTask) return;

		onUpdateTask(task.id, {
			title: editedTitle,
			description: editedDescription || undefined,
			project: editedProject,
			energy: editedEnergy,
			tags: editedTags,
		});

		setIsEditing(false);
	}, [
		task,
		isV2,
		onUpdateTask,
		editedTitle,
		editedDescription,
		editedProject,
		editedEnergy,
		editedTags,
	]);

	// Cancel edits
	const handleCancelEdits = useCallback(() => {
		if (task) {
			setEditedTitle(task.title);
			if (isV2) {
				setEditedDescription((task as Task).description ?? "");
				setEditedProject((task as Task).project ?? null);
				setEditedEnergy((task as Task).energy);
				setEditedTags((task as Task).tags ?? []);
			}
		}
		setIsEditing(false);
	}, [task, isV2]);

	// Add tag (Phase2-4)
	const handleAddTag = useCallback(() => {
		const trimmed = newTagInput.trim();
		if (trimmed && !editedTags.includes(trimmed)) {
			setEditedTags([...editedTags, trimmed]);
			setNewTagInput("");
		}
	}, [newTagInput, editedTags]);

	// Remove tag (Phase2-4)
	const handleRemoveTag = useCallback(
		(tag: string) => {
			setEditedTags(editedTags.filter((t) => t !== tag));
		},
		[editedTags],
	);

	// Handle state transition (Phase2-4)
	const handleTransition = useCallback(
		(to: TaskState, operation: string) => {
			if (!task || !isV2 || !onTransitionTask) return;

			// Check if transition is valid
			if (canTransition && !canTransition(task.id, to)) {
				console.warn(`Invalid transition: ${taskState} -> ${to}`);
				return;
			}

			onTransitionTask(task.id, to, operation);
		},
		[task, isV2, onTransitionTask, canTransition, taskState],
	);

	// Handle delete task (Phase2-4)
	const handleDeleteTask = useCallback(() => {
		if (!task || !isV2 || !onDeleteTask) return;
		onDeleteTask(task.id);
		setShowDeleteConfirm(false);
		onClose();
	}, [task, isV2, onDeleteTask, onClose]);

	if (!isOpen || !task) {
		return null;
	}

	// Get task status info
	const statusInfo = getTaskStatusInfo(task);

	// Get project name (handle both v2 Task with 'project' and legacy Task with 'projectId')
	const projectName = isV2Task(task)
		? task.project
			? projects.find((p) => p.name === task.project)?.name
			: null
		: task.projectId
			? projects.find((p) => p.id === task.projectId)?.name
			: null;

	// Generate history entries
	const historyEntries: Array<{ timestamp: string; action: string }> = [];

	if (task.createdAt) {
		historyEntries.push({
			timestamp: task.createdAt,
			action: "Task created",
		});
	}

	if (isTaskStreamItem(task)) {
		if (task.startedAt) {
			historyEntries.push({
				timestamp: task.startedAt,
				action: "Started working",
			});
		}
		if (task.completedAt) {
			historyEntries.push({
				timestamp: task.completedAt,
				action: "Completed",
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

	const actualTime =
		isTaskStreamItem(task) && task.actualMinutes > 0
			? `Actual: ${formatMinutes(task.actualMinutes)}`
			: null;

	// Tags
	const tags = isTaskStreamItem(task) ? task.tags : isTaskType(task) ? task.tags : [];

	return (
		<>
			{/* Backdrop */}
			<div
				className={`
					fixed inset-0 z-[100]
					bg-[var(--md-sys-color-scrim)]
					transition-opacity duration-300 ease-in-out
					${isOpen ? "opacity-60" : "opacity-0 pointer-events-none"}
				`.trim()}
				onClick={handleBackdropClick}
				aria-hidden="true"
			/>

			{/* Drawer */}
			<div
				ref={drawerRef}
				className={`
					fixed z-[101] top-0 bottom-0 right-0
					${isMobile ? "w-full" : ""}
					shadow-[var(--md-sys-elevation-level-3)]
					transition-transform duration-300 ease-out
					${isOpen ? "translate-x-0" : "translate-x-full"}
					bg-[var(--md-ref-color-surface-container)]
					${className}
				`.trim()}
				style={!isMobile ? { width: typeof width === "number" ? `${width}px` : width } : undefined}
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
							{/* Edit mode toggle (Phase2-4) */}
							{isV2 && (
								<button
									type="button"
									onClick={() => (isEditing ? handleCancelEdits() : setIsEditing(true))}
									className={`
										p-2 rounded-full
										${
											isEditing
												? "text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)]"
												: "text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)]"
										}
										hover:text-[var(--md-ref-color-on-surface)]
										transition-colors duration-150 ease-in-out
									`.trim()}
									aria-label={isEditing ? "Cancel editing" : "Edit task"}
								>
									<Icon name={isEditing ? "close" : "edit"} size={20} />
								</button>
							)}
							{/* Legacy edit callback */}
							{!isV2 && onEdit && (
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
						{/* Title - Editable for v2 tasks (Phase2-4) */}
						<div>
							{isV2 && isEditing ? (
								<input
									type="text"
									value={editedTitle}
									onChange={(e) => setEditedTitle(e.target.value)}
									className={`
										w-full px-3 py-2 rounded-lg
										bg-[var(--md-ref-color-surface-container-highest)]
										text-[var(--md-ref-color-on-surface)]
										border border-[var(--md-ref-color-outline)]
										focus:border-[var(--md-ref-color-primary)]
										focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]/20
										text-xl font-medium
									`.trim()}
									style={{ font: "var(--md-sys-typescale-headline-small)" }}
									placeholder="Task title"
								/>
							) : (
								<h2
									id="task-detail-title"
									className={`
										text-xl font-medium
										text-[var(--md-ref-color-on-surface)]
									`.trim()}
									style={{ font: "var(--md-sys-typescale-headline-small)" }}
								>
									{task.title}
								</h2>
							)}
						</div>

						{/* Description / Markdown - Editable for v2 tasks (Phase2-4) */}
						{(isTaskType(task) || isV2) &&
							(isEditing ||
								(isTaskType(task) && task.description) ||
								(isV2 && editedDescription)) && (
								<div>
									<h3
										className={`
										text-sm font-medium tracking-wide mb-2
										text-[var(--md-ref-color-on-surface-variant)]
									`.trim()}
										style={{ font: "var(--md-sys-typescale-label-medium)" }}
									>
										Description
									</h3>
									<div
										className={`
										text-sm whitespace-pre-wrap break-words
										text-[var(--md-ref-color-on-surface)]
									`.trim()}
										style={{ font: "var(--md-sys-typescale-body-medium)" }}
									>
										{isEditing ? (
											<textarea
												value={editedDescription}
												onChange={(e) => setEditedDescription(e.target.value)}
												className={`
												w-full min-h-[120px] px-3 py-2 rounded-lg
												bg-[var(--md-ref-color-surface-container-highest)]
												text-[var(--md-ref-color-on-surface)]
												border border-[var(--md-ref-color-outline)]
												focus:border-[var(--md-ref-color-primary)]
												focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]/20
											`.trim()}
												placeholder="Add a description..."
											/>
										) : (
											task.description
										)}
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
									style={{ font: "var(--md-sys-typescale-label-medium)" }}
								>
									Notes
								</h3>
								<div
									className={`
										text-sm whitespace-pre-wrap break-words
										text-[var(--md-ref-color-on-surface)]
									`.trim()}
									style={{ font: "var(--md-sys-typescale-body-medium)" }}
								>
									{task.markdown}
								</div>
							</div>
						)}

						{/* Info Grid */}
						<div className="grid grid-cols-1 gap-4">
							{/* Project */}
							{projectName && <InfoItem icon="folder_open" label="Project" value={projectName} />}

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

							{/* Tags - Editable for v2 tasks (Phase2-4) */}
							{(isEditing ? editedTags.length > 0 : tags && tags.length > 0) && (
								<InfoItem
									icon="hashtag"
									label="Tags"
									value={
										isEditing && isV2 ? (
											<div className="flex flex-col gap-2 w-full">
												<div className="flex flex-wrap gap-1.5">
													{editedTags.map((tag) => (
														<span
															key={tag}
															className={`
																inline-flex items-center gap-1
																px-2 py-1 rounded-full
																text-xs font-medium
																bg-[var(--md-ref-color-secondary-container)]
																text-[var(--md-ref-color-on-secondary-container)]
															`.trim()}
														>
															<span className="leading-none">{tag}</span>
															<button
																type="button"
																onClick={() => handleRemoveTag(tag)}
																className="hover:text-[var(--md-ref-color-on-secondary-container)]/70"
															>
																<Icon name="close" size={12} />
															</button>
														</span>
													))}
												</div>
												<div className="flex gap-2">
													<input
														type="text"
														value={newTagInput}
														onChange={(e) => setNewTagInput(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																handleAddTag();
															}
														}}
														className={`
															flex-1 px-2 py-1 text-sm rounded
															bg-[var(--md-ref-color-surface-container-highest)]
															text-[var(--md-ref-color-on-surface)]
															border border-[var(--md-ref-color-outline)]
															focus:border-[var(--md-ref-color-primary)]
															focus:outline-none
														`.trim()}
														placeholder="Add tag..."
													/>
													<button
														type="button"
														onClick={handleAddTag}
														className="px-2 py-1 text-sm rounded bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)]"
													>
														<Icon name="add" size={16} />
													</button>
												</div>
											</div>
										) : (
											<div className="flex flex-wrap gap-1.5">
												{(isEditing ? editedTags : tags).map((tag) => (
													<TagChip key={tag} tag={tag} />
												))}
											</div>
										)
									}
								/>
							)}

							{/* Energy Level - v2 Task only (Phase2-4) */}
							{isV2 && (
								<InfoItem
									icon="bolt"
									label="Energy"
									value={
										isEditing ? (
											<EnergyPicker value={editedEnergy} onChange={setEditedEnergy} size="sm" />
										) : (
											<div className="flex items-center gap-2">
												<div
													className={`w-3 h-3 rounded-full ${getEnergyColor((task as Task).energy)}`}
												/>
												<span className="capitalize text-sm">{(task as Task).energy}</span>
											</div>
										)
									}
								/>
							)}

							{/* Priority / Defer count - v2 Task only (Phase2-4) */}
							{isV2 && (task as Task).priority !== null && (task as Task).priority !== 0 && (
								<InfoItem
									icon={getDeferCount(task) > 0 ? "skip_next" : "warning"}
									label={getDeferCount(task) > 0 ? "Deferred" : "Priority"}
									value={
										getDeferCount(task) > 0
											? `Deferred ${getDeferCount(task)} time${getDeferCount(task) > 1 ? "s" : ""}`
											: (task as Task).priority
									}
								/>
							)}

							{/* Priority (Task type only) */}
							{!isV2 && isTaskType(task) && task.priority !== null && (
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
														var(--md-ref-color-error) ${((task.priority ?? 50) / 100) * 100}%,
														var(--md-ref-color-surface-container-highest) ${((task.priority ?? 50) / 100) * 100}%, 100%)`,
												}}
											/>
											<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
												{task.priority ?? 50}
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
									value={`${task.interruptCount} time${task.interruptCount > 1 ? "s" : ""}`}
								/>
							)}

							{/* Category (Task type only) */}
							{isTaskType(task) && (
								<InfoItem
									icon="circle"
									label="Category"
									value={task.category === "active" ? "Active Tasks" : "Someday / Maybe"}
								/>
							)}

							{/* Routine days (TaskStreamItem only) */}
							{isTaskStreamItem(task) && task.routineDays && task.routineDays.length > 0 && (
								<InfoItem
									icon="schedule"
									label="Repeats on"
									value={
										<span className="capitalize">
											{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
												.filter((_, i) => task.routineDays?.includes(i))
												.join(", ")}
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
									style={{ font: "var(--md-sys-typescale-label-medium)" }}
								>
									<Icon name="history" size={18} />
									History
								</h3>
								<div className="space-y-2">
									{historyEntries.map((entry) => (
										<HistoryEntry
											key={`${entry.timestamp}-${entry.action}`}
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
						{/* Task ID */}
						<span
							className={`
								text-xs font-mono tabular-nums
								text-[var(--md-ref-color-on-surface-variant)]
							`.trim()}
						>
							{task.id.slice(0, 8)}
						</span>

						{/* Actions (Phase2-4) */}
						<div className="flex items-center gap-2">
							{/* Edit mode: Save/Cancel buttons */}
							{isV2 && isEditing && (
								<button
									type="button"
									onClick={handleSaveEdits}
									className={`
											px-4 py-2 rounded-full
											text-sm font-medium
											bg-[var(--md-ref-color-primary)]
											text-[var(--md-ref-color-on-primary)]
											hover:bg-[var(--md-ref-color-primary-container)]
											hover:text-[var(--md-ref-color-on-primary-container)]
											transition-colors duration-150 ease-in-out
										`.trim()}
									style={{ font: "var(--md-sys-typescale-label-large)" }}
								>
									Save
								</button>
							)}

							{/* View mode: State transition buttons (Phase2-4) */}
							{isV2 && !isEditing && (
								<>
									{/* State-specific buttons */}
									{taskState === "READY" && (
										<button
											type="button"
											onClick={() => handleTransition("RUNNING", "start")}
											className={`
												px-3 py-1.5 rounded-full
												text-sm font-medium
												bg-[var(--md-ref-color-primary)]
												text-[var(--md-ref-color-on-primary)]
												hover:bg-[var(--md-ref-color-primary-container)]
												transition-colors duration-150 ease-in-out
												flex items-center gap-1
											`.trim()}
											aria-label="Start task"
										>
											<Icon name="play_arrow" size={16} aria-hidden="true" />
											Start
										</button>
									)}

									{taskState === "RUNNING" && (
										<div className="flex gap-2">
											<button
												type="button"
												onClick={() => handleTransition("DONE", "complete")}
												className={`
													px-3 py-1.5 rounded-full
													text-sm font-medium
													bg-green-600 hover:bg-green-700
													text-white
													transition-colors duration-150 ease-in-out
													flex items-center gap-1
												`.trim()}
												aria-label="Complete task"
											>
												<Icon name="check" size={16} aria-hidden="true" />
												Complete
											</button>
											<button
												type="button"
												onClick={() => handleTransition("RUNNING", "extend")}
												className={`
													px-3 py-1.5 rounded-full
													text-sm font-medium
													bg-[var(--md-ref-color-secondary-container)]
													text-[var(--md-ref-color-on-secondary-container)]
													hover:bg-[var(--md-ref-color-secondary-container-highest)]
													transition-colors duration-150 ease-in-out
													flex items-center gap-1
												`.trim()}
												aria-label="Extend task time"
											>
												<Icon name="refresh" size={16} aria-hidden="true" />
												Extend
											</button>
											<button
												type="button"
												onClick={() => handleTransition("PAUSED", "pause")}
												className={`
													px-3 py-1.5 rounded-full
													text-sm font-medium
													bg-[var(--md-ref-color-surface-container)]
													text-[var(--md-ref-color-on-surface)]
													hover:bg-[var(--md-ref-color-surface-container-highest)]
													transition-colors duration-150 ease-in-out
													flex items-center gap-1
												`.trim()}
												aria-label="Pause task"
											>
												<Icon name="pause" size={16} aria-hidden="true" />
												Pause
											</button>
										</div>
									)}

									{taskState === "PAUSED" && (
										<button
											type="button"
											onClick={() => handleTransition("RUNNING", "resume")}
											className={`
												px-3 py-1.5 rounded-full
												text-sm font-medium
												bg-[var(--md-ref-color-primary)]
												text-[var(--md-ref-color-on-primary)]
												hover:bg-[var(--md-ref-color-primary-container)]
												transition-colors duration-150 ease-in-out
												flex items-center gap-1
											`.trim()}
											aria-label="Resume task"
										>
											<Icon name="play_arrow" size={16} aria-hidden="true" />
											Resume
										</button>
									)}

									{/* Delete button (Phase2-4) */}
									<button
										type="button"
										onClick={() => setShowDeleteConfirm(true)}
										className={`
											px-3 py-1.5 rounded-full
											text-sm font-medium
											bg-transparent
											text-[var(--md-ref-color-error)]
											hover:bg-[var(--md-ref-color-error-container)]
											transition-colors duration-150 ease-in-out
											flex items-center gap-1
										`.trim()}
									>
										<Icon name="delete" size={16} />
										Delete
									</button>
								</>
							)}

							{/* Legacy edit button for non-v2 tasks */}
							{!isV2 && onEdit && (
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
									style={{ font: "var(--md-sys-typescale-label-large)" }}
								>
									Edit Task
								</button>
							)}
						</div>
					</div>

					{/* Delete confirmation dialog (Phase2-4) */}
					{showDeleteConfirm && (
						<>
							<div
								className={`
									fixed inset-0 z-[102]
									bg-[var(--md-sys-color-scrim)]
									transition-opacity duration-200 ease-in-out
									opacity-60
								`.trim()}
								onClick={() => setShowDeleteConfirm(false)}
								aria-hidden="true"
							/>
							<div
								className={`
									fixed z-[103] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
									bg-[var(--md-ref-color-surface-container)]
									rounded-2xl shadow-[var(--md-sys-elevation-level-3)]
									p-6 min-w-[320px] max-w-sm
								`.trim()}
								role="alertdialog"
								aria-modal="true"
								aria-labelledby="delete-confirm-title"
								aria-describedby="delete-confirm-desc"
							>
								<h3
									id="delete-confirm-title"
									className={`
										text-lg font-medium mb-2
										text-[var(--md-ref-color-on-surface)]
									`.trim()}
								>
									Delete task?
								</h3>
								<p
									id="delete-confirm-desc"
									className={`
										text-sm mb-6
										text-[var(--md-ref-color-on-surface-variant)]
									`.trim()}
								>
									This action cannot be undone.
								</p>
								<div className="flex justify-end gap-2">
									<button
										type="button"
										onClick={() => setShowDeleteConfirm(false)}
										className={`
											px-4 py-2 rounded-full
											text-sm font-medium
											bg-[var(--md-ref-color-surface-container-high)]
											text-[var(--md-ref-color-on-surface)]
											hover:bg-[var(--md-ref-color-surface-container-highest)]
											transition-colors duration-150 ease-in-out
										`.trim()}
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleDeleteTask}
										className={`
											px-4 py-2 rounded-full
											text-sm font-medium
											bg-[var(--md-ref-color-error)]
											text-[var(--md-ref-color-on-error)]
											hover:bg-[var(--md-ref-color-error-container)]
											hover:text-[var(--md-ref-color-on-error-container)]
											transition-colors duration-150 ease-in-out
										`.trim()}
									>
										Delete
									</button>
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</>
	);
};

export default TaskDetailDrawer;
