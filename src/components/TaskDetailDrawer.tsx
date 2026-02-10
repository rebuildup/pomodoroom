/**
 * TaskDetailDrawer — Slide-out drawer for viewing task details.
 *
 * Features:
 * - Slide-in animation from right
 * - Close on backdrop click, ESC key, or close button
 * - Mobile responsive (full screen on mobile, fixed width on desktop)
 * - Read-only view with edit button to open TaskDialog
 * - Displays: title, description, tags, project, pomodoros, timestamps, history
 *
 * Usage:
 * ```tsx
 * <TaskDetailDrawer
 *   isOpen={isDrawerOpen}
 *   onClose={() => setIsDrawerOpen(false)}
 *   task={selectedTask}
 *   projects={projects}
 *   onEdit={() => { setIsDrawerOpen(false); setIsDialogOpen(true); }}
 *   theme={theme}
 * />
 * ```
 */
import { useState, useEffect } from "react";
import {
	X,
	Edit3,
	Clock,
	Calendar,
	Hash,
	Target,
	FolderOpen,
	CheckCircle2,
	Circle,
	CircleDot,
	Archive,
	AlertCircle,
	History,
} from "lucide-react";
import type { Project } from "@/types";
import type { Task as TaskType } from "@/types/schedule";
import type { TaskStreamItem } from "@/types/taskstream";

// ─── Types ────────────────────────────────────────────────────────────────────────

interface TaskDetailDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	task?: TaskType | TaskStreamItem | null;
	projects?: Project[];
	onEdit?: () => void;
	theme: "light" | "dark";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function getTaskStatusIcon(task: TaskType | TaskStreamItem): React.ReactNode {
	if ("completedPomodoros" in task) {
		// Task type
		if (task.completed) {
			return <CheckCircle2 size={16} className="text-(--color-text-muted)" />;
		}
		if (task.completedPomodoros > 0) {
			return <CircleDot size={16} className="text-(--color-text-primary)" />;
		}
		return <Circle size={16} className="text-(--color-text-muted)" />;
	}
	// TaskStreamItem type
	switch (task.status) {
		case "doing":
			return <CircleDot size={16} className="text-(--color-text-primary)" />;
		case "log":
			return <CheckCircle2 size={16} className="text-(--color-text-muted)" />;
		case "interrupted":
			return <AlertCircle size={16} className="text-(--color-accent-primary)" />;
		case "defer":
		case "routine":
			return <Archive size={16} className="text-(--color-text-secondary)" />;
		default:
			return <Circle size={16} className="text-(--color-text-muted)" />;
	}
}

function getTaskStatusText(task: TaskType | TaskStreamItem): string {
	if ("completedPomodoros" in task) {
		if (task.completed) return "Completed";
		if (task.completedPomodoros > 0) return "In Progress";
		return "Not Started";
	}
	switch (task.status) {
		case "plan":
			return "Planned";
		case "doing":
			return "In Progress";
		case "log":
			return "Completed";
		case "interrupted":
			return "Interrupted";
		case "defer":
			return "Deferred";
		case "routine":
			return "Routine";
		default:
			return "Unknown";
	}
}

// ─── Sub-components ───────────────────────────────────────────────────────────────

interface InfoItemProps {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	className?: string;
}

function InfoItem({ icon, label, value, className = "" }: InfoItemProps) {
	return (
		<div className={`flex items-start gap-2 text-sm ${className}`}>
			<div className="shrink-0 mt-0.5 text-(--color-text-muted)">
				{icon}
			</div>
			<div className="flex-1 min-w-0">
				<div className="text-[11px] text-(--color-text-muted) uppercase tracking-wide">
					{label}
				</div>
				<div className="text-(--color-text-secondary) break-words">
					{value}
				</div>
			</div>
		</div>
	);
}

interface HistoryEntryProps {
	timestamp: string;
	action: string;
	className?: string;
}

