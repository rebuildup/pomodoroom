import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DatePicker } from "@/components/m3/DateTimePicker";
import { Icon } from "@/components/m3/Icon";
import { TaskCard } from "@/components/m3/TaskCard";
import { TextField } from "@/components/m3/TextField";
import type { ProjectReferenceDraft } from "@/components/m3/ProjectDialog";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import { useWindowManager } from "@/hooks/useWindowManager";
import type { Project } from "@/types/schedule";
import type { Task } from "@/types/task";
import { getTasksForProject } from "@/utils/project-task-matching";

interface OverviewPinnedProjectsProps {
	projects: Project[];
	tasks: Task[];
	onTaskOperation: (taskId: string, operation: TaskOperation) => void;
	onUpdateProject: (
		projectId: string,
		updates: {
			name?: string;
			deadline?: string | null;
			references?: ProjectReferenceDraft[];
			isPinned?: boolean;
		},
	) => Promise<Project>;
}

interface ProjectDraft {
	name: string;
	deadline: string;
	references: ProjectReferenceDraft[];
}

type ReferenceKindOption = "link" | "file" | "note";

function createReferenceDraft(kind: ReferenceKindOption): ProjectReferenceDraft {
	if (kind === "note") {
		return {
			kind: "note",
			label: "メモ",
			value: `note-${Date.now()}`,
		};
	}
	if (kind === "file") {
		return {
			kind: "file",
			label: "",
			value: "",
		};
	}
	return {
		kind: "link",
		label: "",
		value: "",
	};
}

