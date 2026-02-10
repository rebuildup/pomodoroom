/**
 * TaskDialog -- Modal dialog for adding/editing tasks.
 *
 * Features:
 * - Title (required)
 * - Description textarea (Markdown support)
 * - Project select dropdown
 * - Category radio: Active | Someday
 * - Tags input (comma-separated)
 * - Estimated pomodoros slider (1-10)
 * - Priority slider (0-100)
 * - Create/Edit mode detection
 * - Close on Escape key
 */
import { useState, useEffect, useCallback } from "react";
import { X, Hash, Flag, Target, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/types";
import type { Task as TaskType } from "@/types/schedule";

type TaskCategory = "active" | "someday";

interface TaskDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (task: TaskType) => void;
	task?: TaskType | null;
	theme: "light" | "dark";
}

const PRIORITY_LABELS: Record<number, string> = {
	0: "None",
	25: "Low",
	50: "Medium",
	75: "High",
	100: "Urgent",
};

export function TaskDialog({
	isOpen,
	onClose,
	onSave,
	task,
	theme,
}: TaskDialogProps) {
	// Form state
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [projectId, setProjectId] = useState<string>("");
	const [category, setCategory] = useState<TaskCategory>("active");
	const [tags, setTags] = useState("");
	const [estimatedPomodoros, setEstimatedPomodoros] = useState(1);
	const [priority, setPriority] = useState(50);

	// Projects state
	const [projects, setProjects] = useState<Project[]>([]);

	// Validation state
	const [titleError, setTitleError] = useState("");

	// Load projects
	useEffect(() => {
		if (!isOpen) return;
		invoke<Project[]>("cmd_project_list")
			.then(setProjects)
			.catch((err) => console.error("Failed to load projects:", err));
	}, [isOpen]);

	// Initialize form when task changes (edit mode) or reset for new task
	useEffect(() => {
		if (task) {
			setTitle(task.title);
			setDescription(task.description || "");
			setProjectId(task.projectId || "");
			setCategory(task.category);
			setTags(task.tags?.join(", ") || "");
			setEstimatedPomodoros(task.estimatedPomodoros);
			setPriority(task.priority || 50);
		} else {
			// Default values for new task
			setTitle("");
			setDescription("");
			setProjectId("");
			setCategory("active");
			setTags("");
			setEstimatedPomodoros(1);
			setPriority(50);
		}
		setTitleError("");
	}, [task, isOpen]);

	const isEditMode = !!task;

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

			const newTask: TaskType = {
				id: task?.id || crypto.randomUUID(),
				title: title.trim(),
				description: description.trim() || undefined,
				estimatedPomodoros,
				completedPomodoros: task?.completedPomodoros || 0,
				completed: task?.completed || false,
				projectId: projectId || undefined,
				tags: tagArray,
				priority,
				category,
				createdAt: task?.createdAt || new Date().toISOString(),
			};

			onSave(newTask);
			onClose();
		},
		[title, description, projectId, category, tags, estimatedPomodoros, priority, task, onSave, onClose]
	);

	// Keyboard shortcuts
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

	if (!isOpen) return null;

	const isDark = theme === "dark";
	const priorityLabel = PRIORITY_LABELS[
		[0, 25, 50, 75, 100].reduce((prev, curr) =>
			Math.abs(curr - priority) < Math.abs(prev - priority) ? curr : prev
		)
	] || "Medium";

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Dialog */}
			<div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<div
					className={`w-full max-w-lg rounded-xl shadow-xl ${
						isDark
							? "bg-gray-800 border border-gray-700"
							: "bg-white border border-gray-200"
					}`}
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div
						className={`flex items-center justify-between px-4 py-3 border-b ${
							isDark ? "border-gray-700" : "border-gray-200"
						}`}
					>
						<h2
							className={`text-lg font-semibold ${
								isDark ? "text-white" : "text-gray-900"
							}`}
						>
							{isEditMode ? "Edit Task" : "New Task"}
						</h2>
						<button
							type="button"
							onClick={onClose}
							className={`p-1 rounded-lg transition-colors ${
								isDark
									? "hover:bg-gray-700 text-gray-400 hover:text-white"
									: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
							}`}
							aria-label="Close"
						>
							<X size={20} />
						</button>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className="p-4 space-y-4">
						{/* Title (required) */}
						<div>
							<label
								className={`block text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								Title <span className="text-red-500">*</span>
							</label>
							<input
								type="text"
								value={title}
								onChange={(e) => {
									setTitle(e.target.value);
									setTitleError("");
								}}
								placeholder="Task title..."
								className={`w-full px-3 py-2 rounded-lg border text-sm ${
									titleError
										? "border-red-500"
										: isDark
											? "border-gray-600 bg-gray-700 text-white"
											: "border-gray-300 bg-white text-gray-900"
								} placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
							/>
							{titleError && (
								<p className="text-red-500 text-xs mt-1">{titleError}</p>
							)}
						</div>

						{/* Description (Markdown support) */}
						<div>
							<label
								className={`block text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								Description <span className="text-gray-400 text-xs">(Markdown supported)</span>
							</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Optional description..."
								rows={3}
								className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
									isDark
										? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
								} focus:outline-none focus:ring-2 focus:ring-blue-500`}
							/>
						</div>

						{/* Project select */}
						<div>
							<label
								className={`flex items-center gap-1 text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								<FolderOpen size={14} />
								Project <span className="text-gray-400 text-xs">(optional)</span>
							</label>
							<select
								value={projectId}
								onChange={(e) => setProjectId(e.target.value)}
								className={`w-full px-3 py-2 rounded-lg border text-sm ${
									isDark
										? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
								} focus:outline-none focus:ring-2 focus:ring-blue-500`}
							>
								<option value="">No project</option>
								{projects.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</div>

						{/* Category radio: Active | Someday */}
						<div>
							<label
								className={`block text-sm font-medium mb-2 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								Category
							</label>
							<div className="flex gap-4">
								<label className={`flex items-center gap-2 cursor-pointer ${isDark ? "text-gray-300" : "text-gray-700"}`}>
									<input
										type="radio"
										name="category"
										value="active"
										checked={category === "active"}
										onChange={(e) => setCategory(e.target.value as TaskCategory)}
										className="w-4 h-4 text-blue-600"
									/>
									<span className="text-sm">Active</span>
								</label>
								<label className={`flex items-center gap-2 cursor-pointer ${isDark ? "text-gray-300" : "text-gray-700"}`}>
									<input
										type="radio"
										name="category"
										value="someday"
										checked={category === "someday"}
										onChange={(e) => setCategory(e.target.value as TaskCategory)}
										className="w-4 h-4 text-blue-600"
									/>
									<span className="text-sm">Someday</span>
								</label>
							</div>
						</div>

						{/* Tags input (comma-separated) */}
						<div>
							<label
								className={`flex items-center gap-1 text-sm font-medium mb-1 ${
									isDark ? "text-gray-300" : "text-gray-700"
								}`}
							>
								<Hash size={14} />
								Tags <span className="text-gray-400 text-xs">(comma-separated)</span>
							</label>
							<input
								type="text"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="work, urgent, frontend..."
								className={`w-full px-3 py-2 rounded-lg border text-sm ${
									isDark
										? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
								} focus:outline-none focus:ring-2 focus:ring-blue-500`}
							/>
						</div>

						{/* Estimated pomodoros slider (1-10) */}
						<div>
							<div className="flex items-center justify-between mb-1">
								<label
									className={`flex items-center gap-1 text-sm font-medium ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									<Target size={14} />
									Estimated Pomodoros
								</label>
								<span className={`text-sm font-medium ${
									isDark ? "text-blue-400" : "text-blue-600"
								}`}>
									{estimatedPomodoros}
								</span>
							</div>
							<input
								type="range"
								min="1"
								max="10"
								value={estimatedPomodoros}
								onChange={(e) => setEstimatedPomodoros(Number(e.target.value))}
								className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
							/>
							<div className={`flex justify-between text-xs mt-1 ${
								isDark ? "text-gray-500" : "text-gray-400"
							}`}>
								<span>1</span>
								<span>5</span>
								<span>10</span>
							</div>
						</div>

						{/* Priority slider (0-100) */}
						<div>
							<div className="flex items-center justify-between mb-1">
								<label
									className={`flex items-center gap-1 text-sm font-medium ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									<Flag size={14} />
									Priority
								</label>
								<span className={`text-sm font-medium ${
									isDark ? "text-blue-400" : "text-blue-600"
								}`}>
									{priority} ({priorityLabel})
								</span>
							</div>
							<input
								type="range"
								min="0"
								max="100"
								step="25"
								value={priority}
								onChange={(e) => setPriority(Number(e.target.value))}
								className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
							/>
							<div className={`flex justify-between text-xs mt-1 ${
								isDark ? "text-gray-500" : "text-gray-400"
							}`}>
								<span>None</span>
								<span>Low</span>
								<span>Medium</span>
								<span>High</span>
								<span>Urgent</span>
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-2 pt-2">
							<button
								type="button"
								onClick={onClose}
								className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
									isDark
										? "bg-gray-700 hover:bg-gray-600 text-gray-300"
										: "bg-gray-100 hover:bg-gray-200 text-gray-700"
								}`}
							>
								Cancel
							</button>
							<button
								type="submit"
								className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
							>
								{isEditMode ? "Update" : "Create"}
							</button>
						</div>
					</form>
				</div>
			</div>
		</>
	);
}
