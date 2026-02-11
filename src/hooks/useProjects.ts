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

export interface UseProjectsResult {
	projects: Project[];
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	createProject: (name: string, deadline?: string) => Promise<Project>;
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
	const loadProjects = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await invoke<Project[]>("cmd_project_list");
			setProjects(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(`Failed to load projects: ${message}`);
			console.error("[useProjects] Failed to load projects:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	// Load on mount
	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	// Create a new project
	const createProject = useCallback(
		async (name: string, deadline?: string): Promise<Project> => {
			setError(null);
			try {
				const result = await invoke<Project>("cmd_project_create", {
					name: name.trim(),
					deadline: deadline || null,
				});
				// Reload projects to get updated list
				await loadProjects();
				return result;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setError(`Failed to create project: ${message}`);
				console.error("[useProjects] Failed to create project:", err);
				throw err;
			}
		},
		[loadProjects]
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
		getProjectNames,
	};
}
