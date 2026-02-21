/**
 * useGroups - Hook for managing task groups
 *
 * Supports hierarchical (nested) group structure.
 * Groups are used to organize tasks without independent lifecycle like projects.
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Group {
	id: string;
	name: string;
	parentId?: string;
	order: number;
	createdAt: string;
}

export interface UseGroupsResult {
	groups: Group[];
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	createGroup: (name: string, parentId?: string) => Promise<Group>;
	deleteGroup: (groupId: string) => Promise<void>;
	updateGroup: (
		groupId: string,
		updates: Partial<Pick<Group, "name" | "order">> & { parentId?: string | null }
	) => Promise<void>;
	getRootGroups: () => Group[];
	getSubGroups: (parentId: string) => Group[];
	getGroupHierarchy: (groupId: string) => Group[];
}

/**
 * Hook for managing task groups with hierarchical support.
 */
export function useGroups(): UseGroupsResult {
	const [groups, setGroups] = useState<Group[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const normalizeGroup = useCallback((json: Record<string, unknown>): Group => {
		if (json.id == null || json.name == null) {
			throw new Error(
				`normalizeGroup: invalid Group payload, missing id or name: ${JSON.stringify(json)}`
			);
		}
		const parentIdValue = json.parentId ?? json.parent_id;
		return {
			id: String(json.id),
			name: String(json.name),
			parentId: parentIdValue != null ? String(parentIdValue) : undefined,
			order: Number((json.order as number | undefined) ?? (json.order_index as number | undefined) ?? 0),
			createdAt:
				(json.createdAt as string | undefined) ??
				(json.created_at as string | undefined) ??
				new Date().toISOString(),
		};
	}, []);

	// Load groups from backend
	const loadGroups = useCallback(async () => {
		setLoading(true);
		setError(null);
		let result: Record<string, unknown>[] | null = null;
		let loadError: unknown = null;
		try {
			result = await invoke<Record<string, unknown>[]>("cmd_group_list");
		} catch (err) {
			loadError = err;
		}

		if (loadError) {
			const message = loadError instanceof Error ? loadError.message : String(loadError);
			setError(`Failed to load groups: ${message}`);
			console.error("[useGroups] Failed to load groups:", loadError);
		} else if (result) {
			setGroups(result.map(normalizeGroup));
		}
		setLoading(false);
	}, [normalizeGroup]);

	// Load on mount
	useEffect(() => {
		loadGroups();
	}, [loadGroups]);

	// Keep groups in sync across windows/sections.
	useEffect(() => {
		const onRefresh = () => {
			void loadGroups();
		};
		window.addEventListener("groups:refresh", onRefresh);
		return () => {
			window.removeEventListener("groups:refresh", onRefresh);
		};
	}, [loadGroups]);

	// Create a new group
	const createGroup = useCallback(
		async (name: string, parentId?: string): Promise<Group> => {
			setError(null);
			const trimmedName = name.trim();
			const parentValue = parentId ?? null;
			let result: Record<string, unknown> | null = null;
			let createError: unknown = null;
			try {
				result = await invoke<Record<string, unknown>>("cmd_group_create", {
					name: trimmedName,
					parent_id: parentValue,
				});
			} catch (err) {
				createError = err;
			}

			if (createError) {
				const message = createError instanceof Error ? createError.message : String(createError);
				setError(`Failed to create group: ${message}`);
				console.error("[useGroups] Failed to create group:", createError);
				throw createError;
			}

			// Reload groups to get updated list
			await loadGroups();
			if (!result) {
				throw new Error("normalizeGroup: backend returned null for created Group");
			}
			return normalizeGroup(result);
		},
		[loadGroups, normalizeGroup]
	);

	// Delete a group
	const deleteGroup = useCallback(
		async (groupId: string) => {
			let deleteError: unknown = null;
			try {
				await invoke("cmd_group_delete", { group_id: groupId });
			} catch (err) {
				deleteError = err;
			}

			if (deleteError) {
				const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
				setError(`Failed to delete group: ${message}`);
				console.error("[useGroups] Failed to delete group:", deleteError);
				throw deleteError;
			}

			// Reload groups
			await loadGroups();
		},
		[loadGroups]
	);

	// Update a group
	const updateGroup = useCallback(
		async (groupId: string, updates: Partial<Pick<Group, "name" | "order">> & { parentId?: string | null }) => {
			let updateError: unknown = null;
			const parentSpecified = updates.parentId !== undefined;
			const clearParent = updates.parentId === null;
			const payload: Record<string, unknown> = {
				group_id: groupId,
				name: updates.name,
				order: updates.order,
			};
			if (parentSpecified) {
				payload.parent_id = updates.parentId ?? null;
				payload.clear_parent = clearParent ? true : null;
			}
			try {
				await invoke("cmd_group_update", payload);
			} catch (err) {
				updateError = err;
			}

			if (updateError) {
				const message = updateError instanceof Error ? updateError.message : String(updateError);
				setError(`Failed to update group: ${message}`);
				console.error("[useGroups] Failed to update group:", updateError);
				throw updateError;
			}

			// Reload groups
			await loadGroups();
		},
		[loadGroups]
	);

	// Get root groups (no parent)
	const getRootGroups = useCallback((): Group[] => {
		return groups.filter(g => !g.parentId);
	}, [groups]);

	// Get sub-groups for a parent
	const getSubGroups = useCallback((parentId: string): Group[] => {
		return groups.filter(g => g.parentId === parentId).sort((a, b) => a.order - b.order);
	}, [groups]);

	// Get group hierarchy (path from root to current)
	const getGroupHierarchy = useCallback((groupId: string): Group[] => {
		const hierarchy: Group[] = [];
		const visited = new Set<string>();
		let currentId: string | undefined = groupId;
		while (currentId) {
			if (visited.has(currentId)) break;
			visited.add(currentId);
			const group = groups.find(g => g.id === currentId);
			if (!group) break;
			hierarchy.unshift(group);
			currentId = group.parentId;
		}
		return hierarchy;
	}, [groups]);

	return {
		groups,
		loading,
		error,
		refresh: loadGroups,
		createGroup,
		deleteGroup,
		updateGroup,
		getRootGroups,
		getSubGroups,
		getGroupHierarchy,
	};
}
