/**
 * useCachedGoogleCalendar — Google Calendar with offline cache support.
 *
 * Extends useGoogleCalendar with automatic caching of calendar events.
 * Events are cached locally and remain available when offline.
 *
 * Usage:
 * ```tsx
 * const { events, isStale, refresh, isOnline } = useCachedGoogleCalendar();
 * ```
 */

import { useEffect, useCallback, useMemo } from "react";
import { useOfflineCache, DEFAULT_TTL } from "./useOfflineCache";
import {
	useGoogleCalendar,
	type GoogleCalendarEvent,
	type GoogleCalendarState,
} from "./useGoogleCalendar";

const CALENDAR_CACHE_KEY = "cache:google:calendar:events";
const CALENDAR_CACHE_TTL = DEFAULT_TTL.MEDIUM; // 15 minutes

// Cache entry for calendar events
interface CachedCalendarEvents {
	events: GoogleCalendarEvent[];
	lastSyncAt: string;
}

/**
 * Google Calendar hook with offline caching.
 *
 * Features:
 * - Events cached locally for offline access
 * - Auto-refresh when coming back online
 * - Stale data indication
 * - Manual refresh capability
 */
export function useCachedGoogleCalendar() {
	const baseCalendar = useGoogleCalendar();
	const {
		fetchEvents: baseFetchEvents,
		createEvent: baseCreateEvent,
		deleteEvent: baseDeleteEvent,
		state: baseState,
		getAuthUrl,
		connectInteractive,
		exchangeCode,
		disconnect,
		toggleSync,
	} = baseCalendar;

	// Cache for calendar events
	const {
		data: cachedData,
		isStale,
		lastUpdated,
		isOnline,
		isLoading: isCacheLoading,
		save,
		clear,
		refresh,
	} = useOfflineCache<CachedCalendarEvents>({
		key: CALENDAR_CACHE_KEY,
		ttl: CALENDAR_CACHE_TTL,
		fetchFn: async () => {
			// Fetch from base calendar hook
			const events = await baseFetchEvents();
			return {
				events,
				lastSyncAt: new Date().toISOString(),
			};
		},
		enabled: baseState.isConnected && baseState.syncEnabled,
		onOnlineRefresh: true,
	});

	// Events from cache or fetch
	const events = cachedData?.events ?? baseCalendar.events;

	// Combined state (memoized)
	const combinedState = useMemo<
		GoogleCalendarState & {
			isCacheStale: boolean;
			cachedAt: Date | null;
		}
	>(
		() => ({
			...baseState,
			isOnline,
			isCacheStale: isStale,
			cachedAt: lastUpdated,
		}),
		[baseState, isOnline, isStale, lastUpdated],
	);

	// Enhanced fetch that updates cache
	const fetchEvents = useCallback(
		async (startDate?: Date, endDate?: Date) => {
			const fetched = await baseFetchEvents(startDate, endDate);

			// Update cache
			save({
				events: fetched,
				lastSyncAt: new Date().toISOString(),
			});

			return fetched;
		},
		[baseFetchEvents, save],
	);

	// Enhanced create event that updates cache
	const createEvent = useCallback(
		async (summary: string, startTime: Date, durationMinutes: number) => {
			const newEvent = await baseCreateEvent(summary, startTime, durationMinutes);

			// Update cache with new event
			if (cachedData && newEvent) {
				save({
					events: [...cachedData.events, newEvent],
					lastSyncAt: new Date().toISOString(),
				});
			}

			return newEvent;
		},
		[baseCreateEvent, cachedData, save],
	);

	// Enhanced delete event that updates cache
	const deleteEvent = useCallback(
		async (eventId: string) => {
			const success = await baseDeleteEvent(eventId);

			if (success && cachedData) {
				save({
					events: cachedData.events.filter((e) => e.id !== eventId),
					lastSyncAt: new Date().toISOString(),
				});
			}

			return success;
		},
		[baseDeleteEvent, cachedData, save],
	);

	// Clear cache on disconnect
	useEffect(() => {
		if (!baseState.isConnected) {
			clear();
		}
	}, [baseState.isConnected, clear]);

	// Manual cache refresh
	const refreshCache = useCallback(async () => {
		await refresh();
	}, [refresh]);

	// Clear cached data
	const clearCache = useCallback(() => {
		clear();
	}, [clear]);

	// Memoized return value to ensure stable object reference
	const memoizedValue = useMemo(
		() => ({
			state: combinedState,
			events,
			isLoading: isCacheLoading || baseState.isConnecting,
			isStale,
			isOnline,
			cachedAt: lastUpdated,
			getAuthUrl,
			exchangeCode,
			connectInteractive,
			connect: connectInteractive,
			disconnect,
			fetchEvents,
			createEvent,
			deleteEvent,
			toggleSync,
			refresh: refreshCache,
			clearCache,
		}),
		[
			combinedState,
			events,
			isCacheLoading,
			baseState.isConnecting,
			isStale,
			isOnline,
			lastUpdated,
			getAuthUrl,
			exchangeCode,
			connectInteractive,
			disconnect,
			fetchEvents,
			createEvent,
			deleteEvent,
			toggleSync,
			refreshCache,
			clearCache,
		],
	);

	return memoizedValue;
}

// ─── Re-export utilities from base hook ───────────────────────────────────────

export {
	getEventsForDate,
	isPomodoroomEvent,
	getEventColor,
	type GoogleCalendarEvent,
} from "./useGoogleCalendar";
