export interface EventLikeForNextSchedule {
	id: string;
	summary?: string;
	start: {
		dateTime?: string;
		date?: string;
	};
	end: {
		dateTime?: string;
		date?: string;
	};
}

export interface NextScheduleGroup {
	startTimeIso: string;
	primaryTitle: string;
	parallelCount: number;
	isOverdue: boolean;
	diffMs: number;
}

interface ScheduleGroupInternal {
	startTimeIso: string;
	startMs: number;
	titles: string[];
}

function toStartIso(event: EventLikeForNextSchedule): string | null {
	const value = event.start.dateTime ?? event.start.date;
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
}

export function selectNextScheduleGroupFromEvents(
	events: EventLikeForNextSchedule[],
	now = new Date(),
): NextScheduleGroup | null {
	const groups = new Map<number, ScheduleGroupInternal>();

	for (const event of events) {
		const startIso = toStartIso(event);
		if (!startIso) continue;
		const startMs = new Date(startIso).getTime();
		const title = event.summary?.trim() || "Untitled event";

		const existing = groups.get(startMs);
		if (existing) {
			existing.titles.push(title);
			continue;
		}
		groups.set(startMs, {
			startTimeIso: startIso,
			startMs,
			titles: [title],
		});
	}

	if (groups.size === 0) {
		return null;
	}

	const nowMs = now.getTime();
	const sorted = [...groups.values()].sort((a, b) => a.startMs - b.startMs);
	const future = sorted.find((group) => group.startMs >= nowMs);
	const target = future ?? [...sorted].reverse().find((group) => group.startMs < nowMs) ?? null;

	if (!target) return null;

	const diffMs = target.startMs - nowMs;
	return {
		startTimeIso: target.startTimeIso,
		primaryTitle: target.titles[0] ?? "Untitled event",
		parallelCount: target.titles.length,
		isOverdue: diffMs < 0,
		diffMs,
	};
}

export function formatStartTimeHHmm(startTimeIso: string): string {
	const value = new Date(startTimeIso);
	if (Number.isNaN(value.getTime())) return "--:--";
	return value.toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export function formatRelativeCountdown(diffMs: number): string {
	const absMs = Math.abs(diffMs);
	const totalSeconds = Math.floor(absMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const body = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

	if (diffMs >= 0) {
		return `in ${body}`;
	}
	return `+${body} overdue`;
}
