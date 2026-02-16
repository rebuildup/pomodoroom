export interface CalendarLikeEvent {
	id: string;
	calendarId?: string;
	summary?: string;
	description?: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
}

export interface CalendarStreakPolicy {
	enabled: boolean;
	mode: "reset" | "downshift";
	downshiftBy: number;
	optOutTags: string[];
}

export interface CalendarResetCause {
	eventId: string;
	calendarId: string;
	action: "reset" | "downshift";
	reason: string;
	timestamp: string;
}

export interface CalendarResetDecision {
	action: "none" | "reset" | "downshift";
	cause: CalendarResetCause | null;
}

interface EvaluationInput {
	nowMs: number;
	selectedCalendarIds: string[];
	policies: Record<string, CalendarStreakPolicy>;
}

const POLICY_STORAGE_KEY = "calendar_streak_reset_policies_v1";
const LOG_STORAGE_KEY = "calendar_streak_reset_logs_v1";

const HIGH_CONTEXT_KEYWORDS = ["meeting", "sync", "standup", "call", "1:1", "interview"];

export function defaultCalendarStreakPolicy(): CalendarStreakPolicy {
	return {
		enabled: true,
		mode: "reset",
		downshiftBy: 1,
		optOutTags: ["#no-streak-reset"],
	};
}

export function loadCalendarStreakPolicies(): Record<string, CalendarStreakPolicy> {
	try {
		const raw = localStorage.getItem(POLICY_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Record<string, CalendarStreakPolicy>;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

export function saveCalendarStreakPolicies(policies: Record<string, CalendarStreakPolicy>): void {
	try {
		localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policies));
	} catch {
		// Ignore localStorage failures.
	}
}

export function recordCalendarStreakResetLog(entry: CalendarResetCause): void {
	try {
		const raw = localStorage.getItem(LOG_STORAGE_KEY);
		const logs = raw ? (JSON.parse(raw) as CalendarResetCause[]) : [];
		logs.push(entry);
		localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs.slice(-200)));
	} catch {
		// Ignore localStorage failures.
	}
}

function toEventRange(event: CalendarLikeEvent): { startMs: number; endMs: number } | null {
	const startRaw = event.start.dateTime ?? event.start.date;
	const endRaw = event.end.dateTime ?? event.end.date;
	if (!startRaw || !endRaw) return null;
	const startMs = Date.parse(startRaw);
	const endMs = Date.parse(endRaw);
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
	return { startMs, endMs };
}

function hasOptOutTag(event: CalendarLikeEvent, tags: string[]): boolean {
	if (tags.length === 0) return false;
	const text = `${event.summary ?? ""} ${event.description ?? ""}`.toLowerCase();
	return tags.some((tag) => text.includes(tag.toLowerCase()));
}

function isHighContextEvent(event: CalendarLikeEvent): { matched: boolean; reason: string } {
	const text = `${event.summary ?? ""} ${event.description ?? ""}`.toLowerCase();
	for (const keyword of HIGH_CONTEXT_KEYWORDS) {
		if (text.includes(keyword)) {
			return { matched: true, reason: `keyword:${keyword}` };
		}
	}
	return { matched: false, reason: "" };
}

export function evaluateCalendarContextStreakReset(
	events: CalendarLikeEvent[],
	input: EvaluationInput,
): CalendarResetDecision {
	for (const event of events) {
		const calendarId = event.calendarId ?? "primary";
		if (!input.selectedCalendarIds.includes(calendarId)) continue;

		const policy = input.policies[calendarId] ?? defaultCalendarStreakPolicy();
		if (!policy.enabled) continue;
		if (hasOptOutTag(event, policy.optOutTags)) continue;

		const range = toEventRange(event);
		if (!range) continue;
		if (input.nowMs < range.startMs || input.nowMs > range.endMs) continue;

		const highContext = isHighContextEvent(event);
		if (!highContext.matched) continue;

		const action = policy.mode === "downshift" ? "downshift" : "reset";
		return {
			action,
			cause: {
				eventId: event.id,
				calendarId,
				action,
				reason: highContext.reason,
				timestamp: new Date(input.nowMs).toISOString(),
			},
		};
	}
	return { action: "none", cause: null };
}
