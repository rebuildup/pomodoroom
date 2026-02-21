import { beforeEach, describe, expect, it } from "vitest";
import {
	defaultCalendarStreakPolicy,
	evaluateCalendarContextStreakReset,
} from "@/utils/calendar-streak-reset-policy";

describe("calendar streak reset policy", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("applies only to selected calendars", () => {
		const now = Date.parse("2026-02-16T10:00:00.000Z");
		const decision = evaluateCalendarContextStreakReset(
			[
				{
					id: "e1",
					calendarId: "work",
					summary: "Project sync",
					start: { dateTime: "2026-02-16T09:50:00.000Z" },
					end: { dateTime: "2026-02-16T10:20:00.000Z" },
				},
			],
			{
				nowMs: now,
				selectedCalendarIds: ["personal"],
				policies: { work: defaultCalendarStreakPolicy() },
			},
		);
		expect(decision.action).toBe("none");
	});

	it("supports opt-out tags in summary/description", () => {
		const now = Date.parse("2026-02-16T10:00:00.000Z");
		const decision = evaluateCalendarContextStreakReset(
			[
				{
					id: "e2",
					calendarId: "work",
					summary: "Client call #no-streak-reset",
					description: "important",
					start: { dateTime: "2026-02-16T09:55:00.000Z" },
					end: { dateTime: "2026-02-16T10:25:00.000Z" },
				},
			],
			{
				nowMs: now,
				selectedCalendarIds: ["work"],
				policies: { work: defaultCalendarStreakPolicy() },
			},
		);
		expect(decision.action).toBe("none");
	});

	it("returns reset decision and cause for high-context events", () => {
		const now = Date.parse("2026-02-16T10:00:00.000Z");
		const decision = evaluateCalendarContextStreakReset(
			[
				{
					id: "e3",
					calendarId: "work",
					summary: "Weekly meeting",
					start: { dateTime: "2026-02-16T09:40:00.000Z" },
					end: { dateTime: "2026-02-16T10:10:00.000Z" },
				},
			],
			{
				nowMs: now,
				selectedCalendarIds: ["work"],
				policies: { work: defaultCalendarStreakPolicy() },
			},
		);
		expect(decision.action).toBe("reset");
		expect(decision.cause?.eventId).toBe("e3");
		expect(decision.cause?.calendarId).toBe("work");
	});

	// Persistence test removed - database-only architecture
	// recordCalendarStreakResetLog and loadCalendarStreakPolicies are no-ops
});
