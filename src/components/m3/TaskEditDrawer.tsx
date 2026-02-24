/**
 * Material 3 TaskEditDrawer Component
 *
 * Edit drawer for task details with M3 styling.
 * Features:
 * - Slide-in animation from right (Modal/Bottom Sheet pattern)
 * - Close on backdrop click, ESC key, or close button
 * - Mobile responsive (full screen on mobile, fixed width on desktop)
 * - Edit form with: title, estimated time, energy level, description, tags
 * - State transition operations using TaskOperations
 * - Save/Cancel buttons
 *
 * Reference: https://m3.material.io/components/bottom-sheets/overview
 */

import type React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "./Icon";
import { TaskOperations, type OperationCallbackProps } from "./TaskOperations";
import { EnergyPicker, type EnergyLevel } from "./EnergyPicker";
import type { Project } from "@/types";
import type { Task as TaskType } from "@/types/schedule";
import type { TaskStreamItem as TaskStreamItemType } from "@/types/taskstream";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Union type for tasks that can be edited in the drawer.
 * Supports both Task (from schedule) and TaskStreamItem types.
 */
export type TaskEditItem = TaskType | TaskStreamItemType;

/**
 * Props for TaskEditDrawer component.
 *
 * @property isOpen - Whether the drawer is open
 * @property onClose - Close callback
 * @property task - Task to edit (Task or TaskStreamItem)
 * @property projects - Projects for lookup
 * @property onSave - Save callback with task updates
 * @property onOperation - Optional callback for state transition operations
 * @property className - Additional CSS class
 * @property width - Drawer width (desktop only)
 * @property locale - Locale for labels (default: en)
 */
export interface TaskEditDrawerProps {
	/**
	 * Whether the drawer is open
	 */
	isOpen: boolean;

	/**
	 * Close callback
	 */
	onClose: () => void;

	/**
	 * Task to edit (Task or TaskStreamItem)
	 */
	task?: TaskEditItem | null;

	/**
	 * Projects for lookup
	 */
	projects?: Project[];

	/**
	 * Save callback
	 */
	onSave: (updates: TaskEditUpdates) => void;

	/**
	 * Operation callback (called when task state operation is triggered)
	 */
	onOperation?: (props: OperationCallbackProps) => void;

	/**
	 * Additional CSS class
	 */
	className?: string;

	/**
	 * Drawer width (desktop only)
	 */
	width?: string | number;

	/**
	 * Locale for labels (default: en)
	 */
	locale?: "en" | "ja";
}

/**
 * Task edit updates for saving.
 *
 * @property title - Task title
 * @property estimatedMinutes - Estimated duration in minutes
 * @property energyLevel - Energy level for task suggestion (optional)
 * @property description - Task description or markdown notes (optional)
 * @property tags - Task tags array
 */
export interface TaskEditUpdates {
	/** Task title */
	title: string;
	/** Estimated duration in minutes */
	estimatedMinutes: number;
	/** Energy level for task suggestion */
	energyLevel?: EnergyLevel;
	/** Task description or markdown notes */
	description?: string;
	/** Task tags */
	tags: string[];
}

// ─── Helper Types ─────────────────────────────────────────────────────────────

function isTaskStreamItem(item: TaskEditItem): item is TaskStreamItemType {
	return "status" in item && "state" in item;
}

function isTaskType(item: TaskEditItem): item is TaskType {
	return "completedPomodoros" in item;
}

// ─── Form Field Component ─────────────────────────────────────────────────────

interface FormFieldProps {
	label: string;
	required?: boolean;
	error?: string;
	children: React.ReactNode;
	className?: string;
}

