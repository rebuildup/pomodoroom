/**
 * useGoogleTasks — Google Tasks API integration hook.
 *
 * Handles task list management, task fetching, and completion.
 * Uses real Tauri IPC commands for backend integration.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskList {
	id: string;
	title: string;
	updated?: string;
}

export interface GoogleTask {
	id: string;
	title: string;
	notes?: string;
	status: "needsAction" | "completed";
	due?: string;
	updated?: string;
}

export interface GoogleTasksState {
	isConnected: boolean;
	isConnecting: boolean;
	syncEnabled: boolean;
	error?: string;
	lastSync?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_BUFFER = 5 * 60; // 5 minutes in seconds

// ─── Tauri Command Result Types ─────────────────────────────────────────────────

interface AuthResponse {
	authenticated: boolean;
}

interface SelectedTaskListResponse {
	tasklist_id?: string;
	is_default: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useGoogleTasks() {
	const [state, setState] = useState<GoogleTasksState>(() => ({
		isConnected: false,
		isConnecting: false,
		syncEnabled: false,
	}));

	const [tasklists, setTasklists] = useState<TaskList[]>([]);
	const [tasks, setTasks] = useState<GoogleTask[]>([]);

	// ─── Connection Status Check ────────────────────────────────────────────────

	const checkConnectionStatus = useCallback(async () => {
		let tokensJson: string | null = null;
		try {
			tokensJson = await invoke<string>("cmd_load_oauth_tokens", {
				serviceName: "google_tasks",
			});
		} catch (error) {
			setState({
				isConnected: false,
				isConnecting: false,
				syncEnabled: false,
			});
			return;
		}

		if (tokensJson) {
			try {
				const tokens = JSON.parse(tokensJson);
				const isValid = isTokenValid(tokens);

				setState({
					isConnected: isValid,
					isConnecting: false,
					syncEnabled: isValid,
				});
			} catch (e) {
				console.error("Failed to parse tokens:", e);
				setState({
					isConnected: false,
					isConnecting: false,
					syncEnabled: false,
				});
			}
		}
	}, []);

	// ─── OAuth & Authentication ────────────────────────────────────────────────

	/**
	 * Full interactive OAuth flow handled by Rust backend.
	 * Opens system browser, waits for localhost callback, and stores tokens.
	 */
	const connectInteractive = useCallback(async (): Promise<void> => {
		setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

		try {
			const response = await invoke<AuthResponse>("cmd_google_tasks_auth_connect");
			if (!response.authenticated) {
				throw new Error("Google Tasks authentication did not complete");
			}

			setState({
				isConnected: true,
				isConnecting: false,
				syncEnabled: true,
				lastSync: new Date().toISOString(),
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			setState(prev => ({
				...prev,
				isConnecting: false,
				error: message,
			}));
			throw error;
		}
	}, []);

	/**
	 * Disconnect from Google Tasks.
	 * Clears stored tokens and local state.
	 */
	const disconnect = useCallback(async () => {
		try {
			await invoke("cmd_google_tasks_auth_disconnect");
		} catch (error) {
			console.error("Failed to disconnect:", error);
		}

		setTasklists([]);
		setTasks([]);
		setState({
			isConnected: false,
			isConnecting: false,
			syncEnabled: false,
		});
	}, []);

	// ─── Task Lists ─────────────────────────────────────────────────────────────

	/**
	 * Fetch all task lists from Google Tasks API.
	 */
	const fetchTasklists = useCallback(async (): Promise<TaskList[]> => {
		if (!state.isConnected) {
			setTasklists([]);
			return [];
		}

		try {
			const lists = await invoke<TaskList[]>("cmd_google_tasks_list_tasklists");
			setTasklists(lists);

			setState(prev => ({
				...prev,
				error: undefined,
			}));

			return lists;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to fetch task lists:", message);

			setState(prev => ({ ...prev, error: message }));
			return [];
		}
	}, [state.isConnected]);

	/**
	 * Get the selected task list ID from database.
	 */
	const getSelectedTasklist = useCallback(async (): Promise<string | null> => {
		try {
			const result = await invoke<SelectedTaskListResponse>("cmd_google_tasks_get_selected_tasklist");
			return result.tasklist_id ?? null;
		} catch {
			return null;
		}
	}, []);

	/**
	 * Set the selected task list ID in database.
	 */
	const setSelectedTasklist = useCallback(async (tasklistId: string): Promise<boolean> => {
		if (!tasklistId.trim()) {
			setState(prev => ({ ...prev, error: "Task list ID cannot be empty" }));
			return false;
		}

		try {
			await invoke("cmd_google_tasks_set_selected_tasklist", {
				tasklistId,
			});

			setState(prev => ({
				...prev,
				error: undefined,
			}));

			return true;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to set task list:", message);
			setState(prev => ({ ...prev, error: message }));
			return false;
		}
	}, []);

	// ─── Tasks ───────────────────────────────────────────────────────────────────

	/**
	 * Fetch tasks from a specific task list (uncompleted only).
	 * If no tasklistId provided, uses the stored selection.
	 */
	const fetchTasks = useCallback(async (tasklistId?: string): Promise<GoogleTask[]> => {
		if (!state.isConnected) {
			setTasks([]);
			return [];
		}

		const targetListId = tasklistId ?? await getSelectedTasklist();

		if (!targetListId) {
			setTasks([]);
			return [];
		}

		try {
			const fetchedTasks = await invoke<GoogleTask[]>("cmd_google_tasks_list_tasks", {
				tasklistId: targetListId,
			});
			setTasks(fetchedTasks);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
				error: undefined,
			}));

			return fetchedTasks;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to fetch tasks:", message);

			setState(prev => ({ ...prev, error: message }));
			return [];
		}
	}, [state.isConnected, getSelectedTasklist]);

	/**
	 * Complete a task by marking its status as "completed".
	 */
	const completeTask = useCallback(async (taskId: string, tasklistId?: string): Promise<void> => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Tasks");
		}

		if (!taskId.trim()) {
			throw new Error("Task ID cannot be empty");
		}

		const targetListId = tasklistId ?? await getSelectedTasklist();

		if (!targetListId) {
			throw new Error("No task list selected");
		}

		try {
			const updatedTask = await invoke<GoogleTask>("cmd_google_tasks_complete_task", {
				tasklistId: targetListId,
				taskId,
			});

			setTasks(prev => prev.map(t =>
				t.id === taskId ? updatedTask : t
			));

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
				error: undefined,
			}));
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to complete task:", message);

			setState(prev => ({ ...prev, error: message }));
			throw error;
		}
	}, [state.isConnected, getSelectedTasklist]);

	/**
	 * Create a new task in the selected task list.
	 */
	const createTask = useCallback(async (title: string, notes?: string): Promise<GoogleTask> => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Tasks");
		}

		const targetListId = await getSelectedTasklist();

		if (!targetListId) {
			throw new Error("No task list selected");
		}

		if (!title.trim()) {
			throw new Error("Task title cannot be empty");
		}

		try {
			const newTask = await invoke<GoogleTask>("cmd_google_tasks_create_task", {
				tasklistId: targetListId,
				title,
				notes: notes ?? null,
			});

			setTasks(prev => [...prev, newTask]);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
				error: undefined,
			}));

			return newTask;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to create task:", message);

			setState(prev => ({ ...prev, error: message }));
			throw error;
		}
	}, [state.isConnected, getSelectedTasklist]);

	// ─── Sync Control ───────────────────────────────────────────────────────────

	const toggleSync = useCallback((enabled: boolean) => {
		setState(prev => ({ ...prev, syncEnabled: enabled }));
	}, []);

	// ─── Effects ───────────────────────────────────────────────────────────────

	// Check connection status on mount
	useEffect(() => {
		checkConnectionStatus();
	}, [checkConnectionStatus]);

	// Load task lists on mount and when connected
	useEffect(() => {
		if (state.isConnected && state.syncEnabled) {
			fetchTasklists();
		} else {
			setTasklists([]);
		}
	}, [state.isConnected, state.syncEnabled, fetchTasklists]);

	// ─── Return Hook API ─────────────────────────────────────────────────────────

	return {
		state,
		tasklists,
		tasks,
		connectInteractive,
		disconnect,
		fetchTasklists,
		getSelectedTasklist,
		setSelectedTasklist,
		fetchTasks,
		completeTask,
		createTask,
		toggleSync,
	};
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Check if stored OAuth tokens are valid and not expired.
 */
export function isTokenValid(tokens?: {
	access_token?: string;
	accessToken?: string;
	refresh_token?: string;
	refreshToken?: string;
	expires_at?: number;
	expiresAt?: number;
}): boolean {
	if (!tokens) return false;

	const expiresAt = tokens.expires_at ?? tokens.expiresAt;
	if (!expiresAt) return false;

	const now = Math.floor(Date.now() / 1000);
	return expiresAt > now + TOKEN_EXPIRY_BUFFER;
}
