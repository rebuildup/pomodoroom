/**
 * OverviewPinnedProjects - Display pinned projects in Overview
 *
 * Shows pinned projects with their tasks and references in a style
 * matching TasksView's project list. Clicking add cards navigates
 * to TasksView for actual creation.
 */

import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
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

interface OverviewPinnedProjectsProps {
	projects: Project[];
	tasks: Task[];
	onTaskOperation: (taskId: string, operation: TaskOperation) => void;
	onUpdateProject: (
		projectId: string,
		updates: {
			name?: string;
			deadline?: string | null;
			references?: Array<{
				kind: string;
				value: string;
				label?: string;
			}>;
			isPinned?: boolean;
		},
	) => Promise<Project>;
	onNavigateToTasks?: (action: TasksViewAction) => void;
	onExecuteReference?: (reference: { kind: string; value: string; label?: string }, projectId?: string) => void;
}

export function OverviewPinnedProjects({
	projects,
	tasks,
	onTaskOperation,
	onUpdateProject,
	onNavigateToTasks,
	onExecuteReference,
}: OverviewPinnedProjectsProps) {
	const [collapsedProjectIds, setCollapsedProjectIds] = useState<Record<string, boolean>>({});

	const pinnedProjects = useMemo(
		() =>
			projects
				.filter((project) => Boolean(project.isPinned))
				.sort((a, b) => a.name.localeCompare(b.name, "ja")),
		[projects],
	);

	const handleTogglePin = useCallback(
		(projectId: string, isPinned: boolean) => {
			void onUpdateProject(projectId, { isPinned });
		},
		[onUpdateProject],
	);

	if (pinnedProjects.length === 0) return null;

	return (
		<div className="space-y-3">
			<div className="text-sm font-medium">ピン留めプロジェクト</div>
			{pinnedProjects.map((project) => {
				const projectTasks = getTasksForProject(tasks, project);
				const projectRefs = project.references ?? [];
				const isExpanded = !collapsedProjectIds[project.id];

				return (
					<section
						key={project.id}
						className="rounded-lg overflow-hidden bg-[var(--md-ref-color-surface-container-lowest)]"
					>
						{/* Header with expand/collapse */}
						<button
							type="button"
							onClick={() =>
								setCollapsedProjectIds((prev) => ({
									...prev,
									[project.id]: !prev[project.id],
								}))
							}
							className="no-pill bg-transparent hover:bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
						>
							<div className="flex items-center gap-2 text-sm font-medium text-[var(--md-ref-color-on-surface)]">
								<Icon name="folder" size={18} />
								<span
									role="button"
									tabIndex={0}
									onClick={(e) => {
										e.stopPropagation();
										onNavigateToTasks?.({ type: "edit-project", projectId: project.id });
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											e.stopPropagation();
											onNavigateToTasks?.({ type: "edit-project", projectId: project.id });
										}
									}}
									className="hover:text-[var(--md-ref-color-primary)] transition-colors cursor-pointer"
								>
									{project.name}
								</span>
								<span className="text-[var(--md-ref-color-on-surface-variant)]">
									({projectTasks.length} / {projectRefs.length})
								</span>
							</div>
							<div className="flex items-center gap-1">
								{/* Pin toggle button */}
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										handleTogglePin(project.id, false);
									}}
									className="no-pill w-7 h-7 rounded-full flex items-center justify-center transition-colors text-[var(--md-ref-color-primary)] bg-[var(--md-ref-color-primary-container)]"
									aria-label="ピン留め解除"
									title="ピン留め解除"
								>
									<Icon name="push_pin" size={16} />
								</button>
								<Icon
									name={isExpanded ? "expand_less" : "expand_more"}
									size={20}
									className="text-[var(--md-ref-color-on-surface-variant)]"
								/>
							</div>
						</button>

						{/* Expanded content: tasks and references stacked vertically */}
						{isExpanded && (
							<div className="border-t border-[var(--md-ref-color-outline-variant)]">
								<div className="p-3 space-y-4">
									{/* Tasks section */}
									<div>
										<h4 className="text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
											タスク {projectTasks.length > 0 && `(${projectTasks.length})`}
										</h4>
										<div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
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
											{/* Add task card - navigates to TasksView */}
											<TaskCard
												addMode
												onAddClick={(e) => {
													e.stopPropagation();
													onNavigateToTasks?.({ type: "create-task", projectId: project.id });
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
														onExecute={onExecuteReference}
													/>
												))}
											{/* Add reference card - navigates to TasksView */}
											<ReferenceCard
												addMode
												onAddClick={(e) => {
													e.stopPropagation();
													onNavigateToTasks?.({ type: "create-reference", projectId: project.id });
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
		</div>
	);
}
