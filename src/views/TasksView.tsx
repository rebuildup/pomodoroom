/**
 * TasksView — Task list view with collapsible sections and create panel
 */

import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { Icon } from "@/components/m3/Icon";
import { TextField } from "@/components/m3/TextField";
import { Select } from "@/components/m3/Select";
import { DateTimePicker, TimePicker, DatePicker } from "@/components/m3/DateTimePicker";
import { TaskCard } from "@/components/m3/TaskCard";
import { ReferenceCard } from "@/components/m3/ReferenceCard";
import { useTaskStore } from "@/hooks/useTaskStore";
import { showActionNotification } from "@/hooks/useActionNotification";
import { useProjects } from "@/hooks/useProjects";
import { useGroups } from "@/hooks/useGroups";
import { useWindowManager } from "@/hooks/useWindowManager";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import type { ProjectReference } from "@/types/schedule";
import type { TasksViewAction } from "@/components/m3/OverviewProjectManager";
import { getTasksForProject } from "@/utils/project-task-matching";
import { toCandidateIso, toTimeLabel } from "@/utils/notification-time";

type TaskKind = "fixed_event" | "flex_window" | "buffer_fill" | "duration_only" | "break";

function localInputToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function isoToLocalInput(value: string | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60_000);
	return local.toISOString().slice(0, 16);
}

interface TasksViewProps {
	initialAction?: TasksViewAction | null;
	onActionHandled?: () => void;
}

