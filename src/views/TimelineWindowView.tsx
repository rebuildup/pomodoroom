/**
 * TimelineWindowView -- Standalone timeline window.
 *
 * Shows daily timeline with tasks, events, and time gaps.
 * Integrates with Rust backend for gap detection and task proposals.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useTimeline } from "@/hooks/useTimeline";
import TitleBar from "@/components/TitleBar";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskProposalCard } from "@/components/TaskProposalCard";
import type { PomodoroSettings, TimelineItem, TaskProposal, TimeGap } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
	Calendar,
	ChevronLeft,
	ChevronRight,
	RefreshCw,
	Plus,
	Clock,
	CheckCircle2,
	AlertTriangle,
	Trash2,
	Edit3,
	Play,
} from "lucide-react";

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Format time to HH:mm
const formatTime = (date: Date): string => {
	return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
};

// Format duration in minutes
const formatDuration = (minutes: number): string => {
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${minutes}m`;
};

// Get priority color
const getPriorityColor = (priority: number | undefined): string => {
	if (!priority) return "bg-gray-400";
	if (priority >= 80) return "bg-red-500";
	if (priority >= 60) return "bg-orange-500";
	if (priority >= 40) return "bg-yellow-500";
	return "bg-green-500";
};

// Timeline item card component
function TimelineItemCard({
	item,
	theme,
	onEdit,
	onDelete,
	onStart,
}: {
	item: TimelineItem;
	theme: "light" | "dark";
	onEdit: () => void;
	onDelete: () => void;
	onStart: () => void;
}) {
	const isDark = theme === "dark";
	const startTime = new Date(item.startTime);
	const endTime = new Date(item.endTime);
	const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

	return (
		<div
			className={`group relative rounded-lg border p-3 transition-all ${
				item.completed
					? isDark
						? "bg-green-900/20 border-green-700/50 opacity-60"
						: "bg-green-50 border-green-200 opacity-60"
					: isDark
						? "bg-gray-800 border-gray-700 hover:border-gray-600"
						: "bg-white border-gray-200 hover:border-gray-300"
			}`}
		>
			{/* Priority indicator */}
			<div
				className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${getPriorityColor(
					item.priority
				)}`}
			/>

			<div className="pl-2">
				{/* Header */}
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 min-w-0">
						<h4
							className={`font-medium truncate ${
								item.completed ? "line-through" : ""
							} ${isDark ? "text-white" : "text-gray-900"}`}
						>
							{item.title}
						</h4>
						{item.description && (
							<p
								className={`text-sm truncate mt-0.5 ${
									isDark ? "text-gray-400" : "text-gray-500"
								}`}
							>
								{item.description}
							</p>
						)}
					</div>

					{/* Actions */}
					<div
						className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
							isDark ? "text-gray-400" : "text-gray-500"
						}`}
					>
						<button
							type="button"
							onClick={onStart}
							className={`p-1 rounded hover:bg-green-500/20 hover:text-green-500 transition-colors`}
							title="Start timer"
						>
							<Play size={14} />
						</button>
						<button
							type="button"
							onClick={onEdit}
							className={`p-1 rounded ${
								isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"
							} transition-colors`}
							title="Edit"
						>
							<Edit3 size={14} />
						</button>
						<button
							type="button"
							onClick={onDelete}
							className={`p-1 rounded hover:bg-red-500/20 hover:text-red-500 transition-colors`}
							title="Delete"
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>

				{/* Meta info */}
				<div
					className={`flex items-center gap-3 mt-2 text-xs ${
						isDark ? "text-gray-500" : "text-gray-400"
					}`}
				>
					<span className="flex items-center gap-1">
						<Clock size={12} />
						{formatTime(startTime)} - {formatTime(endTime)}
					</span>
					<span>{formatDuration(duration)}</span>
					{item.completed && (
						<span className="flex items-center gap-1 text-green-500">
							<CheckCircle2 size={12} />
							Done
						</span>
					)}
					{item.deadline && new Date(item.deadline) < new Date() && !item.completed && (
						<span className="flex items-center gap-1 text-red-500">
							<AlertTriangle size={12} />
							Overdue
						</span>
					)}
				</div>

				{/* Tags */}
				{item.tags && item.tags.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-2">
						{item.tags.map((tag) => (
							<span
								key={tag}
								className={`px-1.5 py-0.5 rounded text-xs ${
									isDark
										? "bg-gray-700 text-gray-300"
										: "bg-gray-100 text-gray-600"
								}`}
							>
								{tag}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// Time gap indicator component
function TimeGapCard({
	gap,
	theme,
	onFill,
}: {
	gap: TimeGap;
	theme: "light" | "dark";
	onFill: () => void;
}) {
	const isDark = theme === "dark";
	const startTime = new Date(gap.startTime);
	const endTime = new Date(gap.endTime);

	const sizeColor =
		gap.size === "large"
			? isDark
				? "border-blue-500/50 bg-blue-500/10"
				: "border-blue-400/50 bg-blue-50"
			: gap.size === "medium"
				? isDark
					? "border-yellow-500/50 bg-yellow-500/10"
					: "border-yellow-400/50 bg-yellow-50"
				: isDark
					? "border-gray-600 bg-gray-800/50"
					: "border-gray-300 bg-gray-50";

	return (
		<button
			type="button"
			onClick={onFill}
			className={`w-full rounded-lg border-2 border-dashed p-3 text-left transition-all hover:opacity-80 ${sizeColor}`}
		>
			<div className="flex items-center justify-between">
				<div>
					<div
						className={`text-sm font-medium ${
							isDark ? "text-gray-300" : "text-gray-700"
						}`}
					>
						Free time slot
					</div>
					<div
						className={`text-xs mt-0.5 ${
							isDark ? "text-gray-500" : "text-gray-400"
						}`}
					>
						{formatTime(startTime)} - {formatTime(endTime)} ({formatDuration(gap.duration)})
					</div>
				</div>
				<Plus
					size={16}
					className={isDark ? "text-gray-400" : "text-gray-500"}
				/>
			</div>
		</button>
	);
}

export default function TimelineWindowView() {
	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);
	const theme = settings.theme;

	// State
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [isLoading, setIsLoading] = useState(false);
	const [items, setItems] = useLocalStorage<TimelineItem[]>("pomodoroom-timeline-items", []);
	const [gaps, setGaps] = useState<TimeGap[]>([]);
	const [topProposal, setTopProposal] = useState<TaskProposal | null>(null);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<TimelineItem | null>(null);

	// Hooks
	const { handleRightDown } = useRightClickDrag();
	const timeline = useTimeline();

	// Check if selected date is today
	const isToday = useMemo(() => {
		const today = new Date();
		return (
			selectedDate.getDate() === today.getDate() &&
			selectedDate.getMonth() === today.getMonth() &&
			selectedDate.getFullYear() === today.getFullYear()
		);
	}, [selectedDate]);

	// Format date for display
	const formatDate = (date: Date): string => {
		const options: Intl.DateTimeFormatOptions = {
			weekday: "short",
			month: "short",
			day: "numeric",
		};
		return date.toLocaleDateString("ja-JP", options);
	};

	// Filter items by selected date
	const filteredItems = useMemo(() => {
		return items.filter((item) => {
			const itemDate = new Date(item.startTime);
			return (
				itemDate.getDate() === selectedDate.getDate() &&
				itemDate.getMonth() === selectedDate.getMonth() &&
				itemDate.getFullYear() === selectedDate.getFullYear()
			);
		}).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
	}, [items, selectedDate]);

	// Navigate dates
	const goToPreviousDay = () => {
		const newDate = new Date(selectedDate);
		newDate.setDate(newDate.getDate() - 1);
		setSelectedDate(newDate);
	};

	const goToNextDay = () => {
		const newDate = new Date(selectedDate);
		newDate.setDate(newDate.getDate() + 1);
		setSelectedDate(newDate);
	};

	const goToToday = () => {
		setSelectedDate(new Date());
	};

	// Refresh timeline data
	const refreshTimeline = useCallback(async () => {
		setIsLoading(true);
		try {
			// Get time gaps from the backend
			const events = filteredItems.map((item) => ({
				start_time: item.startTime,
				end_time: item.endTime,
			}));
			const detectedGaps = await timeline.detectGaps(events);
			setGaps(detectedGaps);

			// Get top proposal
			const proposal = await timeline.getTopProposal();
			setTopProposal(proposal);
		} catch (error) {
			console.error("Failed to refresh timeline:", error);
		} finally {
			setIsLoading(false);
		}
	}, [filteredItems, timeline]);

	// Initial load and reload on date/items change
	useEffect(() => {
		refreshTimeline();
	}, [filteredItems.length, selectedDate]);

	// Handle task CRUD
	const handleAddTask = useCallback(
		(taskData: Omit<TimelineItem, "id">) => {
			const newTask: TimelineItem = {
				...taskData,
				id: generateId(),
			};
			setItems((prev) => [...prev, newTask]);
			refreshTimeline();
		},
		[setItems, refreshTimeline]
	);

	const handleEditTask = useCallback(
		(taskData: Omit<TimelineItem, "id">) => {
			if (!editingTask) return;
			setItems((prev) =>
				prev.map((item) =>
					item.id === editingTask.id ? { ...taskData, id: item.id } : item
				)
			);
			setEditingTask(null);
			refreshTimeline();
		},
		[editingTask, setItems, refreshTimeline]
	);

	const handleDeleteTask = useCallback(
		(taskId: string) => {
			setItems((prev) => prev.filter((item) => item.id !== taskId));
			refreshTimeline();
		},
		[setItems, refreshTimeline]
	);

	const handleStartTimer = useCallback((task: TimelineItem) => {
		console.log("Starting timer for task:", task.title);
		// Could invoke timer start here
	}, []);

	// Handle proposal actions
	const handleAcceptProposal = useCallback(() => {
		if (topProposal) {
			console.log("Accepted proposal:", topProposal.task.title);
			setTopProposal(null);
		}
	}, [topProposal]);

	const handleRejectProposal = useCallback(() => {
		if (topProposal) {
			console.log("Rejected proposal:", topProposal.task.title);
			setTopProposal(null);
		}
	}, [topProposal]);

	const handleSnoozeProposal = useCallback(() => {
		if (topProposal) {
			console.log("Snoozed proposal:", topProposal.task.title);
			setTopProposal(null);
		}
	}, [topProposal]);

	// Handle gap fill
	const handleFillGap = useCallback((gap: TimeGap) => {
		setEditingTask(null);
		// Pre-fill the dialog with gap times
		const prefilledTask: TimelineItem = {
			id: "",
			type: "task",
			source: "manual",
			title: "",
			startTime: gap.startTime,
			endTime: gap.endTime,
		};
		setEditingTask(prefilledTask);
		setIsDialogOpen(true);
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			if (isDialogOpen) return;

			if (e.key === "Escape") {
				getCurrentWindow().close();
				return;
			}

			if (e.key === "ArrowLeft") {
				goToPreviousDay();
			} else if (e.key === "ArrowRight") {
				goToNextDay();
			} else if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
				goToToday();
			} else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
				refreshTimeline();
			} else if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
				setEditingTask(null);
				setIsDialogOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedDate, isDialogOpen, refreshTimeline]);

	const isDark = theme === "dark";

	return (
		<div
			className={`w-screen h-screen flex flex-col overflow-hidden select-none ${
				isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar theme={theme} title="Timeline" showMinMax={false} />

			{/* Header with date navigation */}
			<div
				className={`flex items-center justify-between px-4 py-3 border-b ${
					isDark ? "border-gray-700" : "border-gray-200"
				}`}
			>
				{/* Date navigation */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={goToPreviousDay}
						className={`p-1.5 rounded-lg transition-colors ${
							isDark
								? "hover:bg-gray-800 text-gray-400 hover:text-white"
								: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
						}`}
						title="Previous day (←)"
					>
						<ChevronLeft size={20} />
					</button>

					<button
						type="button"
						onClick={goToToday}
						className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors ${
							isToday
								? isDark
									? "bg-blue-600 text-white"
									: "bg-blue-500 text-white"
								: isDark
									? "hover:bg-gray-800 text-gray-300"
									: "hover:bg-gray-100 text-gray-700"
						}`}
						title="Go to today (T)"
					>
						<Calendar size={16} />
						<span>{formatDate(selectedDate)}</span>
					</button>

					<button
						type="button"
						onClick={goToNextDay}
						className={`p-1.5 rounded-lg transition-colors ${
							isDark
								? "hover:bg-gray-800 text-gray-400 hover:text-white"
								: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
						}`}
						title="Next day (→)"
					>
						<ChevronRight size={20} />
					</button>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={refreshTimeline}
						disabled={isLoading}
						className={`p-1.5 rounded-lg transition-colors ${
							isDark
								? "hover:bg-gray-800 text-gray-400 hover:text-white"
								: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
						} ${isLoading ? "animate-spin" : ""}`}
						title="Refresh (R)"
					>
						<RefreshCw size={18} />
					</button>

					<button
						type="button"
						onClick={() => {
							setEditingTask(null);
							setIsDialogOpen(true);
						}}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
							isDark
								? "bg-blue-600 hover:bg-blue-700 text-white"
								: "bg-blue-500 hover:bg-blue-600 text-white"
						}`}
						title="Add task (N)"
					>
						<Plus size={16} />
						<span className="text-sm">Add</span>
					</button>
				</div>
			</div>

			{/* Main content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-3">
				{filteredItems.length === 0 && gaps.length === 0 ? (
					/* Empty state */
					<div className="h-full flex flex-col items-center justify-center px-6">
						<div
							className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
								isDark ? "bg-gray-800" : "bg-gray-100"
							}`}
						>
							<Calendar
								size={32}
								className={isDark ? "text-gray-600" : "text-gray-400"}
							/>
						</div>
						<h3
							className={`text-lg font-medium mb-2 ${
								isDark ? "text-gray-300" : "text-gray-700"
							}`}
						>
							No tasks today
						</h3>
						<p
							className={`text-sm text-center max-w-xs mb-4 ${
								isDark ? "text-gray-500" : "text-gray-500"
							}`}
						>
							Your timeline is clear. Add tasks to plan your day.
						</p>
						<button
							type="button"
							onClick={() => {
								setEditingTask(null);
								setIsDialogOpen(true);
							}}
							className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
						>
							<Plus size={18} />
							Add your first task
						</button>
					</div>
				) : (
					/* Task list with gaps */
					<>
						{/* Stats summary */}
						<div
							className={`flex items-center justify-between px-3 py-2 rounded-lg ${
								isDark ? "bg-gray-800" : "bg-gray-50"
							}`}
						>
							<div className="flex items-center gap-4 text-sm">
								<span className={isDark ? "text-gray-400" : "text-gray-500"}>
									{filteredItems.length} tasks
								</span>
								<span className={isDark ? "text-gray-400" : "text-gray-500"}>
									{filteredItems.filter((i) => i.completed).length} completed
								</span>
								{gaps.length > 0 && (
									<span className="text-blue-500">
										{gaps.length} free slots
									</span>
								)}
							</div>
						</div>

						{/* Items and gaps */}
						{filteredItems.map((item) => (
							<TimelineItemCard
								key={item.id}
								item={item}
								theme={theme}
								onEdit={() => {
									setEditingTask(item);
									setIsDialogOpen(true);
								}}
								onDelete={() => handleDeleteTask(item.id)}
								onStart={() => handleStartTimer(item)}
							/>
						))}

						{/* Gaps */}
						{gaps.length > 0 && (
							<div className="mt-4 pt-4 border-t border-dashed border-gray-600">
								<h3
									className={`text-sm font-medium mb-2 ${
										isDark ? "text-gray-400" : "text-gray-500"
									}`}
								>
									Available time slots
								</h3>
								<div className="space-y-2">
									{gaps.map((gap, index) => (
										<TimeGapCard
											key={`${gap.startTime}-${index}`}
											gap={gap}
											theme={theme}
											onFill={() => handleFillGap(gap)}
										/>
									))}
								</div>
							</div>
						)}
					</>
				)}
			</div>

			{/* Task proposal overlay */}
			{topProposal && !isDialogOpen && (
				<div className="absolute bottom-4 left-4 right-4 z-50">
					<TaskProposalCard
						proposal={topProposal}
						onAccept={handleAcceptProposal}
						onReject={handleRejectProposal}
						onSnooze={handleSnoozeProposal}
					/>
				</div>
			)}

			{/* Task dialog */}
			<TaskDialog
				isOpen={isDialogOpen}
				onClose={() => {
					setIsDialogOpen(false);
					setEditingTask(null);
				}}
				onSave={editingTask?.id ? handleEditTask : handleAddTask}
				task={editingTask}
				theme={theme}
			/>

			{/* Loading overlay */}
			{isLoading && (
				<div className="absolute inset-0 bg-black/20 flex items-center justify-center z-40 pointer-events-none">
					<div
						className={`px-4 py-2 rounded-lg ${
							isDark ? "bg-gray-800" : "bg-white"
						} shadow-lg`}
					>
						<RefreshCw size={20} className="animate-spin" />
					</div>
				</div>
			)}

			{/* Keyboard shortcuts hint */}
			<div
				className={`absolute bottom-2 right-4 text-xs ${
					isDark ? "text-gray-600" : "text-gray-400"
				}`}
			>
				← → Navigate • T Today • N New • R Refresh
			</div>
		</div>
	);
}
