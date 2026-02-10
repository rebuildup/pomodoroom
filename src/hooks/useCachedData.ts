/**
 * useCachedData - Pre-configured cache hooks for common Pomodoroom data.
 *
 * Provides ready-to-use hooks for caching:
 * - Task list
 * - Project list
 * - Schedule blocks
 * - Calendar events
 * - Integration configs
 * - Statistics
 *
 * Usage:
 * ```tsx
 * const { data: tasks, isStale, refresh } = useCachedTasks();
 * ```
 */

import { useOfflineCache, useCachedFetch, DEFAULT_TTL, CACHE_KEYS } from "./useOfflineCache";
import type { Task, Project, ScheduleBlock, DailyTemplate } from "@/types/schedule";
import type { TimelineItem } from "@/types";

// ── Task List Cache ────────────────────────────────────────────────────────────────

/**
 * Cached task list hook.
 *
 * @param fetchFn - Function to fetch tasks from backend
 * @param ttl - Cache TTL (default: MEDIUM - 15 minutes)
 */
export function useCachedTasks(
	fetchFn?: () => Promise<Task[]>,
	ttl: number = DEFAULT_TTL.MEDIUM,
) {
	return useOfflineCache<Task[]>({
		key: CACHE_KEYS.TASK_LIST,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Project List Cache ─────────────────────────────────────────────────────────────

/**
 * Cached project list hook.
 *
 * @param fetchFn - Function to fetch projects from backend
 * @param ttl - Cache TTL (default: LONG - 1 hour)
 */
export function useCachedProjects(
	fetchFn?: () => Promise<Project[]>,
	ttl: number = DEFAULT_TTL.LONG,
) {
	return useOfflineCache<Project[]>({
		key: CACHE_KEYS.PROJECT_LIST,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Schedule Cache ──────────────────────────────────────────────────────────────────

/**
 * Cached schedule blocks hook.
 *
 * @param fetchFn - Function to fetch schedule blocks from backend
 * @param ttl - Cache TTL (default: SHORT - 5 minutes, schedules change frequently)
 */
export function useCachedSchedule(
	fetchFn?: () => Promise<ScheduleBlock[]>,
	ttl: number = DEFAULT_TTL.SHORT,
) {
	return useOfflineCache<ScheduleBlock[]>({
		key: CACHE_KEYS.SCHEDULE,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Daily Template Cache ────────────────────────────────────────────────────────────

const TEMPLATE_CACHE_KEY = "cache:daily:template";

/**
 * Cached daily template hook.
 *
 * @param fetchFn - Function to fetch daily template from backend
 * @param ttl - Cache TTL (default: VERY_LONG - 24 hours, templates change rarely)
 */
export function useCachedDailyTemplate(
	fetchFn?: () => Promise<DailyTemplate>,
	ttl: number = DEFAULT_TTL.VERY_LONG,
) {
	return useOfflineCache<DailyTemplate>({
		key: TEMPLATE_CACHE_KEY,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Calendar Events Cache ───────────────────────────────────────────────────────────

/**
 * Cached calendar events hook.
 *
 * @param fetchFn - Function to fetch calendar events from backend
 * @param ttl - Cache TTL (default: MEDIUM - 15 minutes)
 */
export function useCachedCalendarEvents<T = TimelineItem>(
	fetchFn?: () => Promise<T[]>,
	ttl: number = DEFAULT_TTL.MEDIUM,
) {
	return useOfflineCache<T[]>({
		key: CACHE_KEYS.CALENDAR_EVENTS,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Statistics Cache ─────────────────────────────────────────────────────────────────

/**
 * Cached statistics hook.
 *
 * @param fetchFn - Function to fetch stats from backend
 * @param ttl - Cache TTL (default: SHORT - 5 minutes, for semi-real-time updates)
 */
export function useCachedStats<T = Record<string, unknown>>(
	fetchFn?: () => Promise<T>,
	ttl: number = DEFAULT_TTL.SHORT,
) {
	return useOfflineCache<T>({
		key: CACHE_KEYS.STATS,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Integration Config Cache ────────────────────────────────────────────────────────

/**
 * Cached integration configs hook.
 *
 * @param fetchFn - Function to fetch integration configs from backend
 * @param ttl - Cache TTL (default: VERY_LONG - 24 hours, configs change rarely)
 */
export function useCachedIntegrations<T = Record<string, unknown>>(
	fetchFn?: () => Promise<T>,
	ttl: number = DEFAULT_TTL.VERY_LONG,
) {
	return useOfflineCache<T>({
		key: CACHE_KEYS.INTEGRATIONS,
		ttl,
		fetchFn,
		enabled: true,
		onOnlineRefresh: true,
	});
}

// ── Generic Cached Fetch Hook ────────────────────────────────────────────────────────

/**
 * Generic cached data fetch hook with get-or-set pattern.
 *
 * @param key - Cache key
 * @param fetchFn - Function to fetch data
 * @param ttl - Cache TTL (default: LONG)
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useCachedFetch(
 *   'cache:custom:data',
 *   async () => await invoke('cmd_get_custom_data'),
 *   DEFAULT_TTL.MEDIUM
 * );
 * ```
 */
export function useCachedFetchData<T>(
	key: string,
	fetchFn: () => Promise<T>,
	ttl: number = DEFAULT_TTL.LONG,
) {
	return useCachedFetch<T>(key, fetchFn, ttl);
}

// ── Cache Invalidation Utilities ─────────────────────────────────────────────────────

import { cacheDelete, cacheClearPrefix } from "@/utils/cacheManager";

/**
 * Invalidate all task-related caches.
 */
export function invalidateTaskCache(): void {
	cacheDelete(CACHE_KEYS.TASK_LIST);
}

/**
 * Invalidate all project-related caches.
 */
export function invalidateProjectCache(): void {
	cacheDelete(CACHE_KEYS.PROJECT_LIST);
}

/**
 * Invalidate all schedule-related caches.
 */
export function invalidateScheduleCache(): void {
	cacheDelete(CACHE_KEYS.SCHEDULE);
}

/**
 * Invalidate all calendar event caches.
 */
export function invalidateCalendarCache(): void {
	cacheDelete(CACHE_KEYS.CALENDAR_EVENTS);
}

/**
 * Invalidate all stats caches.
 */
export function invalidateStatsCache(): void {
	cacheDelete(CACHE_KEYS.STATS);
}

/**
 * Invalidate ALL caches (use with caution).
 *
 * @returns Number of cache entries cleared
 */
export function invalidateAllCaches(): number {
	return cacheClearPrefix("cache:");
}

/**
 * Invalidate caches for a specific prefix.
 *
 * @param prefix - Cache key prefix to clear
 * @returns Number of cache entries cleared
 */
export function invalidateCachePrefix(prefix: string): number {
	return cacheClearPrefix(`cache:${prefix}`);
}
