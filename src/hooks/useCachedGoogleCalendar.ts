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

import { useEffect, useCallback } from "react";
import {
	useOfflineCache,
	DEFAULT_TTL,
} from "./useOfflineCache";
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
			const events = await baseCalendar.fetchEvents();
			return {
				events,
				lastSyncAt: new Date().toISOString(),
			};
		},
		enabled: baseCalendar.state.isConnected && baseCalendar.state.syncEnabled,
		onOnlineRefresh: true,
	});

	// Combined state
	const combinedState: GoogleCalendarState & {
		isOnline: boolean;
		isCacheStale: boolean;
		cachedAt: Date | null;
	} = {
		...baseCalendar.state,
		isOnline,
		isCacheStale: isStale,
		cachedAt: lastUpdated,
	};

	// Events from cache or fetch
	const events = cachedData?.events ?? baseCalendar.events;

	// Enhanced fetch that updates cache
	const fetchEvents = useCallback(async (startDate?: Date, endDate?: Date) => {
		const fetched = await baseCalendar.fetchEvents(startDate, endDate);

		// Update cache
		save({
			events: fetched,
			lastSyncAt: new Date().toISOString(),
		});

		return fetched;
	}, [baseCalendar.fetchEvents, save]);

	// Enhanced create event that updates cache
	const createEvent = useCallback(async (
		summary: string,
		startTime: Date,
		durationMinutes: number,
	) => {
		const newEvent = await baseCalendar.createEvent(summary, startTime, durationMinutes);

		// Update cache with new event
		if (cachedData) {
			save({
				events: [...cachedData.events, newEvent],
				lastSyncAt: new Date().toISOString(),
			});
		}

		return newEvent;
	}, [baseCalendar.createEvent, cachedData, save]);

	// Enhanced delete event that updates cache
	const deleteEvent = useCallback(async (eventId: string) => {
		const success = await baseCalendar.deleteEvent(eventId);

		if (success && cachedData) {
			save({
				events: cachedData.events.filter(e => e.id !== eventId),
				lastSyncAt: new Date().toISOString(),
			});
		}

		return success;
	}, [baseCalendar.deleteEvent, cachedData, save]);

	// Clear cache on disconnect
	useEffect(() => {
		if (!baseCalendar.state.isConnected) {
			clear();
		}
	}, [baseCalendar.state.isConnected, clear]);

	// Manual cache refresh
	const refreshCache = useCallback(async () => {
		await refresh();
	}, [refresh]);

	// Clear cached data
	const clearCache = useCallback(() => {
		clear();
	}, [clear]);

	return {
		state: combinedState,
		events,
		isLoading: isCacheLoading || baseCalendar.state.isConnecting,
		isStale,
		isOnline,
		cachedAt: lastUpdated,
		connect: baseCalendar.connect,
		disconnect: baseCalendar.disconnect,
		refreshTokens: baseCalendar.refreshTokens,
		fetchEvents,
		createEvent,
		deleteEvent,
		toggleSync: baseCalendar.toggleSync,
		refresh: refreshCache,
		clearCache,
	};
}

// ── Re-export utilities from base hook ───────────────────────────────────────────────

export {
	getEventsForDate,
	isPomodoroomEvent,
	getEventColor,
	type GoogleCalendarEvent,
} from "./useGoogleCalendar";
