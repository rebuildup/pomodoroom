/**
 * BacklogPanel — Backlog panel (projects + someday list).
 *
 * Project task progress display + someday list.
 * Issue #88
 */
import { useState, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Task, Project } from "@/types/schedule";
import {
	ChevronDown,
	ChevronRight,
	Folder,
	Calendar,
	GripVertical,
	Circle,
	CheckCircle2,
	Inbox,
	Plus,
	Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface BacklogState {
	expandedProjects: string[];
	activeTab: "projects" | "someday";
}

// ─── Utilities ─────────────────────────────────────────────────────────────

// Generate consistent color for project based on name
function getProjectColor(name: string): string {
	const colors = [
		"#ef4444", // red
		"#f97316", // orange
		"#eab308", // yellow
		"#22c55e", // green
		"#14b8a6", // teal
		"#3b82f6", // blue
		"#8b5cf6", // violet
		"#ec4899", // pink
	];
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	const index = Math.abs(hash) % colors.length;
	return colors[index]!;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ completed, total, color }: { completed: number; total: number; color?: string }) {
	const pct = total > 0 ? (completed / total) * 100 : 0;
	return (
		<div className="flex items-center gap-2 w-full">
			<div className="flex-1 h-1 bg-(--color-border) overflow-hidden">
				<div
					className="h-full transition-all"
					style={{ width: `${pct}%`, backgroundColor: color || "var(--color-text-primary)" }}
				/>
			</div>
			<span className="text-[10px] font-mono text-(--color-text-muted) shrink-0 tabular-nums">
				{completed}/{total}
			</span>
		</div>
	);
}

function TaskRow({
	task,
	onToggle,
	onEdit,
	onDelete,
}: {
	task: Task;
	onToggle?: (taskId: string) => void;
	onEdit?: (task: Task) => void;
	onDelete?: (taskId: string) => void;
}) {
	const pomodoroProgress = task.estimatedPomodoros > 0
		? `${task.completedPomodoros}/${task.estimatedPomodoros}`
		: "";

	return (
		<div className="group flex items-center gap-2 py-1.5 px-2 hover:bg-(--color-border) transition-colors">
			{/* Drag handle (visual only for now) */}
			<GripVertical
				size={12}
				className="shrink-0 opacity-0 group-hover:opacity-40 text-(--color-text-muted) cursor-grab"
			/>

			{/* Completion toggle */}
			<button
				type="button"
				className="shrink-0"
				onClick={() => onToggle?.(task.id)}
			>
				{task.completed ? (
					<CheckCircle2 size={14} className="text-(--color-text-muted)" />
				) : (
					<Circle size={14} className="text-(--color-text-muted)" />
				)}
			</button>

			{/* Title */}
			<button
				type="button"
				className={`flex-1 truncate text-xs text-left ${
					task.completed
						? "line-through text-(--color-text-muted)"
						: "text-(--color-text-primary)"
				}`}
				onClick={() => onEdit?.(task)}
			>
				{task.title}
			</button>

			{/* Tags */}
			{task.tags.length > 0 && (
				<span className="shrink-0 text-[10px] text-(--color-text-muted)">
					{task.tags[0]}
				</span>
			)}

			{/* Pomodoro count */}
			{pomodoroProgress && (
				<span className="shrink-0 text-[10px] font-mono text-(--color-text-muted) tabular-nums">
					🍅{pomodoroProgress}
				</span>
			)}

			{/* Delete button */}
			<button
				type="button"
				className="shrink-0 opacity-0 group-hover:opacity-100 text-(--color-text-muted) hover:text-red-500"
				onClick={() => onDelete?.(task.id)}
			>
				<Trash2 size={12} />
			</button>
		</div>
	);
}

