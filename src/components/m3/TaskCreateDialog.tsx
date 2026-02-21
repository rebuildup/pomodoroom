/**
 * Material 3 Task Create Dialog Component
 *
 * Simple task creation dialog for v2 redesign.
 *
 * Features:
 * - Title (required)
 * - Description (optional, Markdown support)
 * - Estimated minutes (default: 25)
 * - Energy level (low/medium/high)
 * - Tags (comma-separated)
 * - Project (optional)
 *
 * Keyboard shortcuts:
 * - Ctrl+N to open
 * - Escape to close
 * - Ctrl+Enter to submit
 *
 * @example
 * ```tsx
 * <TaskCreateDialog
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onCreate={(taskData) => taskStore.createTask(taskData)}
 * />
 * ```
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "./Icon";
import { EnergyPicker, type EnergyLevel } from "./EnergyPicker";
import { SplitPreviewEditor } from "./SplitPreviewEditor";
import type { CreateTaskInput } from "@/hooks/useTaskStore";
import { useProjects } from "@/hooks/useProjects";
import type { SplitPreviewItem } from "@/utils/split-preview";

const DEFAULT_ESTIMATED_MINUTES = 25;

const ENERGY_DESCRIPTIONS: Record<EnergyLevel, string> = {
	low: "Short tasks, routine work",
	medium: "Normal work",
	high: "Deep work, creative tasks",
};

export interface TaskCreateDialogProps {
	/** Whether dialog is open */
	isOpen: boolean;
	/** Called when dialog is closed */
	onClose: () => void;
	/** Called when task is created with task data */
	onCreate: (taskData: CreateTaskInput) => void;
}

/**
 * Material 3 Task Create Dialog.
 *
 * Simplified task creation dialog for v2 redesign.
 */
