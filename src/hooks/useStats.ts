/**
 * useStats - Hook for statistics and session data from backend.
 *
 * Database-only architecture: reads session data from SQLite backend via Tauri IPC.
 * Provides session data for charts and statistics.
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SessionData {
	completed_at: string;
	step_type: string;
	duration_min: number;
	task_id: string | null;
	project_name: string | null;
}

export interface StatsData {
	totalFocusMinutes: number;
	totalBreakMinutes: number;
	sessionCount: number;
	projects: Record<string, number>; // project name -> minutes
}

interface UseStatsResult {
	sessions: SessionData[];
	loading: boolean;
	error: string | null;
	stats: StatsData;
	refresh: () => Promise<void>;
	loadByDateRange: (start: string, end: string) => Promise<void>;
	loadToday: () => Promise<void>;
	loadWeek: () => Promise<void>;
	loadMonth: () => Promise<void>;
	loadAll: () => Promise<void>;
}

/**
 * Format date to YYYY-MM-DD for backend queries
 */
function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Get start/end of week for date range
 */
function getWeekRange(date: Date): { start: string; end: string } {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
	d.setDate(diff);
	const start = new Date(d);
	d.setDate(d.getDate() + 6);
	const end = new Date(d);
	return { start: formatDate(start), end: formatDate(end) };
}

/**
 * Get start/end of month for date range
 */
function getMonthRange(date: Date): { start: string; end: string } {
	const start = new Date(date.getFullYear(), date.getMonth(), 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	return { start: formatDate(start), end: formatDate(end) };
}

/**
 * Calculate statistics from sessions
 */
function calculateStats(sessions: SessionData[]): StatsData {
	const stats: StatsData = {
		totalFocusMinutes: 0,
		totalBreakMinutes: 0,
		sessionCount: sessions.length,
		projects: {},
	};

	for (const session of sessions) {
		if (session.step_type === "focus") {
			stats.totalFocusMinutes += session.duration_min;
			if (session.project_name) {
				stats.projects[session.project_name] =
					(stats.projects[session.project_name] || 0) + session.duration_min;
			}
		} else if (session.step_type === "break") {
			stats.totalBreakMinutes += session.duration_min;
		}
	}

	return stats;
}

/**
 * Hook for statistics and session data from SQLite backend.
 *
 * @example
 * ```tsx
 * const { sessions, stats, loading, loadToday, loadWeek } = useStats();
 *
 * // Load today's sessions
 * await loadToday();
 *
 * // Load this week's sessions
 * await loadWeek();
 *
 * // Get total focus time
 * console.log(stats.totalFocusMinutes);
 * ```
 */
export function useStats(): UseStatsResult {
	const [sessions, setSessions] = useState<SessionData[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stats, setStats] = useState<StatsData>({
		totalFocusMinutes: 0,
		totalBreakMinutes: 0,
		sessionCount: 0,
		projects: {},
	});

	const loadSessions = useCallback(async (start: string, end?: string): Promise<void> => {
		setLoading(true);
		setError(null);
		try {
			const result = await invoke<SessionData[]>("cmd_sessions_get_by_date_range", {
				startDate: start,
				endDate: end,
			});
			setSessions(result);
			setStats(calculateStats(result));
			setLoading(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(`Failed to load sessions: ${message}`);
			console.error("[useStats] Failed to load sessions:", err);
			setLoading(false);
		}
	}, []);

	const loadToday = useCallback(async () => {
		const today = formatDate(new Date());
		await loadSessions(today);
	}, [loadSessions]);

	const loadWeek = useCallback(async () => {
		const { start, end } = getWeekRange(new Date());
		await loadSessions(start, end);
	}, [loadSessions]);

	const loadMonth = useCallback(async () => {
		const { start, end } = getMonthRange(new Date());
		await loadSessions(start, end);
	}, [loadSessions]);

	const loadAll = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await invoke<SessionData[]>("cmd_sessions_get_all", { limit: 10000 });
			setSessions(result);
			setStats(calculateStats(result));
			setLoading(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(`Failed to load all sessions: ${message}`);
			console.error("[useStats] Failed to load sessions:", err);
			setLoading(false);
		}
	}, []);

	const refresh = useCallback(async () => {
		// Reload current data - defaults to today if no range was specified
		await loadToday();
	}, [loadToday]);

	return {
		sessions,
		loading,
		error,
		stats,
		refresh,
		loadByDateRange: loadSessions,
		loadToday,
		loadWeek,
		loadMonth,
		loadAll,
	};
}