function FormField({ label, required = false, error, children, className = "" }: FormFieldProps) {
	return (
		<div className={`flex flex-col gap-1.5 ${className}`.trim()}>
			<label
				className={`
					text-sm font-medium tracking-wide
					${error ? "text-[var(--md-ref-color-error)]" : "text-[var(--md-ref-color-on-surface-variant)]"}
				`.trim()}
				style={{ font: "var(--md-sys-typescale-label-medium)" }}
			>
				{label}
				{required && <span className="text-[var(--md-ref-color-error)] ml-1">*</span>}
			</label>
			{children}
			{error && <span className="text-xs text-[var(--md-ref-color-error)]">{error}</span>}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────────

/**
 * Material 3 Task Edit Drawer.
 *
 * A slide-out drawer component for editing task details with Material 3 styling.
 * Features form fields for title, estimated time, energy level, description, and tags.
 * Supports state transition operations via TaskOperations integration.
 *
 * @example
 * ```tsx
 * <TaskEditDrawer
 *   isOpen={isOpen}
 *   task={task}
 *   onClose={handleClose}
 *   onSave={(updates) => updateTask(task.id, updates)}
 *   onOperation={({ taskId, operation }) => handleOperation(taskId, operation)}
 *   locale="ja"
 * />
 * ```
 */
export const TaskEditDrawer: React.FC<TaskEditDrawerProps> = ({
	isOpen,
	onClose,
	task,
	projects = [],
	onSave,
	onOperation,
	className = "",
	width = 440,
	locale = "en",
}) => {
	const [isMobile, setIsMobile] = useState(false);
	const drawerRef = useRef<HTMLDivElement>(null);

	// Form state
	const [title, setTitle] = useState("");
	const [estimatedMinutes, setEstimatedMinutes] = useState(25);
	const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("medium");
	const [description, setDescription] = useState("");
	const [tags, setTags] = useState("");

	// Validation errors
	const [titleError, setTitleError] = useState("");
	const [estimatedMinutesError, setEstimatedMinutesError] = useState("");

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

	// Initialize form when task changes
	useEffect(() => {
		if (!task) return;

		setTitle(task.title);
		setDescription(isTaskStreamItem(task) ? (task.markdown ?? "") : (task.description ?? ""));

		if (isTaskStreamItem(task)) {
			setEstimatedMinutes(task.estimatedMinutes);
			if ((task as any).energyLevel) {
				setEnergyLevel((task as any).energyLevel);
			}
		} else if (isTaskType(task)) {
			setEstimatedMinutes(task.estimatedPomodoros * 25);
		}

		const taskTags = isTaskStreamItem(task) ? task.tags : isTaskType(task) ? task.tags : [];
		setTags(taskTags.join(", "));

		// Clear errors
		setTitleError("");
		setEstimatedMinutesError("");
	}, [task]);

	// Handle backdrop click
	const handleBackdropClick = useCallback(
		(e: React.MouseEvent) => {
			if (e.target === e.currentTarget) {
				onClose();
			}
		},
		[onClose],
	);

	// Validate form
	const validateForm = useCallback((): boolean => {
		let isValid = true;

		if (!title.trim()) {
			setTitleError(locale === "ja" ? "タイトルを入力してください" : "Title is required");
			isValid = false;
		} else {
			setTitleError("");
		}

		if (estimatedMinutes < 1 || estimatedMinutes > 480) {
			setEstimatedMinutesError(
				locale === "ja" ? "1分〜480分の間で入力してください" : "Must be between 1 and 480 minutes",
			);
			isValid = false;
		} else {
			setEstimatedMinutesError("");
		}

		return isValid;
	}, [title, estimatedMinutes, locale]);

	// Handle save
	const handleSave = useCallback(() => {
		if (!validateForm()) return;

		const tagsArray = tags
			.split(",")
			.map((t) => t.trim())
			.filter((t) => t.length > 0);

		onSave({
			title: title.trim(),
			estimatedMinutes,
			energyLevel: task && isTaskStreamItem(task) ? energyLevel : undefined,
			description: description.trim(),
			tags: tagsArray,
		});

		onClose();
	}, [
		title,
		estimatedMinutes,
		energyLevel,
		description,
		tags,
		task,
		onSave,
		onClose,
		validateForm,
	]);

	// Handle operation
	const handleOperation = useCallback(
		(props: OperationCallbackProps) => {
			onOperation?.(props);
		},
		[onOperation],
	);

	if (!isOpen || !task) {
		return null;
	}

	// Get project name
	const projectName = task.projectId ? projects.find((p) => p.id === task.projectId)?.name : null;

	// Convert task to TaskData for TaskOperations
	const taskData = {
		id: task.id,
		state: isTaskStreamItem(task)
			? task.status === "plan"
				? ("READY" as const)
				: task.status === "doing"
					? ("RUNNING" as const)
					: task.status === "interrupted"
						? ("PAUSED" as const)
						: ("DONE" as const)
			: task.completed
				? ("DONE" as const)
				: task.completedPomodoros > 0
					? ("RUNNING" as const)
					: ("READY" as const),
		priority: isTaskType(task) ? (task.priority ?? null) : null,
		estimatedMinutes: isTaskStreamItem(task)
			? task.estimatedMinutes
			: isTaskType(task)
				? task.estimatedPomodoros * 25
				: undefined,
	};

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
				aria-labelledby="task-edit-title"
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
						<h2
							id="task-edit-title"
							className={`
								text-lg font-medium
								text-[var(--md-ref-color-on-surface)]
							`.trim()}
							style={{ font: "var(--md-sys-typescale-headline-small)" }}
						>
							{locale === "ja" ? "タスクを編集" : "Edit Task"}
						</h2>
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

					{/* Content */}
					<div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
						{/* Project info */}
						{projectName && (
							<div className="flex items-center gap-2 text-sm text-[var(--md-ref-color-on-surface-variant)]">
								<Icon name="folder_open" size={16} />
								<span>{projectName}</span>
							</div>
						)}

						{/* Title */}
						<FormField label={locale === "ja" ? "タイトル" : "Title"} required error={titleError}>
							<input
								type="text"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								className={`
									w-full px-4 py-3 rounded-lg
									text-base
									bg-[var(--md-ref-color-surface-container-highest)]
									text-[var(--md-ref-color-on-surface)]
									border ${titleError ? "border-[var(--md-ref-color-error)]" : "border-[var(--md-ref-color-outline)]"}
									focus:border-[var(--md-ref-color-primary)]
									focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]/20
									transition-colors
								`.trim()}
								placeholder={locale === "ja" ? "タスクタイトルを入力..." : "Enter task title..."}
							/>
						</FormField>

						{/* Estimated Time */}
						<FormField
							label={locale === "ja" ? "推定時間（分）" : "Estimated Time (minutes)"}
							required
							error={estimatedMinutesError}
						>
							<input
								type="number"
								min={1}
								max={480}
								value={estimatedMinutes}
								onChange={(e) =>
									setEstimatedMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))
								}
								className={`
									w-full px-4 py-3 rounded-lg
									text-base
									bg-[var(--md-ref-color-surface-container-highest)]
									text-[var(--md-ref-color-on-surface)]
									border ${estimatedMinutesError ? "border-[var(--md-ref-color-error)]" : "border-[var(--md-ref-color-outline)]"}
									focus:border-[var(--md-ref-color-primary)]
									focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]/20
									transition-colors
								`.trim()}
							/>
						</FormField>

						{/* Energy Level (TaskStreamItem only) */}
						{isTaskStreamItem(task) && (
							<FormField label={locale === "ja" ? "エネルギーレベル" : "Energy Level"}>
								<EnergyPicker value={energyLevel} onChange={setEnergyLevel} size="md" />
							</FormField>
						)}

						{/* Tags */}
						<FormField label={locale === "ja" ? "タグ（カンマ区切り）" : "Tags (comma separated)"}>
							<input
								type="text"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								className={`
									w-full px-4 py-3 rounded-lg
									text-base
									bg-[var(--md-ref-color-surface-container-highest)]
									text-[var(--md-ref-color-on-surface)]
									border border-[var(--md-ref-color-outline)]
									focus:border-[var(--md-ref-color-primary)]
									focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]/20
									transition-colors
								`.trim()}
								placeholder={locale === "ja" ? "仕事, 重要, 急ぎ" : "work, important, urgent"}
							/>
						</FormField>

						{/* Description */}
						<FormField label={locale === "ja" ? "説明・メモ" : "Description / Notes"}>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={8}
								className={`
									w-full px-4 py-3 rounded-lg
									text-base
									bg-[var(--md-ref-color-surface-container-highest)]
									text-[var(--md-ref-color-on-surface)]
									border border-[var(--md-ref-color-outline)]
									focus:border-[var(--md-ref-color-primary)]
									focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)]/20
									transition-colors
									whitespace-pre-wrap
									resize-y
								`.trim()}
								placeholder={locale === "ja" ? "タスクの詳細を入力..." : "Enter task details..."}
							/>
						</FormField>
					</div>

					{/* Footer */}
					<div
						className={`
							flex flex-col gap-3
							px-6 py-4
							border-t border-[var(--md-ref-color-outline-variant)]
							shrink-0
						`.trim()}
					>
						{/* Task Operations */}
						{onOperation && (
							<div className="flex items-center justify-between">
								<span
									className={`
										text-xs font-mono tabular-nums
										text-[var(--md-ref-color-on-surface-variant)]
									`.trim()}
								>
									{task.id.slice(0, 8)}
								</span>
								<TaskOperations
									task={taskData}
									onOperation={handleOperation}
									variant="tonal"
									size="medium"
									compact={true}
									showLabels={false}
									locale={locale}
								/>
							</div>
						)}

						{/* Save/Cancel buttons */}
						<div className="flex items-center justify-end gap-2">
							<button
								type="button"
								onClick={onClose}
								className={`
									px-4 py-2 rounded-full
									text-sm font-medium
									text-[var(--md-ref-color-on-surface-variant)]
									hover:bg-[var(--md-ref-color-surface-container-high)]
									transition-colors duration-150 ease-in-out
								`.trim()}
								style={{ font: "var(--md-sys-typescale-label-large)" }}
								aria-label={locale === "ja" ? "キャンセル" : "Cancel"}
							>
								{locale === "ja" ? "キャンセル" : "Cancel"}
							</button>
							<button
								type="button"
								onClick={handleSave}
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
								aria-label={locale === "ja" ? "変更を保存" : "Save changes"}
							>
								{locale === "ja" ? "保存" : "Save"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	);
};

export default TaskEditDrawer;
