/**
 * Cache Manager - Generic cache utilities with TTL support.
 *
 * Provides localStorage-based caching with:
 * - JSON serialization/deserialization
 * - Time-to-live (TTL) expiration
 * - Automatic stale detection
 * - Error handling for storage failures
 */

// Cache entry structure stored in localStorage
interface CacheEntry<T> {
	data: T;
	timestamp: number; // Unix timestamp in milliseconds
	ttl?: number; // Time to live in milliseconds
}

// Cache result with metadata
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
export function cacheGet<T>(key: string, ttl: number = DEFAULT_TTL.LONG): CacheResult<T> {
	try {
		const item = window.localStorage.getItem(key);
		if (!item) {
			return { data: null, isStale: false, lastUpdated: null };
		}

		const entry: CacheEntry<T> = JSON.parse(item);
		const now = Date.now();
		const age = now - entry.timestamp;
		const effectiveTtl = entry.ttl ?? ttl;
		const isStale = age > effectiveTtl;

		return {
			data: entry.data,
			isStale,
			lastUpdated: new Date(entry.timestamp),
		};
	} catch (error) {
		console.error(`Cache get error for key "${key}":`, error);
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
export function cacheSet<T>(key: string, data: T, ttl: number | null = DEFAULT_TTL.LONG): boolean {
	try {
		const entry: CacheEntry<T> = {
			data,
			timestamp: Date.now(),
			ttl: ttl ?? undefined,
		};
		window.localStorage.setItem(key, JSON.stringify(entry));
		return true;
	} catch (error) {
		console.error(`Cache set error for key "${key}":`, error);
		return false;
	}
}

/**
 * Delete cached data by key.
 *
 * @param key - Cache key to delete
 * @returns true if key existed and was removed
 */
export function cacheDelete(key: string): boolean {
	try {
		const existed = window.localStorage.getItem(key) !== null;
		window.localStorage.removeItem(key);
		return existed;
	} catch (error) {
		console.error(`Cache delete error for key "${key}":`, error);
		return false;
	}
}

/**
 * Clear all cache entries with a specific prefix.
 *
 * @param prefix - Key prefix to match
 * @returns Number of entries cleared
 */
export function cacheClearPrefix(prefix: string): number {
	try {
		let cleared = 0;
		const keysToRemove: string[] = [];

		// Find all keys with the prefix
		for (let i = 0; i < window.localStorage.length; i++) {
			const key = window.localStorage.key(i);
			if (key && key.startsWith(prefix)) {
				keysToRemove.push(key);
			}
		}

		// Remove them
		for (const key of keysToRemove) {
			window.localStorage.removeItem(key);
			cleared++;
		}

		return cleared;
	} catch (error) {
		console.error(`Cache clear prefix error for "${prefix}":`, error);
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
export function cacheIsValid<T>(key: string, ttl: number = DEFAULT_TTL.LONG): boolean {
	const result = cacheGet<T>(key, ttl);
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
	const cached = cacheGet<T>(key, ttl);

	if (cached.data !== null && !cached.isStale) {
		return cached.data;
	}

	// Fetch fresh data
	const fresh = await fetchFn();
	cacheSet(key, fresh, ttl);
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
