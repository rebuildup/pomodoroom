/**
 * useProjects -- Hook for managing projects via Tauri IPC
 *
 * Provides project CRUD operations and caching.
 * Uses Tauri commands:
 * - cmd_project_list()
 * - cmd_project_create(name, deadline)
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "@/types/schedule";
import type { ProjectReferenceDraft } from "@/components/m3/ProjectDialog";

export interface UseProjectsResult {
	projects: Project[];
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
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
	getProjectNames: () => string[];
}

/**
 * Hook for managing projects from SQLite backend.
 *
 * @example
 * ```tsx
 * const { projects, loading, createProject, getProjectNames } = useProjects();
 *
 * // Create a new project
 * await createProject("My Project", "2025-12-31");
 *
 * // Get project names for dropdown
 * const options = getProjectNames();
 * ```
 */
export function useProjects(): UseProjectsResult {
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load projects from backend
	const normalizeProject = useCallback((json: Record<string, unknown>): Project => {
		const refsRaw = (json.references as Array<Record<string, unknown>> | undefined) ?? [];
		const tasks = ((json.tasks as unknown[]) ?? []) as Project["tasks"];
		return {
			id: String(json.id),
			name: String(json.name),
			deadline: (json.deadline as string | null) ?? undefined,
			tasks,
			isPinned:
				((json.isPinned as boolean | undefined) ??
					(json.is_pinned as boolean | undefined) ??
					false),
			createdAt:
				(json.createdAt as string | undefined) ??
				(json.created_at as string | undefined) ??
				new Date().toISOString(),
			references: refsRaw.map((r) => ({
				id: String(r.id),
				projectId: String((r.projectId as string | undefined) ?? (r.project_id as string | undefined) ?? json.id),
				kind: String(r.kind ?? ""),
				value: String(r.value ?? ""),
				label: (r.label as string | null) ?? undefined,
				metaJson: (r.metaJson as string | null) ?? (r.meta_json as string | null) ?? undefined,
				orderIndex: Number((r.orderIndex as number | undefined) ?? (r.order_index as number | undefined) ?? 0),
				createdAt:
					(r.createdAt as string | undefined) ??
					(r.created_at as string | undefined) ??
					new Date().toISOString(),
				updatedAt:
					(r.updatedAt as string | undefined) ??
					(r.updated_at as string | undefined) ??
					new Date().toISOString(),
			})),
		};
	}, []);

	const loadProjects = useCallback(async () => {
		setLoading(true);
		setError(null);
		let result: Record<string, unknown>[] | null = null;
		let loadError: unknown = null;
		try {
			result = await invoke<Record<string, unknown>[]>("cmd_project_list");
		} catch (err) {
			loadError = err;
		}

		if (loadError) {
			const message = loadError instanceof Error ? loadError.message : String(loadError);
			setError(`Failed to load projects: ${message}`);
			console.error("[useProjects] Failed to load projects:", loadError);
		} else if (result) {
			setProjects(result.map(normalizeProject));
		}
		setLoading(false);
	}, [normalizeProject]);

	// Load on mount
	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	// Create a new project
	const createProject = useCallback(
		async (
			name: string,
			deadline?: string,
			references?: ProjectReferenceDraft[],
			description?: string,
		): Promise<Project> => {
			setError(null);
			const trimmedName = name.trim();
			const projectDeadline = deadline || null;
			let result: Record<string, unknown> | null = null;
			let createError: unknown = null;
			try {
				result = await invoke<Record<string, unknown>>("cmd_project_create", {
					name: trimmedName,
					deadline: projectDeadline,
					references: references ?? [],
					description: description ?? null,
				});
			} catch (err) {
				createError = err;
			}

			if (createError) {
				const message = createError instanceof Error ? createError.message : String(createError);
				setError(`Failed to create project: ${message}`);
				console.error("[useProjects] Failed to create project:", createError);
				throw createError;
			}

			// Reload projects to get updated list
			await loadProjects();
			return normalizeProject(result as Record<string, unknown>);
		},
		[loadProjects, normalizeProject]
	);

	const updateProject = useCallback(
		async (
			projectId: string,
			updates: {
				name?: string;
				deadline?: string | null;
				references?: ProjectReferenceDraft[];
				isPinned?: boolean;
			},
		): Promise<Project> => {
			setError(null);
			const payload = {
				projectId,
				name: updates.name ?? null,
				deadline: updates.deadline ?? null,
				references: updates.references ?? null,
				isPinned: updates.isPinned ?? null,
			};
			let result: Record<string, unknown> | null = null;
			let updateError: unknown = null;
			try {
				result = await invoke<Record<string, unknown>>("cmd_project_update", payload);
			} catch (err) {
				updateError = err;
			}
			if (updateError) {
				const message = updateError instanceof Error ? updateError.message : String(updateError);
				setError(`Failed to update project: ${message}`);
				throw updateError;
			}
			await loadProjects();
			return normalizeProject(result as Record<string, unknown>);
		},
		[loadProjects, normalizeProject],
	);

	const deleteProject = useCallback(
		async (projectId: string, deleteTasks: boolean) => {
			setError(null);
			let deleteError: unknown = null;
			try {
				await invoke("cmd_project_delete", { projectId, deleteTasks });
			} catch (err) {
				deleteError = err;
			}
			if (deleteError) {
				const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
				setError(`Failed to delete project: ${message}`);
				throw deleteError;
			}
			await loadProjects();
		},
		[loadProjects],
	);

	// Get project names for dropdown/autocomplete
	const getProjectNames = useCallback((): string[] => {
		return projects.map((p) => p.name);
	}, [projects]);

	return {
		projects,
		loading,
		error,
		refresh: loadProjects,
		createProject,
		updateProject,
		deleteProject,
		getProjectNames,
	};
}
