/**
 * useGoogleCalendar — Google Calendar API integration hook.
 *
 * Handles OAuth flow, event fetching, and calendar sync state.
 * Uses real Tauri IPC commands for backend integration.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
	id: string;
	summary?: string;
	description?: string;
	start: {
		dateTime?: string; // ISO 8601
		date?: string;     // YYYY-MM-DD for all-day events
	};
	end: {
		dateTime?: string;
		date?: string;
	};
	created?: string;
	updated?: string;
	status?: string;
	colorId?: string;
}

export interface GoogleCalendarState {
	isConnected: boolean;
	isConnecting: boolean;
	syncEnabled: boolean;
	error?: string;
	lastSync?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

// ─── Tauri Command Result Types ─────────────────────────────────────────────────

interface AuthUrlResponse {
	auth_url: string;
	state: string;
	redirect_port: number;
}

interface TokenExchangeResponse {
	access_token: string;
	expires_in?: number;
	token_type: string;
	authenticated: boolean;
}

// ─── OAuth State Management ─────────────────────────────────────────────────────

let pendingOAuthState: string | null = null;

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useGoogleCalendar() {
	const [state, setState] = useState<GoogleCalendarState>(() => ({
		isConnected: false,
		isConnecting: false,
		syncEnabled: false,
	}));

	const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);

	// Check connection status on mount
	useEffect(() => {
		checkConnectionStatus();
	}, []);

	// Load events on mount and when connected
	useEffect(() => {
		if (state.isConnected && state.syncEnabled) {
			fetchEvents();
		} else {
			setEvents([]);
		}
	}, [state.isConnected, state.syncEnabled]);

	// ─── Connection Status Check ────────────────────────────────────────────────

	const checkConnectionStatus = useCallback(async () => {
		try {
			const tokensJson = await invoke<string>("cmd_load_oauth_tokens", {
				serviceName: "google_calendar",
			});

			if (tokensJson) {
				const tokens = JSON.parse(tokensJson);
				const isValid = isTokenValid(tokens);

				setState({
					isConnected: isValid,
					isConnecting: false,
					syncEnabled: isValid,
				});
			}
		} catch (error) {
			// No tokens stored - not connected
			setState({
				isConnected: false,
				isConnecting: false,
				syncEnabled: false,
			});
		}
	}, []);

	// ─── OAuth & Authentication ────────────────────────────────────────────────

	/**
	 * Get OAuth authorization URL.
	 * Opens browser for user to authorize Google Calendar access.
	 */
	const getAuthUrl = useCallback(async (): Promise<AuthUrlResponse> => {
		try {
			const response = await invoke<AuthUrlResponse>("cmd_google_auth_get_auth_url");
			// Store state for CSRF validation during callback
			pendingOAuthState = response.state;
			return response;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			throw new Error(`Failed to get auth URL: ${err.message}`);
		}
	}, []);

	/**
	 * Exchange OAuth authorization code for access tokens.
	 * Should be called after user completes OAuth flow in browser.
	 */
	const exchangeCode = useCallback(async (code: string, state: string): Promise<void> => {
		setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

		try {
			if (!pendingOAuthState) {
				throw new Error("No pending OAuth flow. Call getAuthUrl first.");
			}

			if (state !== pendingOAuthState) {
				throw new Error("State mismatch - possible CSRF attack");
			}

			const response = await invoke<TokenExchangeResponse>("cmd_google_auth_exchange_code", {
				code,
				state,
				expectedState: pendingOAuthState,
			});

			if (response.authenticated) {
				pendingOAuthState = null;
				setState({
					isConnected: true,
					isConnecting: false,
					syncEnabled: true,
					lastSync: new Date().toISOString(),
				});
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			setState(prev => ({
				...prev,
				isConnecting: false,
				error: err.message,
			}));
			throw err;
		}
	}, []);

	/**
	 * Disconnect from Google Calendar.
	 * Clears stored tokens and local state.
	 */
	const disconnect = useCallback(async () => {
		try {
			await invoke("cmd_clear_oauth_tokens", {
				serviceName: "google_calendar",
			});
		} catch (error) {
			console.error("Failed to clear tokens:", error);
		}

		pendingOAuthState = null;
		setEvents([]);
		setState({
			isConnected: false,
			isConnecting: false,
			syncEnabled: false,
		});
	}, []);

	// ─── Calendar Events ────────────────────────────────────────────────────────

	/**
	 * Fetch events from Google Calendar for a date range.
	 */
	const fetchEvents = useCallback(async (startDate?: Date, endDate?: Date) => {
		if (!state.isConnected || !state.syncEnabled) {
			setEvents([]);
			return [];
		}

		try {
			const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
			const end = endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);   // 30 days ahead

			const fetched = await invoke<GoogleCalendarEvent[]>("cmd_google_calendar_list_events", {
				calendarId: "primary",
				startTime: start.toISOString(),
				endTime: end.toISOString(),
			});

			setEvents(fetched);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
				error: undefined,
			}));

			return fetched;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useGoogleCalendar] Failed to fetch events:", err.message);

			setState(prev => ({
				...prev,
				error: err.message,
			}));

			return [];
		}
	}, [state.isConnected, state.syncEnabled]);

	/**
	 * Create a new event in Google Calendar.
	 */
	const createEvent = useCallback(async (
		summary: string,
		startTime: Date,
		durationMinutes: number,
		description?: string,
	) => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Calendar");
		}

		if (!summary.trim()) {
			throw new Error("Event summary cannot be empty");
		}

		const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

		try {
			const newEvent = await invoke<GoogleCalendarEvent>("cmd_google_calendar_create_event", {
				calendarId: "primary",
				summary,
				description: description ?? null,
				startTime: startTime.toISOString(),
				endTime: endTime.toISOString(),
			});

			setEvents(prev => [...prev, newEvent]);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
			}));

			return newEvent;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useGoogleCalendar] Failed to create event:", err.message);

			setState(prev => ({
				...prev,
				error: err.message,
			}));

			throw err;
		}
	}, [state.isConnected]);

	/**
	 * Delete an event from Google Calendar.
	 */
	const deleteEvent = useCallback(async (eventId: string) => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Calendar");
		}

		if (!eventId.trim()) {
			throw new Error("Event ID cannot be empty");
		}

		try {
			await invoke("cmd_google_calendar_delete_event", {
				calendarId: "primary",
				eventId,
			});

			setEvents(prev => prev.filter(e => e.id !== eventId));

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
			}));

			return true;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[useGoogleCalendar] Failed to delete event:", err.message);

			setState(prev => ({
				...prev,
				error: err.message,
			}));

			throw err;
		}
	}, [state.isConnected]);

	// ─── Sync Control ───────────────────────────────────────────────────────────

	const toggleSync = useCallback((enabled: boolean) => {
		setState(prev => ({ ...prev, syncEnabled: enabled }));
	}, []);

	// ─── Return Hook API ─────────────────────────────────────────────────────────

	return {
		state,
		events,
		getAuthUrl,
		exchangeCode,
		disconnect,
		fetchEvents,
		createEvent,
		deleteEvent,
		toggleSync,
	};
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function isTokenValid(tokens?: {
	access_token: string;
	refresh_token?: string;
	expires_at?: number;
}): boolean {
	if (!tokens) return false;

	const expiresAt = tokens.expires_at;
	if (!expiresAt) return false;

	return expiresAt > Date.now() / 1000 + TOKEN_EXPIRY_BUFFER / 1000;
}

