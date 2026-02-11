/**
 * useOfflineCache - React hook for offline data caching.
 *
 * Features:
 * - LocalStorage-based caching with TTL support
 * - Online/offline detection via navigator.onLine
 * - Auto-refresh when coming back online
 * - Stale data indication for UI feedback
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
	cacheGet,
	cacheSet,
	cacheDelete,
	cacheGetOrSet,
	DEFAULT_TTL,
	CACHE_KEYS,
	type CacheResult,
} from "@/utils/cacheManager";

// Cache options
export interface OfflineCacheOptions<T> {
	key: string;
	ttl?: number; // Time to live in milliseconds (null = no expiration)
	fetchFn?: () => Promise<T>; // Function to fetch fresh data
	enabled?: boolean; // Enable/disable caching (default: true)
	onOnlineRefresh?: boolean; // Auto-refresh when back online (default: true)
}

// Cache result with actions
export interface OfflineCacheResult<T> {
	data: T | null;
	isStale: boolean;
	lastUpdated: Date | null;
	isOnline: boolean;
	isLoading: boolean;
	error: Error | null;
	save: (data: T) => void;
	clear: () => void;
	refresh: () => Promise<void>;
	invalidate: () => void;
}

/**
 * React hook for offline caching with TTL support.
 *
 * @param options - Cache configuration options
 * @returns Cache state and actions
 *
 * @example
 * ```tsx
 * const { data, isStale, refresh, isLoading } = useOfflineCache({
 *   key: CACHE_KEYS.TASK_LIST,
 *   ttl: DEFAULT_TTL.MEDIUM,
 *   fetchFn: async () => await invoke('cmd_get_tasks'),
 * });
 * ```
 */
