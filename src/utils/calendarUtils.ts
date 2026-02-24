/**
 * Calendar utilities for Google Calendar integration.
 *
 * Converts Google Calendar events to ScheduleBlock format for timeline display.
 * Provides helper functions for calendar event filtering and display.
 */

import type { GoogleCalendarEvent } from "@/hooks/useGoogleCalendar";
import type { ScheduleBlock } from "@/types/schedule";

/**
 * Convert a Google Calendar event to a ScheduleBlock.
 *
 * Calendar events are displayed as read-only blocks with type "calendar".
 *
 * @param event - Google Calendar event to convert
 * @param lane - Parallel lane index (default 1 to separate from focus tasks)
 * @returns ScheduleBlock representing the calendar event
 */
export function calendarEventToBlock(
	event: GoogleCalendarEvent,
	lane: number = 1,
): ScheduleBlock | null {
	// Extract start and end times
	const startDateTime = event.start.dateTime ?? event.start.date;
	const endDateTime = event.end.dateTime ?? event.end.date;

	if (!startDateTime || !endDateTime) {
		return null;
	}

	return {
		id: `calendar-${event.id}`,
		blockType: "calendar",
		startTime: startDateTime,
		endTime: endDateTime,
		locked: true, // Calendar events are always locked
		label: event.summary,
		lane,
	};
}

/**
 * Convert multiple Google Calendar events to ScheduleBlocks.
 *
 * @param events - Google Calendar events to convert
 * @param baseLane - Starting lane index (default 1)
 * @returns Array of ScheduleBlocks
 */
export function calendarEventsToBlocks(
	events: GoogleCalendarEvent[],
	baseLane: number = 1,
): ScheduleBlock[] {
	return events
		.map((event, index) => calendarEventToBlock(event, baseLane + (index % 2)))
		.filter((block): block is ScheduleBlock => block !== null);
}

/**
 * Filter calendar events for a specific date.
 *
 * @param events - All calendar events
 * @param date - Target date
 * @returns Events occurring on the target date
 */
export function filterEventsForDate(
	events: GoogleCalendarEvent[],
	date: Date,
): GoogleCalendarEvent[] {
	const targetDateStr = date.toISOString().slice(0, 10);

	return events.filter((event) => {
		const eventStart = event.start.dateTime ?? event.start.date;
		if (!eventStart) return false;
		return eventStart.startsWith(targetDateStr);
	});
}

/**
 * Check if a calendar event is currently active.
 *
 * @param event - Calendar event to check
 * @param now - Current time (default: new Date())
 * @returns True if the event is currently active
 */
export function isCalendarEventActive(event: GoogleCalendarEvent, now: Date = new Date()): boolean {
	const startDateTime = event.start.dateTime ?? event.start.date;
	const endDateTime = event.end.dateTime ?? event.end.date;

	if (!startDateTime || !endDateTime) {
		return false;
	}

	const start = new Date(startDateTime);
	const end = new Date(endDateTime);

	return now >= start && now < end;
}

/**
 * Get calendar event duration in minutes.
 *
 * @param event - Calendar event
 * @returns Duration in minutes, or 0 if cannot be determined
 */
export function getCalendarEventDuration(event: GoogleCalendarEvent): number {
	const startDateTime = event.start.dateTime ?? event.start.date;
	const endDateTime = event.end.dateTime ?? event.end.date;

	if (!startDateTime || !endDateTime) {
		return 0;
	}

	const start = new Date(startDateTime);
	const end = new Date(endDateTime);

	return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Merge calendar events with task schedule blocks.
 *
 * Returns a combined list of blocks sorted by start time.
 * Calendar events are assigned to separate lanes to avoid overlap with task blocks.
 *
 * @param taskBlocks - Task schedule blocks
 * @param calendarEvents - Calendar events for the same date
 * @returns Combined and sorted blocks
 */
export function mergeScheduleWithCalendar(
	taskBlocks: ScheduleBlock[],
	calendarEvents: GoogleCalendarEvent[],
): ScheduleBlock[] {
	const calendarBlocks = calendarEventsToBlocks(calendarEvents, 2); // Lane 2+ for calendar
	return [...taskBlocks, ...calendarBlocks].sort((a, b) => {
		const aTime = new Date(a.startTime).getTime();
		const bTime = new Date(b.startTime).getTime();
		return aTime - bTime;
	});
}
