import { describe, expect, it } from "vitest";
import {
	formatRelativeCountdown,
	formatStartTimeHHmm,
	selectNextScheduleGroupFromEvents,
	type EventLikeForNextSchedule,
} from "./nextSchedule";

function makeEvent(
	id: string,
	startIso: string,
	summary = "Event"
): EventLikeForNextSchedule {
	return {
		id,
		summary,
		start: { dateTime: startIso },
		end: { dateTime: new Date(new Date(startIso).getTime() + 60_000).toISOString() },
	};
}

describe("selectNextScheduleGroupFromEvents", () => {
	it("selects nearest future group and counts parallel events", () => {
		const now = new Date("2026-02-13T10:00:00.000Z");
		const shared = "2026-02-13T10:30:00.000Z";
		const events: EventLikeForNextSchedule[] = [
			makeEvent("1", "2026-02-13T09:00:00.000Z", "Past"),
			makeEvent("2", shared, "Parallel A"),
			makeEvent("3", shared, "Parallel B"),
			makeEvent("4", "2026-02-13T11:00:00.000Z", "Later"),
		];

		const next = selectNextScheduleGroupFromEvents(events, now);

		expect(next).not.toBeNull();
		expect(next?.startTimeIso).toBe(shared);
		expect(next?.primaryTitle).toBe("Parallel A");
		expect(next?.parallelCount).toBe(2);
		expect(next?.isOverdue).toBe(false);
	});

	it("falls back to most recent past group when future events are absent", () => {
		const now = new Date("2026-02-13T10:00:00.000Z");
		const events: EventLikeForNextSchedule[] = [
			makeEvent("1", "2026-02-13T07:30:00.000Z", "Old"),
			makeEvent("2", "2026-02-13T09:45:00.000Z", "Recent Past"),
		];

		const next = selectNextScheduleGroupFromEvents(events, now);

		expect(next).not.toBeNull();
		expect(next?.startTimeIso).toBe("2026-02-13T09:45:00.000Z");
		expect(next?.isOverdue).toBe(true);
	});

	it("returns null for empty or invalid input", () => {
		const now = new Date("2026-02-13T10:00:00.000Z");
		expect(selectNextScheduleGroupFromEvents([], now)).toBeNull();
		expect(
			selectNextScheduleGroupFromEvents(
				[
					{
						id: "bad",
						summary: "Bad",
						start: { dateTime: "not-a-date" },
						end: { dateTime: "2026-02-13T10:10:00.000Z" },
					},
				],
				now
			)
		).toBeNull();
	});
});

describe("format helpers", () => {
	it("formats start time in HH:mm", () => {
		expect(formatStartTimeHHmm("2026-02-13T14:05:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
	});

	it("formats countdown and overdue labels", () => {
		expect(formatRelativeCountdown(65_000)).toBe("in 00:01:05");
		expect(formatRelativeCountdown(-125_000)).toBe("+00:02:05 overdue");
	});
});
