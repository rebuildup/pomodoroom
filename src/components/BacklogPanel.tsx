/**
 * BacklogPanel — バックログ（プロジェクト一覧 + someday リスト）.
 *
 * プロジェクトごとのタスク進捗表示 + いつかやるリスト。
 * Issue #88
 */
import { useState, useMemo } from "react";
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
} from "lucide-react";

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ completed, total }: { completed: number; total: number }) {
	const pct = total > 0 ? (completed / total) * 100 : 0;
	return (
		<div className="flex items-center gap-2 w-full">
			<div className="flex-1 h-1 bg-(--color-border) overflow-hidden">
				<div
					className="h-full bg-(--color-text-primary) transition-all"
					style={{ width: `${pct}%` }}
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
}: {
	task: Task;
	onToggle?: (taskId: string) => void;
}) {
	const pomodoroProgress = task.estimatedPomodoros > 0
		? `${task.completedPomodoros}/${task.estimatedPomodoros}`
		: "";

	return (
		<div className="group flex items-center gap-2 py-1.5 px-2 hover:bg-(--color-border) transition-colors cursor-default">
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
			<span
				className={`flex-1 truncate text-xs ${
					task.completed
						? "line-through text-(--color-text-muted)"
						: "text-(--color-text-primary)"
				}`}
			>
				{task.title}
			</span>

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
		</div>
	);
}

function ProjectSection({
	project,
	tasks,
	defaultExpanded = false,
	onToggleTask,
}: {
	project: Project;
	tasks: Task[];
	defaultExpanded?: boolean;
	onToggleTask?: (taskId: string) => void;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);

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

				<Folder size={13} className="shrink-0 text-(--color-text-secondary)" />

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
				<ProgressBar completed={completedCount} total={tasks.length} />
			</div>

			{/* Task list */}
			{expanded && (
				<div className="pl-3">
					{tasks
						.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
						.map((task) => (
							<TaskRow key={task.id} task={task} onToggle={onToggleTask} />
						))}
				</div>
			)}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface BacklogPanelProps {
	projects: Project[];
	tasks: Task[];
	onToggleTask?: (taskId: string) => void;
	className?: string;
}

export default function BacklogPanel({
	projects,
	tasks,
	onToggleTask,
	className = "",
}: BacklogPanelProps) {
	const [activeTab, setActiveTab] = useState<"projects" | "someday">("projects");

	const activeTasks = useMemo(
		() => tasks.filter((t) => t.category === "active"),
		[tasks]
	);

	const somedayTasks = useMemo(
		() => tasks.filter((t) => t.category === "someday").sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
		[tasks]
	);

	// Group tasks by project
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

	// Unassigned tasks (active but no project)
	const unassignedTasks = useMemo(
		() => activeTasks.filter((t) => !t.projectId),
		[activeTasks]
	);

	// Sort projects by deadline (soonest first)
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
						activeTab === "projects"
							? "text-(--color-text-primary) bg-(--color-surface)"
							: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
					}`}
					onClick={() => setActiveTab("projects")}
				>
					Projects
				</button>
				<button
					type="button"
					className={`flex-1 py-2 text-xs font-bold tracking-widest uppercase text-center transition-colors ${
						activeTab === "someday"
							? "text-(--color-text-primary) bg-(--color-surface)"
							: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
					}`}
					onClick={() => setActiveTab("someday")}
				>
					Someday
					{somedayTasks.length > 0 && (
						<span className="ml-1.5 text-[10px] px-1 bg-(--color-border) text-(--color-text-secondary)">
							{somedayTasks.length}
						</span>
					)}
				</button>
			</div>

			<div className="h-px bg-(--color-border)" />

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{activeTab === "projects" ? (
					<div>
						{sortedProjects.map((project, i) => (
							<div key={project.id}>
								{i > 0 && <div className="h-px bg-(--color-border)" />}
								<ProjectSection
									project={project}
									tasks={projectTaskMap.get(project.id) ?? []}
									defaultExpanded={i === 0}
									onToggleTask={onToggleTask}
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
										<TaskRow key={task.id} task={task} onToggle={onToggleTask} />
									))}
								</div>
							</>
						)}

						{sortedProjects.length === 0 && unassignedTasks.length === 0 && (
							<div className="flex flex-col items-center justify-center py-8 text-(--color-text-muted)">
								<Folder size={24} className="mb-2 opacity-40" />
								<span className="text-xs">No projects yet</span>
							</div>
						)}
					</div>
				) : (
					<div>
						{somedayTasks.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-8 text-(--color-text-muted)">
								<Inbox size={24} className="mb-2 opacity-40" />
								<span className="text-xs">No someday tasks</span>
							</div>
						) : (
							somedayTasks.map((task) => (
								<TaskRow key={task.id} task={task} onToggle={onToggleTask} />
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}
