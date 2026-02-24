import { describe, expect, it } from "vitest";
import { generateWeeklyRetro } from "@/utils/weeklyRetroGenerator";
import type { SessionData, StatsData } from "@/hooks/useStats";

const stats: StatsData = {
	totalFocusMinutes: 90,
	totalBreakMinutes: 15,
	sessionCount: 5,
	projects: { alpha: 90 },
};

const sessions: SessionData[] = [
	{
		completed_at: "2026-02-10T09:00:00.000Z",
		step_type: "focus",
		duration_min: 20,
		task_id: null,
		project_name: "alpha",
	},
	{
		completed_at: "2026-02-10T09:25:00.000Z",
		step_type: "break",
		duration_min: 5,
		task_id: null,
		project_name: null,
	},
	{
		completed_at: "2026-02-10T09:30:00.000Z",
		step_type: "focus",
		duration_min: 30,
		task_id: null,
		project_name: "alpha",
	},
	{
		completed_at: "2026-02-10T10:05:00.000Z",
		step_type: "break",
		duration_min: 10,
		task_id: null,
		project_name: null,
	},
	{
		completed_at: "2026-02-10T10:15:00.000Z",
		step_type: "focus",
		duration_min: 40,
		task_id: null,
		project_name: "alpha",
	},
];

describe("weekly retro break effectiveness", () => {
	it("includes top effective break patterns in markdown", () => {
		const retro = generateWeeklyRetro({
			weekStart: "2026-02-09",
			weekEnd: "2026-02-15",
			sessions,
			stats,
		});

		expect(retro.rawMarkdown).toContain("休憩効果パターン");
		expect(retro.rawMarkdown).toContain("5分休憩");
	});
});
