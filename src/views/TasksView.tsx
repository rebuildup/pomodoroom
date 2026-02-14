/**
 * TasksView — Task list view with collapsible sections and create panel
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import { TextField } from "@/components/m3/TextField";
import { DateTimePicker, TimePicker } from "@/components/m3/DateTimePicker";
import { TaskCard } from "@/components/m3/TaskCard";
import { useTaskStore } from "@/hooks/useTaskStore";
import { showActionNotification } from "@/hooks/useActionNotification";
import { useProjects } from "@/hooks/useProjects";
import { useGroups } from "@/hooks/useGroups";
import { GroupDialog } from "@/components/m3/GroupDialog";
import { ProjectDialog } from "@/components/m3/ProjectDialog";
import type { TaskOperation } from "@/components/m3/TaskOperations";

type TaskKind = "fixed_event" | "flex_window" | "duration_only" | "break";

function localInputToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

export default function TasksView() {
	const taskStore = useTaskStore();
	const { projects, createProject } = useProjects();
	const { groups, createGroup } = useGroups();

	// Dialog states
	const [groupDialogOpen, setGroupDialogOpen] = useState(false);
	const [projectDialogOpen, setProjectDialogOpen] = useState(false);

	// View mode: by_state | by_group | by_project | by_tag
	const [viewMode, setViewMode] = useState<"by_state" | "by_group" | "by_project" | "by_tag">("by_state");

	// Sort and search states
	const [sortBy, setSortBy] = useState<"createdAt" | "updatedAt" | "title" | "pressure">("createdAt");
	const [searchQuery, setSearchQuery] = useState("");

	// Selected group/project/tag
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
	const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

	// Collapsible section states
	const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>({
		ready: false,
		running: false,
		paused: false,
		done: true,
		all: false,
	});

	// Create form states
	const [newTitle, setNewTitle] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [newKind, setNewKind] = useState<TaskKind>("duration_only");
	const [newRequiredMinutes, setNewRequiredMinutes] = useState("25");
	const [newDurationTime, setNewDurationTime] = useState("00:25");
	const [newFixedStartAt, setNewFixedStartAt] = useState("");
	const [newFixedEndAt, setNewFixedEndAt] = useState("");
	const [newWindowStartAt, setNewWindowStartAt] = useState("");
	const [newWindowEndAt, setNewWindowEndAt] = useState("");
	const [newTags, setNewTags] = useState<string[]>([]);
	const [tagInput, setTagInput] = useState("");

	const readyTasks = useMemo(() => taskStore.getTasksByState("READY"), [taskStore.tasks]);
	const runningTasks = useMemo(() => taskStore.getTasksByState("RUNNING"), [taskStore.tasks]);
	const pausedTasks = useMemo(() => taskStore.getTasksByState("PAUSED"), [taskStore.tasks]);
	const doneTasks = useMemo(() => taskStore.getTasksByState("DONE"), [taskStore.tasks]);

	// Group tasks by group ID
	const tasksByGroup = useMemo(() => {
		const groups: Record<string, typeof taskStore.tasks> = {};
		taskStore.tasks.forEach(task => {
			const groupId = task.group || "未分類";
			if (!groups[groupId]) {
				groups[groupId] = [];
			}
			groups[groupId].push(task);
		});
		return groups;
	}, [taskStore.tasks]);

	// Group tasks by project ID
	const tasksByProject = useMemo(() => {
		const projectsMap: Record<string, typeof taskStore.tasks> = {};
		taskStore.tasks.forEach(task => {
			if (task.project) {
				if (!projectsMap[task.project]) {
					projectsMap[task.project] = [];
				}
				projectsMap[task.project].push(task);
			}
		});
		return projectsMap;
	}, [taskStore.tasks]);

	// Group tasks by tag
	const tasksByTag = useMemo(() => {
		const tagsMap: Record<string, typeof taskStore.tasks> = {};
		taskStore.tasks.forEach(task => {
			if (task.tags && task.tags.length > 0) {
				task.tags.forEach(tag => {
					if (!tagsMap[tag]) {
						tagsMap[tag] = [];
					}
					tagsMap[tag].push(task);
				});
			}
		});
		return tagsMap;
	}, [taskStore.tasks]);

	// All unique tags sorted
	const allTags = useMemo(() => {
		const tags = new Set<string>();
		taskStore.tasks.forEach(task => {
			if (task.tags) {
				task.tags.forEach(tag => tags.add(tag));
			}
		});
		return Array.from(tags).sort();
	}, [taskStore.tasks]);

	// Filtered tasks - reserved for future filtering implementation
	const _filteredTasks = useMemo(() => {
		switch (viewMode) {
			case "by_group":
				return selectedGroupId ? tasksByGroup[selectedGroupId] || [] : [];
			case "by_project":
				return selectedProjectId ? tasksByProject[selectedProjectId] || [] : [];
			case "by_tag":
				return selectedTagId ? tasksByTag[selectedTagId] || [] : [];
			default:
				return taskStore.tasks;
		}
	}, [viewMode, selectedGroupId, selectedProjectId, selectedTagId, tasksByGroup, tasksByProject, tasksByTag]);
	void _filteredTasks;

	const handleCreateTask = () => {
		if (!newTitle.trim()) return;
		const tags = newTags.filter((t) => t.length > 0);

		let requiredMinutes: number;
		if (newKind === "fixed_event" && newFixedStartAt && newFixedEndAt) {
			const start = new Date(newFixedStartAt).getTime();
			const end = new Date(newFixedEndAt).getTime();
			requiredMinutes = isNaN(start) || isNaN(end) || end <= start
				? 0
				: Math.round((end - start) / (1000 * 60));
		} else {
			requiredMinutes = Math.max(0, Number(newRequiredMinutes) || 0);
		}

		taskStore.createTask({
			title: newTitle.trim(),
			description: newDescription.trim() || undefined,
			tags,
			kind: newKind,
			requiredMinutes,
			fixedStartAt: newKind === "fixed_event" ? localInputToIso(newFixedStartAt) : null,
			fixedEndAt: newKind === "fixed_event" ? localInputToIso(newFixedEndAt) : null,
			windowStartAt: newKind === "flex_window" ? localInputToIso(newWindowStartAt) : null,
			windowEndAt: newKind === "flex_window" ? localInputToIso(newWindowEndAt) : null,
		});

		setNewTitle("");
		setNewDescription("");
		setNewKind("duration_only");
		setNewRequiredMinutes("25");
		setNewDurationTime("00:25");
		setNewFixedStartAt("");
		setNewFixedEndAt("");
		setNewWindowStartAt("");
		setNewWindowEndAt("");
		setNewTags([]);
		setTagInput("");
	};

	const handleTaskOperation = async (_taskId: string, operation: TaskOperation) => {
		const task = taskStore.getTask(_taskId);
		if (!task) return;

		if (operation === "pause") {
			const now = new Date();
			const nowMs = now.getTime();
			const roundUpToQuarter = (date: Date): Date => {
				const rounded = new Date(date);
				const minutes = rounded.getMinutes();
				const roundedMinutes = Math.ceil(minutes / 15) * 15;
				if (roundedMinutes === 60) {
					rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
					return rounded;
				}
				rounded.setMinutes(roundedMinutes, 0, 0);
				return rounded;
			};
			const toLabel = (iso: string) =>
				new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
			const toCandidateIso = (ms: number) => roundUpToQuarter(new Date(ms)).toISOString();
			const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;

			const nextScheduledMs = taskStore.tasks
				.filter((t) => t.id !== task.id && (t.state === 'READY' || t.state === 'PAUSED'))
				.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
				.filter((v): v is string => Boolean(v))
				.map((v) => Date.parse(v))
				.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
				.sort((a, b) => a - b)[0] ?? null;

			const candidatesRaw: Array<{ label: string; atMs: number }> = [
				{ label: "15分後", atMs: nowMs + 15 * 60_000 },
				...(nextScheduledMs ? [{ label: "次タスク開始時刻", atMs: nextScheduledMs }] : []),
				...(nextScheduledMs ? [{ label: "次タスク後に再開", atMs: nextScheduledMs + durationMs }] : []),
			];

			const unique = new Map<string, { label: string; iso: string }>();
			for (const c of candidatesRaw) {
				const iso = toCandidateIso(c.atMs);
				if (Date.parse(iso) <= nowMs) continue;
				if (!unique.has(iso)) unique.set(iso, { label: c.label, iso });
				if (unique.size >= 3) break;
			}
			const candidates = [...unique.values()];
			if (candidates.length === 0) {
				candidates.push({ label: "15分後", iso: toCandidateIso(nowMs + 15 * 60_000) });
			}

			await showActionNotification({
				title: "タスク中断",
				message: `${task.title} の再開時刻を選択してください`,
				buttons: [
					...candidates.map((c) => ({
						label: `${c.label} (${toLabel(c.iso)})`,
						action: { interrupt_task: { id: task.id, resume_at: c.iso } as const },
					})),
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "start" || operation === "resume") {
			await showActionNotification({
				title: operation === "start" ? "タスク開始" : "タスク再開",
				message: task.title,
				buttons: [
					{
						label: operation === "start" ? "開始" : "再開",
						action: { start_task: { id: task.id, resume: operation === "resume" } },
					},
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "complete") {
			await showActionNotification({
				title: "タスク完了",
				message: task.title,
				buttons: [
					{ label: "完了", action: { complete_task: { id: task.id } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "extend") {
			await showActionNotification({
				title: "タスク延長",
				message: task.title,
				buttons: [
					{ label: "+5分", action: { extend_task: { id: task.id, minutes: 5 } } },
					{ label: "+15分", action: { extend_task: { id: task.id, minutes: 15 } } },
					{ label: "+25分", action: { extend_task: { id: task.id, minutes: 25 } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "defer" || operation === "postpone") {
			await showActionNotification({
				title: "タスク先送り",
				message: task.title,
				buttons: [
					{ label: "先送り", action: { postpone_task: { id: task.id } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
			return;
		}

		if (operation === "delete") {
			await showActionNotification({
				title: "タスク削除",
				message: task.title,
				buttons: [
					{ label: "削除", action: { delete_task: { id: task.id } } },
					{ label: "キャンセル", action: { dismiss: null } },
				],
			});
		}
	};

	return (
		<div className="h-full overflow-y-auto p-4 bg-[var(--md-ref-color-surface)]">
			<div className="max-w-7xl mx-auto">
				{/* Main content: 2-column layout */}
				<div className="flex flex-col lg:flex-row gap-4">
					{/* Left column: Controls + Task list */}
					<div className="flex-1 order-2 lg:order-1 space-y-3">
						{/* Controls row: View mode (left) + Sort (right) */}
						<div className="flex items-center justify-between gap-3 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
							{/* View mode switcher */}
							<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden flex-shrink-0">
								{["by_state", "by_group", "by_project", "by_tag"].map((mode) => {
									const isSelected = viewMode === mode;
									return (
										<button
											key={mode}
											type="button"
											onClick={() => {
												setViewMode(mode as "by_state" | "by_group" | "by_project" | "by_tag");
												setSelectedGroupId(null);
												setSelectedProjectId(null);
												setSelectedTagId(null);
											}}
											className={`
												no-pill h-8 px-3 text-xs font-medium
												flex items-center justify-center
												transition-all duration-150 whitespace-nowrap
												${isSelected
													? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
													: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
												}
											`}
										>
											{mode === "by_state" && "状態別"}
											{mode === "by_group" && "グループ別"}
											{mode === "by_project" && "プロジェクト別"}
											{mode === "by_tag" && "タグ別"}
										</button>
									);
								})}
							</div>

							{/* Sort selector - right aligned */}
							<div className="inline-flex items-center gap-2 flex-shrink-0">
								<span className="text-xs text-[var(--md-ref-color-on-surface-variant)] whitespace-nowrap">並び順:</span>
								<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden">
									{[
										{ value: "createdAt", label: "作成日" },
										{ value: "updatedAt", label: "更新日" },
										{ value: "title", label: "タイトル" },
										{ value: "pressure", label: "プレッシャー" },
									].map((option) => {
										const isSelected = sortBy === option.value;
										return (
											<button
												key={option.value}
												type="button"
												onClick={() => setSortBy(option.value as typeof sortBy)}
												className={`
													no-pill h-8 px-3 text-xs font-medium
													flex items-center justify-center
													transition-all duration-150 whitespace-nowrap
													${isSelected
														? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
														: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
													}
												`}
											>
												{option.label}
											</button>
										);
									})}
								</div>
							</div>
						</div>

						{/* Task sections */}
						{/* View mode: by_state */}
						{viewMode === "by_state" && (
							<>
							{/* Ready tasks */}
								<section className="border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden">
									<button
										type="button"
										onClick={() => setSectionsCollapsed(prev => ({ ...prev, ready: !prev.ready }))}
										className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="radio_button_unchecked" size={18} />
											<span>準備中</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">({readyTasks.length})</span>
										</div>
										<Icon name={sectionsCollapsed.ready ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
									</button>
									{!sectionsCollapsed.ready && (
										<div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-hover">
											{readyTasks.length === 0 ? (
												<p className="text-sm text-[var(--md-ref-color-on-surface-variant)] py-4 text-center">準備中のタスクはありません</p>
											) : (
												readyTasks.map((task) => (
													<TaskCard
														key={task.id}
														task={task}
														allTasks={taskStore.tasks}
														draggable={false}
														density="compact"
														operationsPreset="default"
														showStatusControl={true}
														expandOnClick={true}
														onOperation={handleTaskOperation}
													/>
												))
											)}
										</div>
									)}
								</section>

								{/* Running tasks - always visible */}
								<section className="border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden">
									<button
										type="button"
										onClick={() => setSectionsCollapsed(prev => ({ ...prev, running: !prev.running }))}
										className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="play_arrow" size={18} className="text-green-500" />
											<span>実行中</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">({runningTasks.length})</span>
										</div>
										<Icon name={sectionsCollapsed.running ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
									</button>
									{!sectionsCollapsed.running && (
										<div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-hover">
											{runningTasks.length === 0 ? (
												<p className="text-sm text-[var(--md-ref-color-on-surface-variant)] py-4 text-center">実行中のタスクはありません</p>
											) : (
												runningTasks.map((task) => (
													<TaskCard
														key={task.id}
														task={task}
														allTasks={taskStore.tasks}
														draggable={false}
														density="compact"
														operationsPreset="default"
														showStatusControl={true}
														expandOnClick={true}
														onOperation={handleTaskOperation}
													/>
												))
											)}
										</div>
									)}
								</section>

							{/* Paused tasks */}
								<section className="border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden">
									<button
										type="button"
										onClick={() => setSectionsCollapsed(prev => ({ ...prev, paused: !prev.paused }))}
										className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="pause" size={18} className="text-orange-500" />
											<span>一時停止</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">({pausedTasks.length})</span>
										</div>
										<Icon name={sectionsCollapsed.paused ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
									</button>
									{!sectionsCollapsed.paused && (
										<div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-hover">
											{pausedTasks.length === 0 ? (
												<p className="text-sm text-[var(--md-ref-color-on-surface-variant)] py-4 text-center">一時停止中のタスクはありません</p>
											) : (
												pausedTasks.map((task) => (
													<TaskCard
														key={task.id}
														task={task}
														allTasks={taskStore.tasks}
														draggable={false}
														density="compact"
														operationsPreset="default"
														showStatusControl={true}
														expandOnClick={true}
														onOperation={handleTaskOperation}
													/>
												))
											)}
										</div>
									)}
								</section>

								{/* Done tasks */}
								<section className="border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden">
									<button
										type="button"
										onClick={() => setSectionsCollapsed(prev => ({ ...prev, done: !prev.done }))}
										className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="check_circle" size={18} className="text-purple-500" />
											<span>完了</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">({doneTasks.length})</span>
										</div>
										<Icon name={sectionsCollapsed.done ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
									</button>
									{!sectionsCollapsed.done && (
										<div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-hover">
											{doneTasks.map((task) => (
												<TaskCard
													key={task.id}
													task={task}
													allTasks={taskStore.tasks}
													draggable={false}
													density="compact"
													operationsPreset="none"
													showStatusControl={false}
													expandOnClick={true}
													onOperation={handleTaskOperation}
												/>
											))}
										</div>
									)}
								</section>

								{/* Empty state */}
								{taskStore.totalCount === 0 && (
									<div className="flex flex-col items-center justify-center h-64 text-[var(--md-ref-color-on-surface-variant)]">
										<Icon name="inbox" size={48} className="mb-4 opacity-50" />
										<p className="text-sm">タスクがありません</p>
										<p className="text-xs mt-2">右のパネルからタスクを作成してください</p>
									</div>
								)}
							</>
						)}

						{/* View mode: by_project */}
						{viewMode === "by_project" && (
							<>
								{/* Individual Projects */}
								{projects.length > 0 && projects.map((project) => (
									<section
										key={project.id}
										className="border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden"
									>
										<button
											type="button"
											onClick={() => setSectionsCollapsed(prev => ({ ...prev, [project.id]: !prev[project.id as keyof typeof sectionsCollapsed] }))}
											className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
										>
											<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
												<Icon name="folder" size={18} />
												<span>{project.name}</span>
												<span className="text-[var(--md-ref-color-on-surface-variant)]">({tasksByProject[project.id]?.length || 0})</span>
											</div>
											<Icon name={sectionsCollapsed[project.id as keyof typeof sectionsCollapsed] ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
										</button>
										{!sectionsCollapsed[project.id as keyof typeof sectionsCollapsed] && (
											<div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-hover">
												{(tasksByProject[project.id] || []).map((task) => (
													<TaskCard
														key={task.id}
														task={task}
														allTasks={taskStore.tasks}
														draggable={false}
														density="compact"
														operationsPreset="default"
														showStatusControl={true}
														expandOnClick={true}
														onOperation={handleTaskOperation}
													/>
												))}
											</div>
										)}
									</section>
								))}
							</>
						)}

						{/* View mode: by_tag */}
						{viewMode === "by_tag" && (
							<>
								{allTags.length === 0 ? (
									<p className="text-sm text-[var(--md-ref-color-on-surface-variant)] py-4">タグがありません</p>
								) : (
									allTags.map((tag) => (
										<section
											key={tag}
											className="border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden"
										>
											<button
												type="button"
												onClick={() => setSectionsCollapsed(prev => ({ ...prev, [tag]: !prev[tag as keyof typeof sectionsCollapsed] }))}
												className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
											>
												<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
													<Icon name="tag" size={18} />
													<span>{tag}</span>
													<span className="text-[var(--md-ref-color-on-surface-variant)]">({tasksByTag[tag]?.length || 0})</span>
												</div>
												<Icon name={sectionsCollapsed[tag as keyof typeof sectionsCollapsed] ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
											</button>
											{!sectionsCollapsed[tag as keyof typeof sectionsCollapsed] && (
												<div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto scrollbar-hover">
													{(tasksByTag[tag] || []).map((task) => (
														<TaskCard
															key={task.id}
															task={task}
															allTasks={taskStore.tasks}
															draggable={false}
															density="compact"
															operationsPreset="default"
															showStatusControl={true}
															expandOnClick={true}
															onOperation={handleTaskOperation}
														/>
													))}
												</div>
											)}
										</section>
									))
								)}
							</>
						)}

						{/* Add group/project button for by_group and by_project view */}
						{(viewMode === "by_group" || viewMode === "by_project") && (
							<div className="mt-4 flex justify-center">
								<button
									type="button"
									onClick={() => viewMode === "by_group" ? setGroupDialogOpen(true) : setProjectDialogOpen(true)}
									className="h-10 px-6 rounded-full border border-[var(--md-ref-color-outline)] bg-[var(--md-ref-color-surface-container)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors flex items-center justify-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]"
								>
									<Icon name="add" size={18} />
									<span>{viewMode === "by_group" ? "グループを作成" : "プロジェクトを作成"}</span>
								</button>
							</div>
						)}
					</div>

					{/* Right column: Search + Create panel */}
					<div className="w-full lg:w-[360px] order-1 lg:order-2 space-y-3">
						{/* Search bar */}
						<TextField
							label=""
							value={searchQuery}
							onChange={setSearchQuery}
							placeholder="タスク名、説明、タグで検索..."
							variant="outlined"
							startIcon={<Icon name="search" size={18} />}
						/>

						{/* Create panel */}
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container-low)]">
							{/* Task type selector - M3 Segmented Button */}
							<div className="mb-3">
								<div
									className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden"
									role="radiogroup"
									aria-label="Task type"
								>
									{[
										{ value: "duration_only", label: "タスク" },
										{ value: "fixed_event", label: "予定" },
										{ value: "flex_window", label: "柔軟タスク" },
										{ value: "break", label: "休憩" },
									].map((option, index) => {
										const isSelected = newKind === option.value;
										const isFirst = index === 0;
										const isLast = index === 3;
										return (
											<button
												key={option.value}
												type="button"
												role="radio"
												aria-checked={isSelected}
												onClick={() => setNewKind(option.value as TaskKind)}
											className={`
												no-pill relative h-10 px-4 text-sm font-medium
												flex items-center justify-center
												transition-all duration-150
												${isFirst ? 'rounded-l-full' : ''}
												${isLast ? 'rounded-r-full' : ''}
												${!isFirst ? 'border-l border-[var(--md-ref-color-outline-variant)]' : ''}
											${isSelected
												? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
												: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
											}
											`.trim()}
											>
												{option.label}
											</button>
										);
									})}
								</div>
							</div>

							{/* Title - full width */}
							<div className="mb-3">
								<TextField label="Title" value={newTitle} onChange={setNewTitle} variant="underlined" />
							</div>

							{/* Fixed event: Start/End on separate row */}
							{newKind === "fixed_event" && (
								<div className="grid grid-cols-2 gap-3 mb-3">
									<DateTimePicker label="Start" value={newFixedStartAt} onChange={setNewFixedStartAt} variant="underlined" />
									<DateTimePicker label="End" value={newFixedEndAt} onChange={setNewFixedEndAt} variant="underlined" />
								</div>
							)}

							{/* Required time - M3 Time Picker (disabled for fixed events) */}
							<div className="mb-3">
								{newKind === "fixed_event" ? (
									<TextField
										label="Required time"
										value={(() => {
											if (!newFixedStartAt || !newFixedEndAt) return "";
											const start = new Date(newFixedStartAt).getTime();
											const end = new Date(newFixedEndAt).getTime();
											if (isNaN(start) || isNaN(end) || end <= start) return "";
											const minutes = Math.round((end - start) / (1000 * 60));
											const hours = Math.floor(minutes / 60);
											const mins = minutes % 60;
											return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
										})()}
										onChange={() => {}}
										variant="underlined"
										disabled
									/>
								) : (
									<TimePicker
										label="Required time"
										value={newDurationTime}
										onChange={(value) => {
											setNewDurationTime(value);
											if (value) {
												const [hours, mins] = value.split(':').map(Number);
												const totalMinutes = (hours || 0) * 60 + (mins || 0);
												setNewRequiredMinutes(String(totalMinutes));
											}
										}}
										variant="underlined"
									/>
								)}
							</div>

							{/* Flex window: Window start/end */}
							{newKind === "flex_window" && (
								<div className="grid grid-cols-2 gap-3 mb-3">
									<DateTimePicker label="Window start" value={newWindowStartAt} onChange={setNewWindowStartAt} variant="underlined" />
									<DateTimePicker label="Window end" value={newWindowEndAt} onChange={setNewWindowEndAt} variant="underlined" />
								</div>
							)}

							{/* Advanced settings accordion */}
							<div className="mb-3 border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden">
								<button
									type="button"
									onClick={() => setSectionsCollapsed(prev => ({ ...prev, advanced: !prev.advanced }))}
									className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
								>
									<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">詳細設定</span>
									<Icon name={sectionsCollapsed.advanced ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
								</button>
								{!sectionsCollapsed.advanced && (
									<div className="p-4 space-y-4 border-t border-[var(--md-ref-color-outline-variant)]">
										{/* Group selection */}
										<div>
											<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
												グループ
											</label>
											<select
												value={selectedGroupId || ""}
												onChange={(e) => setSelectedGroupId(e.target.value || null)}
												className="w-full h-10 px-3 rounded-lg border border-[var(--md-ref-color-outline)] bg-[var(--md-ref-color-surface)] text-sm text-[var(--md-ref-color-on-surface)] focus:border-[var(--md-ref-color-primary)] focus:outline-none"
											>
												<option value="">グループを選択</option>
												{groups.map((group) => (
													<option key={group.id} value={group.id}>
														{group.name}
													</option>
												))}
											</select>
										</div>

										{/* Project selection */}
										<div>
											<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
												プロジェクト
											</label>
											<select
												value={selectedProjectId || ""}
												onChange={(e) => setSelectedProjectId(e.target.value || null)}
												className="w-full h-10 px-3 rounded-lg border border-[var(--md-ref-color-outline)] bg-[var(--md-ref-color-surface)] text-sm text-[var(--md-ref-color-on-surface)] focus:border-[var(--md-ref-color-primary)] focus:outline-none"
											>
												<option value="">プロジェクトを選択</option>
												{projects.map((project) => (
													<option key={project.id} value={project.id}>
														{project.name}
													</option>
												))}
											</select>
										</div>
									</div>
								)}
							</div>

							{/* Tags - Google-style input chips */}
							<div className="mb-3">
								<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
									Tags
								</label>
								<div className="flex flex-wrap items-center gap-2 min-h-[40px] px-0 py-2 border-b border-[var(--md-ref-color-outline-variant)] focus-within:border-[var(--md-ref-color-primary)] transition-colors">
									{newTags.map((tag, index) => (
										<span
											key={`${tag}-${index}`}
											className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-sm text-[var(--md-ref-color-on-surface)]"
										>
											{tag}
											<button
												type="button"
												onClick={() => setNewTags(newTags.filter((_, i) => i !== index))}
												className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container-highest)] flex items-center justify-center w-4 h-4 rounded-full text-[var(--md-ref-color-on-surface-variant)]"
												aria-label={`Remove ${tag}`}
											>
												<Icon name="close" size={14} />
											</button>
										</span>
									))}
									<input
										type="text"
										value={tagInput}
										onChange={(e) => setTagInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && tagInput.trim()) {
												e.preventDefault();
												setNewTags([...newTags, tagInput.trim()]);
												setTagInput('');
											} else if (e.key === 'Backspace' && !tagInput && newTags.length > 0) {
												setNewTags(newTags.slice(0, -1));
											}
										}}
										placeholder={newTags.length === 0 ? 'Enterで追加...' : ''}
										className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
									/>
								</div>
							</div>

							{/* Memo - full width, multiline, at the bottom */}
							<div className="mb-3">
								<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
									Memo
								</label>
								<textarea
									value={newDescription}
									onChange={(e) => setNewDescription(e.target.value)}
									placeholder="Add a description..."
									rows={2}
									className="
										w-full px-3 py-2
										bg-transparent
										border-b border-[var(--md-ref-color-outline-variant)]
										focus:border-[var(--md-ref-color-primary)]
										outline-none
										text-sm text-[var(--md-ref-color-on-surface)]
										placeholder:text-[var(--md-ref-color-on-surface-variant)]
										resize-none
										transition-colors duration-150
									"
								/>
							</div>

							{/* Action buttons */}
							<div className="mt-2 flex justify-between gap-2">
								<button
									type="button"
									onClick={() => {
										setNewTitle("");
										setNewDescription("");
										setNewKind("duration_only");
										setNewRequiredMinutes("25");
										setNewDurationTime("00:25");
										setNewFixedStartAt("");
										setNewFixedEndAt("");
										setNewWindowStartAt("");
										setNewWindowEndAt("");
										setNewTags([]);
										setTagInput("");
									}}
									className="h-10 px-6 text-sm font-medium transition-colors"
									style={{
										borderRadius: '9999px',
										backgroundColor: 'var(--md-ref-color-surface-container)',
										color: 'var(--md-ref-color-on-surface)',
										border: '1px solid var(--md-ref-color-outline-variant)',
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = 'var(--md-ref-color-surface-container-high)';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = 'var(--md-ref-color-surface-container)';
									}}
								>
									クリア
								</button>
								<button
									type="button"
									onClick={handleCreateTask}
									className="h-10 px-6 text-sm font-medium transition-colors"
									style={{
										borderRadius: '9999px',
										backgroundColor: 'var(--md-ref-color-primary)',
										color: 'var(--md-ref-color-on-primary)',
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor = 'var(--md-sys-color-primary-fixed-dim)';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor = 'var(--md-ref-color-primary)';
									}}
								>
									追加
								</button>
							</div>
						</div>
					</div>

					{/* Group Dialog */}
					<GroupDialog
						open={groupDialogOpen}
						onClose={() => {
							setGroupDialogOpen(false);
						}}
						onSubmit={async (name, parentId) => {
							await createGroup(name, parentId);
						}}
					/>

					{/* Project Dialog */}
					<ProjectDialog
						open={projectDialogOpen}
						onClose={() => {
							setProjectDialogOpen(false);
						}}
						onSubmit={async (name, _description) => {
							void _description; // Reserved for future use
							await createProject(name);
						}}
					/>
				</div>
			</div>
		</div>
	);
}