function ProjectSection({
	project,
	tasks,
	defaultExpanded = false,
	onToggleTask,
	onEditTask,
	onDeleteTask,
}: {
	project: Project;
	tasks: Task[];
	defaultExpanded?: boolean;
	onToggleTask?: (taskId: string) => void;
	onEditTask?: (task: Task) => void;
	onDeleteTask?: (taskId: string) => void;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const projectColor = getProjectColor(project.name);

	const completedCount = tasks.filter((t) => t.completed).length;
	const daysUntilDeadline = useMemo(() => {
		if (!project.deadline) return null;
		const diff = new Date(project.deadline).getTime() - Date.now();
		return Math.ceil(diff / (1000 * 60 * 60 * 24));
	}, [project.deadline]);

	return (
		<div>
			{/* Project header */}
			<button
				type="button"
				className="flex items-center gap-2 w-full px-2 py-2 hover:bg-(--color-border) transition-colors text-left"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? (
					<ChevronDown size={12} className="text-(--color-text-muted)" />
				) : (
					<ChevronRight size={12} className="text-(--color-text-muted)" />
				)}

				<Folder size={13} className="shrink-0" style={{ color: projectColor }} />

				<span className="flex-1 text-xs font-medium text-(--color-text-primary) truncate">
					{project.name}
				</span>

				{daysUntilDeadline != null && (
					<span
						className={`shrink-0 flex items-center gap-1 text-[10px] ${
							daysUntilDeadline <= 3
								? "text-(--color-text-primary) font-bold"
								: "text-(--color-text-muted)"
						}`}
					>
						<Calendar size={10} />
						{daysUntilDeadline <= 0 ? "期限超過" : `${daysUntilDeadline}d`}
					</span>
				)}
			</button>

			{/* Progress bar */}
			<div className="px-2 pb-1">
				<ProgressBar completed={completedCount} total={tasks.length} color={projectColor} />
			</div>

			{/* Task list */}
			{expanded && (
				<div className="pl-3">
					{tasks
						.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
						.map((task) => (
							<TaskRow
								key={task.id}
								task={task}
								onToggle={onToggleTask}
								onEdit={onEditTask}
								onDelete={onDeleteTask}
							/>
						))}
				</div>
			)}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface BacklogPanelProps {
	className?: string;
}

const STORAGE_KEY = "pomodoroom-backlog-state";

export default function BacklogPanel({ className = "" }: BacklogPanelProps) {
	const [projects, setProjects] = useState<Project[]>([]);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [state, setState] = useState<BacklogState>({
		expandedProjects: [],
		activeTab: "projects",
	});
	const [editingTask, setEditingTask] = useState<Task | null>(null);
	const [showCreateDialog, setShowCreateDialog] = useState(false);

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
				console.error("Failed to load backlog data:", error);
			}
		};
		loadData();
	}, []);

	// Load/save state to localStorage
	useEffect(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			try {
				setState(JSON.parse(saved));
			} catch {
				// Use default state
			}
		}
	}, []);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}, [state]);

	// Task actions
	const handleToggleTask = async (taskId: string) => {
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return;

		const updated = { ...task, completed: !task.completed };
		try {
			await invoke("cmd_task_update", {
				id: taskId,
				title: updated.title,
				description: updated.description,
				estimatedPomodoros: updated.estimatedPomodoros,
				completedPomodoros: updated.completedPomodoros,
				completed: updated.completed,
				projectId: updated.projectId,
				tags: updated.tags,
				priority: updated.priority,
				category: updated.category,
			});
			setTasks(tasks.map((t) => (t.id === taskId ? updated : t)));
		} catch (error) {
			console.error("Failed to toggle task:", error);
		}
	};

	const handleEditTask = (task: Task) => {
		setEditingTask(task);
	};

	const handleDeleteTask = async (taskId: string) => {
		if (!confirm("Are you sure you want to delete this task?")) return;

		try {
			await invoke("cmd_task_delete", { id: taskId });
			setTasks(tasks.filter((t) => t.id !== taskId));
		} catch (error) {
			console.error("Failed to delete task:", error);
		}
	};

	const handleCreateTask = () => {
		setShowCreateDialog(true);
	};

	// Computed values
	const activeTasks = useMemo(
		() => tasks.filter((t) => t.category === "active"),
		[tasks]
	);

	const somedayTasks = useMemo(
		() => tasks.filter((t) => t.category === "someday").sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
		[tasks]
	);

	const projectTaskMap = useMemo(() => {
		const m = new Map<string, Task[]>();
		for (const t of activeTasks) {
			if (t.projectId) {
				const list = m.get(t.projectId) ?? [];
				list.push(t);
				m.set(t.projectId, list);
			}
		}
		return m;
	}, [activeTasks]);

	const unassignedTasks = useMemo(
		() => activeTasks.filter((t) => !t.projectId),
		[activeTasks]
	);

	const sortedProjects = useMemo(
		() =>
			[...projects].sort((a, b) => {
				if (!a.deadline && !b.deadline) return 0;
				if (!a.deadline) return 1;
				if (!b.deadline) return -1;
				return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
			}),
		[projects]
	);

	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Tab header */}
			<div className="flex items-center shrink-0">
				<button
					type="button"
					className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase text-center transition-colors ${
						state.activeTab === "projects"
							? "text-(--color-text-primary) bg-(--color-surface)"
							: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
					}`}
					onClick={() => setState((s) => ({ ...s, activeTab: "projects" }))}
				>
					Projects
				</button>
				<button
					type="button"
					className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase text-center transition-colors ${
						state.activeTab === "someday"
							? "text-(--color-text-primary) bg-(--color-surface)"
							: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
					}`}
					onClick={() => setState((s) => ({ ...s, activeTab: "someday" }))}
				>
					Someday
					{somedayTasks.length > 0 && (
						<span className="ml-1.5 text-[10px] px-1 bg-(--color-border) text-(--color-text-secondary)">
							{somedayTasks.length}
						</span>
					)}
				</button>
				<button
					type="button"
					className="px-2 text-(--color-text-muted) hover:text-(--color-text-primary)"
					onClick={handleCreateTask}
				>
					<Plus size={14} />
				</button>
			</div>

			<div className="h-px bg-(--color-border)" />

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{state.activeTab === "projects" ? (
					<div>
						{sortedProjects.map((project, i) => (
							<div key={project.id}>
								{i > 0 && <div className="h-px bg-(--color-border)" />}
								<ProjectSection
									project={project}
									tasks={projectTaskMap.get(project.id) ?? []}
									defaultExpanded={state.expandedProjects.includes(project.id)}
									onToggleTask={handleToggleTask}
									onEditTask={handleEditTask}
									onDeleteTask={handleDeleteTask}
								/>
							</div>
						))}

						{/* Unassigned tasks */}
						{unassignedTasks.length > 0 && (
							<>
								<div className="h-px bg-(--color-border)" />
								<div className="px-2 py-2">
									<div className="flex items-center gap-2 mb-1">
										<Inbox size={13} className="text-(--color-text-muted)" />
										<span className="text-xs font-medium text-(--color-text-secondary)">
											Unassigned
										</span>
									</div>
									{unassignedTasks.map((task) => (
										<TaskRow
											key={task.id}
											task={task}
											onToggle={handleToggleTask}
											onEdit={handleEditTask}
											onDelete={handleDeleteTask}
										/>
									))}
								</div>
							</>
						)}

						{sortedProjects.length === 0 && unassignedTasks.length === 0 && (
							<div className="flex flex-col items-center justify-center py-8 text-(--color-text-muted)">
								<Folder size={24} className="mb-2 opacity-40" />
								<span className="text-xs">No projects yet</span>
								<button
									type="button"
									className="mt-2 text-xs text-(--color-text-secondary) hover:text-(--color-text-primary)"
									onClick={handleCreateTask}
								>
									Create a task
								</button>
							</div>
						)}
					</div>
				) : (
					<div>
						{somedayTasks.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-8 text-(--color-text-muted)">
								<Inbox size={24} className="mb-2 opacity-40" />
								<span className="text-xs">No someday tasks</span>
								<button
									type="button"
									className="mt-2 text-xs text-(--color-text-secondary) hover:text-(--color-text-primary)"
									onClick={handleCreateTask}
								>
									Create a task
								</button>
							</div>
						) : (
							somedayTasks.map((task) => (
								<TaskRow
									key={task.id}
									task={task}
									onToggle={handleToggleTask}
									onEdit={handleEditTask}
									onDelete={handleDeleteTask}
								/>
							))
						)}
					</div>
				)}
			</div>

			{/* Task edit/create dialog - to be implemented with TaskDialog component */}
			{editingTask && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-(--color-surface) p-4 rounded-lg w-96">
						<h3 className="text-sm font-medium mb-2">Edit Task</h3>
						<p className="text-xs text-(--color-text-muted)">Task dialog coming soon</p>
						<button
							type="button"
							className="mt-4 px-3 py-1 text-xs bg-(--color-border) hover:bg-(--color-text-muted)"
							onClick={() => setEditingTask(null)}
						>
							Close
						</button>
					</div>
				</div>
			)}

			{showCreateDialog && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
					<div className="bg-(--color-surface) p-4 rounded-lg w-96">
						<h3 className="text-sm font-medium mb-2">Create Task</h3>
						<p className="text-xs text-(--color-text-muted)">Task dialog coming soon</p>
						<button
							type="button"
							className="mt-4 px-3 py-1 text-xs bg-(--color-border) hover:bg-(--color-text-muted)"
							onClick={() => setShowCreateDialog(false)}
						>
							Close
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
