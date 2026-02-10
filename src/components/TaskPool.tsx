/**
 * TaskPool -- Unscheduled task pool component.
 *
 * Features:
 * - Display tasks without assigned time slots
 * - Drag source for timeline scheduling
 * - Filter by category (Active/Someday)
 * - Search by title/tags
 * - Sort options (priority, created, estimated)
 * - Task card with title, project badge, estimated pomodoros, priority, tags
 * - Click to view details (opens TaskDialog)
 * - Right-click context menu (Edit, Delete, Schedule now, Move to Someday)
 * - Real-time updates when tasks change
 * - Collapse/expand state in localStorage
 *
 * Issue #58
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task, Project } from "@/types/schedule";
import { TaskDialog } from "@/components/TaskDialog";
import {
	GripVertical,
	Search,
	Filter,
	ArrowUpDown,
	Circle,
	Hash,
	Target,
	Flag,
	MoreVertical,
	Pencil,
	Trash2,
	Calendar,
	Archive,
	ChevronDown,
	ChevronRight,
	FolderOpen,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface TaskPoolState {
	filterCategory: "all" | "active" | "someday";
	searchQuery: string;
	sortBy: "priority" | "created" | "estimated" | "title";
	sortOrder: "asc" | "desc";
	expanded: boolean;
}

interface TaskPoolProps {
	className?: string;
	theme?: "light" | "dark";
	onTaskDragStart?: (task: Task) => void;
	onTaskSelect?: (task: Task) => void;
}

interface ContextMenuState {
	visible: boolean;
	x: number;
	y: number;
	task: Task | null;
}

type SortOption = "priority" | "created" | "estimated" | "title";

// ─── Utilities ─────────────────────────────────────────────────────────────

function getProjectColor(name: string): string {
	const colors = [
		"#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
		"#3b82f6", "#8b5cf6", "#ec4899",
	];
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	const index = Math.abs(hash) % colors.length;
	return colors[index]!;
}

function getPriorityColor(priority?: number): string {
	if (priority === undefined) return "#6b7280";
	if (priority >= 75) return "#ef4444";
	if (priority >= 50) return "#f97316";
	if (priority >= 25) return "#eab308";
	return "#6b7280";
}

function getPriorityLabel(priority?: number): string {
	if (priority === undefined) return "None";
	if (priority >= 75) return "Urgent";
	if (priority >= 50) return "High";
	if (priority >= 25) return "Medium";
	return "Low";
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface TaskCardProps {
	task: Task;
	project?: Project;
	theme?: "light" | "dark";
	onEdit: (task: Task) => void;
	onDragStart?: (task: Task) => void;
	onContextMenu?: (e: React.MouseEvent, task: Task) => void;
}

function TaskCard({ task, project, theme = "dark", onEdit, onDragStart, onContextMenu }: TaskCardProps) {
	const handleDragStart = useCallback((e: React.DragEvent) => {
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("task_id", task.id);
		onDragStart?.(task);
	}, [task, onDragStart]);

	const isDark = theme === "dark";
	const priorityColor = getPriorityColor(task.priority);
	const projectColor = project ? getProjectColor(project.name) : undefined;

	return (
		<div
			draggable
			onDragStart={handleDragStart}
			onContextMenu={(e) => onContextMenu?.(e, task)}
			className={`group relative p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing hover:shadow-md ${
				isDark
					? "bg-gray-800/50 border-gray-700 hover:border-gray-600"
					: "bg-white border-gray-200 hover:border-gray-300"
			}`}
		>
			{/* Drag handle */}
			<div className="absolute top-2 left-2 opacity-0 group-hover:opacity-50 transition-opacity">
				<GripVertical size={14} className={isDark ? "text-gray-500" : "text-gray-400"} />
			</div>

			{/* Main content */}
			<div className="pl-5">
				{/* Header: Title + Actions */}
				<div className="flex items-start gap-2 mb-2">
					<h4
						className={`flex-1 text-sm font-medium line-clamp-2 cursor-pointer hover:underline ${
							isDark ? "text-gray-100" : "text-gray-900"
						}`}
						onClick={() => onEdit(task)}
					>
						{task.title}
					</h4>
					<button
						type="button"
						className={`shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
							isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
						}`}
						onClick={() => onEdit(task)}
						aria-label="Edit task"
					>
						<MoreVertical size={14} />
					</button>
				</div>

				{/* Metadata row */}
				<div className="flex items-center gap-2 flex-wrap">
					{/* Project badge */}
					{project && (
						<span
							className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
							style={{
								backgroundColor: projectColor ? `${projectColor}20` : undefined,
								color: projectColor || undefined,
							}}
						>
							<FolderOpen size={10} />
							{project.name}
						</span>
					)}

					{/* Estimated pomodoros */}
					<span className={`inline-flex items-center gap-1 text-xs ${
						isDark ? "text-gray-400" : "text-gray-500"
					}`}>
						<Target size={10} />
						{task.estimatedPomodoros}🍅
					</span>

					{/* Priority indicator */}
					<span
						className="inline-flex items-center gap-1 text-xs"
						style={{ color: priorityColor }}
					>
						<Flag size={10} />
						{getPriorityLabel(task.priority)}
					</span>

					{/* Completion status */}
					{task.completedPomodoros > 0 && (
						<span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
							{task.completedPomodoros}/{task.estimatedPomodoros}
						</span>
					)}
				</div>

				{/* Tags */}
				{task.tags.length > 0 && (
					<div className="flex items-center gap-1 flex-wrap mt-2">
						<Hash size={10} className={isDark ? "text-gray-500" : "text-gray-400"} />
						{task.tags.slice(0, 3).map((tag) => (
							<span
								key={tag}
								className={`px-1.5 py-0.5 rounded text-[10px] ${
									isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"
								}`}
							>
								{tag}
							</span>
						))}
						{task.tags.length > 3 && (
							<span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
								+{task.tags.length - 3}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

interface ContextMenuProps {
	visible: boolean;
	x: number;
	y: number;
	task: Task | null;
	onClose: () => void;
	onEdit: (task: Task) => void;
	onDelete: (taskId: string) => void;
	onSchedule: (task: Task) => void;
	onMoveToSomeday: (task: Task) => void;
	theme?: "light" | "dark";
}

function ContextMenu({
	visible,
	x,
	y,
	task,
	onClose,
	onEdit,
	onDelete,
	onSchedule,
	onMoveToSomeday,
	theme = "dark",
}: ContextMenuProps) {
	useEffect(() => {
		if (visible) {
			const handleClick = () => onClose();
			window.addEventListener("click", handleClick);
			return () => {
				window.removeEventListener("click", handleClick);
			};
		}
		return undefined;
	}, [visible, onClose]);

	if (!visible || !task) return null;

	const isDark = theme === "dark";

	return (
		<div
			className={`fixed z-[200] min-w-48 rounded-lg shadow-xl border py-1 ${
				isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
			}`}
			style={{ left: x, top: y }}
			onClick={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
					isDark ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-100 text-gray-700"
				}`}
				onClick={() => {
					onEdit(task);
					onClose();
				}}
			>
				<Pencil size={14} />
				Edit task
			</button>
			<button
				type="button"
				className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
					isDark ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-100 text-gray-700"
				}`}
				onClick={() => {
					onSchedule(task);
					onClose();
				}}
			>
				<Calendar size={14} />
				Schedule now
			</button>
			{task.category === "active" && (
				<button
					type="button"
					className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
						isDark ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-100 text-gray-700"
					}`}
					onClick={() => {
						onMoveToSomeday(task);
						onClose();
					}}
				>
					<Archive size={14} />
					Move to Someday
				</button>
			)}
			<div className={`h-px my-1 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />
			<button
				type="button"
				className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-red-500 transition-colors ${
					isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"
				}`}
				onClick={() => {
					onDelete(task.id);
					onClose();
				}}
			>
				<Trash2 size={14} />
				Delete task
			</button>
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

const STORAGE_KEY = "pomodoroom-task-pool-state";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
	{ value: "priority", label: "Priority" },
	{ value: "created", label: "Created" },
	{ value: "estimated", label: "Estimated" },
	{ value: "title", label: "Title" },
];

export default function TaskPool({
	className = "",
	theme = "dark",
	onTaskDragStart,
	onTaskSelect,
}: TaskPoolProps) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [projects, setProjects] = useState<Project[]>([]);
	const [state, setState] = useState<TaskPoolState>({
		filterCategory: "all",
		searchQuery: "",
		sortBy: "priority",
		sortOrder: "desc",
		expanded: true,
	});
	const [contextMenu, setContextMenu] = useState<ContextMenuState>({
		visible: false,
		x: 0,
		y: 0,
		task: null,
	});
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [taskDialogOpen, setTaskDialogOpen] = useState(false);

	// Load data from Tauri
	useEffect(() => {
		const loadData = async () => {
			try {
				const [projectsData, tasksData] = await Promise.all([
					invoke<Project[]>("cmd_project_list"),
					invoke<Task[]>("cmd_task_list"),
				]);
				setProjects(projectsData);
				setTasks(tasksData);
			} catch (error) {
				console.error("Failed to load task pool data:", error);
			}
		};
		loadData();
	}, []);

	// Load/save state to localStorage
	useEffect(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			try {
				setState((prev) => ({ ...prev, ...JSON.parse(saved) }));
			} catch {
				// Use default state
			}
		}
	}, []);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}, [state]);

	// Filter and sort tasks
	const filteredTasks = useMemo(() => {
		let result = [...tasks];

		// Filter by completed (show only incomplete tasks)
		result = result.filter((t) => !t.completed);

		// Filter by category
		if (state.filterCategory !== "all") {
			result = result.filter((t) => t.category === state.filterCategory);
		}

		// Filter by search query
		if (state.searchQuery.trim()) {
			const query = state.searchQuery.toLowerCase();
			result = result.filter(
				(t) =>
					t.title.toLowerCase().includes(query) ||
					t.tags.some((tag) => tag.toLowerCase().includes(query))
			);
		}

		// Sort
		result.sort((a, b) => {
			let comparison = 0;
			switch (state.sortBy) {
				case "priority":
					comparison = (a.priority ?? 0) - (b.priority ?? 0);
					break;
				case "created":
					comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
					break;
				case "estimated":
					comparison = a.estimatedPomodoros - b.estimatedPomodoros;
					break;
				case "title":
					comparison = a.title.localeCompare(b.title);
					break;
			}
			return state.sortOrder === "asc" ? comparison : -comparison;
		});

		return result;
	}, [tasks, state.filterCategory, state.searchQuery, state.sortBy, state.sortOrder]);

	// Project map for task cards
	const projectMap = useMemo(() => {
		const map = new Map<string, Project>();
		for (const project of projects) {
			map.set(project.id, project);
		}
		return map;
	}, [projects]);

	// Handlers
	const handleEditTask = useCallback((task: Task) => {
		setEditingTask(task);
		setTaskDialogOpen(true);
	}, []);

	const handleSaveTask = useCallback(async (updatedTask: Task) => {
		try {
			await invoke("cmd_task_update", {
				id: updatedTask.id,
				title: updatedTask.title,
				description: updatedTask.description,
				estimatedPomodoros: updatedTask.estimatedPomodoros,
				completedPomodoros: updatedTask.completedPomodoros,
				completed: updatedTask.completed,
				projectId: updatedTask.projectId,
				tags: updatedTask.tags,
				priority: updatedTask.priority,
				category: updatedTask.category,
			});
			// Reload tasks
			const tasksData = await invoke<Task[]>("cmd_task_list");
			setTasks(tasksData);
		} catch (error) {
			console.error("Failed to save task:", error);
		}
	}, []);

	const handleDeleteTask = useCallback(async (taskId: string) => {
		if (!confirm("Are you sure you want to delete this task?")) return;

		try {
			await invoke("cmd_task_delete", { id: taskId });
			setTasks((prev) => prev.filter((t) => t.id !== taskId));
		} catch (error) {
			console.error("Failed to delete task:", error);
		}
	}, []);

	const handleScheduleTask = useCallback((task: Task) => {
		// TODO: Open time picker for scheduling
		console.log("Schedule task:", task);
		onTaskSelect?.(task);
	}, [onTaskSelect]);

	const handleMoveToSomeday = useCallback(async (task: Task) => {
		if (task.category === "someday") return;

		try {
			await invoke("cmd_task_update", {
				id: task.id,
				title: task.title,
				description: task.description,
				estimatedPomodoros: task.estimatedPomodoros,
				completedPomodoros: task.completedPomodoros,
				completed: task.completed,
				projectId: task.projectId,
				tags: task.tags,
				priority: task.priority,
				category: "someday",
			});
			setTasks((prev) =>
				prev.map((t) => (t.id === task.id ? { ...t, category: "someday" } : t))
			);
		} catch (error) {
			console.error("Failed to move task to someday:", error);
		}
	}, []);

	const handleContextMenu = useCallback((e: React.MouseEvent, task: Task) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			visible: true,
			x: e.clientX,
			y: e.clientY,
			task,
		});
	}, []);

	const toggleSortOrder = useCallback(() => {
		setState((prev) => ({
			...prev,
			sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
		}));
	}, []);

	const isDark = theme === "dark";

	return (
		<div className={`flex flex-col ${className}`}>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
				<button
					type="button"
					className="flex items-center gap-1 text-xs font-bold tracking-widest uppercase text-(--color-text-primary)"
					onClick={() => setState((prev) => ({ ...prev, expanded: !prev.expanded }))}
				>
					{state.expanded ? (
						<ChevronDown size={14} className="text-(--color-text-muted)" />
					) : (
						<ChevronRight size={14} className="text-(--color-text-muted)" />
					)}
					Task Pool
					<span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
						isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
					}`}>
						{filteredTasks.length}
					</span>
				</button>
			</div>

			{/* Filters and search */}
			{state.expanded && (
				<>
					<div className="p-2 space-y-2 border-b border-(--color-border)">
						{/* Search input */}
						<div className="relative">
							<Search
								size={14}
								className={`absolute left-2 top-1/2 -translate-y-1/2 ${
									isDark ? "text-gray-500" : "text-gray-400"
								}`}
							/>
							<input
								type="text"
								value={state.searchQuery}
								onChange={(e) =>
									setState((prev) => ({ ...prev, searchQuery: e.target.value }))
								}
								placeholder="Search tasks..."
								className={`w-full pl-8 pr-3 py-1.5 text-sm rounded-md border ${
									isDark
										? "bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-500 focus:border-blue-500"
										: "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
								} focus:outline-none focus:ring-1 focus:ring-blue-500`}
							/>
						</div>

						{/* Filter and sort controls */}
						<div className="flex items-center gap-2">
							{/* Category filter */}
							<div className="relative">
								<Filter
									size={14}
									className={`absolute left-2 top-1/2 -translate-y-1/2 ${
										isDark ? "text-gray-500" : "text-gray-400"
									}`}
								/>
								<select
									value={state.filterCategory}
									onChange={(e) =>
										setState((prev) => ({
											...prev,
											filterCategory: e.target.value as TaskPoolState["filterCategory"],
										}))
									}
									className={`pl-8 pr-6 py-1.5 text-sm rounded-md border appearance-none cursor-pointer ${
										isDark
											? "bg-gray-800 border-gray-700 text-gray-100 focus:border-blue-500"
											: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
									} focus:outline-none focus:ring-1 focus:ring-blue-500`}
								>
									<option value="all">All tasks</option>
									<option value="active">Active</option>
									<option value="someday">Someday</option>
								</select>
							</div>

							{/* Sort selector */}
							<div className="flex-1 flex items-center gap-1">
								<select
									value={state.sortBy}
									onChange={(e) =>
										setState((prev) => ({
											...prev,
											sortBy: e.target.value as SortOption,
										}))
									}
									className={`flex-1 px-2 py-1.5 text-sm rounded-md border appearance-none cursor-pointer ${
										isDark
											? "bg-gray-800 border-gray-700 text-gray-100 focus:border-blue-500"
											: "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
									} focus:outline-none focus:ring-1 focus:ring-blue-500`}
								>
									{SORT_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
								<button
									type="button"
									onClick={toggleSortOrder}
									className={`p-1.5 rounded-md border ${
										isDark
											? "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
											: "bg-white border-gray-300 text-gray-500 hover:text-gray-700"
									} transition-colors`}
									title={`Sort ${state.sortOrder === "asc" ? "ascending" : "descending"}`}
								>
									<ArrowUpDown size={14} />
								</button>
							</div>
						</div>
					</div>

					{/* Task list */}
					<div className="flex-1 overflow-y-auto p-2 space-y-2">
						{filteredTasks.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-8 text-(--color-text-muted)">
								<Circle size={32} className="mb-2 opacity-40" />
								<span className="text-sm">No unscheduled tasks</span>
								<span className="text-xs mt-1">Tasks will appear here when created</span>
							</div>
						) : (
							filteredTasks.map((task) => (
								<TaskCard
									key={task.id}
									task={task}
									project={task.projectId ? projectMap.get(task.projectId) : undefined}
									theme={theme}
									onEdit={handleEditTask}
									onDragStart={onTaskDragStart}
									onContextMenu={handleContextMenu}
								/>
							))
						)}
					</div>
				</>
			)}

			{/* Context menu */}
			<ContextMenu
				visible={contextMenu.visible}
				x={contextMenu.x}
				y={contextMenu.y}
				task={contextMenu.task}
				onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
				onEdit={handleEditTask}
				onDelete={handleDeleteTask}
				onSchedule={handleScheduleTask}
				onMoveToSomeday={handleMoveToSomeday}
				theme={theme}
			/>

			{/* Task dialog */}
			<TaskDialog
				isOpen={taskDialogOpen}
				onClose={() => {
					setTaskDialogOpen(false);
					setEditingTask(null);
				}}
				onSave={handleSaveTask}
				task={editingTask}
				theme={theme}
			/>
		</div>
	);
}
