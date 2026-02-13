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
	summary?: string | undefined;
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

interface RawGoogleCalendarEvent {
	id?: string;
	title?: string;
	summary?: string;
	start_time?: string;
	end_time?: string;
	startTime?: string;
	endTime?: string;
	start?: { dateTime?: string; date?: string };
	end?: { dateTime?: string; date?: string };
	description?: string;
	status?: string;
	colorId?: string;
	created?: string;
	updated?: string;
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


	// ─── Connection Status Check ────────────────────────────────────────────────

	const checkConnectionStatus = useCallback(async () => {
		let tokensJson: string | null = null;
		try {
			tokensJson = await invoke<string>("cmd_load_oauth_tokens", {
				serviceName: "google_calendar",
			});
		} catch (error) {
			// No tokens stored - not connected
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
	 * Get OAuth authorization URL.
	 * Opens browser for user to authorize Google Calendar access.
	 */
	const getAuthUrl = useCallback(async (): Promise<AuthUrlResponse> => {
		try {
			const response = await invoke<AuthUrlResponse>("cmd_google_auth_get_auth_url");
			// Store state for CSRF validation during callback
			pendingOAuthState = response.state;
			return response;
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			throw new Error(`Failed to get auth URL: ${message}`);
		}
	}, []);

	/**
	 * Exchange OAuth authorization code for access tokens.
	 * Should be called after user completes OAuth flow in browser.
	 */
	const exchangeCode = useCallback(async (code: string, state: string): Promise<void> => {
		setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

		const validationError = (() => {
			if (!pendingOAuthState) {
				return new Error("No pending OAuth flow. Call getAuthUrl first.");
			}
			if (state !== pendingOAuthState) {
				return new Error("State mismatch - possible CSRF attack");
			}
			return null;
		})();

		if (validationError) {
			setState(prev => ({
				...prev,
				isConnecting: false,
				error: validationError.message,
			}));
			throw validationError;
		}

		let response: TokenExchangeResponse;
		try {
			response = await invoke<TokenExchangeResponse>("cmd_google_auth_exchange_code", {
				code,
				state,
				expectedState: pendingOAuthState,
			});
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			setState(prev => ({
				...prev,
				isConnecting: false,
				error: message,
			}));
			throw error;
		}

		if (response.authenticated) {
			pendingOAuthState = null;
			setState({
				isConnected: true,
				isConnecting: false,
				syncEnabled: true,
				lastSync: new Date().toISOString(),
			});
		}
	}, []);

	/**
	 * Full interactive OAuth flow handled by Rust backend.
	 * Opens system browser, waits for localhost callback, and stores tokens.
	 */
	const connectInteractive = useCallback(async (): Promise<void> => {
		setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

		try {
			const response = await invoke<TokenExchangeResponse>("cmd_google_auth_connect");
			if (!response.authenticated) {
				throw new Error("Google authentication did not complete");
			}

			pendingOAuthState = null;
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
	 * Uses selected calendars from settings.
	 */
	const fetchEvents = useCallback(async (startDate?: Date, endDate?: Date) => {
		if (!state.isConnected || !state.syncEnabled) {
			setEvents([]);
			return [];
		}

		const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
		const end = endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);   // 30 days ahead

		// Get selected calendar IDs
		let calendarIds: string[];
		try {
			const selection = await invoke<{
				calendar_ids: string[];
			}>("cmd_google_calendar_get_selected_calendars");
			// Ensure calendar_ids is an array
			if (Array.isArray(selection.calendar_ids)) {
				calendarIds = selection.calendar_ids;
			} else {
				// Fallback if response is malformed
				calendarIds = ["primary"];
			}
		} catch {
			// Fallback to primary if settings not available
			calendarIds = ["primary"];
		}

		// Fetch events from each selected calendar
		let allEvents: GoogleCalendarEvent[] = [];
		for (const calendarId of calendarIds) {
			try {
				const rawEvents = await invoke<RawGoogleCalendarEvent[]>("cmd_google_calendar_list_events", {
					calendarId,
					startTime: start.toISOString(),
					endTime: end.toISOString(),
				});
				const normalizedEvents = rawEvents
					.map(normalizeGoogleCalendarEvent)
					.filter((event): event is GoogleCalendarEvent => event !== null);
				allEvents = [...allEvents, ...normalizedEvents];
			} catch (error: unknown) {
				let message = "Unknown error";
				if (error instanceof Error) {
					message = error.message;
				} else {
					message = String(error);
				}
				console.error(`[useGoogleCalendar] Failed to fetch events from ${calendarId}:`, message);
			}
		}

		// Deduplicate events by ID
		const seen = new Set<string>();
		const uniqueEvents = allEvents.filter(e => {
			if (seen.has(e.id)) return false;
			seen.add(e.id);
			return true;
		});

		// Sort by start time
		uniqueEvents.sort((a, b) => {
			const aStart = a.start?.dateTime ?? a.start?.date ?? "";
			const bStart = b.start?.dateTime ?? b.start?.date ?? "";
			return aStart.localeCompare(bStart);
		});

		setEvents(uniqueEvents);

		setState(prev => ({
			...prev,
			lastSync: new Date().toISOString(),
			error: undefined,
		}));

		return uniqueEvents;
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
		const descriptionValue = description ?? null;

		let newEvent: GoogleCalendarEvent;
		try {
			newEvent = await invoke<GoogleCalendarEvent>("cmd_google_calendar_create_event", {
				calendarId: "primary",
				eventJson: {
					summary,
					description: descriptionValue,
					start_time: startTime.toISOString(),
					end_time: endTime.toISOString(),
				},
			});
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			console.error("[useGoogleCalendar] Failed to create event:", message);

			setState(prev => ({
				...prev,
				error: message,
			}));

			throw error;
		}

		setEvents(prev => [...prev, newEvent]);

		setState(prev => ({
			...prev,
			lastSync: new Date().toISOString(),
		}));

		return newEvent;
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
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			console.error("[useGoogleCalendar] Failed to delete event:", message);

			setState(prev => ({
				...prev,
				error: message,
			}));

			throw error;
		}

		setEvents(prev => prev.filter(e => e.id !== eventId));

		setState(prev => ({
			...prev,
			lastSync: new Date().toISOString(),
		}));

		return true;
	}, [state.isConnected]);

	// ─── Sync Control ───────────────────────────────────────────────────────────

	const toggleSync = useCallback((enabled: boolean) => {
		setState(prev => ({ ...prev, syncEnabled: enabled }));
	}, []);


	// ─── Effects ───────────────────────────────────────────────────────────────

	// Check connection status on mount
	useEffect(() => {
		checkConnectionStatus();
	}, [checkConnectionStatus]);

	// Load events on mount and when connected
	useEffect(() => {
		if (state.isConnected && state.syncEnabled) {
			fetchEvents();
		} else {
			setEvents([]);
		}
	}, [state.isConnected, state.syncEnabled, fetchEvents]);

	// ─── Return Hook API ─────────────────────────────────────────────────────────

	return {
		state,
		events,
		getAuthUrl,
		exchangeCode,
		connectInteractive,
		disconnect,
		fetchEvents,
		createEvent,
		deleteEvent,
		toggleSync,
	};
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

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

	return expiresAt > Date.now() / 1000 + TOKEN_EXPIRY_BUFFER / 1000;
}

function normalizeGoogleCalendarEvent(raw: RawGoogleCalendarEvent): GoogleCalendarEvent | null {
	const id = raw.id?.trim();
	if (!id) return null;

	const startValue = raw.start?.dateTime ?? raw.start?.date ?? raw.start_time ?? raw.startTime;
	const endValue = raw.end?.dateTime ?? raw.end?.date ?? raw.end_time ?? raw.endTime;
	if (!startValue || !endValue) return null;

	const isAllDayStart = /^\d{4}-\d{2}-\d{2}$/.test(startValue);
	const isAllDayEnd = /^\d{4}-\d{2}-\d{2}$/.test(endValue);

	return {
		id,
		summary: raw.summary ?? raw.title,
		description: raw.description,
		start: isAllDayStart ? { date: startValue } : { dateTime: startValue },
		end: isAllDayEnd ? { date: endValue } : { dateTime: endValue },
		status: raw.status,
		colorId: raw.colorId,
		created: raw.created,
		updated: raw.updated,
	};
}

// ─── Utility: Get events for a specific date ───────────────────────────────────

export function getEventsForDate(
	events: GoogleCalendarEvent[],
	date: Date,
): GoogleCalendarEvent[] {
	// Use local date comparison (YYYY-MM-DD in local timezone)
	const targetYear = date.getFullYear();
	const targetMonth = date.getMonth();
	const targetDate = date.getDate();

	return events.filter(event => {
		const eventStart = event.start.dateTime ?? event.start.date;
		if (!eventStart) return false;

		// Parse event start date in local timezone
		const eventDate = new Date(eventStart);
		
		// Compare year, month, and date in local timezone
		return (
			eventDate.getFullYear() === targetYear &&
			eventDate.getMonth() === targetMonth &&
			eventDate.getDate() === targetDate
		);
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