export function useOfflineCache<T>(options: OfflineCacheOptions<T>): OfflineCacheResult<T> {
	const {
		key,
		ttl = DEFAULT_TTL.LONG,
		fetchFn,
		enabled = true,
		onOnlineRefresh = true,
	} = options;

	// State
	const [data, setData] = useState<T | null>(null);
	const [isStale, setIsStale] = useState(false);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [isOnline, setIsOnline] = useState(() => navigator.onLine);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Track if initial load has occurred
	const initialLoadRef = useRef(false);
	const refreshOnOnlineRef = useRef(false);

	// Load from cache
	const loadFromCache = useCallback(async () => {
		if (!enabled) return;

		const result = await cacheGet<T>(key, ttl);

		setData(result.data);
		setIsStale(result.isStale);
		setLastUpdated(result.lastUpdated);

		return result;
	}, [key, ttl, enabled]);

	// Fetch fresh data
	const fetchFresh = useCallback(async (): Promise<void> => {
		if (!fetchFn || !enabled) return;

		setIsLoading(true);
		setError(null);

		const cacheTtl = ttl ?? null;
		let fresh: T | undefined;
		let caughtError: unknown;

		try {
			fresh = await fetchFn();
		} catch (err) {
			caughtError = err;
		}

		if (caughtError !== undefined) {
			const finalError =
				caughtError instanceof Error ? caughtError : new Error(String(caughtError));
			setError(finalError);
			console.error(`Failed to fetch fresh data for "${key}":`, finalError);
			setIsLoading(false);
			return;
		}

		if (fresh !== undefined) {
			setData(fresh);
			setIsStale(false);
			setLastUpdated(new Date());
			cacheSet(key, fresh, cacheTtl);
		}
		setIsLoading(false);
	}, [fetchFn, key, ttl, enabled]);

	// Save data to cache
	const save = useCallback(
		(newData: T) => {
			if (!enabled) return;

			setData(newData);
			setIsStale(false);
			setLastUpdated(new Date());
			cacheSet(key, newData, ttl ?? null);
		},
		[key, ttl, enabled],
	);

	// Clear cache
	const clear = useCallback(() => {
		if (!enabled) return;

		setData(null);
		setIsStale(false);
		setLastUpdated(null);
		cacheDelete(key);
	}, [key, enabled]);

	// Invalidate cache (mark as stale but keep data)
	const invalidate = useCallback(() => {
		if (!enabled) return;
		setIsStale(true);
	}, [enabled]);

	// Manual refresh
	const refresh = useCallback(async () => {
		await fetchFresh();
	}, [fetchFresh]);

	// Initial load
	useEffect(() => {
		if (initialLoadRef.current || !enabled) return;

		initialLoadRef.current = true;
		(async () => {
			const cached = await loadFromCache();
			// Auto-fetch if we have a fetch function and no cached data or it's stale
			if (fetchFn && ((cached?.data === null) || cached?.isStale)) {
				fetchFresh();
			}
		})();
	}, [enabled, loadFromCache, fetchFn, fetchFresh]);

	// Handle online/offline events
	useEffect(() => {
		if (!enabled) return;

		const handleOnline = () => {
			setIsOnline(true);

			// Auto-refresh when coming back online if configured
			if (onOnlineRefresh && fetchFn && refreshOnOnlineRef.current) {
				fetchFresh();
				refreshOnOnlineRef.current = false;
			}
		};

		const handleOffline = () => {
			setIsOnline(false);
			refreshOnOnlineRef.current = true;
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [enabled, onOnlineRefresh, fetchFn, fetchFresh]);

	return {
		data,
		isStale,
		lastUpdated,
		isOnline,
		isLoading,
		error,
		save,
		clear,
		refresh,
		invalidate,
	};
}

/**
 * Higher-order cache hook that uses the get-or-set pattern.
 *
 * @param key - Cache key
 * @param fetchFn - Function to fetch fresh data
 * @param ttl - Optional TTL (defaults to LONG)
 * @returns Cache state and actions
 */
export function useCachedFetch<T>(
	key: string,
	fetchFn: () => Promise<T>,
	ttl: number = DEFAULT_TTL.LONG,
): OfflineCacheResult<T> {
	const [data, setData] = useState<T | null>(null);
	const [isStale, setIsStale] = useState(false);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [isOnline, setIsOnline] = useState(() => navigator.onLine);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchRef = useRef(fetchFn);

	// Keep fetchRef updated (must be in effect, not during render)
	useEffect(() => {
		fetchRef.current = fetchFn;
	}, [fetchFn]);

	// Load or fetch data
	const loadData = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		let result: T | undefined;
		let caughtError: unknown;

		try {
			result = await cacheGetOrSet(key, fetchRef.current, ttl);
		} catch (err) {
			caughtError = err;
		}

		if (caughtError !== undefined) {
			const finalError =
				caughtError instanceof Error ? caughtError : new Error(String(caughtError));
			setError(finalError);

			// Try to serve stale data if available
			const cached = await cacheGet<T>(key, ttl);
			if (cached.data !== null) {
				setData(cached.data);
				setIsStale(true);
				setLastUpdated(cached.lastUpdated);
			}
			setIsLoading(false);
			return;
		}

		if (result !== undefined) {
			setData(result);
			setIsStale(false);

			const cachedResult = await cacheGet<T>(key, ttl);
			setLastUpdated(cachedResult.lastUpdated);
		}
		setIsLoading(false);
	}, [key, ttl]);

	// Initial load
	useEffect(() => {
		loadData();
	}, [loadData]);

	// Handle online/offline
	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			loadData();
		};

		const handleOffline = () => setIsOnline(false);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [loadData]);

	// Actions
	const save = useCallback(
		(newData: T) => {
			setData(newData);
			setIsStale(false);
			setLastUpdated(new Date());
			cacheSet(key, newData, ttl);
		},
		[key, ttl],
	);

	const clear = useCallback(() => {
		setData(null);
		setIsStale(false);
		setLastUpdated(null);
		cacheDelete(key);
	}, [key]);

	const refresh = useCallback(async () => {
		await loadData();
	}, [loadData]);

	const invalidate = useCallback(() => {
		setIsStale(true);
	}, []);

	return {
		data,
		isStale,
		lastUpdated,
		isOnline,
		isLoading,
		error,
		save,
		clear,
		refresh,
		invalidate,
	};
}

// Export utilities and constants
export { DEFAULT_TTL, CACHE_KEYS };
export type { CacheResult };
