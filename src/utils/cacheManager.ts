/**
 * Cache Manager - Generic cache utilities with TTL support.
 *
 * Now backed by SQLite via Tauri commands instead of localStorage.
 * Provides:
 * - JSON serialization/deserialization
 * - Time-to-live (TTL) expiration
 * - Automatic stale detection
 * - Rust backend for reliability
 */

import { invoke } from "@tauri-apps/api/core";

// Cache result with metadata (matches Rust CacheResult)
export interface CacheResult<T> {
	data: T | null;
	isStale: boolean;
	lastUpdated: Date | null;
}

// Default TTL values (in milliseconds)
export const DEFAULT_TTL = {
	SHORT: 5 * 60 * 1000, // 5 minutes
	MEDIUM: 15 * 60 * 1000, // 15 minutes
	LONG: 60 * 60 * 1000, // 1 hour
	VERY_LONG: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/**
 * Get cached data by key.
 *
 * @param key - Cache key
 * @param ttl - Optional TTL to check staleness (defaults to LONG)
 * @returns Cache result with data and metadata
 */
export async function cacheGet<T>(key: string, ttl: number = DEFAULT_TTL.LONG): Promise<CacheResult<T>> {
	try {
		const result = await invoke<{
			data: T | null;
			is_stale: boolean;
			last_updated: number | null;
		}>("cmd_cache_get", { key, ttl });

		return {
			data: result.data,
			isStale: result.is_stale,
			lastUpdated: result.last_updated ? new Date(result.last_updated) : null,
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error(`[cacheManager] Cache get error for key "${key}":`, err.message);
		return { data: null, isStale: false, lastUpdated: null };
	}
}

/**
 * Set cached data by key.
 *
 * @param key - Cache key
 * @param data - Data to cache
 * @param ttl - Optional TTL (defaults to LONG, null means no expiration)
 * @returns true if successful, false otherwise
 */
export async function cacheSet<T>(key: string, data: T, ttl: number | null = DEFAULT_TTL.LONG): Promise<boolean> {
	try {
		await invoke("cmd_cache_set", { key, data, ttl });
		return true;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error(`[cacheManager] Cache set error for key "${key}":`, err.message);
		return false;
	}
}

/**
 * Delete cached data by key.
 *
 * @param key - Cache key to delete
 * @returns true if key existed and was removed
 */
export async function cacheDelete(key: string): Promise<boolean> {
	try {
		return await invoke<boolean>("cmd_cache_delete", { key });
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error(`[cacheManager] Cache delete error for key "${key}":`, err.message);
		return false;
	}
}

/**
 * Clear all cache entries with a specific prefix.
 *
 * @param prefix - Key prefix to match
 * @returns Number of entries cleared
 */
export async function cacheClearPrefix(prefix: string): Promise<number> {
	try {
		return await invoke<number>("cmd_cache_clear_prefix", { prefix });
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error(`[cacheManager] Cache clear prefix error for "${prefix}":`, err.message);
		return 0;
	}
}

/**
 * Check if cached data exists and is not stale.
 *
 * @param key - Cache key
 * @param ttl - Optional TTL (defaults to LONG)
 * @returns true if data exists and is fresh
 */
export async function cacheIsValid<T>(key: string, ttl: number = DEFAULT_TTL.LONG): Promise<boolean> {
	const result = await cacheGet<T>(key, ttl);
	return result.data !== null && !result.isStale;
}

/**
 * Get or set pattern - fetch from cache, or compute and cache if missing/stale.
 *
 * @param key - Cache key
 * @param fetchFn - Function to fetch fresh data
 * @param ttl - Optional TTL (defaults to LONG)
 * @returns Fresh or cached data
 */
export async function cacheGetOrSet<T>(
	key: string,
	fetchFn: () => Promise<T>,
	ttl: number = DEFAULT_TTL.LONG,
): Promise<T> {
	const cached = await cacheGet<T>(key, ttl);

	if (cached.data !== null && !cached.isStale) {
		return cached.data;
	}

	// Fetch fresh data
	const fresh = await fetchFn();
	await cacheSet(key, fresh, ttl);
	return fresh;
}

// Cache key prefixes for different data types
export const CACHE_KEYS = {
	TASK_LIST: "cache:tasks",
	PROJECT_LIST: "cache:projects",
	SCHEDULE: "cache:schedule",
	INTEGRATIONS: "cache:integrations",
	STATS: "cache:stats",
	CALENDAR_EVENTS: "cache:calendar:events",
} as const;
