import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/m3/DateTimePicker";
import { Icon } from "@/components/m3/Icon";
import { ProjectDialog, type ProjectReferenceDraft } from "@/components/m3/ProjectDialog";
import { TaskCard } from "@/components/m3/TaskCard";
import { TextField } from "@/components/m3/TextField";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import type { Project } from "@/types/schedule";
import type { Task } from "@/types/task";
import { getTasksForProject } from "@/utils/project-task-matching";

interface OverviewProjectManagerProps {
	projects: Project[];
	tasks: Task[];
	onTaskOperation: (taskId: string, operation: TaskOperation) => void;
	createProject: (
		name: string,
		deadline?: string,
		references?: ProjectReferenceDraft[],
		description?: string,
	) => Promise<Project>;
	updateProject: (
		projectId: string,
		updates: {
			name?: string;
			deadline?: string | null;
			references?: ProjectReferenceDraft[];
			isPinned?: boolean;
		},
	) => Promise<Project>;
	deleteProject: (projectId: string, deleteTasks: boolean) => Promise<void>;
}

function toDateInput(iso?: string): string {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
		date.getUTCDate(),
	).padStart(2, "0")}`;
}

interface ProjectPanelCardProps {
	project: Project;
	allTasks: Task[];
	onTaskOperation: (taskId: string, operation: TaskOperation) => void;
	onUpdate: (
		projectId: string,
		updates: {
			name?: string;
			deadline?: string | null;
			references?: ProjectReferenceDraft[];
			isPinned?: boolean;
		},
	) => Promise<unknown>;
	onDelete: (projectId: string, deleteTasks: boolean) => Promise<void>;
}

function ProjectPanelCard({
	project,
	allTasks,
	onTaskOperation,
	onUpdate,
	onDelete,
}: ProjectPanelCardProps) {
	const [draftName, setDraftName] = useState(project.name);
	const [draftDeadline, setDraftDeadline] = useState(toDateInput(project.deadline));
	const [draftRefs, setDraftRefs] = useState<ProjectReferenceDraft[]>(
		(project.references ?? []).map((ref) => ({
			id: ref.id,
			kind: ref.kind,
			value: ref.value,
			label: ref.label,
		})),
	);
	const [draftPinned, setDraftPinned] = useState(Boolean(project.isPinned));
	const [deleteArmed, setDeleteArmed] = useState(false);

	useEffect(() => {
		setDraftName(project.name);
		setDraftDeadline(toDateInput(project.deadline));
		setDraftRefs(
			(project.references ?? []).map((ref) => ({
				id: ref.id,
				kind: ref.kind,
				value: ref.value,
				label: ref.label,
			})),
		);
		setDraftPinned(Boolean(project.isPinned));
		setDeleteArmed(false);
	}, [project]);

	const projectTasks = useMemo(() => getTasksForProject(allTasks, project), [allTasks, project]);

	const addRef = () => {
		setDraftRefs((prev) => [...prev, { kind: "link", value: "", label: "" }]);
	};
	const updateRef = (index: number, field: keyof ProjectReferenceDraft, value: string) => {
		setDraftRefs((prev) =>
			prev.map((ref, i) => (i === index ? { ...ref, [field]: value } : ref)),
		);
	};
	const removeRef = (index: number) => {
		setDraftRefs((prev) => prev.filter((_, i) => i !== index));
	};

	const save = async () => {
		await onUpdate(project.id, {
			name: draftName.trim(),
			deadline: draftDeadline || null,
			isPinned: draftPinned,
			references: draftRefs
				.map((ref) => ({
					id: ref.id,
					kind: ref.kind.trim() || "link",
					value: ref.value.trim(),
					label: ref.label?.trim() || undefined,
				}))
				.filter((ref) => ref.value.length > 0),
		});
	};

	const togglePinned = async () => {
		const next = !draftPinned;
		setDraftPinned(next);
		try {
			await onUpdate(project.id, { isPinned: next });
		} catch {
			setDraftPinned(!next);
		}
	};

	const deleteProject = async () => {
		if (!deleteArmed) {
			setDeleteArmed(true);
			return;
		}
		await onDelete(project.id, true);
	};

	return (
		<section className="rounded-xl border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface)] p-4 space-y-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
					<TextField
						label="プロジェクト名"
						value={draftName}
						onChange={setDraftName}
						variant="underlined"
					/>
					<div>
						<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
							期限
						</label>
						<DatePicker value={draftDeadline} onChange={setDraftDeadline} variant="underlined" />
					</div>
				</div>
				<button
					type="button"
					onClick={togglePinned}
					className={`h-9 px-3 rounded-full border text-xs font-medium inline-flex items-center gap-1 ${
						draftPinned
							? "border-[var(--md-ref-color-primary)] text-[var(--md-ref-color-primary)]"
							: "border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface-variant)]"
					}`}
				>
					<Icon name={draftPinned ? "flag" : "label"} size={14} />
					{draftPinned ? "ピン留め中" : "ピン留め"}
				</button>
			</div>

			<div>
				<div className="flex items-center justify-between mb-2">
					<div className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]">
						リファレンス
					</div>
					<button
						type="button"
						onClick={addRef}
						className="h-7 px-2 rounded-full border border-[var(--md-ref-color-outline)] text-xs"
					>
						追加
					</button>
				</div>
				<div className="space-y-2">
					{draftRefs.length === 0 ? (
						<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">リファレンスなし</div>
					) : (
						draftRefs.map((ref, index) => (
							<div
								key={`${project.id}-ref-${index}`}
								className="border border-[var(--md-ref-color-outline-variant)] rounded-lg p-2 space-y-1"
							>
								<div className="flex gap-2">
									<TextField
										label="種別"
										value={ref.kind}
										onChange={(value) => updateRef(index, "kind", value)}
										variant="underlined"
									/>
									<TextField
										label="ラベル"
										value={ref.label ?? ""}
										onChange={(value) => updateRef(index, "label", value)}
										variant="underlined"
									/>
								</div>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<TextField
											label="値"
											value={ref.value}
											onChange={(value) => updateRef(index, "value", value)}
											variant="underlined"
										/>
									</div>
									<button
										type="button"
										onClick={() => removeRef(index)}
										className="h-7 w-7 rounded-full border border-[var(--md-ref-color-outline)] flex items-center justify-center"
									>
										<Icon name="close" size={14} />
									</button>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<div className="flex items-center justify-between gap-2">
				<button
					type="button"
					onClick={save}
					className="h-9 px-4 rounded-full bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] text-xs font-medium"
				>
					保存
				</button>
				<button
					type="button"
					onClick={deleteProject}
					className={`h-9 px-4 rounded-full border text-xs font-medium ${
						deleteArmed
							? "border-red-500 text-red-600 bg-red-50"
							: "border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)]"
					}`}
				>
					{deleteArmed ? "再押下で削除(関連タスクも削除)" : "削除"}
				</button>
			</div>

			<div>
				<div className="text-sm font-medium mb-2">
					プロジェクト内タスク ({projectTasks.length})
				</div>
				{projectTasks.length === 0 ? (
					<div className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
						このプロジェクトのタスクはありません
					</div>
				) : (
					<div className="space-y-2">
						{projectTasks.map((task) => (
							<TaskCard
								key={task.id}
								task={task}
								allTasks={allTasks}
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
			</div>
		</section>
	);
}

export function OverviewProjectManager({
	projects,
	tasks,
	onTaskOperation,
	createProject,
	updateProject,
	deleteProject,
}: OverviewProjectManagerProps) {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	const sortedProjects = useMemo(
		() =>
			[...projects].sort((a, b) => {
				const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
				if (pinDiff !== 0) return pinDiff;
				return a.name.localeCompare(b.name, "ja");
			}),
		[projects],
	);

	return (
		<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
			<div className="flex items-center justify-between mb-3">
				<div className="text-sm font-medium">プロジェクト管理</div>
				<button
					type="button"
					onClick={() => setCreateDialogOpen(true)}
					className="h-8 px-3 rounded-full border border-[var(--md-ref-color-outline)] text-xs font-medium text-[var(--md-ref-color-on-surface)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
				>
					+ 作成
				</button>
			</div>

			{sortedProjects.length === 0 ? (
				<div className="text-sm opacity-60">プロジェクトはありません</div>
			) : (
				<div className="space-y-4">
					{sortedProjects.map((project) => (
						<ProjectPanelCard
							key={project.id}
							project={project}
							allTasks={tasks}
							onTaskOperation={onTaskOperation}
							onUpdate={updateProject}
							onDelete={deleteProject}
						/>
					))}
				</div>
			)}

			<ProjectDialog
				open={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onSubmit={async (name, description, deadline, references) => {
					await createProject(name, deadline, references, description);
					setCreateDialogOpen(false);
				}}
			/>
		</div>
	);
}
