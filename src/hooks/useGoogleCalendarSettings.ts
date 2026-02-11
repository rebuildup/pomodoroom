/**
 * useGoogleCalendarSettings — Google Calendar selection management.
 *
 * Handles fetching user's calendars and managing which calendars
 * to sync events from.
 */

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleCalendarListEntry {
	id: string;
	summary?: string;
	description?: string;
	primary?: boolean;
	selected?: boolean;
	accessRole?: string;
	backgroundColor?: string;
	foregroundColor?: string;
}

export interface CalendarSelectionState {
	isLoading: boolean;
	error?: string;
	calendarIds: string[];
	isDefault: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useGoogleCalendarSettings() {
	const [state, setState] = useState<CalendarSelectionState>(() => ({
		isLoading: false,
		calendarIds: ["primary"],
		isDefault: true,
	}));

	const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);

	// ─── Fetch Calendars ────────────────────────────────────────────────────

	/**
	 * Fetch all user's calendars from Google Calendar API.
	 */
	const fetchCalendars = useCallback(async (): Promise<GoogleCalendarListEntry[]> => {
		setState(prev => ({ ...prev, isLoading: true, error: undefined }));

		try {
			const result = await invoke<GoogleCalendarListEntry[]>("cmd_google_calendar_list_calendars");
			setCalendars(result);
			setState(prev => ({ ...prev, isLoading: false, error: undefined }));
			return result;
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			setState(prev => ({ ...prev, isLoading: false, error: message }));
			return [];
		}
	}, []);

	// ─── Calendar Selection ───────────────────────────────────────────────────

	/**
	 * Get the currently selected calendar IDs.
	 */
	const getSelection = useCallback(async () => {
		try {
			const result = await invoke<{
				calendar_ids: string[];
				is_default: boolean;
			}>("cmd_google_calendar_get_selected_calendars");

			setState({
				isLoading: false,
				calendarIds: result.calendar_ids,
				isDefault: result.is_default,
			});

			return result;
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			setState(prev => ({ ...prev, error: message }));
			return null;
		}
	}, []);

	/**
	 * Set the selected calendar IDs.
	 */
	const setSelection = useCallback(async (calendarIds: string[]) => {
		if (calendarIds.length === 0) {
			setState(prev => ({ ...prev, error: "At least one calendar must be selected" }));
			return false;
		}

		setState(prev => ({ ...prev, isLoading: true, error: undefined }));

		try {
			await invoke("cmd_google_calendar_set_selected_calendars", {
				calendarIds,
			});

			setState({
				isLoading: false,
				calendarIds,
				isDefault: false,
			});

			return true;
		} catch (error: unknown) {
			let message = "Unknown error";
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			setState(prev => ({ ...prev, isLoading: false, error: message }));
			return false;
		}
	}, []);

	// ─── Effects ─────────────────────────────────────────────────────────────

	// Load selection on mount
	useEffect(() => {
		getSelection();
	}, [getSelection]);

	// ─── Return Hook API ─────────────────────────────────────────────────────

	return {
		state,
		calendars,
		fetchCalendars,
		getSelection,
		setSelection,
	};
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Get calendar display name.
 */
export function getCalendarDisplayName(calendar: GoogleCalendarListEntry): string {
	return calendar.summary || calendar.id || "Unnamed Calendar";
}

/**
 * Check if a calendar is the primary calendar.
 */
export function isPrimaryCalendar(calendar: GoogleCalendarListEntry): boolean {
	return calendar.primary === true || calendar.id === "primary";
}

/**
 * Get calendar color for display.
 */
export function getCalendarColor(calendar: GoogleCalendarListEntry): string {
	return calendar.backgroundColor || "#888888";
}

/**
 * Get text color for calendar (contrast).
 */
export function getCalendarTextColor(calendar: GoogleCalendarListEntry): string {
	return calendar.foregroundColor || "#000000";
}
