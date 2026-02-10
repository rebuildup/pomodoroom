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
import type { Task } from "@/types/task";

const DEFAULT_ESTIMATED_MINUTES = 25;

const ENERGY_DESCRIPTIONS: Record<EnergyLevel, string> = {
	low: "短時間・定型作業",
	medium: "通常作業",
	high: "深い作業・創造的",
};

export interface TaskCreateDialogProps {
	/** Whether dialog is open */
	isOpen: boolean;
	/** Called when dialog is closed */
	onClose: () => void;
	/** Called when task is created with task data */
	onCreate: (taskData: Omit<Task, "id" | "state" | "elapsedMinutes" | "priority" | "createdAt" | "updatedAt" | "completedAt" | "pausedAt" | "estimatedPomodoros" | "completedPomodoros" | "completed" | "category">) => void;
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
	// Form state
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [estimatedMinutes, setEstimatedMinutes] = useState(DEFAULT_ESTIMATED_MINUTES);
	const [energy, setEnergy] = useState<EnergyLevel>("medium");
	const [tags, setTags] = useState("");
	const [project, setProject] = useState("");

	// Validation state
	const [titleError, setTitleError] = useState("");

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
			setTitle("");
			setDescription("");
			setEstimatedMinutes(DEFAULT_ESTIMATED_MINUTES);
			setEnergy("medium");
			setTags("");
			setProject("");
			setTitleError("");
		}
	}, [isOpen]);

	// Handle form submission
	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();

			// Validation
			if (!title.trim()) {
				setTitleError("タイトルは必須です");
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
				project: project || null,
				group: null,
				tags: tagArray,
				energy,
			};

			onCreate(taskData);
			onClose();
		},
		[title, description, estimatedMinutes, energy, tags, project, onCreate, onClose]
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
			/>

			{/* Dialog */}
			<div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<div
					className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-xl"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
						<h2 className="text-lg font-semibold text-white">
							新しいタスク
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
						{/* Title (required) */}
						<div>
							<label className="block text-sm font-medium text-gray-300 mb-1">
								タイトル <span className="text-red-500">*</span>
							</label>
							<input
								ref={titleInputRef}
								type="text"
								value={title}
								onChange={(e) => {
									setTitle(e.target.value);
									setTitleError("");
								}}
								placeholder="タスク名..."
								className={`w-full px-3 py-2 rounded-lg border text-sm bg-gray-700 text-white placeholder-gray-400 ${
									titleError
										? "border-red-500 focus:border-red-500"
										: "border-gray-600 focus:border-blue-500"
								} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors`}
							/>
							{titleError && (
								<p className="text-red-500 text-xs mt-1">{titleError}</p>
							)}
						</div>

						{/* Description (optional) */}
						<div>
							<label className="block text-sm font-medium text-gray-300 mb-1">
								説明 <span className="text-gray-500 text-xs">(Markdown対応)</span>
							</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="任意の説明..."
								rows={3}
								className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
							/>
						</div>

						{/* Estimated minutes */}
						<div>
							<div className="flex items-center justify-between mb-1">
								<label className="flex items-center gap-1 text-sm font-medium text-gray-300">
									<Icon name="schedule" size={14} />
									推定時間（分）
								</label>
								<span className="text-sm font-medium text-blue-400">
									{estimatedMinutes}分
								</span>
							</div>
							<input
								type="range"
								min="5"
								max="120"
								step="5"
								value={estimatedMinutes}
								onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
								className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
							/>
							<div className="flex justify-between text-xs text-gray-500 mt-1">
								<span>5分</span>
								<span>25分</span>
								<span>60分</span>
								<span>120分</span>
							</div>
						</div>

						{/* Energy level */}
						<div>
							<label className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-2">
								<Icon name="battery_3_bar" size={14} />
								エネルギーレベル
							</label>
							<div className="flex items-center gap-2">
								<EnergyPicker value={energy} onChange={setEnergy} />
								<span className="text-xs text-gray-500">
									{ENERGY_DESCRIPTIONS[energy]}
								</span>
							</div>
						</div>

						{/* Tags */}
						<div>
							<label className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-1">
								<Icon name="hashtag" size={14} />
								タグ <span className="text-gray-500 text-xs">(カンマ区切り)</span>
							</label>
							<input
								type="text"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="work, urgent, frontend..."
								className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
							/>
						</div>

						{/* Project */}
						<div>
							<label className="flex items-center gap-1 text-sm font-medium text-gray-300 mb-1">
								<Icon name="folder_open" size={14} />
								プロジェクト <span className="text-gray-500 text-xs">(任意)</span>
							</label>
							<input
								type="text"
								value={project}
								onChange={(e) => setProject(e.target.value)}
								placeholder="プロジェクト名..."
								className="w-full px-3 py-2 rounded-lg border border-gray-600 bg-gray-700 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
							/>
						</div>

						{/* Actions */}
						<div className="flex justify-between items-center pt-2">
							<span className="text-xs text-gray-500">
								Ctrl+Enterで保存
							</span>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={onClose}
									className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
								>
									キャンセル
								</button>
								<button
									type="submit"
									className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
								>
									作成
								</button>
							</div>
						</div>
					</form>
				</div>
			</div>
		</>
	);
};

export default TaskCreateDialog;
