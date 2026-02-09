/**
 * TaskBoard — 強化版タスク管理パネル.
 *
 * BacklogPanel の進化版:
 * - クイック入力（インライン追加）
 * - ステータスフロー: inbox → doing → done
 * - 優先度の視覚的表現
 * - プロジェクト別グルーピング
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Task, Project } from "@/types/schedule";
import {
	Plus,
	Circle,
	CircleDot,
	CheckCircle2,
	Folder,
	ChevronDown,
	ChevronRight,
	Inbox,
	Zap,
	Clock,
	Archive,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type TaskStatus = "inbox" | "doing" | "done";
type ViewMode = "status" | "project";

interface TaskBoardProps {
	projects: Project[];
	tasks: Task[];
	onToggleTask?: (taskId: string) => void;
	onAddTask?: (title: string) => void;
	className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveStatus(task: Task): TaskStatus {
	if (task.completed) return "done";
	if (task.completedPomodoros > 0) return "doing";
	return "inbox";
}

function priorityBar(priority: number | undefined): string {
	const p = priority ?? 0;
	if (p >= 80) return "bg-(--color-text-primary)";
	if (p >= 50) return "bg-(--color-text-secondary)";
	if (p >= 20) return "bg-(--color-text-muted)";
	return "bg-(--color-border)";
}

function statusIcon(status: TaskStatus) {
	switch (status) {
		case "inbox": return <Circle size={13} className="text-(--color-text-muted)" />;
		case "doing": return <CircleDot size={13} className="text-(--color-text-primary)" />;
		case "done": return <CheckCircle2 size={13} className="text-(--color-text-muted)" />;
	}
}

// ─── Quick Entry ────────────────────────────────────────────────────────────

function QuickEntry({ onAdd }: { onAdd?: (title: string) => void }) {
	const [active, setActive] = useState(false);
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (active) inputRef.current?.focus();
	}, [active]);

	const handleSubmit = useCallback(() => {
		const title = value.trim();
		if (title) {
			onAdd?.(title);
			setValue("");
		}
		setActive(false);
	}, [value, onAdd]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") handleSubmit();
			if (e.key === "Escape") { setValue(""); setActive(false); }
		},
		[handleSubmit],
	);

	if (!active) {
		return (
			<button
				type="button"
				className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[11px] text-(--color-text-muted) hover:text-(--color-text-secondary) hover:bg-(--color-surface) transition-colors"
				onClick={() => setActive(true)}
			>
				<Plus size={12} />
				<span>Add task…</span>
			</button>
		);
	}

	return (
		<div className="flex items-center gap-2 px-3 py-1.5 bg-(--color-surface)">
			<Plus size={12} className="text-(--color-text-muted) shrink-0" />
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleSubmit}
				placeholder="Task title…"
				className="flex-1 bg-transparent text-[11px] text-(--color-text-primary) outline-none placeholder:text-(--color-text-muted)"
			/>
			<span className="text-[9px] text-(--color-text-muted) shrink-0">⏎</span>
		</div>
	);
}

// ─── Task Row ───────────────────────────────────────────────────────────────

function TaskRow({
	task,
	onToggle,
	showProject,
}: {
	task: Task;
	onToggle?: (taskId: string) => void;
	showProject?: boolean;
}) {
	const status = deriveStatus(task);
	const pomProgress = task.estimatedPomodoros > 0
		? `${task.completedPomodoros}/${task.estimatedPomodoros}`
		: "";

	return (
		<div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-(--color-surface) transition-colors cursor-default">
			{/* Priority bar (left edge) */}
			<div
				className={`w-0.5 h-4 shrink-0 ${priorityBar(task.priority)}`}
			/>

			{/* Status toggle */}
			<button
				type="button"
				className="shrink-0 transition-colors hover:opacity-70"
				onClick={() => onToggle?.(task.id)}
			>
				{statusIcon(status)}
			</button>

			{/* Title */}
			<span
				className={`flex-1 truncate text-[11px] ${
					status === "done"
						? "line-through text-(--color-text-muted)"
						: status === "doing"
							? "text-(--color-text-primary) font-medium"
							: "text-(--color-text-secondary)"
				}`}
			>
				{task.title}
			</span>

			{/* Project tag */}
			{showProject && task.tags.length > 0 && (
				<span className="shrink-0 text-[9px] text-(--color-text-muted) bg-(--color-border) px-1 py-0.5">
					{task.tags[0]}
				</span>
			)}

			{/* Pomodoro info */}
			{pomProgress && (
				<span className="shrink-0 text-[9px] font-mono text-(--color-text-muted) tabular-nums">
					🍅{pomProgress}
				</span>
			)}
		</div>
	);
}