export const TaskCreateDialog: React.FC<TaskCreateDialogProps> = ({
	isOpen,
	onClose,
	onCreate,
}) => {
	// Task type: flexible (default), fixed (event), or life
	type TaskType = "flexible" | "fixed" | "life";
	const [taskType, setTaskType] = useState<TaskType>("flexible");

	// Form state
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [estimatedMinutes, setEstimatedMinutes] = useState(DEFAULT_ESTIMATED_MINUTES);
	const [energy, setEnergy] = useState<EnergyLevel>("medium");
	const [tags, setTags] = useState("");
	const [project, setProject] = useState("");
	const [isSplitPreviewOpen, setIsSplitPreviewOpen] = useState(false);

	// Fixed time state (for fixed/life tasks) - reserved for future implementation
	const [, setFixedStartAt] = useState("");
	const [, setFixedEndAt] = useState("");

	// Split option - whether task can be split with breaks
	const [allowSplit, setAllowSplit] = useState(true);

	// Validation state
	const [titleError, setTitleError] = useState("");

	// Load projects from backend
	const { getProjectNames } = useProjects();
	const projectNames = getProjectNames();

	// Ref for title input (auto-focus)
	const titleInputRef = useRef<HTMLInputElement>(null);

	// Auto-focus title input when dialog opens
	useEffect(() => {
		if (isOpen) {
			// Small delay to ensure dialog is rendered
			setTimeout(() => {
				titleInputRef.current?.focus();
			}, 50);
		}
	}, [isOpen]);

	// Reset form when dialog opens/closes
	useEffect(() => {
		if (isOpen) {
			// Reset to defaults
			setTaskType("flexible");
			setTitle("");
			setDescription("");
			setEstimatedMinutes(DEFAULT_ESTIMATED_MINUTES);
			setEnergy("medium");
			setTags("");
			setProject("");
			setFixedStartAt("");
			setFixedEndAt("");
			setAllowSplit(true);
			setTitleError("");
		}
	}, [isOpen]);

	// Handle form submission
	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();

			// Validation
			if (!title.trim()) {
				setTitleError("Title is required");
				return;
			}

			// Parse tags
			const tagArray = tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0);

			// Create task data
			const taskData = {
				title: title.trim(),
				description: description.trim() || undefined,
				estimatedMinutes: estimatedMinutes || null,
				requiredMinutes: estimatedMinutes || null,
				kind: "duration_only" as const,
				fixedStartAt: null,
				fixedEndAt: null,
				windowStartAt: null,
				windowEndAt: null,
				project: project || null,
				group: null,
				tags: tagArray,
				energy,
				allowSplit,
			};

			onCreate(taskData);
			onClose();
		},
		[title, description, estimatedMinutes, energy, tags, project, allowSplit, onCreate, onClose]
	);

	const handleSplitPreviewAccept = useCallback(
		(items: SplitPreviewItem[]) => {
			const tagArray = tags
				.split(",")
				.map((t) => t.trim())
				.filter((t) => t.length > 0);

			items.forEach((item) => {
				onCreate({
					title: item.title,
					description: description.trim() || undefined,
					requiredMinutes: item.durationMinutes,
					kind: item.kind === "break" ? "break" : "duration_only",
					fixedStartAt: null,
					fixedEndAt: null,
					windowStartAt: null,
					windowEndAt: null,
					project: project || null,
					group: null,
					tags: [
						...tagArray,
						item.kind === "break" ? "auto-split-break" : "auto-split-focus",
					],
					energy,
					// Inherit allowSplit for focus tasks; breaks shouldn't be split further
					allowSplit: item.kind === "break" ? false : allowSplit,
				});
			});

			setIsSplitPreviewOpen(false);
			onClose();
		},
		[description, energy, allowSplit, onClose, onCreate, project, tags]
	);

	// Handle keyboard shortcuts
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape to close
			if (e.key === "Escape") {
				onClose();
				return;
			}

			// Ctrl+Enter to submit
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				handleSubmit(e as any);
				return;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, handleSubmit]);

	if (!isOpen) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
				onClick={onClose}
				aria-hidden="true"
			/>

			{/* Dialog */}
			<div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<div
					className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-xl"
					onClick={(e) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
					aria-labelledby="task-create-title"
				>
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
						<h2 id="task-create-title" className="text-lg font-semibold text-white">
							New Task
						</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-1 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
							aria-label="Close"
						>
							<Icon name="close" size={20} />
						</button>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="p-4 space-y-4">
						{/* Task Type Selector - M3 Segmented Button */}
						<div>
							<label className="block text-sm font-medium text-gray-300 mb-2">
								Type
							</label>
							<div className="flex rounded-lg border border-gray-600 overflow-hidden" role="radiogroup" aria-label="Task type">
								{(
									[
										{ id: "flexible", label: "Flexible", icon: "schedule" },
										{ id: "fixed", label: "Event", icon: "event" },
										{ id: "life", label: "Life", icon: "self_improvement" },
									] as const
								).map((type) => (
									<button
										key={type.id}
										type="button"
										role="radio"
										aria-checked={taskType === type.id}
										onClick={() => setTaskType(type.id)}
										className={`
											flex-1 flex items-center justify-center gap-2 py-2 px-3
											text-sm font-medium
											transition-colors duration-150
											${taskType === type.id
												? "bg-blue-600 text-white"
												: "bg-gray-700 text-gray-300 hover:bg-gray-600"
											}
										`.trim()}
									>
										<Icon name={type.icon} size={16} />
										<span>{type.label}</span>
									</button>
								))}
							</div>
							<p className="text-xs text-gray-500 mt-1">
								{taskType === "flexible" && "Flexible task with estimated duration"}
								{taskType === "fixed" && "Fixed-time event on your calendar"}
								{taskType === "life" && "Life maintenance time block"}
							</p>
						</div>

						{/* Title (required) */}
						<div>
							<label htmlFor="task-title" className="block text-sm font-medium text-gray-300 mb-1">
								Title <span className="text-red-500">*</span>
							</label>
							<input
								id="task-title"
								ref={titleInputRef}
								type="text"
								value={title}
								onChange={(e) => {
									setTitle(e.target.value);
									setTitleError("");
								}}
								placeholder="Task name..."
								required
								aria-required="true"
								aria-invalid={!!titleError}
								aria-describedby={titleError ? "task-title-error" : undefined}
								className={`w-full px-3 py-2 rounded-lg border text-sm bg-gray-700 text-white placeholder-gray-400 ${
									titleError
										? "border-red-500 focus:border-red-500"
										: "border-gray-600 focus:border-blue-500"
								} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors`}
							/>
							{titleError && (
								<p id="task-title-error" className="text-red-500 text-xs mt-1" role="alert">{titleError}</p>
							)}
						</div>

						{/* Description (optional) */}
						<div>
							<label htmlFor="task-description" className="block text-sm font-medium text-gray-300 mb-1">
								Description <span className="text-gray-500 text-xs">(Markdown supported)</span>
							</label>
							<textarea
								id="task-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Add a description..."
								rows={3}
								className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
							/>
						</div>

						{/* Estimated minutes */}
						<div>
							<div className="flex items-center justify-between mb-1">
								<label htmlFor="task-estimated" className="flex items-center gap-1 text-sm font-medium text-gray-300">
									<Icon name="schedule" size={14} aria-hidden="true" />
									Estimated time (minutes)
								</label>
								<span className="text-sm font-medium text-blue-400" aria-live="polite" aria-atomic="true">
									{estimatedMinutes}m
								</span>
							</div>
							<input
								id="task-estimated"
								type="range"
								min="5"
								max="120"
								step="5"
								value={estimatedMinutes}
								onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
								className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
								aria-valuemin={5}
								aria-valuemax={120}
								aria-valuenow={estimatedMinutes}
								aria-label={`Estimated time: ${estimatedMinutes} minutes`}
							/>
							<div className="flex justify-between text-xs text-gray-500 mt-1" aria-hidden="true">
								<span>5m</span>
								<span>25m</span>
								<span>60m</span>
								<span>120m</span>
							</div>
						</div>

						{/* Energy level */}
						<div>
							<fieldset className="border-0 p-0">
								<legend className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2">
									<Icon name="battery_3_bar" size={14} aria-hidden="true" />
									Energy level
								</legend>
								<div className="flex items-center gap-2" role="radiogroup" aria-label="Energy level">
									<EnergyPicker value={energy} onChange={setEnergy} />
									<span className="text-xs text-gray-500" aria-live="polite" aria-atomic="true">
										{ENERGY_DESCRIPTIONS[energy]}
									</span>
								</div>
							</fieldset>
						</div>

						{/* Allow Split Toggle */}
						<div>
							<label className="flex items-center gap-3 cursor-pointer">
								<input
									type="checkbox"
									checked={allowSplit}
									onChange={(e) => setAllowSplit(e.target.checked)}
									className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
								/>
								<div className="flex flex-col">
									<span className="flex items-center gap-1 text-sm font-medium text-gray-300">
										<Icon name="call_split" size={14} aria-hidden="true" />
										Allow splitting with breaks
									</span>
									<span className="text-xs text-gray-500">
										{allowSplit
											? "Scheduler can insert breaks during this task"
											: "Task will be worked on continuously without breaks"}
									</span>
								</div>
							</label>
						</div>

						{/* Tags */}
						<div>
							<label htmlFor="task-tags" className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-1">
								<Icon name="hashtag" size={14} aria-hidden="true" />
								Tags <span className="text-gray-500 text-xs">(comma separated)</span>
							</label>
							<input
								id="task-tags"
								type="text"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="work, urgent, frontend..."
								className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
							/>
						</div>

						{/* Project */}
						<div>
							<label htmlFor="task-project" className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-1">
								<Icon name="folder_open" size={14} aria-hidden="true" />
								Project <span className="text-gray-500 text-xs">(optional)</span>
							</label>
							<input
								id="task-project"
								list="project-list"
								type="text"
								value={project}
								onChange={(e) => setProject(e.target.value)}
								placeholder="Select or type project name..."
								className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
							/>
							<datalist id="project-list">
								{projectNames.map((name) => (
									<option key={name} value={name} />
								))}
							</datalist>
							{projectNames.length === 0 && (
								<p className="text-xs text-gray-500 mt-1">
									No projects yet. Create one in Settings.
								</p>
							)}
						</div>

						{/* Actions */}
						<div className="flex justify-between items-center pt-2">
							<span className="text-xs text-gray-500">
								Ctrl+Enter to save
							</span>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => {
										if (!title.trim()) {
											setTitleError("Title is required");
											return;
										}
										setIsSplitPreviewOpen(true);
									}}
									className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-700 hover:bg-indigo-600 text-white transition-colors"
								>
									Split Preview
								</button>
								<button
									type="button"
									onClick={onClose}
									className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
								>
									Cancel
								</button>
								<button
									type="submit"
									className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
								>
									Create
								</button>
							</div>
						</div>
					</form>
				</div>
			</div>

			<SplitPreviewEditor
				isOpen={isSplitPreviewOpen}
				title={title}
				totalMinutes={estimatedMinutes}
				onAccept={handleSplitPreviewAccept}
				onCancel={() => setIsSplitPreviewOpen(false)}
			/>
		</>
	);
};

export default TaskCreateDialog;
