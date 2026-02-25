/**
 * Material 3 Task Card Component
 *
 * Draggable card for tasks in the kanban board.
 * Shows task title, priority, tags, and progress.
 * Uses TaskOperations for unified operation buttons.
 *
 * Reference: https://m3.material.io/components/cards/overview
 */

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./Icon";
import { TextField } from "./TextField";
import { Select } from "./Select";
import { DateTimePicker } from "./DateTimePicker";
import { IconPillButton } from "./IconPillButton";
import { SplitButton } from "./SplitButton";
import type { TaskOperation } from "./TaskOperations";
import { TaskTimeRemaining } from "./TaskTimeRemaining";
import type { Task as ScheduleTask } from "@/types/schedule";
import type { TaskState } from "@/types/task-state";
import type { Task as V2Task } from "@/types/task";
import {
	scheduleTaskToV2Task,
	hasProjects,
	hasGroups,
	getDisplayProjects,
	getDisplayGroups,
} from "@/types/task";

/**
 * Strip auto-generated markers from description text.
 * Removes patterns like [calendar:xxx], [recurring:xxx], [gtodo:xxx]
 * and "Auto-generated from ..." messages.
 */
function stripDescriptionMarkers(description: string): string {
	const cleaned = description
		// Remove marker patterns like [calendar:xxx], [recurring:xxx:xxx], [gtodo:xxx]
		.replace(/\[(?:calendar|recurring|gtodo):[^\]]*\]/g, "")
		// Remove "Auto-generated from ..." text
		.replace(/Auto-generated from [^\n]*/g, "")
		// Clean up multiple spaces
		.replace(/\s+/g, " ")
		// Trim whitespace
		.trim();

	return cleaned;
}

export type TaskCardDensity = "compact" | "comfortable" | "detailed";
export type TaskCardOperationsPreset = "none" | "minimal" | "default" | "full";

interface TaskCardSections {
	description?: boolean;
	tags?: boolean;
	time?: boolean;
	progress?: boolean;
	operations?: boolean;
	priority?: boolean;
}

export interface TaskCardUpdatePayload {
	title?: string;
	description?: string;
	state?: TaskState;
	tags?: string[];
	requiredMinutes?: number | null;
	fixedStartAt?: string | null;
	fixedEndAt?: string | null;
	windowStartAt?: string | null;
	windowEndAt?: string | null;
}

export interface TaskCardProps {
	/** Task data (optional in addMode) */
	task?: ScheduleTask | V2Task;
	/** All tasks for auto-schedule calculation */
	allTasks?: (ScheduleTask | V2Task)[];
	/** Whether the card is being dragged */
	isDragging?: boolean;
	/** Enables sortable drag affordance */
	draggable?: boolean;
	/** Callback when card is clicked */
	onClick?: (task: ScheduleTask | V2Task) => void;
	/** Callback when task operation is triggered */
	onOperation?: (taskId: string, operation: TaskOperation) => void;
	/** Callback when task fields are updated from inline editor */
	onUpdateTask?: (taskId: string, updates: TaskCardUpdatePayload) => void | Promise<void>;
	/** Visual density */
	density?: TaskCardDensity;
	/** Toggle sections shown in card */
	sections?: TaskCardSections;
	/** Preset for operation controls */
	operationsPreset?: TaskCardOperationsPreset;
	/** Show status control button on the left side of title */
	showStatusControl?: boolean;
	/** Expand details when card is clicked */
	expandOnClick?: boolean;
	/** Initial expanded state when expandOnClick is enabled */
	defaultExpanded?: boolean;
	/** Controlled expanded state */
	expanded?: boolean;
	/** Called when expanded state should change */
	onExpandedChange?: (taskId: string, expanded: boolean) => void;
	/** Additional CSS class */
	className?: string;
	/** Show as add card */
	addMode?: boolean;
	/** Callback when add card is clicked */
	onAddClick?: (e: React.MouseEvent) => void;
}

/**
 * Get priority color class.
 */
