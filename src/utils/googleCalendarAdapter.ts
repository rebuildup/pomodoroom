import type { GoogleCalendarEvent } from "@/hooks/useGoogleCalendar";

export interface CalendarTimeRange {
	start_time: string;
	end_time: string;
}

function toIsoBoundary(date: string, endOfDay: boolean): string {
	return endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`;
}

export function eventToTimeRange(event: GoogleCalendarEvent): CalendarTimeRange | null {
	const startDateTime = event.start.dateTime;
	const startDate = event.start.date;
	const endDateTime = event.end.dateTime;
	const endDate = event.end.date;

	const start = startDateTime ?? (startDate ? toIsoBoundary(startDate, false) : null);
	const end = endDateTime ?? (endDate ? toIsoBoundary(endDate, false) : null);

	if (!start || !end) {
		return null;
	}

	return {
		start_time: start,
		end_time: end,
	};
}