// ─── Status Section ─────────────────────────────────────────────────────────

function StatusSection({
	status,
	label,
	icon,
	tasks,
	onToggleTask,
	defaultExpanded = true,
}: {
	status: TaskStatus;
	label: string;
	icon: React.ReactNode;
	tasks: Task[];
	onToggleTask?: (taskId: string) => void;
	defaultExpanded?: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);

	if (tasks.length === 0 && status === "done") return null;

	return (
		<div>
			<button
				type="button"
				className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-(--color-surface) transition-colors text-left"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
				{icon}
				<span className="text-[10px] font-bold tracking-widest uppercase text-(--color-text-muted)">
					{label}
				</span>
				<span className="text-[10px] font-mono text-(--color-text-muted) tabular-nums">
					{tasks.length}
				</span>
			</button>

			{expanded && (
				<div>
					{tasks.map((task) => (
						<TaskRow key={task.id} task={task} onToggle={onToggleTask} showProject />
					))}
					{tasks.length === 0 && (
						<div className="px-3 py-2 text-[10px] text-(--color-text-muted)">
							Nothing here
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ─── Project Section ────────────────────────────────────────────────────────

function ProjectGroup({
	project,
	tasks,
	onToggleTask,
	defaultExpanded,
}: {
	project: Project;
	tasks: Task[];
	onToggleTask?: (taskId: string) => void;
	defaultExpanded: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const done = tasks.filter((t) => t.completed).length;
	const doing = tasks.filter((t) => !t.completed && t.completedPomodoros > 0).length;

	return (
		<div>
			<button
				type="button"
				className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-(--color-surface) transition-colors text-left"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
				<Folder size={12} className="text-(--color-text-secondary)" />
				<span className="flex-1 text-[11px] font-medium text-(--color-text-primary) truncate">
					{project.name}
				</span>
				{/* Mini progress */}
				<div className="flex items-center gap-1 shrink-0">
					{doing > 0 && (
						<span className="text-[9px] font-mono text-(--color-text-primary) tabular-nums">
							{doing}⚡
						</span>
					)}
					<span className="text-[9px] font-mono text-(--color-text-muted) tabular-nums">
						{done}/{tasks.length}
					</span>
				</div>
			</button>

			{/* Progress bar */}
			<div className="px-3 pb-0.5">
				<div className="h-px bg-(--color-border) overflow-hidden">
					<div
						className="h-full bg-(--color-text-primary) transition-all"
						style={{ width: `${tasks.length > 0 ? (done / tasks.length) * 100 : 0}%` }}
					/>
				</div>
			</div>

			{expanded &&
				tasks
					.sort((a, b) => {
						// doing first, then by priority
						const sa = deriveStatus(a) === "doing" ? 0 : deriveStatus(a) === "inbox" ? 1 : 2;
						const sb = deriveStatus(b) === "doing" ? 0 : deriveStatus(b) === "inbox" ? 1 : 2;
						if (sa !== sb) return sa - sb;
						return (b.priority ?? 0) - (a.priority ?? 0);
					})
					.map((task) => (
						<TaskRow key={task.id} task={task} onToggle={onToggleTask} />
					))}
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TaskBoard({
	projects,
	tasks,
	onToggleTask,
	onAddTask,
	className = "",
}: TaskBoardProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("status");

	const activeTasks = useMemo(
		() => tasks.filter((t) => t.category === "active"),
		[tasks],
	);

	const somedayTasks = useMemo(
		() => tasks.filter((t) => t.category === "someday"),
		[tasks],
	);

	// Status groups
	const doingTasks = useMemo(
		() => activeTasks
			.filter((t) => deriveStatus(t) === "doing")
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
		[activeTasks],
	);

	const inboxTasks = useMemo(
		() => activeTasks
			.filter((t) => deriveStatus(t) === "inbox")
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
		[activeTasks],
	);

	const doneTasks = useMemo(
		() => activeTasks
			.filter((t) => deriveStatus(t) === "done")
			.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
		[activeTasks],
	);

	// Project map
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

	const unassigned = useMemo(
		() => activeTasks.filter((t) => !t.projectId),
		[activeTasks],
	);

	const sortedProjects = useMemo(
		() => [...projects].sort((a, b) => {
			if (!a.deadline && !b.deadline) return 0;
			if (!a.deadline) return 1;
			if (!b.deadline) return -1;
			return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
		}),
		[projects],
	);

	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Tab bar: view mode + someday toggle */}
			<div className="flex items-center shrink-0">
				<button
					type="button"
					className={`flex items-center gap-1 px-3 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors ${
						viewMode === "status"
							? "text-(--color-text-primary) bg-(--color-surface)"
							: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
					}`}
					onClick={() => setViewMode("status")}
				>
					<Zap size={10} />
					Status
				</button>
				<button
					type="button"
					className={`flex items-center gap-1 px-3 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors ${
						viewMode === "project"
							? "text-(--color-text-primary) bg-(--color-surface)"
							: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
					}`}
					onClick={() => setViewMode("project")}
				>
					<Folder size={10} />
					Project
				</button>

				<div className="flex-1" />

				{/* Counts */}
				<div className="flex items-center gap-2 px-3 text-[9px] font-mono text-(--color-text-muted) tabular-nums">
					<span>{doingTasks.length}⚡</span>
					<span>{inboxTasks.length}📥</span>
					<span>{doneTasks.length}✓</span>
				</div>
			</div>

			<div className="h-px bg-(--color-border)" />

			{/* Quick entry */}
			<QuickEntry onAdd={onAddTask} />

			<div className="h-px bg-(--color-border)" />

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{viewMode === "status" ? (
					<>
						<StatusSection
							status="doing"
							label="Doing"
							icon={<CircleDot size={11} className="text-(--color-text-primary)" />}
							tasks={doingTasks}
							onToggleTask={onToggleTask}
						/>

						<div className="h-px bg-(--color-border) mx-3" />

						<StatusSection
							status="inbox"
							label="Next"
							icon={<Clock size={11} className="text-(--color-text-muted)" />}
							tasks={inboxTasks}
							onToggleTask={onToggleTask}
						/>

						{doneTasks.length > 0 && (
							<>
								<div className="h-px bg-(--color-border) mx-3" />
								<StatusSection
									status="done"
									label="Done"
									icon={<CheckCircle2 size={11} className="text-(--color-text-muted)" />}
									tasks={doneTasks}
									onToggleTask={onToggleTask}
									defaultExpanded={false}
								/>
							</>
						)}

						{/* Someday section */}
						{somedayTasks.length > 0 && (
							<>
								<div className="h-px bg-(--color-border) mx-3 mt-1" />
								<StatusSection
									status="inbox"
									label="Someday"
									icon={<Archive size={11} className="text-(--color-text-muted)" />}
									tasks={somedayTasks}
									onToggleTask={onToggleTask}
									defaultExpanded={false}
								/>
							</>
						)}
					</>
				) : (
					<>
						{sortedProjects.map((project, i) => (
							<div key={project.id}>
								{i > 0 && <div className="h-px bg-(--color-border) mx-3" />}
								<ProjectGroup
									project={project}
									tasks={projectTaskMap.get(project.id) ?? []}
									onToggleTask={onToggleTask}
									defaultExpanded={i === 0}
								/>
							</div>
						))}

						{unassigned.length > 0 && (
							<>
								<div className="h-px bg-(--color-border) mx-3" />
								<div className="px-3 py-1.5">
									<div className="flex items-center gap-2 mb-1">
										<Inbox size={12} className="text-(--color-text-muted)" />
										<span className="text-[10px] font-bold tracking-widest uppercase text-(--color-text-muted)">
											Unassigned
										</span>
									</div>
									{unassigned.map((task) => (
										<TaskRow key={task.id} task={task} onToggle={onToggleTask} showProject />
									))}
								</div>
							</>
						)}
					</>
				)}
			</div>
		</div>
	);
}
