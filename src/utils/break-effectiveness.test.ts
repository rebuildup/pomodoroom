import { describe, expect, it } from "vitest";
import type { SessionData } from "@/hooks/useStats";
import {
	analyzeBreakEffectivenessCycles,
	computeBreakFeedbackScore,
	recommendBreakMinutesFromFeedback,
} from "@/utils/break-effectiveness";

function makeSession(overrides: Partial<SessionData>): SessionData {
	return {
		completed_at: overrides.completed_at ?? "2026-02-15T09:00:00.000Z",
		step_type: overrides.step_type ?? "focus",
		duration_min: overrides.duration_min ?? 25,
		task_id: overrides.task_id ?? null,
		project_name: overrides.project_name ?? null,
	};
}

describe("break effectiveness", () => {
	it("computes feedback score per completed cycle", () => {
		const score = computeBreakFeedbackScore(20, 30);
		expect(score).toBeCloseTo(0.5, 5);
	});

	it("builds focus-break-focus cycles and keeps per-tag profile data", () => {
		const sessions: SessionData[] = [
			makeSession({ step_type: "focus", duration_min: 20, project_name: "alpha", completed_at: "2026-02-15T09:00:00.000Z" }),
			makeSession({ step_type: "break", duration_min: 5, completed_at: "2026-02-15T09:25:00.000Z" }),
			makeSession({ step_type: "focus", duration_min: 30, project_name: "alpha", completed_at: "2026-02-15T09:30:00.000Z" }),
		];

		const analysis = analyzeBreakEffectivenessCycles(sessions);
		expect(analysis.cycles).toHaveLength(1);
		expect(analysis.profiles.alpha).toBeDefined();
		expect(analysis.profiles.alpha?.avgScore).toBeGreaterThan(0);
	});

	it("changes recommendation gradually by one minute", () => {
		expect(recommendBreakMinutesFromFeedback(5, [-0.3, -0.2, -0.1])).toBe(6);
		expect(recommendBreakMinutesFromFeedback(10, [0.3, 0.2, 0.1])).toBe(9);
		expect(recommendBreakMinutesFromFeedback(8, [0.05, -0.04, 0.01])).toBe(8);
	});
});