function formatDeadline(value?: string): string {
	if (!value) return "期限未設定";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "期限未設定";
	return date.toLocaleDateString("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
}

function toProjectDraft(project: Project): ProjectDraft {
	return {
		name: project.name,
		deadline: project.deadline ? project.deadline.slice(0, 10) : "",
		references: (project.references ?? []).map((ref) => ({
			kind: ref.kind,
			value: ref.value,
			label: ref.label,
		})),
	};
}

function toNoteWindowLabel(value: string): string {
	if (value.startsWith("note-")) return value;
	if (value.startsWith("note")) return value;
	return `note-${value}`;
}

function AddReferenceMenuButton({
	onSelect,
	ariaLabel = "リファレンス追加",
}: {
	onSelect: (kind: ReferenceKindOption) => void;
	ariaLabel?: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (!menuRef.current?.contains(target)) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	const actions: Array<{ label: string; kind: ReferenceKindOption }> = [
		{ label: "リンク", kind: "link" },
		{ label: "ファイル", kind: "file" },
		{ label: "ノート", kind: "note" },
	];

	return (
		<div className="relative" ref={menuRef}>
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="
					no-pill w-8 h-8 rounded-full border border-[var(--md-ref-color-outline-variant)]
					inline-flex items-center justify-center
					text-[var(--md-ref-color-on-surface)]
					!bg-transparent transition-colors duration-150
					hover:!bg-[var(--md-ref-color-surface-container-high)]
				"
				aria-label={ariaLabel}
				title={ariaLabel}
				aria-expanded={isOpen}
				aria-haspopup="menu"
			>
				<Icon name="add" size={18} className="opacity-70" />
			</button>
			{isOpen && (
				<div
					role="menu"
					className="
						absolute right-0 top-9 z-30 min-w-[140px]
						bg-[var(--md-sys-color-surface)]
						rounded-lg
						shadow-[0_4px_20px_rgba(0,0,0,0.15)]
						border border-[var(--md-sys-color-outline-variant)]
					"
				>
					{actions.map((action) => (
						<button
							key={action.kind}
							type="button"
							role="menuitem"
							onClick={() => {
								onSelect(action.kind);
								setIsOpen(false);
							}}
							className="
								no-pill !bg-transparent hover:!bg-[var(--md-sys-color-surface-container-high)]
								w-full h-9 px-3
								flex items-center text-left
								text-sm font-medium
							"
						>
							<span>{action.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export function OverviewPinnedProjects({
	projects,
	tasks,
	onTaskOperation,
	onUpdateProject,
}: OverviewPinnedProjectsProps) {
	const [collapsedProjectIds, setCollapsedProjectIds] = useState<Record<string, boolean>>({});
	const [editingProjectIds, setEditingProjectIds] = useState<Record<string, boolean>>({});
	const [draftByProjectId, setDraftByProjectId] = useState<Record<string, ProjectDraft>>({});
	const windowManager = useWindowManager();

	const pinnedProjects = useMemo(
		() =>
			projects
				.filter((project) => Boolean(project.isPinned))
				.sort((a, b) => a.name.localeCompare(b.name, "ja")),
		[projects],
	);

	if (pinnedProjects.length === 0) return null;

	const setProjectEditing = (project: Project, editing: boolean) => {
		setEditingProjectIds((prev) => ({ ...prev, [project.id]: editing }));
		if (editing) {
			setDraftByProjectId((prev) => ({
				...prev,
				[project.id]: toProjectDraft(project),
			}));
		}
	};

	const addDraftReference = (project: Project, kind: ReferenceKindOption) => {
		setEditingProjectIds((prev) => ({ ...prev, [project.id]: true }));
		setDraftByProjectId((prev) => {
			const base = prev[project.id] ?? toProjectDraft(project);
			return {
				...prev,
				[project.id]: {
					...base,
					references: [...base.references, createReferenceDraft(kind)],
				},
			};
		});
	};

	const saveProject = async (project: Project) => {
		const draft = draftByProjectId[project.id];
		if (!draft) return;
		const normalizedRefs: ProjectReferenceDraft[] = draft.references
			.map((ref) => ({
				kind: ref.kind.trim() || "link",
				value: ref.value.trim(),
				label: ref.label?.trim() || undefined,
			}))
			.filter((ref) => ref.value.length > 0);
		await onUpdateProject(project.id, {
			name: draft.name.trim(),
			deadline: draft.deadline || null,
			references: normalizedRefs,
		});
		setProjectEditing(project, false);
	};

	const openReference = async (
		project: Project,
		reference: { kind: string; value: string; label?: string },
	) => {
		const target = reference.value.trim();
		if (!target) return;
		if (reference.kind.trim().toLowerCase() === "note") {
			await windowManager.openWindow("note", {
				label: toNoteWindowLabel(target),
				title: `${project.name} - ${reference.label?.trim() || "ノート"}`,
			});
			return;
		}
		try {
			await invoke("cmd_open_reference", { target });
		} catch (error) {
			console.error("[OverviewPinnedProjects] failed to open reference:", error);
		}
	};

	return (
		<>
			{pinnedProjects.map((project) => {
				const projectTasks = getTasksForProject(tasks, project);
				const doneCount = projectTasks.filter((task) => task.state === "DONE").length;
				const collapsed = Boolean(collapsedProjectIds[project.id]);
				const editing = Boolean(editingProjectIds[project.id]);
				const refs = project.references ?? [];
				const draft = draftByProjectId[project.id] ?? toProjectDraft(project);

				return (
					<section
						key={project.id}
						className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4 space-y-3"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="text-base font-semibold truncate">{project.name}</div>
								<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
									{formatDeadline(project.deadline)}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<div className="text-xs text-[var(--md-ref-color-on-surface-variant)] whitespace-nowrap">
									{doneCount}/{projectTasks.length} 完了
								</div>
								<button
									type="button"
									onClick={() => setProjectEditing(project, !editing)}
									className="h-8 px-3 rounded-full border border-[var(--md-ref-color-outline)] text-xs font-medium"
								>
									{editing ? "編集を閉じる" : "プロジェクトを編集"}
								</button>
								<AddReferenceMenuButton
									onSelect={(kind) => addDraftReference(project, kind)}
								/>
								<button
									type="button"
									onClick={() =>
										setCollapsedProjectIds((prev) => ({
											...prev,
											[project.id]: !collapsed,
										}))
									}
									className="h-8 w-8 rounded-full border border-[var(--md-ref-color-outline)] flex items-center justify-center"
									aria-label={collapsed ? "展開" : "閉じる"}
								>
									<Icon name={collapsed ? "expand_more" : "expand_less"} size={16} />
								</button>
							</div>
						</div>

						{editing && (
							<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface)] space-y-3">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
									<TextField
										label="プロジェクト名"
										value={draft.name}
										onChange={(value) =>
											setDraftByProjectId((prev) => ({
												...prev,
												[project.id]: { ...draft, name: value },
											}))
										}
										variant="underlined"
									/>
									<div>
										<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
											期限
										</label>
										<DatePicker
											value={draft.deadline}
											onChange={(value) =>
												setDraftByProjectId((prev) => ({
													...prev,
													[project.id]: { ...draft, deadline: value },
												}))
											}
											variant="underlined"
										/>
									</div>
								</div>

								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => saveProject(project)}
										className="h-8 px-3 rounded-full bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] text-xs font-medium"
									>
										保存
									</button>
									<button
										type="button"
										onClick={() => setProjectEditing(project, false)}
										className="h-8 px-3 rounded-full border border-[var(--md-ref-color-outline)] text-xs font-medium"
									>
										キャンセル
									</button>
								</div>

								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
											リファレンス
										</div>
										<AddReferenceMenuButton
											ariaLabel="編集リファレンス追加"
											onSelect={(kind) =>
												setDraftByProjectId((prev) => {
													const base = prev[project.id] ?? toProjectDraft(project);
													return {
														...prev,
														[project.id]: {
															...base,
															references: [...base.references, createReferenceDraft(kind)],
														},
													};
												})
											}
										/>
									</div>
									{draft.references.length === 0 ? (
										<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
											リファレンスなし
										</div>
									) : (
										<div className="space-y-2">
											{draft.references.map((ref, index) => (
												<div
													key={`${project.id}-draft-ref-${index}`}
													className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-2 space-y-1"
												>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
														<TextField
															label="種別"
															value={ref.kind}
															onChange={(value) =>
																setDraftByProjectId((prev) => {
																	const next = [...draft.references];
																	next[index] = { ...next[index], kind: value };
																	return { ...prev, [project.id]: { ...draft, references: next } };
																})
															}
															variant="underlined"
														/>
														<TextField
															label="ラベル"
															value={ref.label ?? ""}
															onChange={(value) =>
																setDraftByProjectId((prev) => {
																	const next = [...draft.references];
																	next[index] = { ...next[index], label: value };
																	return { ...prev, [project.id]: { ...draft, references: next } };
																})
															}
															variant="underlined"
														/>
													</div>
													<div className="flex items-center gap-2">
														<div className="flex-1">
															<TextField
																label="値"
																value={ref.value}
																onChange={(value) =>
																	setDraftByProjectId((prev) => {
																		const next = [...draft.references];
																		next[index] = { ...next[index], value };
																		return { ...prev, [project.id]: { ...draft, references: next } };
																	})
																}
																variant="underlined"
															/>
														</div>
														<button
															type="button"
															onClick={() =>
																setDraftByProjectId((prev) => ({
																	...prev,
																	[project.id]: {
																		...draft,
																		references: draft.references.filter((_, i) => i !== index),
																	},
																}))
															}
															className="h-7 w-7 rounded-full border border-[var(--md-ref-color-outline)] flex items-center justify-center"
														>
															<Icon name="close" size={14} />
														</button>
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							</div>
						)}

						{!collapsed && (
							<>
								<div className="space-y-2">
									<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
										リファレンス
									</div>
									{refs.length === 0 ? (
										<div className="rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface)] p-3 text-xs text-[var(--md-ref-color-on-surface-variant)]">
											リファレンスはありません
										</div>
									) : (
										<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
											{refs.map((ref) => (
												<button
													key={ref.id}
													type="button"
													onClick={() => {
														void openReference(project, {
															kind: ref.kind,
															value: ref.value,
															label: ref.label,
														});
													}}
													className="rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface)] p-3 text-left hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
												>
													<div className="flex items-center justify-between gap-2">
														<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
															{ref.label?.trim() || ref.kind}
														</div>
														<div className="text-[10px] opacity-70">{ref.kind}</div>
													</div>
													<div className="text-sm break-all mt-1">{ref.value}</div>
												</button>
											))}
										</div>
									)}
								</div>
								{projectTasks.length === 0 ? (
									<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
										このプロジェクトのタスクはありません
									</div>
								) : (
									<div className="space-y-2">
										{projectTasks.slice(0, 4).map((task) => (
											<TaskCard
												key={task.id}
												task={task}
												allTasks={tasks}
												draggable={false}
												density="compact"
												operationsPreset="default"
												showStatusControl={true}
												expandOnClick={true}
												onOperation={onTaskOperation}
											/>
										))}
									</div>
								)}
							</>
						)}
					</section>
				);
			})}
		</>
	);
}
