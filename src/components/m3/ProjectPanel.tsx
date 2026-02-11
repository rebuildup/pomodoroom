/**
 * ProjectPanel -- Material 3 Project Management Component
 *
 * Manages projects stored in SQLite via Tauri IPC.
 * Features:
 * - List all projects
 * - Create new projects with optional deadline
 * - Display task count per project
 */
import { useState } from "react";
import { Icon } from "./Icon";
import { useProjects } from "@/hooks/useProjects";

const PROJECT_COLOR_DEFAULT = "#3b82f6";

export interface ProjectPanelProps {
	theme: "light" | "dark";
}

export function ProjectPanel({ theme }: ProjectPanelProps) {
	const { projects, loading, error, createProject } = useProjects();
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [newProjectName, setNewProjectName] = useState("");
	const [newProjectDeadline, setNewProjectDeadline] = useState("");
	const [createFormError, setCreateFormError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);

	// Create new project
	const handleCreateProject = async (e: React.FormEvent) => {
		e.preventDefault();
		setCreateFormError(null);

		if (!newProjectName.trim()) {
			setCreateFormError("Project name is required");
			return;
		}

		setIsCreating(true);
		const deadline = newProjectDeadline || undefined;
		try {
			await createProject(newProjectName.trim(), deadline);
			// Reset form and close
			setNewProjectName("");
			setNewProjectDeadline("");
			setShowCreateForm(false);
			setIsCreating(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setCreateFormError(`Failed to create project: ${message}`);
			setIsCreating(false);
		}
	};

	// Format date for display
	const formatDate = (isoDate?: string) => {
		if (!isoDate) return null;
		try {
			const date = new Date(isoDate);
			return date.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		} catch {
			return null;
		}
	};

	// Check if deadline is approaching (within 7 days)
	const isDeadlineApproaching = (deadline?: string) => {
		if (!deadline) return false;
		let daysUntil: number;
		try {
			const due = new Date(deadline);
			const now = new Date();
			daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
		} catch {
			return false;
		}
		return daysUntil <= 7 && daysUntil >= 0;
	};

	// Check if deadline is overdue
	const isDeadlineOverdue = (deadline?: string) => {
		if (!deadline) return false;
		try {
			const due = new Date(deadline);
			const now = new Date();
			return due < now;
		} catch {
			return false;
		}
	};

	const isDark = theme === "dark";

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3
					className={`text-xs font-bold uppercase tracking-widest ${
						isDark ? "text-gray-500" : "text-gray-400"
					}`}
				>
					Projects
				</h3>
				<button
					type="button"
					onClick={() => setShowCreateForm(!showCreateForm)}
					className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
						isDark
							? "bg-white/10 hover:bg-white/15"
							: "bg-black/5 hover:bg-black/10"
					}`}
					aria-label={showCreateForm ? "Cancel" : "Add project"}
				>
					<Icon name={showCreateForm ? "close" : "add"} size={14} />
					{showCreateForm ? "Cancel" : "Add"}
				</button>
			</div>

			{/* Create Project Form */}
			{showCreateForm && (
				<form
					onSubmit={handleCreateProject}
					className={`p-4 rounded-xl space-y-3 ${
						isDark ? "bg-white/5" : "bg-black/5"
					}`}
				>
					{createFormError && (
						<p className="text-red-400 text-xs">{createFormError}</p>
					)}
					<div>
						<label
							htmlFor="project-name"
							className={`block text-sm font-medium mb-1 ${
								isDark ? "text-gray-300" : "text-gray-700"
							}`}
						>
							Project Name <span className="text-red-500">*</span>
						</label>
						<input
							id="project-name"
							type="text"
							value={newProjectName}
							onChange={(e) => setNewProjectName(e.target.value)}
							placeholder="e.g. Website Redesign"
							className={`w-full px-3 py-2 rounded-lg border text-sm ${
								isDark
									? "bg-white/10 border-white/10 focus:border-blue-500 text-white placeholder-gray-400"
									: "bg-white border-gray-300 focus:border-blue-500 text-gray-900 placeholder-gray-400"
							} border focus:outline-none transition-colors`}
							autoFocus
						/>
					</div>
					<div>
						<label
							htmlFor="project-deadline"
							className={`block text-sm font-medium mb-1 ${
								isDark ? "text-gray-300" : "text-gray-700"
							}`}
						>
							Deadline <span className="text-gray-500 text-xs">(optional)</span>
						</label>
						<input
							id="project-deadline"
							type="date"
							value={newProjectDeadline}
							onChange={(e) => setNewProjectDeadline(e.target.value)}
							className={`w-full px-3 py-2 rounded-lg border text-sm ${
								isDark
									? "bg-white/10 border-white/10 focus:border-blue-500 text-white placeholder-gray-400"
									: "bg-white border-gray-300 focus:border-blue-500 text-gray-900 placeholder-gray-400"
							} border focus:outline-none transition-colors`}
						/>
					</div>
					<button
						type="submit"
						disabled={isCreating}
						className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
							isCreating
								? "opacity-50 cursor-not-allowed"
								: isDark
									? "bg-blue-600 hover:bg-blue-700 text-white"
									: "bg-blue-500 hover:bg-blue-600 text-white"
						} ${isDark ? "text-white" : "text-white"}`}
					>
						{isCreating ? "Creating..." : "Create Project"}
					</button>
				</form>
			)}

			{/* Loading state */}
			{loading && (
				<p
					className={`text-center py-8 text-sm ${
						isDark ? "text-gray-500" : "text-gray-400"
					}`}
				>
					Loading projects...
				</p>
			)}

			{/* Error state */}
			{error && (
				<p className="text-red-400 text-sm py-4 text-center">{error}</p>
			)}

			{/* Empty state */}
			{!loading && !error && projects.length === 0 && !showCreateForm && (
				<p
					className={`text-center py-8 text-sm ${
						isDark ? "text-gray-500" : "text-gray-400"
					}`}
				>
					No projects yet. Create one to get started.
				</p>
			)}

			{/* Project list */}
			{!loading && !error && projects.length > 0 && (
				<div className="space-y-2">
					{projects.map((project) => {
						const deadline = formatDate(project.deadline);
						const approaching = isDeadlineApproaching(project.deadline);
						const overdue = isDeadlineOverdue(project.deadline);

						return (
							<div
								key={project.id}
								className={`p-3 rounded-lg border ${
									isDark
										? "bg-white/5 border-white/10"
										: "bg-black/5 border-gray-200"
								}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex items-start gap-3 min-w-0 flex-1">
										{/* Project icon/color indicator */}
										<div
											className="w-3 h-3 rounded-sm mt-1 flex-shrink-0"
											style={{ backgroundColor: PROJECT_COLOR_DEFAULT }}
											aria-hidden="true"
										/>

										{/* Project info */}
										<div className="min-w-0 flex-1">
											<h4
												className={`text-sm font-medium truncate ${
													isDark ? "text-white" : "text-gray-900"
												}`}
											>
												{project.name}
											</h4>
											<div className="flex items-center gap-3 mt-1">
												{/* Task count */}
												<span
													className={`text-xs ${
														isDark ? "text-gray-500" : "text-gray-400"
													}`}
												>
													<Icon
														name="check_circle_outline"
														size={12}
														aria-hidden="true"
														className="mr-1"
													/>
													{project.tasks.length} task
													{project.tasks.length !== 1 ? "s" : ""}
												</span>

												{/* Deadline */}
												{deadline && (
													<span
														className={`text-xs ${
															overdue
																? "text-red-400"
																: approaching
																	? "text-yellow-400"
																	: isDark
																		? "text-gray-500"
																		: "text-gray-400"
														}`}
													>
														<Icon
															name={
																overdue
																	? "warning"
																	: approaching
																		? "schedule"
																		: "event"
															}
															size={12}
															aria-hidden="true"
															className="mr-1"
														/>
														{deadline}
														{overdue && " (overdue)"}
													</span>
												)}
											</div>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default ProjectPanel;
