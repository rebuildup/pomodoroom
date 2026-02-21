/**
 * useGoogleCalendar — Google Calendar API integration hook.
 *
 * Handles OAuth flow, event fetching, and calendar sync state.
 * Uses real Tauri IPC commands for backend integration.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
	beginGoogleOAuth,
	completeGoogleOAuth,
	enqueueSyncOperation,
	flushSyncQueue,
	getMobileGoogleClientId,
	getSelectedCalendarIds,
	isMobileBackendlessMode,
	isOAuthCallbackUrl,
	isTokenValid as isMobileTokenValid,
	loadGoogleTokens,
	mobileCalendarCreateEvent,
	mobileCalendarDeleteEvent,
	mobileCalendarListEvents,
	setSelectedCalendarIds,
} from "@/lib/mobile/mobileGoogleDataLayer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
	id: string;
	calendarId?: string;
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
	const mobileMode = isMobileBackendlessMode();
	const mobileClientId = getMobileGoogleClientId();
	const [state, setState] = useState<GoogleCalendarState>(() => ({
		isConnected: false,
		isConnecting: false,
		syncEnabled: false,
	}));

	const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);


	// ─── Connection Status Check ────────────────────────────────────────────────

	const checkConnectionStatus = useCallback(async () => {
		if (mobileMode) {
			const tokens = loadGoogleTokens();
			const isValid = isMobileTokenValid(tokens);
			setState({
				isConnected: isValid,
				isConnecting: false,
				syncEnabled: isValid,
			});
			return;
		}
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
	}, [mobileMode]);

	// ─── OAuth & Authentication ────────────────────────────────────────────────

	/**
	 * Get OAuth authorization URL.
	 * Opens browser for user to authorize Google Calendar access.
	 */
	const getAuthUrl = useCallback(async (): Promise<AuthUrlResponse> => {
		if (mobileMode) {
			const redirectUri = window.location.origin + window.location.pathname;
			const scopes = [
				"https://www.googleapis.com/auth/calendar.events",
				"https://www.googleapis.com/auth/calendar.readonly",
				"https://www.googleapis.com/auth/tasks",
				"https://www.googleapis.com/auth/tasks.readonly",
			];
			const result = await beginGoogleOAuth({
				clientId: mobileClientId,
				redirectUri,
				scopes,
			});
			return {
				auth_url: result.authUrl,
				state: result.state,
				redirect_port: 0,
			};
		}
		let response: AuthUrlResponse;
		try {
			response = await invoke<AuthUrlResponse>("cmd_google_auth_get_auth_url");
			// Store state for CSRF validation during callback
			pendingOAuthState = response.state;
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			console.error(`Failed to get auth URL: ${message}`);
			return { auth_url: "", state: "", redirect_port: 0 };
		}
		return response;
	}, [mobileMode, mobileClientId]);

	/**
	 * Exchange OAuth authorization code for access tokens.
	 * Should be called after user completes OAuth flow in browser.
	 */
	const exchangeCode = useCallback(async (code: string, state: string): Promise<void> => {
		if (mobileMode) {
			setState(prev => ({ ...prev, isConnecting: true, error: undefined }));
			const redirectUri = window.location.origin + window.location.pathname;
			await completeGoogleOAuth({
				clientId: mobileClientId,
				code,
				state,
				redirectUri,
			});
			setState({
				isConnected: true,
				isConnecting: false,
				syncEnabled: true,
				lastSync: new Date().toISOString(),
			});
			return;
		}
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
			return;
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
	}, [mobileMode, mobileClientId]);

	/**
	 * Full interactive OAuth flow handled by Rust backend.
	 * Opens system browser, waits for localhost callback, and stores tokens.
	 */
	const connectInteractive = useCallback(async (): Promise<void> => {
		if (mobileMode) {
			const auth = await getAuthUrl();
			setState(prev => ({ ...prev, isConnecting: true, error: undefined }));
			window.location.assign(auth.auth_url);
			return;
		}
		setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

		let response: TokenExchangeResponse;
		try {
			response = await invoke<TokenExchangeResponse>("cmd_google_auth_connect");
			if (!response.authenticated) {
				setState(prev => ({
					...prev,
					isConnecting: false,
					error: "Google authentication did not complete",
				}));
				return;
			}
		} catch (error: unknown) {
			let message: string;
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
			return;
		}

		pendingOAuthState = null;
		setState({
			isConnected: true,
			isConnecting: false,
			syncEnabled: true,
			lastSync: new Date().toISOString(),
		});
	}, [mobileMode, getAuthUrl]);

	/**
	 * Disconnect from Google Calendar.
	 * Clears stored tokens and local state.
	 */
	const disconnect = useCallback(async () => {
		if (mobileMode) {
			// localStorage cleared - database-only architecture
			setSelectedCalendarIds(["primary"]);
			pendingOAuthState = null;
			setEvents([]);
			setState({
				isConnected: false,
				isConnecting: false,
				syncEnabled: false,
			});
			return;
		}
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
	}, [mobileMode]);

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
		if (mobileMode) {
			calendarIds = getSelectedCalendarIds();
		} else {
			let selection: { calendar_ids?: string[] };
			try {
				selection = await invoke<{
					calendar_ids: string[];
				}>("cmd_google_calendar_get_selected_calendars");
			} catch {
				// Fallback to primary if settings not available
				selection = { calendar_ids: undefined };
			}
			// Ensure calendar_ids is an array
			if (Array.isArray(selection.calendar_ids)) {
				calendarIds = selection.calendar_ids;
			} else {
				// Fallback if response is malformed
				calendarIds = ["primary"];
			}
		}

		// Fetch events from each selected calendar
		let allEvents: GoogleCalendarEvent[] = [];

		if (mobileMode) {
			for (const calendarId of calendarIds) {
				try {
					const mobileResult = await mobileCalendarListEvents(
						mobileClientId,
						calendarId,
						start.toISOString(),
						end.toISOString(),
					);
					const itemsValue = mobileResult.items;
					const rawEvents: RawGoogleCalendarEvent[] = (itemsValue !== null && itemsValue !== undefined ? itemsValue : []) as RawGoogleCalendarEvent[];
					const normalizedEvents = rawEvents
						.map((event) => normalizeGoogleCalendarEvent(event, calendarId))
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
		} else {
			for (const calendarId of calendarIds) {
				try {
					const rawEvents = await invoke<RawGoogleCalendarEvent[]>("cmd_google_calendar_list_events", {
						calendarId,
						startTime: start.toISOString(),
						endTime: end.toISOString(),
					});
					const normalizedEvents = rawEvents
						.map((event) => normalizeGoogleCalendarEvent(event, calendarId))
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
		if (mobileMode && navigator.onLine) {
			await flushSyncQueue(async (op) => {
				if (op.type === "calendar.create") {
					await mobileCalendarCreateEvent(mobileClientId, String(op.payload.calendarId), {
						summary: String(op.payload.summary),
						description: (op.payload.description as string | null | undefined) ?? null,
						start: { dateTime: String(op.payload.startTime) },
						end: { dateTime: String(op.payload.endTime) },
					});
				}
				if (op.type === "calendar.delete") {
					await mobileCalendarDeleteEvent(
						mobileClientId,
						String(op.payload.calendarId),
						String(op.payload.eventId),
					);
				}
			});
		}

		return uniqueEvents;
	}, [state.isConnected, state.syncEnabled, mobileMode, mobileClientId]);

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

		if (mobileMode) {
			let newEvent: GoogleCalendarEvent;
			try {
				if (!navigator.onLine) {
					enqueueSyncOperation({
						type: "calendar.create",
						payload: {
							calendarId: "primary",
							summary,
							description: descriptionValue,
							startTime: startTime.toISOString(),
							endTime: endTime.toISOString(),
						},
					});
					newEvent = {
						id: `local-${Date.now()}`,
						summary,
						description: descriptionValue !== null && descriptionValue !== undefined ? descriptionValue : undefined,
						start: { dateTime: startTime.toISOString() },
						end: { dateTime: endTime.toISOString() },
					};
				} else {
					const created = (await mobileCalendarCreateEvent(mobileClientId, "primary", {
						summary,
						description: descriptionValue,
						start: { dateTime: startTime.toISOString() },
						end: { dateTime: endTime.toISOString() },
					})) as RawGoogleCalendarEvent;
					const normalized = normalizeGoogleCalendarEvent(created);
					if (!normalized) {
						console.error("Failed to normalize created event");
						return;
					}
					newEvent = normalized;
				}
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

				return;
			}

			setEvents(prev => [...prev, newEvent]);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
			}));

			return newEvent;
		} else {
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

				return;
			}

			setEvents(prev => [...prev, newEvent]);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
			}));

			return newEvent;
		}
	}, [state.isConnected, mobileMode, mobileClientId]);

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

		if (mobileMode) {
			try {
				if (!navigator.onLine) {
					enqueueSyncOperation({
						type: "calendar.delete",
						payload: { calendarId: "primary", eventId },
					});
				} else if (!eventId.startsWith("local-")) {
					await mobileCalendarDeleteEvent(mobileClientId, "primary", eventId);
				}
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

				return;
			}

			setEvents(prev => prev.filter(e => e.id !== eventId));

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
			}));

			return true;
		} else {
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

				return;
			}

			setEvents(prev => prev.filter(e => e.id !== eventId));

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
			}));

			return true;
		}
	}, [state.isConnected, mobileMode, mobileClientId]);

	// ─── Sync Control ───────────────────────────────────────────────────────────

	const toggleSync = useCallback((enabled: boolean) => {
		setState(prev => ({ ...prev, syncEnabled: enabled }));
	}, []);


	// ─── Effects ───────────────────────────────────────────────────────────────

	// Check connection status on mount
	useEffect(() => {
		checkConnectionStatus();
	}, [checkConnectionStatus]);

	// Web/mobile OAuth callback handling (code/state in URL).
	useEffect(() => {
		if (!mobileMode) return;
		if (!isOAuthCallbackUrl(window.location.href)) return;
		const url = new URL(window.location.href);
		const code = url.searchParams.get("code");
		const cbState = url.searchParams.get("state");
		if (!code || !cbState) return;

		exchangeCode(code, cbState)
			.then(() => {
				url.searchParams.delete("code");
				url.searchParams.delete("state");
				url.searchParams.delete("scope");
				url.searchParams.delete("authuser");
				url.searchParams.delete("prompt");
				window.history.replaceState({}, "", url.toString());
			})
			.catch((error) => {
				console.error("[useGoogleCalendar] OAuth callback exchange failed:", error);
			});
	}, [mobileMode, exchangeCode]);

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

function normalizeGoogleCalendarEvent(raw: RawGoogleCalendarEvent, calendarId?: string): GoogleCalendarEvent | null {
	const id = raw.id?.trim();
	if (!id) return null;

	const startValue = raw.start?.dateTime ?? raw.start?.date ?? raw.start_time ?? raw.startTime;
	const endValue = raw.end?.dateTime ?? raw.end?.date ?? raw.end_time ?? raw.endTime;
	if (!startValue || !endValue) return null;

	const isAllDayStart = /^\d{4}-\d{2}-\d{2}$/.test(startValue);
	const isAllDayEnd = /^\d{4}-\d{2}-\d{2}$/.test(endValue);

	return {
		id,
		calendarId,
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