// ─── Utility: Get events for a specific date ───────────────────────────────────

export function getEventsForDate(
	events: GoogleCalendarEvent[],
	date: Date,
): GoogleCalendarEvent[] {
	const dateStr = date.toISOString().slice(0, 10);

	return events.filter(event => {
		const eventStart = event.start.dateTime ?? event.start.date;
		if (!eventStart) return false;
		return eventStart.startsWith(dateStr);
	});
}

// ─── Utility: Check if event is from Pomodoroom ────────────────────────────────

export function isPomodoroomEvent(event: GoogleCalendarEvent): boolean {
	return event.summary?.startsWith("Pomodoroom:") ?? false;
}

// ─── Utility: Get event color for display ──────────────────────────────────────

export function getEventColor(event: GoogleCalendarEvent): string {
	if (isPomodoroomEvent(event)) {
		return "#3b82f6"; // Blue for Pomodoroom events
	}

	// Google Calendar color ID mapping (subset)
	const colorMap: Record<string, string> = {
		"1": "#7986cb", // Blue
		"2": "#33b679", // Teal
		"3": "#8e24aa", // Purple
		"4": "#e67c73", // Red
		"5": "#f4511e", // Orange
		"6": "#f6c026", // Yellow
		"7": "#3f51b5", // Dark Blue
		"8": "#039be5", // Light Blue
		"9": "#7986cb", // Blue (duplicate of 1)
		"10": "#888888", // Gray
		"11": "#888888", // Gray (duplicate)
	};

	return event.colorId ? colorMap[event.colorId] ?? "#888888" : "#888888";
}