function getPriorityColor(priority: number | null): string {
	if (priority === null) return "text-[var(--md-ref-color-on-surface-variant)]";
	if (priority >= 80) return "text-[var(--md-ref-color-error)]";
	if (priority >= 50) return "text-[var(--md-ref-color-tertiary)]";
	return "text-[var(--md-ref-color-on-surface-variant)]";
}

/**
 * Format progress as fraction.
 */
function formatProgress(task: ScheduleTask): string {
	return `${task.completedPomodoros}/${task.estimatedPomodoros}`;
}

function isScheduleTask(task: ScheduleTask | V2Task): task is ScheduleTask {
	return !("energy" in task);
}

function toEstimatedMinutes(task: ScheduleTask | V2Task): number {
	if (task.requiredMinutes !== null && task.requiredMinutes !== undefined) {
		return task.requiredMinutes;
	}
	return task.estimatedPomodoros * 25;
}

function toProgressLabel(task: ScheduleTask | V2Task): string {
	if (isScheduleTask(task)) return formatProgress(task);
	// Type assertion for V2Task branch
	const narrowedV2Task = task as V2Task;
	const est = narrowedV2Task.requiredMinutes ?? 0;
	const elapsed = narrowedV2Task.elapsedMinutes ?? 0;
	if (est <= 0) return `${elapsed}m`;
	return `${Math.min(elapsed, est)}/${est}m`;
}

function isoToLocalInput(value: string | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60_000);
	return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function resolveSections(
	density: TaskCardDensity,
	overrides?: TaskCardSections,
): Required<TaskCardSections> {
	const defaults: Record<TaskCardDensity, Required<TaskCardSections>> = {
		compact: {
			description: false,
			tags: false,
			time: true,
			progress: false,
			operations: true,
			priority: false,
		},
		comfortable: {
			description: true,
			tags: true,
			time: true,
			progress: true,
			operations: true,
			priority: true,
		},
		detailed: {
			description: true,
			tags: true,
			time: true,
			progress: true,
			operations: true,
			priority: true,
		},
	};

	return {
		...defaults[density],
		...overrides,
	};
}

function getStatusControlMeta(state: TaskState): {
	icon: "radio_button_unchecked" | "radio_button_checked" | "pause" | "check_circle";
	colorClass: string;
	action: TaskOperation | null;
	label?: string;
} {
	switch (state) {
		case "READY":
			return {
				icon: "radio_button_unchecked",
				colorClass: "text-[var(--md-ref-color-on-surface-variant)]",
				action: "start",
			};
		case "RUNNING":
			return {
				icon: "radio_button_checked",
				colorClass: "text-green-500",
				action: "pause",
			};
		case "PAUSED":
			return {
				icon: "pause",
				colorClass: "text-amber-500",
				action: "resume",
			};
		case "DONE":
			return {
				icon: "check_circle",
				colorClass: "text-[var(--md-ref-color-primary)]",
				action: null,
			};
		case "DRIFTING":
			return {
				icon: "radio_button_unchecked",
				colorClass: "text-red-500",
				action: "start",
			};
		default:
			return {
				icon: "radio_button_unchecked",
				colorClass: "text-[var(--md-ref-color-on-surface-variant)]",
				action: null,
			};
	}
}

/**
 * Material 3 Task Card.
 *
 * Draggable card displaying task information with unified TaskOperations buttons.
 *
 * @example
 * ```tsx
 * <TaskCard
 *   task={task}
 *   onClick={(t) => console.log(t.id)}
 *   onOperation={(id, op) => handleOperation(id, op)}
 * />
 * ```
 */
// Add mode component - extracted to avoid hooks rules violation
const TaskCardAddMode: React.FC<{ onAddClick?: (e: React.MouseEvent) => void }> = ({
	onAddClick,
}) => {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onAddClick?.(e);
			}}
			className="group relative flex items-center justify-center p-2 rounded-md w-full min-h-[52px]
			bg-[var(--md-ref-color-surface)]
			border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_55%,transparent)]
			cursor-pointer
			hover:bg-[var(--md-ref-color-surface-container-low)]
			transition-colors duration-150 ease-out
		"
		>
			<Icon name="add" size={24} className="text-[var(--md-ref-color-primary)]" />
		</button>
	);
};

