export interface GoogleCalendarListEntry {
	id?: string;
	summary?: string;
	primary?: boolean;
	selected?: boolean;
	accessRole?: string;
}

/**
 * Decide which calendar IDs should be queried for events.
 * By default we prioritize visible/readable calendars and fall back to primary.
 */
export function pickCalendarIdsToQuery(calendars: GoogleCalendarListEntry[]): string[] {
	const readable = calendars.filter((c) => {
		if (!c.id || !c.id.trim()) return false;
		if (c.accessRole === "freeBusyReader" || c.accessRole === "none") return false;
		return c.selected !== false;
	});

	const unique = new Set<string>();
	const ordered: string[] = [];

	const primary = readable.find((c) => c.primary && c.id)?.id;
	if (primary) {
		unique.add(primary);
		ordered.push(primary);
	}

	for (const calendar of readable) {
		const id = calendar.id;
		if (id && !unique.has(id)) {
			unique.add(id);
			ordered.push(id);
		}
	}

	if (ordered.length === 0) {
		return ["primary"];
	}

	return ordered;
}