function HistoryEntry({ timestamp, action, className = "" }: HistoryEntryProps) {
	return (
		<div className={`flex items-start gap-2 text-xs ${className}`}>
			<span className="shrink-0 text-(--color-text-muted) font-mono tabular-nums">
				{formatDate(timestamp)}
			</span>
			<span className="flex-1 text-(--color-text-secondary)">
				{action}
			</span>
		</div>
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────────

export function TaskDetailDrawer({
	isOpen,
	onClose,
	task,
	projects = [],
	onEdit,
	theme,
}: TaskDetailDrawerProps) {
	const [isMobile, setIsMobile] = useState(false);

	// Detect mobile viewport
	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 640);
		checkMobile();
		window.addEventListener("resize", checkMobile);
		return () => window.removeEventListener("resize", checkMobile);
	}, []);

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

	// Prevent body scroll when drawer is open
	useEffect(() => {
		if (!isOpen) return;

		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = "";
		};
	}, [isOpen]);

	if (!isOpen || !task) {
		return null;
	}

	const isDark = theme === "dark";

	// Get project name
	const projectName = task.projectId
		? projects.find((p) => p.id === task.projectId)?.name
		: null;

	// Generate history entries
	const historyEntries: Array<{ timestamp: string; action: string }> = [];

	if ("createdAt" in task) {
		historyEntries.push({
			timestamp: task.createdAt,
			action: "Task created",
		});
	}

	if ("startedAt" in task && task.startedAt) {
		historyEntries.push({
			timestamp: task.startedAt,
			action: "Started working",
		});
	}

	if ("completedAt" in task && task.completedAt) {
		historyEntries.push({
			timestamp: task.completedAt,
			action: "Completed",
		});
	}

	// Sort by timestamp (newest first)
	historyEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

	// Pomodoro info
	const pomodoroInfo = "estimatedPomodoros" in task
		? `${task.completedPomodoros} / ${task.estimatedPomodoros} pomodoros`
		: "estimatedMinutes" in task
			? `Estimated: ${formatMinutes(task.estimatedMinutes)}`
			: null;

	const actualTime = "actualMinutes" in task && task.actualMinutes > 0
		? `Actual: ${formatMinutes(task.actualMinutes)}`
		: null;

	return (
		<>
			{/* Backdrop */}
			<div
				className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
					isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
				}`}
				onClick={onClose}
			/>

			{/* Drawer */}
			<div
				className={`fixed z-[101] top-0 bottom-0 right-0 shadow-2xl transition-transform duration-300 ease-out ${
					isMobile ? "w-full" : "w-[400px]"
				} ${isOpen ? "translate-x-0" : "translate-x-full"} ${
					isDark
						? "bg-gray-900 border-l border-gray-700"
						: "bg-white border-l border-gray-200"
				}`}
			>
				<div className="flex flex-col h-full">
					{/* Header */}
					<div
						className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
							isDark ? "border-gray-700" : "border-gray-200"
						}`}
					>
						<div className="flex items-center gap-2 flex-1 min-w-0">
							{getTaskStatusIcon(task)}
							<span
								className={`text-xs font-medium uppercase tracking-wide ${
									isDark ? "text-gray-400" : "text-gray-500"
								}`}
							>
								{getTaskStatusText(task)}
							</span>
						</div>
						<div className="flex items-center gap-1">
							{onEdit && (
								<button
									type="button"
									onClick={onEdit}
									className={`p-2 rounded-lg transition-colors ${
										isDark
											? "hover:bg-gray-800 text-gray-400 hover:text-white"
											: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
									}`}
									aria-label="Edit task"
								>
									<Edit3 size={16} />
								</button>
							)}
							<button
								type="button"
								onClick={onClose}
								className={`p-2 rounded-lg transition-colors ${
									isDark
										? "hover:bg-gray-800 text-gray-400 hover:text-white"
										: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
								}`}
								aria-label="Close"
							>
								<X size={16} />
							</button>
						</div>
					</div>

					{/* Content */}
					<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
						{/* Title */}
						<div>
							<h2
								className={`text-lg font-semibold ${
									isDark ? "text-white" : "text-gray-900"
								}`}
							>
								{task.title}
							</h2>
						</div>

						{/* Description / Markdown */}
						{"description" in task && task.description && (
							<div>
								<h3
									className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
										isDark ? "text-gray-400" : "text-gray-500"
									}`}
								>
									Description
								</h3>
								<div
									className={`text-sm whitespace-pre-wrap break-words ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									{task.description}
								</div>
							</div>
						)}

						{"markdown" in task && task.markdown && (
							<div>
								<h3
									className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
										isDark ? "text-gray-400" : "text-gray-500"
									}`}
								>
									Notes
								</h3>
								<div
									className={`text-sm whitespace-pre-wrap break-words ${
										isDark ? "text-gray-300" : "text-gray-700"
									}`}
								>
									{task.markdown}
								</div>
							</div>
						)}

						{/* Info Grid */}
						<div className="grid grid-cols-1 gap-3">
							{/* Project */}
							{projectName && (
								<InfoItem
									icon={<FolderOpen size={14} />}
									label="Project"
									value={projectName}
								/>
							)}

							{/* Pomodoros / Time */}
							{pomodoroInfo && (
								<InfoItem
									icon={<Target size={14} />}
									label="Progress"
									value={
										<div className="flex flex-col gap-0.5">
											<span>{pomodoroInfo}</span>
											{actualTime && (
												<span className="text-xs text-(--color-text-muted)">
													{actualTime}
												</span>
											)}
										</div>
									}
								/>
							)}

							{/* Tags */}
							{"tags" in task && task.tags && task.tags.length > 0 && (
								<InfoItem
									icon={<Hash size={14} />}
									label="Tags"
									value={
										<div className="flex flex-wrap gap-1">
											{task.tags.map((tag) => (
												<span
													key={tag}
													className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
														isDark
															? "bg-gray-800 text-gray-300"
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

							{/* Priority (Task type only) */}
							{"priority" in task && task.priority !== undefined && (
								<InfoItem
									icon={<AlertCircle size={14} />}
									label="Priority"
									value={
										<div className="flex items-center gap-2">
											<div
												className={`h-1.5 w-20 rounded-full ${
													task.priority >= 80
														? "bg-red-500"
														: task.priority >= 50
															? "bg-yellow-500"
															: task.priority >= 20
																? "bg-blue-500"
																: "bg-gray-500"
												}`}
											/>
											<span className="text-xs">{task.priority}</span>
										</div>
									}
								/>
							)}

							{/* Created At */}
							{"createdAt" in task && (
								<InfoItem
									icon={<Calendar size={14} />}
									label="Created"
									value={formatDate(task.createdAt)}
								/>
							)}
						</div>

						{/* History */}
						{historyEntries.length > 0 && (
							<div>
								<h3
									className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${
										isDark ? "text-gray-400" : "text-gray-500"
									}`}
								>
									<History size={14} />
									History
								</h3>
								<div className="space-y-1.5">
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

						{/* Interrupt count (TaskStreamItem only) */}
						{"interruptCount" in task && task.interruptCount > 0 && (
							<InfoItem
								icon={<AlertCircle size={14} />}
								label="Interrupted"
								value={`${task.interruptCount} time${task.interruptCount > 1 ? "s" : ""}`}
							/>
						)}

						{/* Category (Task type only) */}
						{"category" in task && (
							<InfoItem
								icon={<Circle size={14} />}
								label="Category"
								value={
									task.category === "active" ? "Active Tasks" : "Someday / Maybe"
								}
							/>
						)}

						{/* Routine days (TaskStreamItem only) */}
						{"routineDays" in task && task.routineDays && task.routineDays.length > 0 && (
							<InfoItem
								icon={<Clock size={14} />}
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

					{/* Footer */}
					<div
						className={`flex items-center justify-between px-4 py-3 border-t shrink-0 ${
							isDark ? "border-gray-700" : "border-gray-200"
						}`}
					>
						<span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
							{task.id}
						</span>
						{onEdit && (
							<button
								type="button"
								onClick={onEdit}
								className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
							>
								Edit Task
							</button>
						)}
					</div>
				</div>
			</div>
		</>
	);
}

export default TaskDetailDrawer;
