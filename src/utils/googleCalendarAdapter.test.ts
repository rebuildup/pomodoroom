import { describe, expect, it } from "vitest";
import { eventToTimeRange } from "./googleCalendarAdapter";

describe("eventToTimeRange", () => {
	it("maps timed events using dateTime fields", () => {
		const range = eventToTimeRange({
			id: "1",
			start: { dateTime: "2026-02-12T09:00:00Z" },
			end: { dateTime: "2026-02-12T10:00:00Z" },
		});

		expect(range).toEqual({
			start_time: "2026-02-12T09:00:00Z",
			end_time: "2026-02-12T10:00:00Z",
		});
	});

	it("maps all-day events using date boundaries", () => {
		const range = eventToTimeRange({
			id: "2",
			start: { date: "2026-02-12" },
			end: { date: "2026-02-13" },
		});

		expect(range).toEqual({
			start_time: "2026-02-12T00:00:00.000Z",
			end_time: "2026-02-13T00:00:00.000Z",
		});
	});
});