export default function TasksView({ initialAction, onActionHandled }: TasksViewProps) {
	const taskStore = useTaskStore();
	const { projects, createProject, updateProject, deleteProject } = useProjects();
	const { groups, createGroup, updateGroup, deleteGroup } = useGroups();
	const { openWindow } = useWindowManager();

	// View mode: by_state | by_group | by_project | by_tag
	const [viewMode, setViewMode] = useState<"by_state" | "by_group" | "by_project" | "by_tag">(
		"by_state",
	);

	// Sort and search states
	const [sortBy, setSortBy] = useState<"createdAt" | "updatedAt" | "title" | "pressure">(
		"createdAt",
	);
	const [searchQuery, setSearchQuery] = useState("");

	// Selected group/project/tag
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
	// const [selectedTagId, setSelectedTagId] = useState<string | null>(null); // TODO: implement tag filter

	// Collapsible section states
	const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>({
		ready: false,
		running: false,
		paused: false,
		done: true,
		all: false,
	});

	// Editing mode: when set, replace create panel with edit form
	const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
	const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
	const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

	// Creating mode: when set, replace create panel with create form
	const [creatingGroupId, setCreatingGroupId] = useState(false);
	const [creatingProjectId, setCreatingProjectId] = useState(false);
	const [creatingReferenceId, setCreatingReferenceId] = useState<string | null>(null); // Which project to add reference to

	// Editing mode: when set, replace create panel with edit form
	const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);

	// Edit form states
	const [editProjectName, setEditProjectName] = useState("");
	const [editProjectDeadline, setEditProjectDeadline] = useState("");
	const [editProjectRefs, setEditProjectRefs] = useState<
		Array<{ id?: string; kind: string; value: string; label?: string }>
	>([]);
	const [editGroupName, setEditGroupName] = useState("");

	// Create form states for group and project
	const [newGroupName, setNewGroupName] = useState("");
	const [newGroupParentId, setNewGroupParentId] = useState<string | undefined>(undefined);
	const [newProjectName, setNewProjectName] = useState("");
	const [newProjectDeadline, setNewProjectDeadline] = useState("");
	const [newProjectDescription, setNewProjectDescription] = useState("");

	// Create form states for reference
	const [newReferenceKind, setNewReferenceKind] = useState("url");
	const [newReferenceValue, setNewReferenceValue] = useState("");
	const [newReferenceLabel, setNewReferenceLabel] = useState("");

	// Edit form states for reference
	const [editReferenceProjectId, setEditReferenceProjectId] = useState<string | null>(null); // Which project the reference belongs to
	const [editReferenceKind, setEditReferenceKind] = useState("url");
	const [editReferenceValue, setEditReferenceValue] = useState("");
	const [editReferenceLabel, setEditReferenceLabel] = useState("");

	// Get the item being edited
	const editingProject = editingProjectId ? projects.find((p) => p.id === editingProjectId) : null;

	// Initialize edit form when project is selected
	const handleStartEditProject = (projectId: string) => {
		const project = projects.find((p) => p.id === projectId);
		if (project) {
			setEditingProjectId(projectId);
			setCreatingReferenceId(null);
			setEditingReferenceId(null);
			setEditingGroupId(null);
			setEditingTaskId(null);
			setEditProjectName(project.name);
			setEditProjectDeadline(project.deadline || "");
			setEditProjectRefs(
				(project.references ?? []).map((r) => ({
					id: r.id,
					kind: r.kind,
					value: r.value,
					label: r.label,
				})),
			);
		}
	};

	// Initialize edit form when group is selected
	const handleStartEditGroup = (groupId: string) => {
		const group = groups.find((g) => g.id === groupId);
		if (group) {
			setEditingProjectId(null);
			setCreatingReferenceId(null);
			setEditingReferenceId(null);
			setEditingGroupId(groupId);
			setEditingTaskId(null);
			setEditGroupName(group.name);
		}
	};

	// Initialize edit form when task is selected
	const handleStartEditTask = (taskId: string) => {
		const task = taskStore.tasks.find((t) => t.id === taskId);
		if (task) {
			setEditingProjectId(null);
			setCreatingReferenceId(null);
			setEditingReferenceId(null);
			setEditingGroupId(null);
			setEditingTaskId(taskId);
			// Reuse create form states for editing
			setNewTitle(task.title);
			setNewDescription(task.description || "");
			setNewKind(task.kind || "duration_only");
			setNewRequiredMinutes(String(task.requiredMinutes || 25));
			const mins = task.requiredMinutes || 25;
			setNewDurationTime(
				`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`,
			);
			setNewTags(task.tags || []);
			setNewAllowSplit(task.allowSplit !== false);
			// Initialize datetime fields
			setNewFixedStartAt(isoToLocalInput(task.fixedStartAt));
			setNewFixedEndAt(isoToLocalInput(task.fixedEndAt));
			setNewWindowStartAt(isoToLocalInput(task.windowStartAt));
			setNewWindowEndAt(isoToLocalInput(task.windowEndAt));
			// Initialize group selection
			setSelectedGroupId(task.group || null);
		}
	};

	// Cancel editing - reset all form states
	const handleCancelEdit = () => {
		setEditingProjectId(null);
		setEditingGroupId(null);
		setEditingTaskId(null);
		setEditingReferenceId(null);
		setCreatingGroupId(false);
		setCreatingProjectId(false);
		setCreatingReferenceId(null);
		setEditProjectName("");
		setEditProjectDeadline("");
		setEditProjectRefs([]);
		setEditGroupName("");
		// Reset create form states as well
		setNewTitle("");
		setNewDescription("");
		setNewKind("duration_only");
		setNewRequiredMinutes("25");
		setNewDurationTime("00:25");
		setNewTags([]);
		setNewAllowSplit(true);
		// Reset group/project create form states
		setNewGroupName("");
		setNewGroupParentId(undefined);
		setNewProjectName("");
		setNewProjectDeadline("");
		setNewProjectDescription("");
		// Reset reference create form states
		setNewReferenceKind("url");
		setNewReferenceValue("");
		setNewReferenceLabel("");
		// Reset reference edit form states
		setEditReferenceProjectId(null);
		setEditReferenceKind("url");
		setEditReferenceValue("");
		setEditReferenceLabel("");
	};

	// Track processed action to prevent double-processing in React Strict Mode
	const processedActionRef = useRef<string | null>(null);

	// Handle initial action from navigation (e.g., from Overview)
	useEffect(() => {
		if (!initialAction) return;

		// Create a unique key for this action to prevent double-processing
		const actionKey = `${initialAction.type}:${initialAction.projectId || ""}`;
		if (processedActionRef.current === actionKey) return;
		processedActionRef.current = actionKey;

		if (initialAction.type === "create-task") {
			// Reset editing states and set project if provided
			handleCancelEdit();
			if (initialAction.projectId) {
				setSelectedProjectId(initialAction.projectId);
			}
		} else if (initialAction.type === "create-reference") {
			// Start creating reference for the specified project
			handleCancelEdit();
			setCreatingReferenceId(initialAction.projectId);
		} else if (initialAction.type === "edit-project") {
			// Start editing the specified project
			handleStartEditProject(initialAction.projectId);
		}

		// Notify parent that action was handled
		onActionHandled?.();
	}, [
		initialAction,
		onActionHandled,
		// biome-ignore lint/correctness/useExhaustiveDependencies: stable function
		handleCancelEdit,
		// biome-ignore lint/correctness/useExhaustiveDependencies: stable function
		handleStartEditProject,
		// setSelectedProjectId, // State setter - stable
		// setCreatingReferenceId, // State setter - stable
	]);

	const handleUpdateProject = async () => {
		if (!editingProjectId || !editProjectName.trim()) return;
		await updateProject(editingProjectId, {
			name: editProjectName.trim(),
			deadline: editProjectDeadline || null,
			references: editProjectRefs,
		});
		handleCancelEdit();
	};

	const handleDeleteProject = async () => {
		if (!editingProjectId) return;
		if (confirm("このプロジェクトを削除しますか？関連するタスクも削除されます。")) {
			await deleteProject(editingProjectId, true);
			handleCancelEdit();
		}
	};

	const handleUpdateGroup = async () => {
		if (!editingGroupId || !editGroupName.trim()) return;
		await updateGroup(editingGroupId, { name: editGroupName.trim() });
		handleCancelEdit();
	};

	const handleDeleteGroup = async () => {
		if (!editingGroupId) return;
		if (confirm("このグループを削除しますか？")) {
			await deleteGroup(editingGroupId);
			handleCancelEdit();
		}
	};

	const handleUpdateTask = async () => {
		if (!editingTaskId || !newTitle.trim()) return;
		await taskStore.updateTask(editingTaskId, {
			title: newTitle.trim(),
			description: newDescription.trim() || undefined,
			kind: newKind,
			requiredMinutes: parseInt(newRequiredMinutes, 10) || 25,
			tags: newTags,
			allowSplit: newAllowSplit,
			fixedStartAt: newKind === "fixed_event" ? localInputToIso(newFixedStartAt) : null,
			fixedEndAt: newKind === "fixed_event" ? localInputToIso(newFixedEndAt) : null,
			windowStartAt: newKind === "flex_window" ? localInputToIso(newWindowStartAt) : null,
			windowEndAt: newKind === "flex_window" ? localInputToIso(newWindowEndAt) : null,
			group: selectedGroupId || undefined,
		});
		handleCancelEdit();
	};

	const handleDeleteTask = async () => {
		if (!editingTaskId) return;
		if (confirm("このタスクを削除しますか？")) {
			await taskStore.deleteTask(editingTaskId);
			handleCancelEdit();
		}
	};

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
	const [newAllowSplit, setNewAllowSplit] = useState(true);

	const readyTasks = taskStore.getTasksByState("READY");
	const runningTasks = taskStore.getTasksByState("RUNNING");
	const pausedTasks = taskStore.getTasksByState("PAUSED");
	const doneTasks = taskStore.getTasksByState("DONE");

	// Group tasks by group ID
	const grouped: Record<string, typeof taskStore.tasks> = {};
	for (const group of groups) {
		grouped[group.id] = [];
	}
	for (const task of taskStore.tasks) {
		const matchedGroup = groups.find(
			(group) => task.group === group.id || task.group === group.name,
		);
		if (matchedGroup) {
			grouped[matchedGroup.id].push(task);
		}
	}
	const tasksByGroup = grouped;

	// Group tasks by project ID
	const projectsMap: Record<string, typeof taskStore.tasks> = {};
	for (const project of projects) {
		projectsMap[project.id] = getTasksForProject(taskStore.tasks, project);
	}
	const tasksByProject = projectsMap;

	// Group tasks by tag
	const tagsMap: Record<string, typeof taskStore.tasks> = {};
	taskStore.tasks.forEach((task) => {
		if (task.tags && task.tags.length > 0) {
			task.tags.forEach((tag) => {
				if (!tagsMap[tag]) {
					tagsMap[tag] = [];
				}
				tagsMap[tag].push(task);
			});
		}
	});
	const tasksByTag = tagsMap;

	// All unique tags sorted
	const tags = new Set<string>();
	for (const task of taskStore.tasks) {
		if (task.tags) {
			for (const tag of task.tags) {
				tags.add(tag);
			}
		}
	}
	const allTags = Array.from(tags).sort();

	const normalizedSearch = searchQuery.trim().toLowerCase();
	const filterBySearch = (list: typeof taskStore.tasks) => {
		if (!normalizedSearch) return list;
		return list.filter((task) => {
			const title = task.title.toLowerCase();
			const description = (task.description ?? "").toLowerCase();
			const tags = (task.tags ?? []).join(" ").toLowerCase();
			return (
				title.includes(normalizedSearch) ||
				description.includes(normalizedSearch) ||
				tags.includes(normalizedSearch)
			);
		});
	};
	const visibleReadyTasks = filterBySearch(readyTasks);
	const visibleRunningTasks = filterBySearch(runningTasks);
	const visiblePausedTasks = filterBySearch(pausedTasks);
	const visibleDoneTasks = filterBySearch(doneTasks);
	const visibleTasksByGroup = Object.fromEntries(
		Object.entries(tasksByGroup).map(([groupId, list]) => [groupId, filterBySearch(list)]),
	) as Record<string, typeof taskStore.tasks>;
	const visibleTasksByProject = Object.fromEntries(
		Object.entries(tasksByProject).map(([projectId, list]) => [projectId, filterBySearch(list)]),
	) as Record<string, typeof taskStore.tasks>;
	const visibleTasksByTag = Object.fromEntries(
		Object.entries(tasksByTag).map(([tag, list]) => [tag, filterBySearch(list)]),
	) as Record<string, typeof taskStore.tasks>;

	const handleCreateTask = () => {
		if (!newTitle.trim()) return;
		const tags = newTags.filter((t) => t.length > 0);

		let requiredMinutes: number;
		if (newKind === "fixed_event" && newFixedStartAt && newFixedEndAt) {
			const start = new Date(newFixedStartAt).getTime();
			const end = new Date(newFixedEndAt).getTime();
			requiredMinutes =
				Number.isNaN(start) || Number.isNaN(end) || end <= start
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
			allowSplit: newAllowSplit,
			group: selectedGroupId || undefined,
			project: selectedProjectId || undefined,
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
		setNewAllowSplit(true);
		setSelectedGroupId(null);
		setSelectedProjectId(null);
	};

	const handleCreateGroup = async () => {
		if (!newGroupName.trim()) return;
		await createGroup(newGroupName.trim(), newGroupParentId);
		setNewGroupName("");
		setNewGroupParentId(undefined);
		setCreatingGroupId(false);
	};

	const handleCreateProject = async () => {
		if (!newProjectName.trim()) return;
		await createProject(
			newProjectName.trim(),
			newProjectDeadline || undefined,
			[],
			newProjectDescription.trim() || undefined,
		);
		setNewProjectName("");
		setNewProjectDeadline("");
		setNewProjectDescription("");
		setCreatingProjectId(false);
	};

	const handleCreateReference = async () => {
		// Note kind allows empty value, other kinds require value
		if (!creatingReferenceId) return;
		if (newReferenceKind !== "note" && !newReferenceValue.trim()) return;

		const project = projects.find((p) => p.id === creatingReferenceId);
		if (!project) return;
		const now = new Date().toISOString();
		const newRef = {
			id: `ref-${Date.now()}`,
			projectId: creatingReferenceId,
			kind: newReferenceKind,
			value: newReferenceKind === "note" ? "" : newReferenceValue.trim(),
			label: newReferenceLabel.trim() || undefined,
			orderIndex: (project.references || []).length,
			createdAt: now,
			updatedAt: now,
		};
		await updateProject(creatingReferenceId, {
			name: project.name,
			deadline: project.deadline || null,
			references: [...(project.references || []), newRef],
		});
		setNewReferenceKind("url");
		setNewReferenceValue("");
		setNewReferenceLabel("");
		setCreatingReferenceId(null);
	};

	const handleStartEditReference = (referenceId: string, projectId: string) => {
		const project = projects.find((p) => p.id === projectId);
		if (!project) return;
		const reference = (project.references || []).find((r) => r.id === referenceId);
		if (!reference) return;

		setEditingReferenceId(referenceId);
		setEditReferenceProjectId(projectId);
		setEditReferenceKind(reference.kind);
		setEditReferenceValue(reference.value);
		setEditReferenceLabel(reference.label || "");
		setEditingProjectId(null);
		setEditingGroupId(null);
		setEditingTaskId(null);
		setCreatingGroupId(false);
		setCreatingProjectId(false);
		setCreatingReferenceId(null);
	};

	const handleUpdateReference = async () => {
		// Note kind allows empty value, other kinds require value
		if (!editingReferenceId || !editReferenceProjectId) return;
		if (editReferenceKind !== "note" && !editReferenceValue.trim()) return;

		const project = projects.find((p) => p.id === editReferenceProjectId);
		if (!project) return;

		const updatedRefs = (project.references || []).map((r) =>
			r.id === editingReferenceId
				? {
						...r,
						kind: editReferenceKind,
						value: editReferenceKind === "note" ? editReferenceValue : editReferenceValue.trim(),
						label: editReferenceLabel.trim() || undefined,
					}
				: r,
		);

		await updateProject(editReferenceProjectId, {
			name: project.name,
			deadline: project.deadline || null,
			references: updatedRefs,
		});
		handleCancelEdit();
	};

	const handleDeleteReference = async () => {
		if (!editingReferenceId || !editReferenceProjectId) return;
		const project = projects.find((p) => p.id === editReferenceProjectId);
		if (!project) return;

		const filteredRefs = (project.references || []).filter((r) => r.id !== editingReferenceId);

		await updateProject(editReferenceProjectId, {
			name: project.name,
			deadline: project.deadline || null,
			references: filteredRefs,
		});
		handleCancelEdit();
	};

	// Execute reference (open file, URL, or show note)
	const handleExecuteReference = async (reference: ProjectReference, projectId?: string) => {
		const kind = reference.kind.toLowerCase();
		if (kind === "url" || kind === "link") {
			// Open URL in default browser
			try {
				await invoke("cmd_open_reference", { target: reference.value });
			} catch (error) {
				console.error("Failed to open URL:", error);
			}
		} else if (kind === "file" || kind === "folder") {
			// Open file/folder with default app
			try {
				await invoke("cmd_open_reference", { target: reference.value });
			} catch (error) {
				console.error("Failed to open path:", error);
			}
		} else if (kind === "note") {
			// Open note view window with reference data
			try {
				const windowLabel = await openWindow("note");
				if (windowLabel) {
					// Wait for window to fully load before emitting event
					await new Promise((resolve) => setTimeout(resolve, 500));
					console.log("[TasksView] Emitting note:load-reference to", windowLabel);
					await emitTo(windowLabel, "note:load-reference", {
						projectId: projectId || "",
						referenceId: reference.id,
					});
					console.log("[TasksView] Event emitted successfully");
				}
			} catch (error) {
				console.error("Failed to open note window:", error);
			}
		}
	};

	// Handlers for file/folder selection
	const handleSelectFile = async () => {
		try {
			const selected = await open({
				multiple: false,
				directory: false,
			});
			if (selected && typeof selected === "string") {
				setNewReferenceValue(selected);
			}
		} catch (error) {
			console.error("File selection failed:", error);
		}
	};

	const handleSelectFolder = async () => {
		try {
			const selected = await open({
				multiple: false,
				directory: true,
			});
			if (selected && typeof selected === "string") {
				setNewReferenceValue(selected);
			}
		} catch (error) {
			console.error("Folder selection failed:", error);
		}
	};

	const handleTaskOperation = async (_taskId: string, operation: TaskOperation) => {
		const task = taskStore.getTask(_taskId);
		if (!task) return;

		if (operation === "pause") {
			const now = new Date();
			const nowMs = now.getTime();
			const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;

			const nextScheduledMs =
				taskStore.tasks
					.filter((t) => t.id !== task.id && (t.state === "READY" || t.state === "PAUSED"))
					.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
					.filter((v): v is string => Boolean(v))
					.map((v) => Date.parse(v))
					.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
					.sort((a, b) => a - b)[0] ?? null;

			const candidatesRaw: Array<{ label: string; atMs: number }> = [
				{ label: "15分後", atMs: nowMs + 15 * 60_000 },
				...(nextScheduledMs ? [{ label: "次タスク開始時刻", atMs: nextScheduledMs }] : []),
				...(nextScheduledMs
					? [{ label: "次タスク後に再開", atMs: nextScheduledMs + durationMs }]
					: []),
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
						label: `${c.label} (${toTimeLabel(c.iso)})`,
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
			return;
		}

		if (operation === "edit") {
			handleStartEditTask(_taskId);
		}
	};

	return (
		<div className="space-y-4">
			<div className="max-w-7xl mx-auto">
				{/* Main content: responsive layout */}
				<div className="flex flex-col-reverse lg:flex-row gap-4">
					{/* Left column: Controls + Task list */}
					<div className="flex-1 min-w-0 space-y-3">
						{/* Controls row: View mode (left) + Sort (right) */}
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 overflow-x-auto">
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
												// setSelectedTagId(null); // TODO: implement tag filter
											}}
											className={`
												no-pill h-8 px-3 text-xs font-medium
												flex items-center justify-center
												transition-all duration-150 whitespace-nowrap
												${
													isSelected
														? "!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]"
														: "!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]"
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

							{/* Sort selector */}
							<div className="inline-flex items-center gap-2 flex-shrink-0">
								<span className="text-xs text-[var(--md-ref-color-on-surface-variant)] whitespace-nowrap">
									並び順:
								</span>
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
													${
														isSelected
															? "!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]"
															: "!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]"
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
								<section className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
									<button
										type="button"
										onClick={() =>
											setSectionsCollapsed((prev) => ({ ...prev, ready: !prev.ready }))
										}
										className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="radio_button_unchecked" size={18} />
											<span>準備中</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">
												({visibleReadyTasks.length})
											</span>
										</div>
										<Icon
											name={sectionsCollapsed.ready ? "expand_more" : "expand_less"}
											size={20}
											className="text-[var(--md-ref-color-on-surface-variant)]"
										/>
									</button>
									{!sectionsCollapsed.ready && (
										<div className="task-list-scroll grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y">
											{visibleReadyTasks.map((task) => (
												<TaskCard
													key={task.id}
													task={task}
													allTasks={taskStore.tasks}
													draggable={false}
													density="compact"
													operationsPreset="default"
													showStatusControl={true}
													expandOnClick={false}
													onClick={(task) => handleStartEditTask(task.id)}
													onOperation={handleTaskOperation}
												/>
											))}
											<TaskCard
												addMode
												onAddClick={(e) => {
													e.stopPropagation();
													handleCancelEdit();
												}}
											/>
										</div>
									)}
								</section>

								{/* Running tasks */}
								<section className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
									<button
										type="button"
										onClick={() =>
											setSectionsCollapsed((prev) => ({ ...prev, running: !prev.running }))
										}
										className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="play_arrow" size={18} className="text-green-500" />
											<span>実行中</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">
												({visibleRunningTasks.length})
											</span>
										</div>
										<Icon
											name={sectionsCollapsed.running ? "expand_more" : "expand_less"}
											size={20}
											className="text-[var(--md-ref-color-on-surface-variant)]"
										/>
									</button>
									{!sectionsCollapsed.running && (
										<div className="task-list-scroll grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y">
											{visibleRunningTasks.map((task) => (
												<TaskCard
													key={task.id}
													task={task}
													allTasks={taskStore.tasks}
													draggable={false}
													density="compact"
													operationsPreset="default"
													showStatusControl={true}
													expandOnClick={false}
													onClick={(task) => handleStartEditTask(task.id)}
													onOperation={handleTaskOperation}
												/>
											))}
											<TaskCard
												addMode
												onAddClick={(e) => {
													e.stopPropagation();
													handleCancelEdit();
												}}
											/>
										</div>
									)}
								</section>

								{/* Paused tasks */}
								<section className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
									<button
										type="button"
										onClick={() =>
											setSectionsCollapsed((prev) => ({ ...prev, paused: !prev.paused }))
										}
										className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="pause" size={18} className="text-orange-500" />
											<span>一時停止</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">
												({visiblePausedTasks.length})
											</span>
										</div>
										<Icon
											name={sectionsCollapsed.paused ? "expand_more" : "expand_less"}
											size={20}
											className="text-[var(--md-ref-color-on-surface-variant)]"
										/>
									</button>
									{!sectionsCollapsed.paused && (
										<div className="task-list-scroll grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y">
											{visiblePausedTasks.map((task) => (
												<TaskCard
													key={task.id}
													task={task}
													allTasks={taskStore.tasks}
													draggable={false}
													density="compact"
													operationsPreset="default"
													showStatusControl={true}
													expandOnClick={false}
													onClick={(task) => handleStartEditTask(task.id)}
													onOperation={handleTaskOperation}
												/>
											))}
											<TaskCard
												addMode
												onAddClick={(e) => {
													e.stopPropagation();
													handleCancelEdit();
												}}
											/>
										</div>
									)}
								</section>

								{/* Done tasks */}
								<section className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
									<button
										type="button"
										onClick={() => setSectionsCollapsed((prev) => ({ ...prev, done: !prev.done }))}
										className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
									>
										<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											<Icon name="check_circle" size={18} className="text-purple-500" />
											<span>完了</span>
											<span className="text-[var(--md-ref-color-on-surface-variant)]">
												({visibleDoneTasks.length})
											</span>
										</div>
										<Icon
											name={sectionsCollapsed.done ? "expand_more" : "expand_less"}
											size={20}
											className="text-[var(--md-ref-color-on-surface-variant)]"
										/>
									</button>
									{!sectionsCollapsed.done && (
										<div className="task-list-scroll grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y">
											{visibleDoneTasks.map((task) => (
												<TaskCard
													key={task.id}
													task={task}
													allTasks={taskStore.tasks}
													draggable={false}
													density="compact"
													operationsPreset="default"
													showStatusControl={true}
													expandOnClick={false}
													onClick={(task) => handleStartEditTask(task.id)}
													onOperation={handleTaskOperation}
												/>
											))}
											<TaskCard
												addMode
												onAddClick={(e) => {
													e.stopPropagation();
													handleCancelEdit();
												}}
											/>
										</div>
									)}
								</section>
							</>
						)}

						{/* View mode: by_group */}
						{viewMode === "by_group" &&
							(groups.length === 0 ? (
								<section className="w-full rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
									<button
										type="button"
										onClick={() => {
											setCreatingGroupId(true);
											setCreatingReferenceId(null);
											setEditingReferenceId(null);
											setEditingProjectId(null);
											setEditingGroupId(null);
											setEditingTaskId(null);
											setCreatingProjectId(false);
										}}
										className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-center gap-2 transition-colors"
									>
										<Icon name="add" size={18} className="text-[var(--md-ref-color-primary)]" />
										<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											グループを作成
										</span>
									</button>
								</section>
							) : (
								<>
									{groups.map((group) => {
										const groupTasks = visibleTasksByGroup[group.id] || [];
										return (
											<section
												key={group.id}
												className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]"
											>
												<button
													type="button"
													onClick={() =>
														setSectionsCollapsed((prev) => ({
															...prev,
															[group.id]: !prev[group.id as keyof typeof sectionsCollapsed],
														}))
													}
													className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
												>
													<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
														<Icon name="folder" size={18} />
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																handleStartEditGroup(group.id);
															}}
															className="hover:text-[var(--md-ref-color-primary)] transition-colors"
														>
															{group.name}
														</button>
														<span className="text-[var(--md-ref-color-on-surface-variant)]">
															({groupTasks.length})
														</span>
													</div>
													<Icon
														name={
															sectionsCollapsed[group.id as keyof typeof sectionsCollapsed]
																? "expand_more"
																: "expand_less"
														}
														size={20}
														className="text-[var(--md-ref-color-on-surface-variant)]"
													/>
												</button>
												{!sectionsCollapsed[group.id as keyof typeof sectionsCollapsed] && (
													<div className="task-list-scroll grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y">
														{groupTasks.map((task) => (
															<TaskCard
																key={task.id}
																task={task}
																allTasks={taskStore.tasks}
																draggable={false}
																density="compact"
																operationsPreset="default"
																showStatusControl={true}
																expandOnClick={false}
																onClick={(task) => handleStartEditTask(task.id)}
																onOperation={handleTaskOperation}
															/>
														))}
														<TaskCard
															addMode
															onAddClick={(e) => {
																e.stopPropagation();
																handleCancelEdit();
															}}
														/>
													</div>
												)}
											</section>
										);
									})}
									{/* Add group card at the end */}
									<section className="w-full mt-2 rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
										<button
											type="button"
											onClick={() => {
												setCreatingGroupId(true);
												setCreatingReferenceId(null);
												setEditingReferenceId(null);
												setEditingProjectId(null);
												setEditingGroupId(null);
												setEditingTaskId(null);
												setCreatingProjectId(false);
											}}
											className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-center gap-2 transition-colors"
										>
											<Icon name="add" size={18} className="text-[var(--md-ref-color-primary)]" />
											<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
												グループを作成
											</span>
										</button>
									</section>
								</>
							))}

						{/* View mode: by_project */}
						{viewMode === "by_project" &&
							(projects.length === 0 ? (
								<section className="w-full rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
									<button
										type="button"
										onClick={() => {
											setCreatingProjectId(true);
											setCreatingReferenceId(null);
											setEditingReferenceId(null);
											setEditingProjectId(null);
											setEditingGroupId(null);
											setEditingTaskId(null);
											setCreatingGroupId(false);
										}}
										className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-center gap-2 transition-colors"
									>
										<Icon name="add" size={18} className="text-[var(--md-ref-color-primary)]" />
										<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
											プロジェクトを作成
										</span>
									</button>
								</section>
							) : (
								<>
									{projects.map((project) => {
										const projectTasks = visibleTasksByProject[project.id] || [];
										const projectRefs = project.references || [];
										const isExpanded =
											!sectionsCollapsed[project.id as keyof typeof sectionsCollapsed];

										return (
											<section
												key={project.id}
												className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]"
											>
												{/* Header with expand/collapse */}
												<button
													type="button"
													onClick={() =>
														setSectionsCollapsed((prev) => ({
															...prev,
															[project.id]: !prev[project.id as keyof typeof sectionsCollapsed],
														}))
													}
													className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
												>
													<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
														<Icon name="folder" size={18} />
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																handleStartEditProject(project.id);
															}}
															className="hover:text-[var(--md-ref-color-primary)] transition-colors"
														>
															{project.name}
														</button>
														<span className="text-[var(--md-ref-color-on-surface-variant)]">
															({projectTasks.length} / {projectRefs.length})
														</span>
													</div>
													<Icon
														name={isExpanded ? "expand_less" : "expand_more"}
														size={20}
														className="text-[var(--md-ref-color-on-surface-variant)]"
													/>
												</button>

												{/* Expanded content: tasks and references stacked vertically */}
												{isExpanded && (
													<div className="border-t border-[var(--md-ref-color-outline-variant)]">
														{/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation */}
														<div
															className="task-list-scroll space-y-4 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y"
															onMouseDown={(e) => e.stopPropagation()}
															onMouseUp={(e) => e.stopPropagation()}
														>
															{/* Tasks section */}
															<div>
																<h4 className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
																	タスク
																</h4>
																<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
																	{projectTasks.map((task) => (
																		<TaskCard
																			key={task.id}
																			task={task}
																			allTasks={taskStore.tasks}
																			draggable={false}
																			density="compact"
																			operationsPreset="default"
																			showStatusControl={true}
																			expandOnClick={false}
																			onClick={(task) => handleStartEditTask(task.id)}
																			onOperation={handleTaskOperation}
																		/>
																	))}
																	{/* Add task card */}
																	<TaskCard
																		addMode
																		onAddClick={(e) => {
																			e.stopPropagation();
																			handleCancelEdit(); // Clear all edit states to show task creation panel
																		}}
																	/>
																</div>
															</div>

															{/* References section */}
															<div>
																<h4 className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
																	リファレンス
																</h4>
																<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
																	{projectRefs
																		.sort((a, b) => a.orderIndex - b.orderIndex)
																		.map((ref) => (
																			<ReferenceCard
																				key={ref.id}
																				reference={ref}
																				projectId={project.id}
																				onExecute={handleExecuteReference}
																				onEdit={() => {
																					handleStartEditReference(ref.id, project.id);
																				}}
																			/>
																		))}
																	{/* Add reference card */}
																	<ReferenceCard
																		addMode
																		onAddClick={(e) => {
																			e.stopPropagation();
																			// Open reference creation panel
																			setCreatingReferenceId(project.id);
																			setEditingReferenceId(null);
																			setEditingProjectId(null);
																			setEditingGroupId(null);
																			setEditingTaskId(null);
																			setCreatingGroupId(false);
																			setCreatingProjectId(false);
																		}}
																	/>
																</div>
															</div>
														</div>
													</div>
												)}
											</section>
										);
									})}
									{/* Add project card at the end */}
									<section className="w-full mt-2 rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
										<button
											type="button"
											onClick={() => {
												setCreatingProjectId(true);
												setCreatingReferenceId(null);
												setEditingReferenceId(null);
												setEditingProjectId(null);
												setEditingGroupId(null);
												setEditingTaskId(null);
												setCreatingGroupId(false);
											}}
											className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-center gap-2 transition-colors"
										>
											<Icon name="add" size={18} className="text-[var(--md-ref-color-primary)]" />
											<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
												プロジェクトを作成
											</span>
										</button>
									</section>
								</>
							))}

						{/* View mode: by_tag */}
						{viewMode === "by_tag" &&
							(allTags.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-64 text-[var(--md-ref-color-on-surface-variant)]">
									<Icon name="tag" size={48} className="mb-4 opacity-50" />
									<p className="text-sm">タグ付きタスクがありません</p>
								</div>
							) : (
								allTags.map((tag) => {
									const tagTasks = visibleTasksByTag[tag] || [];
									if (tagTasks.length === 0) return null;
									return (
										<section
											key={tag}
											className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]"
										>
											<button
												type="button"
												onClick={() =>
													setSectionsCollapsed((prev) => ({
														...prev,
														[tag]: !prev[tag as keyof typeof sectionsCollapsed],
													}))
												}
												className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
											>
												<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
													<Icon name="tag" size={18} />
													<span>{tag}</span>
													<span className="text-[var(--md-ref-color-on-surface-variant)]">
														({tagTasks.length})
													</span>
												</div>
												<Icon
													name={
														sectionsCollapsed[tag as keyof typeof sectionsCollapsed]
															? "expand_more"
															: "expand_less"
													}
													size={20}
													className="text-[var(--md-ref-color-on-surface-variant)]"
												/>
											</button>
											{!sectionsCollapsed[tag as keyof typeof sectionsCollapsed] && (
												<div className="task-list-scroll grid grid-cols-1 xl:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-hover-y">
													{tagTasks.map((task) => (
														<TaskCard
															key={task.id}
															task={task}
															allTasks={taskStore.tasks}
															draggable={false}
															density="compact"
															operationsPreset="default"
															showStatusControl={true}
															expandOnClick={false}
															onClick={(task) => handleStartEditTask(task.id)}
															onOperation={handleTaskOperation}
														/>
													))}
												</div>
											)}
										</section>
									);
								})
							))}
					</div>

					{/* Right column: Search + Create panel */}
					<div className="w-full lg:w-[360px] flex-shrink-0 space-y-3 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
						{/* Search bar */}
						<TextField
							label=""
							value={searchQuery}
							onChange={setSearchQuery}
							placeholder="タスク名、説明、タグで検索..."
							variant="outlined"
							startIcon={<Icon name="search" size={18} />}
						/>

						{/* Create/Edit panel */}
						<div className="rounded-lg p-3 bg-[var(--md-ref-color-surface-container-low)]">
							{creatingReferenceId ? (
								/* Reference Create Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											リファレンスを追加
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>

									{/* Label (optional) - moved to top */}
									<TextField
										label="表示名（オプション）"
										value={newReferenceLabel}
										onChange={setNewReferenceLabel}
										placeholder="例: ドキュメント, 参考リンク"
										variant="underlined"
										maxLength={50}
									/>

									{/* Kind selection */}
									<Select
										label="種類"
										value={newReferenceKind}
										onChange={setNewReferenceKind}
										options={[
											{ value: "url", label: "URL / リンク" },
											{ value: "file", label: "ファイル" },
											{ value: "folder", label: "フォルダ" },
											{ value: "note", label: "メモ" },
										]}
										variant="underlined"
									/>

									{/* Value input based on kind */}
									{newReferenceKind === "url" && (
										<TextField
											label="URL"
											value={newReferenceValue}
											onChange={setNewReferenceValue}
											placeholder="https://..."
											variant="underlined"
											maxLength={500}
										/>
									)}

									{newReferenceKind === "file" && (
										<div className="space-y-2">
											<label
												htmlFor="reference-file"
												className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
											>
												ファイル
											</label>
											<div className="flex gap-2">
												<input
													id="reference-file"
													type="text"
													value={newReferenceValue}
													onChange={(e) => setNewReferenceValue(e.target.value)}
													placeholder="ファイルパス"
													className="flex-1 py-2 px-3 bg-transparent border-b border-[var(--md-ref-color-outline-variant)] focus:border-[var(--md-ref-color-primary)] outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)] transition-colors duration-150"
													readOnly
												/>
												<button
													type="button"
													onClick={handleSelectFile}
													className="h-9 px-3 text-sm font-medium text-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-surface-container-high)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors flex items-center gap-1.5"
												>
													<Icon name="folder_open" size={16} />
													選択
												</button>
											</div>
										</div>
									)}

									{newReferenceKind === "folder" && (
										<div className="space-y-2">
											<label
												htmlFor="reference-folder"
												className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
											>
												フォルダ
											</label>
											<div className="flex gap-2">
												<input
													id="reference-folder"
													type="text"
													value={newReferenceValue}
													onChange={(e) => setNewReferenceValue(e.target.value)}
													placeholder="フォルダパス"
													className="flex-1 py-2 px-3 bg-transparent border-b border-[var(--md-ref-color-outline-variant)] focus:border-[var(--md-ref-color-primary)] outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)] transition-colors duration-150"
													readOnly
												/>
												<button
													type="button"
													onClick={handleSelectFolder}
													className="h-9 px-3 text-sm font-medium text-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-surface-container-high)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors flex items-center gap-1.5"
												>
													<Icon name="folder_open" size={16} />
													選択
												</button>
											</div>
										</div>
									)}

									{newReferenceKind === "note" && null}

									{/* Actions */}
									<div className="flex justify-end gap-2 pt-2">
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
										>
											キャンセル
										</button>
										<button
											type="button"
											onClick={handleCreateReference}
											disabled={newReferenceKind !== "note" && !newReferenceValue.trim()}
											className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
										>
											追加
										</button>
									</div>
								</div>
							) : editingReferenceId ? (
								/* Reference Edit Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											リファレンスを編集
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>

									{/* Label (optional) - moved to top */}
									<TextField
										label="表示名（オプション）"
										value={editReferenceLabel}
										onChange={setEditReferenceLabel}
										placeholder="例: ドキュメント, 参考リンク"
										variant="underlined"
										maxLength={50}
									/>

									{/* Kind selection */}
									<Select
										label="種類"
										value={editReferenceKind}
										onChange={setEditReferenceKind}
										options={[
											{ value: "url", label: "URL / リンク" },
											{ value: "file", label: "ファイル" },
											{ value: "folder", label: "フォルダ" },
											{ value: "note", label: "メモ" },
										]}
										variant="underlined"
									/>

									{/* Value input based on kind */}
									{editReferenceKind === "url" && (
										<TextField
											label="URL"
											value={editReferenceValue}
											onChange={setEditReferenceValue}
											placeholder="https://..."
											variant="underlined"
											maxLength={500}
										/>
									)}

									{editReferenceKind === "file" && (
										<div className="space-y-2">
											<label
												htmlFor="edit-reference-file"
												className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
											>
												ファイル
											</label>
											<div className="flex gap-2">
												<input
													id="edit-reference-file"
													type="text"
													value={editReferenceValue}
													onChange={(e) => setEditReferenceValue(e.target.value)}
													placeholder="ファイルパス"
													className="flex-1 py-2 px-3 bg-transparent border-b border-[var(--md-ref-color-outline-variant)] focus:border-[var(--md-ref-color-primary)] outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)] transition-colors duration-150"
													readOnly
												/>
												<button
													type="button"
													onClick={handleSelectFile}
													className="h-9 px-3 text-sm font-medium text-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-surface-container-high)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors flex items-center gap-1.5"
												>
													<Icon name="folder_open" size={16} />
													選択
												</button>
											</div>
										</div>
									)}

									{editReferenceKind === "folder" && (
										<div className="space-y-2">
											<label
												htmlFor="edit-reference-folder"
												className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
											>
												フォルダ
											</label>
											<div className="flex gap-2">
												<input
													id="edit-reference-folder"
													type="text"
													value={editReferenceValue}
													onChange={(e) => setEditReferenceValue(e.target.value)}
													placeholder="フォルダパス"
													className="flex-1 py-2 px-3 bg-transparent border-b border-[var(--md-ref-color-outline-variant)] focus:border-[var(--md-ref-color-primary)] outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)] transition-colors duration-150"
													readOnly
												/>
												<button
													type="button"
													onClick={handleSelectFolder}
													className="h-9 px-3 text-sm font-medium text-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-surface-container-high)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors flex items-center gap-1.5"
												>
													<Icon name="folder_open" size={16} />
													選択
												</button>
											</div>
										</div>
									)}

									{editReferenceKind === "note" && null}

									{/* Actions */}
									<div className="flex justify-between pt-2">
										<button
											type="button"
											onClick={handleDeleteReference}
											className="h-9 px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
										>
											削除
										</button>
										<div className="flex gap-2">
											<button
												type="button"
												onClick={handleCancelEdit}
												className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
											>
												キャンセル
											</button>
											<button
												type="button"
												onClick={handleUpdateReference}
												disabled={editReferenceKind !== "note" && !editReferenceValue.trim()}
												className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
											>
												保存
											</button>
										</div>
									</div>
								</div>
							) : creatingProjectId ? (
								/* Project Create Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											プロジェクトを作成
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>

									{/* Project name */}
									<TextField
										label="プロジェクト名"
										value={newProjectName}
										onChange={setNewProjectName}
										placeholder="例: ウェブサイト開発, マーケティング"
										variant="underlined"
										maxLength={50}
									/>

									{/* Description */}
									<div>
										<label
											htmlFor="project-description"
											className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1"
										>
											説明（オプション）
										</label>
										<textarea
											id="project-description"
											value={newProjectDescription}
											onChange={(e) => setNewProjectDescription(e.target.value)}
											placeholder="プロジェクトの詳細"
											rows={2}
											maxLength={200}
											className="
												w-full py-2
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

									{/* Deadline */}
									<div>
										<DatePicker
											label="期限（オプション）"
											value={newProjectDeadline}
											onChange={setNewProjectDeadline}
											variant="underlined"
										/>
									</div>

									{/* Actions */}
									<div className="flex justify-end gap-2 pt-2">
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
										>
											キャンセル
										</button>
										<button
											type="button"
											onClick={handleCreateProject}
											disabled={!newProjectName.trim()}
											className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
										>
											作成
										</button>
									</div>
								</div>
							) : creatingGroupId ? (
								/* Group Create Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											グループを作成
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>
									<TextField
										label="グループ名"
										value={newGroupName}
										onChange={setNewGroupName}
										placeholder="例: 仕事, 個人, 休憩"
										variant="underlined"
										maxLength={50}
									/>
									{/* Parent group selection */}
									<Select
										label="親グループ"
										value={newGroupParentId || ""}
										onChange={(value) => setNewGroupParentId(value || undefined)}
										options={[
											{ value: "", label: "なし（ルートグループ）" },
											...groups
												.filter((g) => !g.parentId)
												.map((g) => ({ value: g.id, label: g.name })),
										]}
										variant="underlined"
									/>
									<div className="flex justify-end gap-2 pt-2">
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
										>
											キャンセル
										</button>
										<button
											type="button"
											onClick={handleCreateGroup}
											disabled={!newGroupName.trim()}
											className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
										>
											作成
										</button>
									</div>
								</div>
							) : editingProject ? (
								/* Project Edit Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											プロジェクトを編集
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>

									{/* Project name */}
									<TextField
										label="プロジェクト名"
										value={editProjectName}
										onChange={setEditProjectName}
										variant="underlined"
										maxLength={50}
									/>

									{/* Deadline */}
									<div>
										<DatePicker
											label="期限（オプション）"
											value={editProjectDeadline}
											onChange={setEditProjectDeadline}
											variant="underlined"
										/>
									</div>

									{/* References */}
									<div>
										<span className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
											リファレンス
										</span>
										<div className="space-y-2">
											{editProjectRefs.map((ref, index) => (
												<div key={ref.id || index} className="flex items-center gap-2">
													<input
														type="text"
														value={ref.kind}
														onChange={(e) => {
															const newRefs = [...editProjectRefs];
															newRefs[index] = { ...newRefs[index], kind: e.target.value };
															setEditProjectRefs(newRefs);
														}}
														placeholder="種別"
														className="flex-1 min-w-0 py-1.5 px-2 text-sm bg-transparent border-b border-[var(--md-ref-color-outline-variant)] focus:border-[var(--md-ref-color-primary)] outline-none text-[var(--md-ref-color-on-surface)]"
													/>
													<input
														type="text"
														value={ref.value}
														onChange={(e) => {
															const newRefs = [...editProjectRefs];
															newRefs[index] = { ...newRefs[index], value: e.target.value };
															setEditProjectRefs(newRefs);
														}}
														placeholder="値"
														className="flex-1 min-w-0 py-1.5 px-2 text-sm bg-transparent border-b border-[var(--md-ref-color-outline-variant)] focus:border-[var(--md-ref-color-primary)] outline-none text-[var(--md-ref-color-on-surface)]"
													/>
													<button
														type="button"
														onClick={() =>
															setEditProjectRefs(editProjectRefs.filter((_, i) => i !== index))
														}
														className="p-1.5 rounded-full text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
													>
														<Icon name="close" size={16} />
													</button>
												</div>
											))}
											<button
												type="button"
												onClick={() =>
													setEditProjectRefs([...editProjectRefs, { kind: "", value: "" }])
												}
												className="flex items-center gap-1 text-xs text-[var(--md-ref-color-primary)] hover:text-[var(--md-ref-color-on-primary)] transition-colors"
											>
												<Icon name="add" size={16} />
												<span>リファレンスを追加</span>
											</button>
										</div>
									</div>

									{/* Actions */}
									<div className="flex justify-between gap-2 pt-2">
										<button
											type="button"
											onClick={handleDeleteProject}
											className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)] rounded-lg transition-colors"
										>
											削除
										</button>
										<div className="flex gap-2">
											<button
												type="button"
												onClick={handleCancelEdit}
												className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
											>
												キャンセル
											</button>
											<button
												type="button"
												onClick={handleUpdateProject}
												disabled={!editProjectName.trim()}
												className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
											>
												保存
											</button>
										</div>
									</div>
								</div>
							) : editingGroupId ? (
								/* Group Edit Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											グループを編集
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>
									<TextField
										label="グループ名"
										value={editGroupName}
										onChange={setEditGroupName}
										variant="underlined"
										maxLength={50}
									/>
									<div className="flex justify-between gap-2 pt-2">
										<button
											type="button"
											onClick={handleDeleteGroup}
											className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)] rounded-lg transition-colors"
										>
											削除
										</button>
										<div className="flex gap-2">
											<button
												type="button"
												onClick={handleCancelEdit}
												className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
											>
												キャンセル
											</button>
											<button
												type="button"
												onClick={handleUpdateGroup}
												disabled={!editGroupName.trim()}
												className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
											>
												保存
											</button>
										</div>
									</div>
								</div>
							) : editingTaskId ? (
								/* Task Edit Panel */
								<div className="space-y-3">
									<div className="flex items-center justify-between mb-2">
										<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">
											タスクを編集
										</h3>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] transition-colors"
										>
											<Icon name="close" size={18} />
										</button>
									</div>

									{/* Task type selector */}
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
														aria-pressed={isSelected}
														onClick={() => setNewKind(option.value as TaskKind)}
														className={`
															no-pill relative h-10 px-4 text-sm font-medium
															flex items-center justify-center
															transition-all duration-150
															${isFirst ? "rounded-l-full" : ""}
															${isLast ? "rounded-r-full" : ""}
															${!isFirst ? "border-l border-[var(--md-ref-color-outline-variant)]" : ""}
															${
																isSelected
																	? "!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]"
																	: "!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]"
															}
														`.trim()}
													>
														{option.label}
													</button>
												);
											})}
										</div>
									</div>

									{/* Title */}
									<TextField
										label="タイトル"
										value={newTitle}
										onChange={setNewTitle}
										variant="underlined"
									/>

									{/* Description */}
									<div className="mb-3">
										<label
											htmlFor="task-memo"
											className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1"
										>
											メモ
										</label>
										<textarea
											id="task-memo"
											value={newDescription}
											onChange={(e) => setNewDescription(e.target.value)}
											placeholder="タスクの詳細..."
											rows={2}
											className="
												w-full py-2
												bg-transparent
												border-b border-[var(--md-ref-color-outline-variant)]
												focus:border-[var(--md-ref-color-primary)]
												outline-none
												text-sm text-[var(--md-ref-color-on-surface)]
												placeholder:text-[var(--md-ref-color-on-surface-variant)]
												resize-none
												transition-colors
											"
										/>
									</div>

									{/* Fixed event: Start/End */}
									{newKind === "fixed_event" && (
										<div className="grid grid-cols-2 gap-3 mb-3">
											<DateTimePicker
												label="開始"
												value={newFixedStartAt}
												onChange={setNewFixedStartAt}
												variant="underlined"
											/>
											<DateTimePicker
												label="終了"
												value={newFixedEndAt}
												onChange={setNewFixedEndAt}
												variant="underlined"
											/>
										</div>
									)}

									{/* Required time */}
									<div className="mb-3">
										{newKind === "fixed_event" ? (
											<TextField
												label="所要時間"
												value={(() => {
													if (!newFixedStartAt || !newFixedEndAt) return "";
													const start = new Date(newFixedStartAt).getTime();
													const end = new Date(newFixedEndAt).getTime();
													if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "";
													const minutes = Math.round((end - start) / (1000 * 60));
													const hours = Math.floor(minutes / 60);
													const mins = minutes % 60;
													return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
												})()}
												onChange={() => {}}
												variant="underlined"
												disabled
											/>
										) : (
											<TimePicker
												label="所要時間"
												value={newDurationTime}
												onChange={(value) => {
													setNewDurationTime(value);
													if (value) {
														const [hours, mins] = value.split(":").map(Number);
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
											<DateTimePicker
												label="ウィンドウ開始"
												value={newWindowStartAt}
												onChange={setNewWindowStartAt}
												variant="underlined"
											/>
											<DateTimePicker
												label="ウィンドウ終了"
												value={newWindowEndAt}
												onChange={setNewWindowEndAt}
												variant="underlined"
											/>
										</div>
									)}

									{/* Allow Split Toggle */}
									<div className="mb-3">
										<label className="flex items-center gap-3 cursor-pointer">
											<input
												type="checkbox"
												checked={newAllowSplit}
												onChange={(e) => setNewAllowSplit(e.target.checked)}
												className="w-4 h-4 rounded accent-[var(--md-ref-color-primary)]"
											/>
											<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
												休憩で分割を許可
											</span>
										</label>
									</div>

									{/* Group selection */}
									<Select
										label="グループ"
										value={selectedGroupId || ""}
										onChange={(value) => setSelectedGroupId(value || null)}
										options={[
											{ value: "", label: "グループを選択" },
											...groups.map((group) => ({ value: group.id, label: group.name })),
										]}
										variant="underlined"
									/>

									{/* Tags - Google-style input chips */}
									<div className="mb-3">
										<label
											htmlFor="task-tags-input"
											className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1"
										>
											タグ
										</label>
										<div className="flex flex-wrap items-center gap-2 min-h-[40px] px-0 py-2 border-b border-[var(--md-ref-color-outline-variant)] focus-within:border-[var(--md-ref-color-primary)] transition-colors">
											{newTags.map((tag) => (
												<span
													key={tag}
													className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-sm text-[var(--md-ref-color-on-surface)]"
												>
													{tag}
													<button
														type="button"
														onClick={() => setNewTags(newTags.filter((t) => t !== tag))}
														className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container-highest)] flex items-center justify-center w-4 h-4 rounded-full text-[var(--md-ref-color-on-surface-variant)]"
														aria-label={`Remove ${tag}`}
													>
														<Icon name="close" size={14} />
													</button>
												</span>
											))}
											<input
												id="task-tags-input"
												type="text"
												value={tagInput}
												onChange={(e) => setTagInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && tagInput.trim()) {
														e.preventDefault();
														setNewTags([...newTags, tagInput.trim()]);
														setTagInput("");
													} else if (e.key === "Backspace" && !tagInput && newTags.length > 0) {
														setNewTags(newTags.slice(0, -1));
													}
												}}
												placeholder={newTags.length === 0 ? "Enterで追加..." : ""}
												className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
											/>
										</div>
									</div>

									{/* Actions */}
									<div className="flex justify-between gap-2 pt-2">
										<button
											type="button"
											onClick={handleDeleteTask}
											className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)] rounded-lg transition-colors"
										>
											削除
										</button>
										<div className="flex gap-2">
											<button
												type="button"
												onClick={handleCancelEdit}
												className="h-9 px-4 text-sm font-medium text-[var(--md-ref-color-primary)] hover:bg-[var(--md-ref-color-surface-container)] rounded-lg transition-colors"
											>
												キャンセル
											</button>
											<button
												type="button"
												onClick={handleUpdateTask}
												disabled={!newTitle.trim()}
												className="h-9 px-4 text-sm font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] rounded-full disabled:opacity-50 transition-colors"
											>
												保存
											</button>
										</div>
									</div>
								</div>
							) : (
								/* Task Create Panel */
								<>
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
														aria-pressed={isSelected}
														onClick={() => setNewKind(option.value as TaskKind)}
														className={`
												no-pill relative h-10 px-4 text-sm font-medium
												flex items-center justify-center
												transition-all duration-150
												${isFirst ? "rounded-l-full" : ""}
												${isLast ? "rounded-r-full" : ""}
												${!isFirst ? "border-l border-[var(--md-ref-color-outline-variant)]" : ""}
											${
												isSelected
													? "!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]"
													: "!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]"
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
										<TextField
											label="Title"
											value={newTitle}
											onChange={setNewTitle}
											variant="underlined"
										/>
									</div>

									{/* Fixed event: Start/End on separate row */}
									{newKind === "fixed_event" && (
										<div className="grid grid-cols-2 gap-3 mb-3">
											<DateTimePicker
												label="Start"
												value={newFixedStartAt}
												onChange={setNewFixedStartAt}
												variant="underlined"
											/>
											<DateTimePicker
												label="End"
												value={newFixedEndAt}
												onChange={setNewFixedEndAt}
												variant="underlined"
											/>
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
													if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "";
													const minutes = Math.round((end - start) / (1000 * 60));
													const hours = Math.floor(minutes / 60);
													const mins = minutes % 60;
													return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
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
														const [hours, mins] = value.split(":").map(Number);
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
											<DateTimePicker
												label="Window start"
												value={newWindowStartAt}
												onChange={setNewWindowStartAt}
												variant="underlined"
											/>
											<DateTimePicker
												label="Window end"
												value={newWindowEndAt}
												onChange={setNewWindowEndAt}
												variant="underlined"
											/>
										</div>
									)}

									{/* Allow Split Toggle */}
									<div className="mb-3">
										<label className="flex items-center gap-3 cursor-pointer">
											<input
												type="checkbox"
												checked={newAllowSplit}
												onChange={(e) => setNewAllowSplit(e.target.checked)}
												className="w-4 h-4 rounded accent-[var(--md-ref-color-primary)]"
											/>
											<div className="flex flex-col">
												<span className="flex items-center gap-1 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
													休憩で分割を許可
												</span>
												<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
													{newAllowSplit
														? "スケジューラが休憩を挟むことができます"
														: "連続して作業します"}
												</span>
											</div>
										</label>
									</div>

									{/* Advanced settings accordion */}
									<div className="mb-3">
										<button
											type="button"
											onClick={() =>
												setSectionsCollapsed((prev) => ({ ...prev, advanced: !prev.advanced }))
											}
											className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-0 py-2 flex items-center justify-between transition-colors border-b border-[var(--md-ref-color-outline-variant)]"
										>
											<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">
												詳細設定
											</span>
											<Icon
												name={sectionsCollapsed.advanced ? "expand_more" : "expand_less"}
												size={20}
												className="text-[var(--md-ref-color-on-surface-variant)]"
											/>
										</button>
										{!sectionsCollapsed.advanced && (
											<div className="pt-3 space-y-4">
												{/* Group selection */}
												<Select
													label="グループ"
													value={selectedGroupId || ""}
													onChange={(value) => setSelectedGroupId(value || null)}
													options={[
														{ value: "", label: "グループを選択" },
														...groups.map((group) => ({ value: group.id, label: group.name })),
													]}
													variant="underlined"
												/>

												{/* Project selection */}
												<Select
													label="プロジェクト"
													value={selectedProjectId || ""}
													onChange={(value) => setSelectedProjectId(value || null)}
													options={[
														{ value: "", label: "プロジェクトを選択" },
														...projects.map((project) => ({
															value: project.id,
															label: project.name,
														})),
													]}
													variant="underlined"
												/>
											</div>
										)}
									</div>

									{/* Tags - Google-style input chips */}
									<div className="mb-3">
										<label
											htmlFor="create-task-tags"
											className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1"
										>
											Tags
										</label>
										<div className="flex flex-wrap items-center gap-2 min-h-[40px] px-0 py-2 border-b border-[var(--md-ref-color-outline-variant)] focus-within:border-[var(--md-ref-color-primary)] transition-colors">
											{newTags.map((tag) => (
												<span
													key={tag}
													className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-sm text-[var(--md-ref-color-on-surface)]"
												>
													{tag}
													<button
														type="button"
														onClick={() => setNewTags(newTags.filter((t) => t !== tag))}
														className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container-highest)] flex items-center justify-center w-4 h-4 rounded-full text-[var(--md-ref-color-on-surface-variant)]"
														aria-label={`Remove ${tag}`}
													>
														<Icon name="close" size={14} />
													</button>
												</span>
											))}
											<input
												id="create-task-tags"
												type="text"
												value={tagInput}
												onChange={(e) => setTagInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && tagInput.trim()) {
														e.preventDefault();
														setNewTags([...newTags, tagInput.trim()]);
														setTagInput("");
													} else if (e.key === "Backspace" && !tagInput && newTags.length > 0) {
														setNewTags(newTags.slice(0, -1));
													}
												}}
												placeholder={newTags.length === 0 ? "Enterで追加..." : ""}
												className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
											/>
										</div>
									</div>

									{/* Memo - full width, multiline, at the bottom */}
									<div className="mb-3">
										<label
											htmlFor="create-task-memo"
											className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1"
										>
											Memo
										</label>
										<textarea
											id="create-task-memo"
											value={newDescription}
											onChange={(e) => setNewDescription(e.target.value)}
											placeholder="Add a description..."
											rows={2}
											className="
										w-full py-2
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
												setNewAllowSplit(true);
											}}
											className="h-10 px-6 text-sm font-medium transition-colors"
											style={{
												borderRadius: "9999px",
												backgroundColor: "var(--md-ref-color-surface-container)",
												color: "var(--md-ref-color-on-surface)",
												border: "1px solid var(--md-ref-color-outline-variant)",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.backgroundColor =
													"var(--md-ref-color-surface-container-high)";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.backgroundColor =
													"var(--md-ref-color-surface-container)";
											}}
										>
											クリア
										</button>
										<button
											type="button"
											onClick={handleCreateTask}
											className="h-10 px-6 text-sm font-medium transition-colors"
											style={{
												borderRadius: "9999px",
												backgroundColor: "var(--md-ref-color-primary)",
												color: "var(--md-ref-color-on-primary)",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.backgroundColor =
													"var(--md-sys-color-primary-fixed-dim)";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.backgroundColor = "var(--md-ref-color-primary)";
											}}
										>
											追加
										</button>
									</div>
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
