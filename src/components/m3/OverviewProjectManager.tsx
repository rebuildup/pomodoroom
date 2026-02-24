import { useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import { ProjectDialog, type ProjectReferenceDraft } from "@/components/m3/ProjectDialog";
import { ReferenceCard } from "@/components/m3/ReferenceCard";
import { TaskCard } from "@/components/m3/TaskCard";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import type { Project } from "@/types/schedule";
import type { Task } from "@/types/task";
import { getTasksForProject } from "@/utils/project-task-matching";

export type TasksViewAction =
	| { type: "create-task"; projectId?: string }
	| { type: "create-reference"; projectId: string }
	| { type: "edit-project"; projectId: string };

interface OverviewProjectManagerProps {
	projects: Project[];
	tasks: Task[];
	onTaskOperation: (taskId: string, operation: TaskOperation) => void;
	onNavigateToTasks?: (action: TasksViewAction) => void;
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

interface ProjectPanelCardProps {
	project: Project;
	allTasks: Task[];
	onTaskOperation: (taskId: string, operation: TaskOperation) => void;
	onNavigateToTasks?: (action: TasksViewAction) => void;
	onTogglePin?: (projectId: string, isPinned: boolean) => void;
}

function ProjectPanelCard({
	project,
	allTasks,
	onTaskOperation,
	onNavigateToTasks,
	onTogglePin,
}: ProjectPanelCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const projectTasks = getTasksForProject(allTasks, project);
	const projectRefs = project.references ?? [];

	const handleAddTask = () => {
		onNavigateToTasks?.({ type: "create-task", projectId: project.id });
	};

	const handleAddReference = () => {
		onNavigateToTasks?.({ type: "create-reference", projectId: project.id });
	};

	const handleEditProject = (e: React.MouseEvent) => {
		e.stopPropagation();
		onNavigateToTasks?.({ type: "edit-project", projectId: project.id });
	};

	return (
		<div className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
			>
				<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
					<Icon name="folder" size={18} />
					<span
						onClick={handleEditProject}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								e.stopPropagation();
								handleEditProject(e as any);
							}
						}}
						role="button"
						tabIndex={0}
						className="hover:underline hover:text-[var(--md-ref-color-primary)] cursor-pointer transition-colors"
					>
						{project.name}
					</span>
					<span className="text-[var(--md-ref-color-on-surface-variant)]">
						({projectTasks.length} / {projectRefs.length})
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onTogglePin?.(project.id, !project.isPinned);
						}}
						className={`no-pill w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
							project.isPinned
								? "text-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-primary-container)]"
								: "text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)]"
						}`}
						aria-label={project.isPinned ? "ピン留め解除" : "ピン留め"}
						title={project.isPinned ? "ピン留め解除" : "ピン留め"}
					>
						<Icon
							name={project.isPinned ? "push_pin" : "push_pin"}
							size={16}
							className={project.isPinned ? "" : "opacity-50"}
						/>
					</button>
					<Icon
						name={isExpanded ? "expand_less" : "expand_more"}
						size={20}
						className="text-[var(--md-ref-color-on-surface-variant)]"
					/>
				</div>
			</button>

			{isExpanded && (
				<div className="border-t border-[var(--md-ref-color-outline-variant)]">
					<div className="p-3 space-y-4">
						{/* References section */}
						<div>
							<h4 className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
								リファレンス
							</h4>
							<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
								{projectRefs
									.sort((a, b) => a.orderIndex - b.orderIndex)
									.map((ref) => (
										<ReferenceCard key={ref.id} reference={ref} projectId={project.id} />
									))}
								<ReferenceCard addMode onAddClick={handleAddReference} />
							</div>
						</div>

						{/* Tasks section */}
						<div>
							<h4 className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
								タスク {projectTasks.length > 0 && `(${projectTasks.length})`}
							</h4>
							<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
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
								<div
									onClick={handleAddTask}
									role="button"
									tabIndex={0}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleAddTask();
										}
									}}
									className="group relative flex items-center justify-center p-2 rounded-md h-[52px]
										bg-[var(--md-ref-color-surface)]
										border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_55%,transparent)]
										cursor-pointer
										hover:bg-[var(--md-ref-color-surface-container-low)]
										transition-colors duration-150 ease-out
									"
								>
									<Icon name="add" size={24} className="text-[var(--md-ref-color-primary)]" />
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export function OverviewProjectManager({
	projects,
	tasks,
	onTaskOperation,
	onNavigateToTasks,
	createProject,
	updateProject,
	deleteProject: _deleteProject,
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
		<div className="space-y-3">
			<div className="text-sm font-medium">プロジェクト管理</div>

			<div className="space-y-3">
				{sortedProjects.map((project) => (
					<ProjectPanelCard
						key={project.id}
						project={project}
						allTasks={tasks}
						onTaskOperation={onTaskOperation}
						onNavigateToTasks={onNavigateToTasks}
						onTogglePin={(projectId, isPinned) => {
							updateProject(projectId, { isPinned });
						}}
					/>
				))}
				{/* Add project card */}
				<div
					onClick={() => setCreateDialogOpen(true)}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setCreateDialogOpen(true);
						}
					}}
					className="group relative flex items-center justify-center p-2 rounded-md h-[52px]
						bg-[var(--md-ref-color-surface)]
						border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_55%,transparent)]
						cursor-pointer
						hover:bg-[var(--md-ref-color-surface-container-low)]
						transition-colors duration-150 ease-out
					"
				>
					<Icon name="add" size={24} className="text-[var(--md-ref-color-primary)]" />
				</div>
			</div>

			<ProjectDialog
				open={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onSubmit={async (name, description, deadline) => {
					await createProject(name, deadline, [], description);
					setCreateDialogOpen(false);
				}}
			/>
		</div>
	);
}
