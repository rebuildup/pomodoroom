/**
 * useGoogleTasks — Google Tasks API integration hook.
 *
 * Handles task list management, task fetching, and completion.
 * Uses real Tauri IPC commands for backend integration.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ────────────────────────────────────────────────────────────

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
	tasklistIds: string[];
}

export interface SessionTask {
	taskId: string;
	tasklistId: string;
	taskTitle: string;
	isSet: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────

const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes in ms

// ─── Tauri Command Result Types ─────────────────────────────────────────────────

interface AuthResponse {
	authenticated: boolean;
}

interface SelectedTaskListResponse {
	tasklist_ids?: string[];
	is_default: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useGoogleTasks() {
	const [state, setState] = useState<GoogleTasksState>(() => ({
		isConnected: false,
		isConnecting: false,
		syncEnabled: false,
		tasklistIds: ["default"],
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
				tasklistIds: [],
			});
			return;
		}

		if (tokensJson) {
			try {
				const tokens = JSON.parse(tokensJson);
				const isValid = isTokenValid(tokens);

				// Load selected tasklist IDs
				let selectedIds: string[] = ["default"];
				try {
					const result = await invoke<{
						tasklist_ids?: string[];
					}>("cmd_google_tasks_get_selected_tasklists");
					selectedIds = result.tasklist_ids ?? ["default"];
				} catch {
					// Use default if command fails
				}

				setState({
					isConnected: isValid,
					isConnecting: false,
					syncEnabled: isValid,
					tasklistIds: selectedIds,
				});
			} catch (e) {
				console.error("Failed to parse tokens:", e);
				setState({
					isConnected: false,
					isConnecting: false,
					syncEnabled: false,
					tasklistIds: [],
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
				tasklistIds: state.tasklistIds,
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
			tasklistIds: [],
		});
	}, []);

	// ─── Task Lists ────────────────────────────────────────────────────────

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
	 * Get all selected task list IDs from database.
	 */
	const getSelectedTasklists = useCallback(async (): Promise<string[]> => {
		try {
			const result = await invoke<{
				tasklist_ids?: string[];
			}>("cmd_google_tasks_get_selected_tasklists");

			return result.tasklist_ids ?? [];
		} catch {
			return [];
		}
	}, []);

	/**
	 * Set multiple task list IDs in database.
	 */
	const setSelectedTasklists = useCallback(async (tasklistIds: string[]): Promise<boolean> => {
		if (!tasklistIds.length) {
			setState(prev => ({ ...prev, error: "At least one task list must be selected" }));
			return false;
		}

		try {
			await invoke("cmd_google_tasks_set_selected_tasklists", {
				tasklistIds,
			});

			setState(prev => ({
				...prev,
				tasklistIds: tasklistIds.clone(),
				error: undefined,
			}));

			return true;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to set task lists:", message);

			setState(prev => ({
				...prev,
				error: message,
			}));

			return false;
		}
	}, []);

	// ─── Tasks ────────────────────────────────────────────────────────────

	/**
	 * Fetch tasks from selected task lists (union of all selected lists).
	 * If no tasklistId provided, uses stored selections.
	 */
	const fetchTasks = useCallback(async (tasklistId?: string): Promise<GoogleTask[]> => {
		if (!state.isConnected) {
			setTasks([]);
			return [];
		}

		// Get all selected tasklist IDs if no specific list provided
		const targetListIds = tasklistId
			? [tasklistId]
			: state.tasklistIds.length > 0
				? state.tasklistIds
				: await getSelectedTasklists();

		if (targetListIds.length === 0) {
			setTasks([]);
			return [];
		}

		try {
			// Fetch tasks from each selected list and merge
			const allTasks: GoogleTask[] = [];
			for (const listId of targetListIds) {
				const tasks = await invoke<GoogleTask[]>("cmd_google_tasks_list_tasks", {
					tasklistId: listId,
				});
				allTasks.push(...tasks);
			}

			// Sort by status (uncompleted first) and title
			allTasks.sort((a, b) => {
				if (a.status === "needsAction" && b.status !== "needsAction") return -1;
				if (a.status !== "needsAction" && b.status === "needsAction") return 1;
				return a.title.localeCompare(b.title);
			});

			setTasks(allTasks);

			setState(prev => ({
				...prev,
				error: undefined,
			}));

			return allTasks;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to fetch tasks:", message);

			setState(prev => ({ ...prev, error: message }));
			return [];
		}
	}, [state.isConnected, state.tasklistIds, getSelectedTasklists]);

	/**
	 * Complete a task.
	 */
	const completeTask = useCallback(async (taskId: string, tasklistId?: string): Promise<void> => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Tasks");
		}

		const targetListId = tasklistId ?? state.tasklistIds[0] ?? null;

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

			setState(prev => ({
				...prev,
				error: message,
			}));

			throw error;
		}
	}, [state.isConnected, state.tasklistIds]);

	/**
	 * Create a new task.
	 */
	const createTask = useCallback(async (title: string, notes?: string): Promise<GoogleTask> => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Tasks");
		}

		const targetListId = state.tasklistIds[0] ?? null;

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

			setState(prev => ({
				...prev,
				error: message,
			}));

			throw error;
		}
	}, [state.isConnected, state.tasklistIds]);

	// ─── Session Task Commands ────────────────────────────────────────────────

	/**
	 * Get the task ID associated with current session.
	 */
	const getSelectedTaskId = useCallback(async (): Promise<string | null> => {
		try {
			const result = await invoke<{
				task_id?: string;
			}>("cmd_google_tasks_get_session_task");

			return result.task_id ?? null;
		} catch {
			return null;
		}
	}, []);

	/**
	 * Set a task to be completed when session finishes.
	 */
	const setSelectedTaskId = useCallback(async (
		taskId: string,
		tasklistId: string,
		taskTitle: string,
	): Promise<boolean> => {
		if (!taskId.trim()) {
			setState(prev => ({ ...prev, error: "Task ID cannot be empty" }));
			return false;
		}

		if (!tasklistId.trim()) {
			setState(prev => ({ ...prev, error: "Task list ID cannot be empty" }));
			return false;
		}

		try {
			await invoke("cmd_google_tasks_set_session_task", {
				taskId,
				tasklistId,
				taskTitle,
			});

			setState(prev => ({
				...prev,
				error: undefined,
			}));

			return true;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to set session task:", message);

			setState(prev => ({
				...prev,
				error: message,
			}));

			return false;
		}
	}, []);

	/**
	 * Complete task associated with current session.
	 * Called automatically when a Pomodoro session finishes.
	 */
	const completeCurrentSessionTask = useCallback(async (): Promise<GoogleTask | null> => {
		if (!state.isConnected) {
			console.warn("[useGoogleTasks] Not connected, cannot complete session task");
			return null;
		}

		try {
			const result = await invoke<GoogleTask | null>("cmd_google_tasks_complete_session_task");

			if (result) {
				setState(prev => ({
					...prev,
					lastSync: new Date().toISOString(),
					error: undefined,
				}));
			}

			return result;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[useGoogleTasks] Failed to complete session task:", message);

			setState(prev => ({ ...prev, error: message }));

			return null;
		}
	}, [state.isConnected]);

	// ─── Sync Control ───────────────────────────────────────────────────────

	const toggleSync = useCallback((enabled: boolean) => {
		setState(prev => ({ ...prev, syncEnabled: enabled }));
	}, []);

	// ─── Effects ───────────────────────────────────────────────────────

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

	// ─── Return Hook API ─────────────────────────────────────────────────────

	return {
		state,
		tasklists,
		tasks,
		connectInteractive,
		disconnect,
		fetchTasklists,
		getSelectedTasklists,
		setSelectedTasklists,
		fetchTasks,
		completeTask,
		createTask,
		getSelectedTaskId,
		setSelectedTaskId,
		completeCurrentSessionTask,
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
