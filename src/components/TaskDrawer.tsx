/**
 * TaskDrawer -- Slide-in drawer for viewing/editing task details.
 *
 * Features:
 * - Slide-in animation from right side
 * - Overlay backdrop with click-to-close
 * - Responsive width (400px default, full width on mobile)
 * - Header: title, status badge, close button
 * - Description: Markdown-rendered task description
 * - Metadata: project link, tags display, estimated pomodoros, priority indicator, created/updated dates
 * - Activity Log: Timeline of task changes
 * - Actions: Edit, Delete, Start/Pause buttons
 * - Integration: Open from TaskStream, BoardPanel, TimelineBar
 * - Edit button opens TaskDialog
 *
 * Issue #15
 */
import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/m3/Icon";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { Task } from "@/types/schedule";
import type { Project } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────

interface TaskDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	taskId?: string | null;
	task?: Task | null; // Direct task prop (alternative to taskId)
	theme: "light" | "dark";
	onEdit?: (task: Task) => void; // Open TaskDialog for editing
	onDelete?: (taskId: string) => void; // Delete task
	onStart?: (taskId: string) => void; // Start/pause timer for this task
	projects?: Project[]; // For project name lookup
}

// Activity log entry (timeline of changes)
interface ActivityLogEntry {
	id: string;
	action: "created" | "updated" | "completed" | "started" | "paused" | "deleted";
	timestamp: string; // ISO
	note?: string;
}

// Priority label mapping
const PRIORITY_LABELS: Record<number, string> = {
	0: "None",
	25: "Low",
	50: "Medium",
	75: "High",
	100: "Urgent",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
	return `${formatDate(iso)} ${formatTime(iso)}`;
}

function getPriorityLabel(priority: number = 50): string {
	return PRIORITY_LABELS[[0, 25, 50, 75, 100].reduce((prev, curr) =>
		Math.abs(curr - priority) < Math.abs(prev - priority) ? curr : prev
	)] || "Medium";
}

function getPriorityColor(priority: number): string {
	if (priority >= 75) return "text-red-500";
	if (priority >= 50) return "text-yellow-500";
	if (priority >= 25) return "text-blue-500";
	return "text-gray-500";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MetadataItemProps {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	className?: string;
}

function MetadataItem({ icon, label, value, className = "" }: MetadataItemProps) {
	return (
		<div className={`flex items-center gap-2 text-sm ${className}`}>
			<span className="text-(--color-text-muted) shrink-0">{icon}</span>
			<span className="text-(--color-text-muted) shrink-0">{label}:</span>
			<span className="text-(--color-text-secondary)">{value}</span>
		</div>
	);
}

function StatusBadge({ completed }: { completed: boolean }) {
	return (
		<span
			className={`px-2 py-0.5 rounded-full text-xs font-medium ${
				completed
					? "bg-green-500/10 text-green-400 border border-green-500/30"
					: "bg-blue-500/10 text-blue-400 border border-blue-500/30"
			}`}
		>
			{completed ? "Completed" : "Active"}
		</span>
	);
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
	const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-2 bg-(--color-surface) rounded-full overflow-hidden">
				<div
					className="h-full bg-blue-500 transition-all duration-300"
					style={{ width: `${percentage}%` }}
				/>
			</div>
			<span className="text-xs text-(--color-text-muted) font-mono">
				{completed}/{total}
			</span>
		</div>
	);
}

interface ActivityLogProps {
	entries: ActivityLogEntry[];
}