// Main task card content component (requires task to be defined)
const TaskCardContent: React.FC<Omit<TaskCardProps, "addMode" | "onAddClick">> = React.memo(
	({
		task,
		allTasks = [],
		isDragging = false,
		draggable = true,
		onClick: _onClick,
		onOperation,
		onUpdateTask,
		density = "comfortable",
		sections,
		operationsPreset = "default",
		showStatusControl = true,
		expandOnClick = false,
		defaultExpanded = false,
		expanded,
		onExpandedChange,
		className = "",
	}) => {
		// All hooks must be called before any early returns (React rules of hooks)
		const cardRef = React.useRef<HTMLDivElement | null>(null);
		const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
		const [isEditing, setIsEditing] = React.useState(false);
		// Note: These initial values will be updated via useEffect when task changes
		const [editTitle, setEditTitle] = React.useState(task?.title ?? "");
		const [editDescription, setEditDescription] = React.useState(task?.description ?? "");
		const [editState, setEditState] = React.useState<TaskState>(
			(task?.state as TaskState) ?? "READY",
		);
		const [editTagsText, setEditTagsText] = React.useState(task?.tags.join(", ") ?? "");
		const [editEstimatedMinutes, setEditEstimatedMinutes] = React.useState<number>(
			task ? toEstimatedMinutes(task) : 0,
		);
		const v2Task = task && isScheduleTask(task) ? scheduleTaskToV2Task(task) : task;
		const [editRequiredMinutes, setEditRequiredMinutes] = React.useState<number>(
			v2Task?.requiredMinutes ?? (v2Task ? toEstimatedMinutes(v2Task) : 0),
		);
		const [editFixedStartAt, setEditFixedStartAt] = React.useState<string>(
			isoToLocalInput(v2Task?.fixedStartAt),
		);
		const [editFixedEndAt, setEditFixedEndAt] = React.useState<string>(
			isoToLocalInput(v2Task?.fixedEndAt),
		);
		const [editWindowStartAt, setEditWindowStartAt] = React.useState<string>(
			isoToLocalInput(v2Task?.windowStartAt),
		);
		const [editWindowEndAt, setEditWindowEndAt] = React.useState<string>(
			isoToLocalInput(v2Task?.windowEndAt),
		);
		const densityConfig = {
			compact: {
				rootPadding: "p-2",
				rootGap: "gap-1.5",
				headerGap: "gap-1.5",
				titleClass: "text-[13px] font-medium leading-5",
				descClass: "text-[11px] leading-4",
				timeMargin: "mt-1",
				tagClass: "px-1.5 py-0.5 text-[10px]",
				dragIcon: 14,
			},
			comfortable: {
				rootPadding: "p-2.5",
				rootGap: "gap-2",
				headerGap: "gap-2",
				titleClass: "text-sm font-medium leading-5",
				descClass: "text-xs leading-4",
				timeMargin: "mt-1.5",
				tagClass: "px-2 py-0.5 text-xs",
				dragIcon: 16,
			},
			detailed: {
				rootPadding: "p-3",
				rootGap: "gap-2.5",
				headerGap: "gap-2",
				titleClass: "text-sm font-semibold leading-5",
				descClass: "text-xs leading-5",
				timeMargin: "mt-2",
				tagClass: "px-2 py-0.5 text-xs",
				dragIcon: 16,
			},
		}[density];

		const {
			attributes,
			listeners,
			setNodeRef,
			transform,
			transition,
			isDragging: isSortableDragging,
		} = useSortable({
			id: task?.id ?? "__empty__",
			disabled: !draggable || !task,
		});

		const style = {
			transform: CSS.Transform.toString(transform),
			transition,
			opacity: isDragging || isSortableDragging ? 0.5 : 1,
		};

		// Derived values for computed state
		const priorityColor = task ? getPriorityColor(task.priority) : undefined;
		const shownSections = resolveSections(density, sections);
		const hasOperations = shownSections.operations && operationsPreset !== "none";
		const hasProgress = shownSections.progress;
		const effectiveExpanded = expanded ?? isExpanded;
		// showDetails is controlled by effectiveExpanded regardless of expandOnClick
		// expandOnClick only controls whether clicking toggles expansion or triggers onClick
		const showDetails = effectiveExpanded;
		const showFooter = showDetails && (hasOperations || hasProgress);
		const showEditButton = showDetails && expandOnClick && Boolean(onOperation);

		// All hooks must be called before any early returns (React rules of hooks)
		React.useEffect(() => {
			if (task) {
				setEditTitle(task.title);
				setEditDescription(task.description ?? "");
				setEditState(task.state as TaskState);
				setEditTagsText(task.tags.join(", "));
				setEditEstimatedMinutes(toEstimatedMinutes(task));
				setEditRequiredMinutes(
					v2Task?.requiredMinutes ?? (v2Task ? toEstimatedMinutes(v2Task) : 0),
				);
				setEditFixedStartAt(isoToLocalInput(v2Task?.fixedStartAt));
				setEditFixedEndAt(isoToLocalInput(v2Task?.fixedEndAt));
				setEditWindowStartAt(isoToLocalInput(v2Task?.windowStartAt));
				setEditWindowEndAt(isoToLocalInput(v2Task?.windowEndAt));
				setIsEditing(false);
			}
		}, [
			task?.id,
			task?.title,
			task?.description,
			task?.state,
			task?.tags,
			task?.completed,
			task?.priority,
			v2Task?.requiredMinutes,
			v2Task?.fixedStartAt,
			v2Task?.fixedEndAt,
			v2Task?.windowStartAt,
			v2Task?.windowEndAt,
			task,
			v2Task,
		]);

		React.useEffect(() => {
			if (!showDetails) {
				setIsEditing(false);
			}
		}, [showDetails]);

		const resetEditDraft = React.useCallback(() => {
			if (task) {
				setEditTitle(task.title);
				setEditDescription(task.description ?? "");
				setEditState(task.state as TaskState);
				setEditTagsText(task.tags.join(", "));
				setEditEstimatedMinutes(toEstimatedMinutes(task));
				setEditRequiredMinutes(
					v2Task?.requiredMinutes ?? (v2Task ? toEstimatedMinutes(v2Task) : 0),
				);
				setEditFixedStartAt(isoToLocalInput(v2Task?.fixedStartAt));
				setEditFixedEndAt(isoToLocalInput(v2Task?.fixedEndAt));
				setEditWindowStartAt(isoToLocalInput(v2Task?.windowStartAt));
				setEditWindowEndAt(isoToLocalInput(v2Task?.windowEndAt));
			}
		}, [task, v2Task]);

		const handleCancelEdit = React.useCallback(() => {
			resetEditDraft();
			setIsEditing(false);
		}, [resetEditDraft]);

		// Early return after all hooks (React rules of hooks)
		if (!task) {
			return null;
		}

		// Re-derive narrowed values after early return for type safety
		// task is guaranteed non-null here, so these are too
		const narrowedTaskData: {
			id: string;
			title: string;
			state: TaskState;
			priority: number | null;
			estimatedMinutes: number;
			completed: boolean | null;
		} = {
			id: task.id,
			title: task.title,
			state: task.state as TaskState,
			priority: task.priority,
			estimatedMinutes: toEstimatedMinutes(task),
			completed: task.completed,
		};

		const narrowedStatusMeta = getStatusControlMeta(task.state as TaskState);
		// v2Task is guaranteed to be V2Task here since task is non-null
		const narrowedV2Task: V2Task = task && isScheduleTask(task) ? scheduleTaskToV2Task(task) : task;

		const handleSaveEdit = async () => {
			if (!onUpdateTask) {
				setIsEditing(false);
				return;
			}
			const parsedTags = editTagsText
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
			await onUpdateTask(task.id, {
				title: editTitle.trim() || task.title,
				description: editDescription.trim() || undefined,
				state: editState,
				tags: parsedTags,
				requiredMinutes: Math.max(0, Math.round(editRequiredMinutes || 0)),
				fixedStartAt: localInputToIso(editFixedStartAt),
				fixedEndAt: localInputToIso(editFixedEndAt),
				windowStartAt: localInputToIso(editWindowStartAt),
				windowEndAt: localInputToIso(editWindowEndAt),
			});
			setIsEditing(false);
		};

		return (
			<div
				ref={(node) => {
					setNodeRef(node);
					cardRef.current = node;
				}}
				style={style}
				className={`
				group relative flex flex-col ${densityConfig.rootGap} ${densityConfig.rootPadding} rounded-md min-h-[52px]
				bg-[var(--md-ref-color-surface)]
				border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_55%,transparent)]
				${draggable ? "cursor-grab active:cursor-grabbing" : ""}
				hover:bg-[var(--md-ref-color-surface-container-low)]
				transition-colors duration-150 ease-out
				${task.state === "DONE" ? "opacity-60" : ""}
				${className}
			`.trim()}
			>
				{showEditButton ? (
					<div className="absolute top-2 right-2 z-10">
						<IconPillButton
							icon="edit"
							label={onOperation ? "Edit" : "Details"}
							size="sm"
							onClick={() => {
								if (onOperation) {
									onOperation(narrowedTaskData.id, "edit");
								}
							}}
							disabled={!onOperation}
						/>
					</div>
				) : null}

				{/* Drag handle and header */}
				{/* Fixed header: Status + Drag + Title + Time (always visible) */}
				<div className={`flex items-center ${densityConfig.headerGap}`}>
					{showStatusControl && !isEditing ? (
						<div>
							<IconPillButton
								icon={narrowedStatusMeta.icon}
								size="sm"
								className={narrowedStatusMeta.colorClass}
								onClick={() => {
									if (expandOnClick) {
										const next = !effectiveExpanded;
										if (expanded === undefined) {
											setIsExpanded(next);
										}
										onExpandedChange?.(task.id, next);
										return;
									}
									if (narrowedStatusMeta.action && onOperation) {
										onOperation(task.id, narrowedStatusMeta.action);
									}
								}}
								disabled={!expandOnClick && !narrowedStatusMeta.action}
							/>
						</div>
					) : null}
					{draggable ? (
						<button
							type="button"
							className="no-pill !bg-transparent text-[var(--md-ref-color-on-surface-variant)] hover:text-[var(--md-ref-color-on-surface)]"
							{...attributes}
							{...listeners}
							aria-label={`Drag task: ${task.title}`}
							tabIndex={-1}
						>
							<Icon name="drag_indicator" size={densityConfig.dragIcon} />
						</button>
					) : null}

					{/* Title and Time (always visible, never moves) */}
					<div
						className={`flex-1 min-w-0 flex items-center justify-between gap-2 ${showEditButton ? "pr-8" : ""}`}
					>
						<h3
							className={`
						${densityConfig.titleClass} text-[15px] font-semibold text-[var(--md-ref-color-on-surface)] truncate flex-1 min-w-0 leading-none
						${task.state === "DONE" ? "line-through" : ""}
					`.trim()}
						>
							{task.title}
						</h3>
						{shownSections.time ? (
							<div className="flex-shrink-0 flex items-center">
								<TaskTimeRemaining
									task={isScheduleTask(task) ? scheduleTaskToV2Task(task) : task}
									allTasks={allTasks.map((t) => (isScheduleTask(t) ? scheduleTaskToV2Task(t) : t))}
									className="whitespace-nowrap leading-none"
								/>
							</div>
						) : null}
					</div>

					{/* Priority indicator */}
					{shownSections.priority && task.priority !== undefined && task.priority !== null ? (
						<div
							id={`task-priority-${task.id}`}
							className={`flex items-center gap-1 ${priorityColor}`}
							title={`Priority: ${task.priority}`}
						>
							<span className="text-[10px] font-semibold tracking-wide">P{task.priority}</span>
						</div>
					) : null}
				</div>

				{/* Expandable details section (below fixed header) */}
				{!isEditing && showDetails && (
					<div className="flex flex-col min-h-[140px]">
						{/* Main content area - scrollable, fills available space */}
						<div className="flex-1 max-h-[120px] overflow-y-auto scrollbar-hover mt-2 pr-1">
							<div className="space-y-1.5">
								{/* Time details */}
								{narrowedV2Task.fixedStartAt && (
									<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
										<span className="opacity-60">開始: </span>
										{new Date(narrowedV2Task.fixedStartAt).toLocaleString("ja-JP")}
									</div>
								)}
								{narrowedV2Task.fixedEndAt && (
									<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
										<span className="opacity-60">終了: </span>
										{new Date(narrowedV2Task.fixedEndAt).toLocaleString("ja-JP")}
									</div>
								)}
								{narrowedV2Task.windowStartAt && (
									<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
										<span className="opacity-60">ウィンドウ: </span>
										{new Date(narrowedV2Task.windowStartAt).toLocaleString("ja-JP")} -{" "}
										{narrowedV2Task.windowEndAt
											? new Date(narrowedV2Task.windowEndAt).toLocaleString("ja-JP")
											: "--"}
									</div>
								)}
								{!narrowedV2Task.fixedStartAt && !narrowedV2Task.windowStartAt && narrowedV2Task.estimatedStartAt && (
									<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
										<span className="opacity-60">見積開始: </span>
										{new Date(narrowedV2Task.estimatedStartAt).toLocaleString("ja-JP")}
									</div>
								)}

								{/* Duration info */}
								{(narrowedV2Task.requiredMinutes || narrowedV2Task.elapsedMinutes > 0) && (
									<div className="flex gap-3 text-xs text-[var(--md-ref-color-on-surface-variant)]">
										{narrowedV2Task.requiredMinutes && (
											<span>
												<span className="opacity-60">必要:</span> {narrowedV2Task.requiredMinutes}分
											</span>
										)}
										{narrowedV2Task.elapsedMinutes > 0 && (
											<span>
												<span className="opacity-60">経過:</span> {narrowedV2Task.elapsedMinutes}分
											</span>
										)}
									</div>
								)}

								{/* Tags */}
								{task.tags.length > 0 && (
									<div className="flex flex-wrap gap-1">
										{task.tags.map((tag) => (
											<span
												key={tag}
												className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--md-ref-color-secondary-container)] text-[var(--md-ref-color-on-secondary-container)]"
											>
												{tag}
											</span>
										))}
									</div>
								)}

								{/* Description */}
								{(() => {
									const cleanDescription = task.description
										? stripDescriptionMarkers(task.description)
										: "";
									return (
										cleanDescription && (
											<p className="text-xs text-[var(--md-ref-color-on-surface-variant)] line-clamp-2">
												{cleanDescription}
											</p>
										)
									);
								})()}

								{/* Project & Energy */}
								<div className="flex flex-wrap gap-3 text-xs text-[var(--md-ref-color-on-surface-variant)]">
									{hasProjects(narrowedV2Task) && (
										<span>
											<span className="opacity-60">プロジェクト:</span>{" "}
											{getDisplayProjects(narrowedV2Task).join(", ")}
										</span>
									)}
									{hasGroups(narrowedV2Task) && (
										<span>
											<span className="opacity-60">グループ:</span>{" "}
											{getDisplayGroups(narrowedV2Task).join(", ")}
										</span>
									)}
									{narrowedV2Task.energy && (
										<span>
											<span className="opacity-60">エネルギー:</span> {narrowedV2Task.energy}
										</span>
									)}
								</div>
							</div>
						</div>

						{/* Footer with split button - pushed to bottom */}
						{showFooter && (
							<div
								className="flex items-center justify-between gap-2 mt-auto pt-2"
								onClick={(e) => e.stopPropagation()}
								onMouseDown={(e) => e.stopPropagation()}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.stopPropagation();
									}
								}}
								role="none"
							>
								{hasProgress ? (
									<span className="flex items-center gap-1.5 text-xs text-[var(--md-ref-color-on-surface-variant)]">
										{toProgressLabel(task)}
									</span>
								) : (
									<span />
								)}

								{/* Split button for operations */}
								<div className="flex items-center gap-2">
									{/* Primary action button based on state */}
									{narrowedTaskData.state === "READY" && (
										<SplitButton
											label="開始"
											icon="play_arrow"
											onClick={() => onOperation?.(narrowedTaskData.id, "start")}
											variant="filled"
											size="small"
											actions={[
												{
													label: "延期",
													icon: "schedule",
													onClick: () => onOperation?.(narrowedTaskData.id, "defer"),
												},
												{
													label: "編集",
													icon: "edit",
													onClick: () => onOperation?.(narrowedTaskData.id, "edit"),
												},
												{
													label: "削除",
													icon: "delete",
													onClick: () => narrowedTaskData && onOperation?.(narrowedTaskData.id, "delete"),
												},
											]}
										/>
									)}
									{narrowedTaskData.state === "RUNNING" && (
										<SplitButton
											label="完了"
											icon="check"
											onClick={() => onOperation?.(narrowedTaskData.id, "complete")}
											variant="filled"
											size="small"
											actions={[
												{
													label: "一時停止",
													icon: "pause",
													onClick: () => onOperation?.(narrowedTaskData.id, "pause"),
												},
												{
													label: "延長",
													icon: "add_circle",
													onClick: () => onOperation?.(narrowedTaskData.id, "extend"),
												},
												{
													label: "削除",
													icon: "delete",
													onClick: () => narrowedTaskData && onOperation?.(narrowedTaskData.id, "delete"),
												},
											]}
										/>
									)}
									{narrowedTaskData.state === "PAUSED" && (
										<SplitButton
											label="再開"
											icon="play_arrow"
											onClick={() => onOperation?.(narrowedTaskData.id, "resume")}
											variant="filled"
											size="small"
											actions={[
												{
													label: "編集",
													icon: "edit",
													onClick: () => onOperation?.(narrowedTaskData.id, "edit"),
												},
												{
													label: "削除",
													icon: "delete",
													onClick: () => narrowedTaskData && onOperation?.(narrowedTaskData.id, "delete"),
												},
											]}
										/>
									)}
									{narrowedTaskData.state === "DONE" && (
										<SplitButton
											label="完了済み"
											icon="check_circle"
											onClick={() => {}}
											variant="outlined"
											size="small"
											disabled={true}
											actions={[
												{
													label: "削除",
													icon: "delete",
													onClick: () => narrowedTaskData && onOperation?.(narrowedTaskData.id, "delete"),
												},
											]}
										/>
									)}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Edit mode (replaces entire content) */}
				{isEditing && (
					<div
						className="space-y-2"
						onClick={(e) => e.stopPropagation()}
						onMouseDown={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.stopPropagation();
							}
						}}
						role="none"
					>
						<TextField
							value={editTitle}
							onChange={setEditTitle}
							label="Title"
							variant="underlined"
						/>
						<label
							htmlFor={`task-memo-${task.id}`}
							className="text-xs text-[var(--md-ref-color-on-surface-variant)]"
						>
							Memo
						</label>
						<textarea
							id={`task-memo-${task.id}`}
							value={editDescription}
							onChange={(e) => setEditDescription(e.target.value)}
							className="w-full min-h-[72px] rounded-lg border border-[var(--md-ref-color-outline)] bg-[var(--md-ref-color-surface)] px-3 py-2 text-sm text-[var(--md-ref-color-on-surface)] focus:outline-none focus:border-[var(--md-ref-color-outline)]"
						/>
					</div>
				)}

				{showDetails && isEditing ? (
					<div
						className="grid grid-cols-1 md:grid-cols-2 gap-2"
						onClick={(e) => e.stopPropagation()}
						onMouseDown={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.stopPropagation();
							}
						}}
						role="none"
					>
						<Select
							label="Status"
							value={editState}
							onChange={(v) => setEditState(v as TaskState)}
							variant="underlined"
							options={[
								{ value: "READY", label: "READY" },
								{ value: "RUNNING", label: "RUNNING" },
								{ value: "PAUSED", label: "PAUSED" },
								{ value: "DONE", label: "DONE" },
							]}
						/>
						{narrowedV2Task?.kind === "fixed_event" ? (
							<>
								<DateTimePicker
									label="Start"
									value={editFixedStartAt}
									onChange={setEditFixedStartAt}
									variant="underlined"
								/>
								<DateTimePicker
									label="End"
									value={editFixedEndAt}
									onChange={setEditFixedEndAt}
									variant="underlined"
								/>
							</>
						) : null}
						{narrowedV2Task?.kind === "flex_window" ? (
							<>
								<TextField
									label="Required minutes"
									type="number"
									value={String(editRequiredMinutes)}
									onChange={(v) => setEditRequiredMinutes(Number(v) || 0)}
									variant="underlined"
								/>
								<DateTimePicker
									label="Window start"
									value={editWindowStartAt}
									onChange={setEditWindowStartAt}
									variant="underlined"
								/>
								<DateTimePicker
									label="Window end"
									value={editWindowEndAt}
									onChange={setEditWindowEndAt}
									variant="underlined"
								/>
							</>
						) : null}
						{narrowedV2Task?.kind === "duration_only" || narrowedV2Task?.kind === "break" ? (
							<TextField
								label="Required minutes"
								type="number"
								value={String(editRequiredMinutes)}
								onChange={(v) => setEditRequiredMinutes(Number(v) || 0)}
								variant="underlined"
							/>
						) : null}
						<TextField
							label="Estimated minutes"
							type="number"
							value={String(editEstimatedMinutes)}
							onChange={(v) => setEditEstimatedMinutes(Number(v) || 0)}
							variant="underlined"
						/>
						<TextField
							label="Tags (comma separated)"
							className="md:col-span-2"
							value={editTagsText}
							onChange={setEditTagsText}
							variant="underlined"
						/>
						<div className="md:col-span-2 flex items-center justify-end gap-2">
							<IconPillButton
								icon="close"
								label="Cancel"
								size="sm"
								onClick={() => {
									handleCancelEdit();
								}}
							/>
							<IconPillButton
								icon="check"
								label="Update"
								size="sm"
								className="bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] border-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-primary)] hover:text-[var(--md-ref-color-on-primary)]"
								onClick={() => {
									void handleSaveEdit();
								}}
							/>
						</div>
					</div>
				) : null}
			</div>
		);
	},
	(prevProps, nextProps) => {
		// Custom comparison for TaskCardContent to prevent unnecessary re-renders
		const prevTask = prevProps.task;
		const nextTask = nextProps.task;
		if (!prevTask || !nextTask) {
			return false;
		}
		return (
			prevTask.id === nextTask.id &&
			prevTask.title === nextTask.title &&
			prevTask.description === nextTask.description &&
			prevTask.state === nextTask.state &&
			prevTask.priority === nextTask.priority &&
			prevTask.completed === nextTask.completed &&
			prevTask.tags.join("|") === nextTask.tags.join("|") &&
			(isScheduleTask(prevTask) && isScheduleTask(nextTask)
				? prevTask.completedPomodoros === nextTask.completedPomodoros &&
					prevTask.estimatedPomodoros === nextTask.estimatedPomodoros
				: !isScheduleTask(prevTask) && !isScheduleTask(nextTask)
					? (prevTask as V2Task).requiredMinutes === (nextTask as V2Task).requiredMinutes &&
						(prevTask as V2Task).elapsedMinutes === (nextTask as V2Task).elapsedMinutes &&
						(prevTask as V2Task).updatedAt === (nextTask as V2Task).updatedAt
					: false) &&
			prevProps.isDragging === nextProps.isDragging &&
			prevProps.draggable === nextProps.draggable &&
			prevProps.density === nextProps.density &&
			prevProps.operationsPreset === nextProps.operationsPreset &&
			prevProps.showStatusControl === nextProps.showStatusControl &&
			prevProps.expandOnClick === nextProps.expandOnClick &&
			prevProps.defaultExpanded === nextProps.defaultExpanded &&
			prevProps.expanded === nextProps.expanded &&
			JSON.stringify(prevProps.sections ?? {}) === JSON.stringify(nextProps.sections ?? {}) &&
			prevProps.className === nextProps.className
		);
	},
);

TaskCardContent.displayName = "TaskCardContent";

// Main exported component that handles both add mode and task card content
export const TaskCard: React.FC<TaskCardProps> = (props) => {
	if (props.addMode) {
		return <TaskCardAddMode onAddClick={props.onAddClick} />;
	}
	return <TaskCardContent {...props} />;
};

export default TaskCard;
