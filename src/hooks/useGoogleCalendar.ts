/**
 * useGoogleCalendar — Google Calendar API integration hook.
 *
 * Handles OAuth flow, event fetching, and calendar sync state.
 * Uses localStorage for stub implementation until backend is ready.
 */

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
	id: string;
	summary: string;
	description?: string;
	start: {
		dateTime?: string; // ISO 8601
		date?: string;     // YYYY-MM-DD for all-day events
	};
	end: {
		dateTime?: string;
		date?: string;
	};
	created: string;
	updated: string;
	status: string;
	colorId?: string;
}

export interface GoogleCalendarState {
	isConnected: boolean;
	isConnecting: boolean;
	syncEnabled: boolean;
	error?: string;
	lastSync?: string;
}

export interface GoogleCalendarConfig {
	clientId?: string;
	clientSecret?: string;
	oauthTokens?: {
		accessToken: string;
		refreshToken: string;
		expiresAt: number;
	};
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "pomodoroom-google-calendar";
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes before expiry

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useGoogleCalendar() {
	const [state, setState] = useState<GoogleCalendarState>(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const config: GoogleCalendarConfig = JSON.parse(stored);
			const isConnected = isTokenValid(config.oauthTokens);
			return {
				isConnected,
				isConnecting: false,
				syncEnabled: isConnected,
			};
		}
		return {
			isConnected: false,
			isConnecting: false,
			syncEnabled: false,
		};
	});

	const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);

	// Load events on mount and when connected
	useEffect(() => {
		if (state.isConnected && state.syncEnabled) {
			fetchEvents();
		} else {
			setEvents([]);
		}
	}, [state.isConnected, state.syncEnabled]);

	// ─── OAuth & Authentication ────────────────────────────────────────────────

	const connect = useCallback(async (clientId: string, clientSecret: string) => {
		setState(prev => ({ ...prev, isConnecting: true, error: undefined }));

		try {
			// TODO: Implement real OAuth flow with backend
			// For now, simulate OAuth with a stub implementation
			await simulateOAuthFlow(clientId, clientSecret);

			const config: GoogleCalendarConfig = {
				clientId,
				clientSecret,
				oauthTokens: {
					accessToken: generateMockToken(),
					refreshToken: generateMockToken(),
					expiresAt: Date.now() + 3600 * 1000, // 1 hour
				},
			};

			localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

			setState({
				isConnected: true,
				isConnecting: false,
				syncEnabled: true,
				lastSync: new Date().toISOString(),
			});
		} catch (error) {
			setState(prev => ({
				...prev,
				isConnecting: false,
				error: error instanceof Error ? error.message : "Connection failed",
			}));
		}
	}, []);

	const disconnect = useCallback(() => {
		localStorage.removeItem(STORAGE_KEY);
		setEvents([]);
		setState({
			isConnected: false,
			isConnecting: false,
			syncEnabled: false,
		});
	}, []);

	const refreshTokens = useCallback(async () => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return false;

		const config: GoogleCalendarConfig = JSON.parse(stored);
		if (!config.oauthTokens) return false;

		// TODO: Implement real token refresh with backend
		config.oauthTokens.accessToken = generateMockToken();
		config.oauthTokens.expiresAt = Date.now() + 3600 * 1000;

		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

		setState(prev => ({
			...prev,
			isConnected: true,
		}));

		return true;
	}, []);

	// ─── Calendar Events ────────────────────────────────────────────────────────

	const fetchEvents = useCallback(async (startDate?: Date, endDate?: Date) => {
		if (!state.isConnected || !state.syncEnabled) {
			setEvents([]);
			return [];
		}

		try {
			// TODO: Implement real API call to Google Calendar
			const fetched = await mockFetchEvents(startDate, endDate);
			setEvents(fetched);

			setState(prev => ({
				...prev,
				lastSync: new Date().toISOString(),
				error: undefined,
			}));

			return fetched;
		} catch (error) {
			setState(prev => ({
				...prev,
				error: error instanceof Error ? error.message : "Failed to fetch events",
			}));
			return [];
		}
	}, [state.isConnected, state.syncEnabled]);

	const createEvent = useCallback(async (
		summary: string,
		startTime: Date,
		durationMinutes: number,
	) => {
		if (!state.isConnected) {
			throw new Error("Not connected to Google Calendar");
		}

		const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

		// TODO: Implement real API call
		const newEvent: GoogleCalendarEvent = {
			id: `mock-${Date.now()}`,
			summary,
			start: {
				dateTime: startTime.toISOString(),
			},
			end: {
				dateTime: endTime.toISOString(),
			},
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			status: "confirmed",
		};

		setEvents(prev => [...prev, newEvent]);
		return newEvent;
	}, [state.isConnected]);

	const deleteEvent = useCallback(async (eventId: string) => {
		if (!state.isConnected) return false;

		// TODO: Implement real API call
		setEvents(prev => prev.filter(e => e.id !== eventId));
		return true;
	}, [state.isConnected]);

	// ─── Sync Control ───────────────────────────────────────────────────────────

	const toggleSync = useCallback((enabled: boolean) => {
		setState(prev => ({ ...prev, syncEnabled: enabled }));
	}, []);

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	return {
		state,
		events,
		connect,
		disconnect,
		refreshTokens,
		fetchEvents,
		createEvent,
		deleteEvent,
		toggleSync,
	};
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function isTokenValid(tokens?: {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}): boolean {
	if (!tokens) return false;
	return tokens.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER;
}

function generateMockToken(): string {
	return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

async function simulateOAuthFlow(clientId: string, _clientSecret: string): Promise<void> {
	// Simulate OAuth redirect flow delay
	await new Promise(resolve => setTimeout(resolve, 1000));

	if (!clientId || clientId.length < 10) {
		throw new Error("Invalid client ID");
	}
}

async function mockFetchEvents(
	startDate?: Date,
	endDate?: Date,
): Promise<GoogleCalendarEvent[]> {
	// Simulate API delay
	await new Promise(resolve => setTimeout(resolve, 500));

	const now = new Date();
	const start = startDate ?? new Date(now.getFullYear(), now.getMonth(), 1);
	const end = endDate ?? new Date(now.getFullYear(), now.getMonth() + 2, 0);

	// Generate mock events
	const events: GoogleCalendarEvent[] = [];

	// Add some recurring "real" events
	const sampleEvents = [
		{ summary: "Weekly Standup", days: [1, 3, 5], hour: 10, duration: 30 },
		{ summary: "Team Lunch", days: [4], hour: 12, duration: 60 },
		{ summary: "Sprint Planning", days: [0], hour: 14, duration: 90 },
		{ summary: "1:1 with Manager", days: [2], hour: 15, duration: 30 },
	];

	let eventCounter = 0;
	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		const dayOfWeek = d.getDay();

		for (const template of sampleEvents) {
			if (template.days.includes(dayOfWeek)) {
				const startDate = new Date(d);
				startDate.setHours(template.hour, 0, 0, 0);

				const endDate = new Date(startDate);
				endDate.setMinutes(startDate.getMinutes() + template.duration);

				events.push({
					id: `mock-event-${eventCounter++}`,
					summary: template.summary,
					start: { dateTime: startDate.toISOString() },
					end: { dateTime: endDate.toISOString() },
					created: new Date().toISOString(),
					updated: new Date().toISOString(),
					status: "confirmed",
				});
			}
		}
	}

	return events;
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
