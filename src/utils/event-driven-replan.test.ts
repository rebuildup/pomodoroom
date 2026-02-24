import { describe, expect, it } from "vitest";
import type { ScheduleBlock } from "@/types/schedule";
import {
	buildReplanDiff,
	calculateChurnOutsideWindow,
	detectImpactedWindowFromCalendarDelta,
	mergeLocalReplan,
} from "./event-driven-replan";

function block(id: string, startTime: string, endTime: string, label?: string): ScheduleBlock {
	return {
		id,
		blockType: "focus",
		startTime,
		endTime,
		locked: false,
		label,
	};
}

describe("event-driven-replan", () => {
	it("detects impacted window from calendar deltas with padding", () => {
		const previous = [block("cal-1", "2026-02-16T10:00:00.000Z", "2026-02-16T11:00:00.000Z")];
		const next = [block("cal-1", "2026-02-16T10:30:00.000Z", "2026-02-16T11:30:00.000Z")];

		const window = detectImpactedWindowFromCalendarDelta(previous, next, 10);
		expect(window).not.toBeNull();
		expect(window?.startTime).toBe("2026-02-16T09:50:00.000Z");
		expect(window?.endTime).toBe("2026-02-16T11:40:00.000Z");
	});

	it("preserves and locks unaffected blocks while replacing impacted window", () => {
		const current = [
			block("b1", "2026-02-16T08:00:00.000Z", "2026-02-16T08:30:00.000Z"),
			block("b2", "2026-02-16T10:00:00.000Z", "2026-02-16T10:30:00.000Z"),
			block("b3", "2026-02-16T12:00:00.000Z", "2026-02-16T12:30:00.000Z"),
		];
		const replanned = [block("b2-new", "2026-02-16T10:15:00.000Z", "2026-02-16T10:45:00.000Z")];
		const window = {
			startTime: "2026-02-16T09:45:00.000Z",
			endTime: "2026-02-16T11:15:00.000Z",
		};

		const merged = mergeLocalReplan(current, replanned, window);

		expect(merged.map((entry) => entry.id)).toEqual(["b1", "b2-new", "b3"]);
		expect(merged.find((entry) => entry.id === "b1")?.locked).toBe(true);
		expect(merged.find((entry) => entry.id === "b3")?.locked).toBe(true);
	});

	it("computes diff and reports zero churn outside impacted window", () => {
		const before = [
			block("stable", "2026-02-16T08:00:00.000Z", "2026-02-16T08:30:00.000Z"),
			block("changed", "2026-02-16T10:00:00.000Z", "2026-02-16T10:30:00.000Z"),
		];
		const after = [
			block("stable", "2026-02-16T08:00:00.000Z", "2026-02-16T08:30:00.000Z"),
			block("changed", "2026-02-16T10:15:00.000Z", "2026-02-16T10:45:00.000Z"),
		];
		const window = {
			startTime: "2026-02-16T09:45:00.000Z",
			endTime: "2026-02-16T11:00:00.000Z",
		};

		const diff = buildReplanDiff(before, after, window);
		const churn = calculateChurnOutsideWindow(before, after, window);

		expect(diff).toHaveLength(1);
		expect(diff[0]?.type).toBe("updated");
		expect(churn).toBe(0);
	});
});