function ActivityLog({ entries }: ActivityLogProps) {
	if (entries.length === 0) {
		return (
			<div className="text-sm text-(--color-text-muted) text-center py-4">
				No activity yet
			</div>
		);
	}

	const actionLabels: Record<ActivityLogEntry["action"], string> = {
		created: "Created",
		updated: "Updated",
		completed: "Completed",
		started: "Started",
		paused: "Paused",
		deleted: "Deleted",
	};

	return (
		<div className="space-y-2">
			{entries.map((entry) => (
				<div key={entry.id} className="flex items-start gap-2 text-sm">
					<div className="w-2 h-2 mt-1.5 rounded-full bg-(--color-border)" />
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-(--color-text-secondary) font-medium">
								{actionLabels[entry.action]}
							</span>
							<span className="text-xs text-(--color-text-muted)">
								{formatDateTime(entry.timestamp)}
							</span>
						</div>
						{entry.note && (
							<p className="text-(--color-text-muted) text-xs mt-0.5">{entry.note}</p>
						)}
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TaskDrawer({
	isOpen,
	onClose,
	taskId,
	task: directTask,
	theme,
	onEdit,
	onDelete,
	onStart,
	projects = [],
}: TaskDrawerProps) {
	const [task, setTask] = useState<Task | null>(directTask ?? null);
	const [isLoading, setIsLoading] = useState(false);
	const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

	// Fetch task data when opened
	useEffect(() => {
		if (!isOpen) return;

		// Use direct task if provided
		if (directTask) {
			setTask(directTask);
			// TODO: Activity log will be implemented in Rust backend (#174)
			setActivityLog([]);
			return;
		}

		// Fetch by taskId
		if (taskId) {
			setIsLoading(true);
			invoke<Task>("cmd_task_get", { taskId })
				.then((fetchedTask) => {
					setTask(fetchedTask);
					// TODO: Activity log will be implemented in Rust backend (#174)
					setActivityLog([]);
				})
				.catch((err) => {
					console.error("Failed to fetch task:", err);
				})
				.finally(() => {
					setIsLoading(false);
				});
		}
	}, [isOpen, taskId, directTask]);

	// Handle keyboard ESC
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

	// Handle actions
	const handleEdit = useCallback(() => {
		if (task && onEdit) {
			onEdit(task);
			onClose();
		}
	}, [task, onEdit, onClose]);

	const handleDelete = useCallback(() => {
		if (task?.id && onDelete) {
			if (confirm(`Delete task "${task.title}"?`)) {
				onDelete(task.id);
				onClose();
			}
		}
	}, [task, onDelete, onClose]);

	const handleStart = useCallback(() => {
		if (task?.id && onStart) {
			onStart(task.id);
		}
	}, [task, onStart]);

	// Get project name
	const project = task?.projectId ? projects.find((p) => p.id === task.projectId) : undefined;
	const projectName = project?.name ?? task?.projectId ?? "No project";

	if (!isOpen) return null;

	const isDark = theme === "dark";

	return (
		<>
			{/* Backdrop */}
			<div
				className={`fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300 ${
					isOpen ? "opacity-100" : "opacity-0"
				}`}
				onClick={onClose}
			/>

			{/* Drawer */}
			<div
				className={`fixed inset-y-0 right-0 z-[101] w-full max-w-md shadow-2xl transform transition-transform duration-300 ease-out ${
					isDark ? "bg-gray-800 border-l border-gray-700" : "bg-white border-l border-gray-200"
				} ${isOpen ? "translate-x-0" : "translate-x-full"}`}
			>
				<div className="flex flex-col h-full">
					{/* Header */}
					<div className={`flex items-start justify-between px-6 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-2">
								<StatusBadge completed={task?.completed ?? false} />
							</div>
							<h2 className={`text-lg font-semibold truncate ${isDark ? "text-white" : "text-gray-900"}`}>
								{task?.title ?? "Task Details"}
							</h2>
						</div>
						<button
							type="button"
							onClick={onClose}
							className={`p-1 rounded-lg transition-colors shrink-0 ${
								isDark
									? "hover:bg-gray-700 text-gray-400 hover:text-white"
									: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
							}`}
							aria-label="Close"
						>
							<Icon name="close" size={20} />
						</button>
					</div>

					{/* Content */}
					<div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
						{isLoading ? (
							<div className="flex items-center justify-center h-full">
								<div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
									Loading task details...
								</div>
							</div>
						) : !task ? (
							<div className="flex items-center justify-center h-full">
								<div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
									Task not found
								</div>
							</div>
						) : (
							<>
								{/* Description */}
								{task.description && (
									<div>
										<h3 className={`text-sm font-semibold mb-2 flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
											<Icon name="description" size={14} />
											Description
										</h3>
										<div className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
											<MarkdownRenderer content={task.description} />
										</div>
									</div>
								)}

								{/* Progress */}
								<div>
									<h3 className={`text-sm font-semibold mb-2 flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
										<Icon name="flag" size={14} />
										Progress
									</h3>
									<ProgressBar completed={task.completedPomodoros} total={task.estimatedPomodoros} />
								</div>

								{/* Metadata */}
								<div className="space-y-2">
									<h3 className={`text-sm font-semibold flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
										<Icon name="tag" size={14} />
										Details
									</h3>

									{/* Project */}
									{task.projectId && (
										<MetadataItem
											icon={<Icon name="folder_open" size={14} />}
											label="Project"
											value={
												<span className="flex items-center gap-1">
													{projectName}
													{project?.deadline && (
														<span className="text-xs text-(--color-text-muted)">
															(due {formatDate(project.deadline)})
														</span>
													)}
												</span>
											}
										/>
									)}

									{/* Priority */}
									<MetadataItem
										icon={<Icon name="flag" size={14} />}
										label="Priority"
										value={
											<span className={`font-medium ${getPriorityColor(task.priority ?? 50)}`}>
												{getPriorityLabel(task.priority ?? 50)} ({task.priority ?? 50})
											</span>
										}
									/>

									{/* Category */}
									<MetadataItem
										icon={<Icon name="tag" size={14} />}
										label="Category"
										value={
											<span className={`px-2 py-0.5 rounded text-xs ${
												task.category === "active"
													? "bg-blue-500/10 text-blue-400"
													: "bg-gray-500/10 text-gray-400"
											}`}>
												{task.category === "active" ? "Active" : "Someday"}
											</span>
										}
									/>

									{/* Tags */}
									{task.tags && task.tags.length > 0 && (
										<MetadataItem
											icon={<Icon name="tag" size={14} />}
											label="Tags"
											value={
												<div className="flex flex-wrap gap-1">
													{task.tags.map((tag) => (
														<span
															key={tag}
															className={`px-2 py-0.5 rounded text-xs ${
																isDark
																	? "bg-gray-700 text-gray-300"
																	: "bg-gray-100 text-gray-700"
															}`}
														>
															{tag}
														</span>
													))}
												</div>
											}
										/>
									)}

									{/* Created date */}
									<MetadataItem
										icon={<Icon name="schedule" size={14} />}
										label="Created"
										value={formatDateTime(task.createdAt)}
									/>
								</div>

								{/* Activity Log */}
								<div>
									<h3 className={`text-sm font-semibold mb-3 flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
										<Icon name="schedule" size={14} />
										Activity Log
									</h3>
									<ActivityLog entries={activityLog} />
								</div>
							</>
						)}
					</div>

					{/* Footer Actions */}
					{task && (
						<div className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
							<div className="flex gap-2">
								{/* Start/Pause button */}
								{onStart && (
									<button
										type="button"
										onClick={handleStart}
										className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
									>
										<Icon name="play_arrow" size={16} />
										Start
									</button>
								)}

								<div className="flex-1" />

								{/* Edit button */}
								{onEdit && (
									<button
										type="button"
										onClick={handleEdit}
										className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
											isDark
												? "bg-gray-700 hover:bg-gray-600 text-gray-300"
												: "bg-gray-100 hover:bg-gray-200 text-gray-700"
										}`}
									>
										<Icon name="edit" size={16} />
										Edit
									</button>
								)}

								{/* Delete button */}
								{onDelete && (
									<button
										type="button"
										onClick={handleDelete}
										className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
											isDark
												? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
												: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
										}`}
									>
										<Icon name="delete" size={16} />
										Delete
									</button>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
}

// ─── Hook for managing drawer state ───────────────────────────────────────────

export function useTaskDrawer() {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [selectedTask, setSelectedTask] = useState<Task | null>(null);

	const openDrawer = useCallback((taskIdOrTask: string | Task) => {
		if (typeof taskIdOrTask === "string") {
			setSelectedTaskId(taskIdOrTask);
			setSelectedTask(null);
		} else {
			setSelectedTask(taskIdOrTask);
			setSelectedTaskId(null);
		}
		setIsOpen(true);
	}, []);

	const closeDrawer = useCallback(() => {
		setIsOpen(false);
		// Clear selection after animation
		setTimeout(() => {
			setSelectedTaskId(null);
			setSelectedTask(null);
		}, 300);
	}, []);

	return {
		isOpen,
		selectedTaskId,
		selectedTask,
		openDrawer,
		closeDrawer,
	};
}
