import type { SessionData } from "@/hooks/useStats";

// localStorage persistence removed - database-only architecture

export interface BreakEffectivenessCycle {
	preFocusMinutes: number;
	breakMinutes: number;
	postFocusMinutes: number;
	tag: string;
	score: number;
}

export interface BreakTagProfile {
	tag: string;
	occurrences: number;
	avgScore: number;
	bestBreakMinutes: number;
}

export type BreakResponseProfiles = Record<string, BreakTagProfile>;

export interface BreakEffectivenessAnalysis {
	cycles: BreakEffectivenessCycle[];
	profiles: BreakResponseProfiles;
	topPatterns: Array<{ label: string; score: number; occurrences: number }>;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function computeBreakFeedbackScore(preFocusMinutes: number, postFocusMinutes: number): number {
	if (preFocusMinutes <= 0 || postFocusMinutes <= 0) return 0;
	return clamp((postFocusMinutes - preFocusMinutes) / preFocusMinutes, -1, 1);
}

export function recommendBreakMinutesFromFeedback(
	baseBreakMinutes: number,
	recentScores: number[],
	limits: { min?: number; max?: number; step?: number } = {},
): number {
	const min = limits.min ?? 5;
	const max = limits.max ?? 30;
	const step = limits.step ?? 1;
	if (recentScores.length === 0) return clamp(baseBreakMinutes, min, max);

	const avg = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
	if (avg <= -0.15) return clamp(baseBreakMinutes + step, min, max);
	if (avg >= 0.15) return clamp(baseBreakMinutes - step, min, max);
	return clamp(baseBreakMinutes, min, max);
}

export function analyzeBreakEffectivenessCycles(sessions: SessionData[]): BreakEffectivenessAnalysis {
	const ordered = [...sessions].sort(
		(a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at),
	);
	const cycles: BreakEffectivenessCycle[] = [];

	for (let i = 0; i < ordered.length - 2; i++) {
		const pre = ordered[i];
		const rest = ordered[i + 1];
		const post = ordered[i + 2];
		if (!pre || !rest || !post) continue;
		if (pre.step_type !== "focus" || rest.step_type !== "break" || post.step_type !== "focus") {
			continue;
		}

		const tag = post.project_name ?? pre.project_name ?? "uncategorized";
		cycles.push({
			preFocusMinutes: pre.duration_min,
			breakMinutes: rest.duration_min,
			postFocusMinutes: post.duration_min,
			tag,
			score: computeBreakFeedbackScore(pre.duration_min, post.duration_min),
		});
	}

	const profiles: BreakResponseProfiles = {};
	for (const cycle of cycles) {
		const existing = profiles[cycle.tag];
		if (!existing) {
			profiles[cycle.tag] = {
				tag: cycle.tag,
				occurrences: 1,
				avgScore: cycle.score,
				bestBreakMinutes: cycle.breakMinutes,
			};
			continue;
		}

		const nextOccurrences = existing.occurrences + 1;
		const nextAvg = (existing.avgScore * existing.occurrences + cycle.score) / nextOccurrences;
		profiles[cycle.tag] = {
			...existing,
			occurrences: nextOccurrences,
			avgScore: nextAvg,
			bestBreakMinutes:
				cycle.score > existing.avgScore ? cycle.breakMinutes : existing.bestBreakMinutes,
		};
	}

	const patternMap = new Map<string, { totalScore: number; count: number }>();
	for (const cycle of cycles) {
		const key = `${cycle.breakMinutes}`;
		const existing = patternMap.get(key) ?? { totalScore: 0, count: 0 };
		patternMap.set(key, {
			totalScore: existing.totalScore + cycle.score,
			count: existing.count + 1,
		});
	}

	const topPatterns = [...patternMap.entries()]
		.map(([minutes, data]) => ({
			label: `${minutes}分休憩`,
			score: data.count > 0 ? data.totalScore / data.count : 0,
			occurrences: data.count,
		}))
		.sort((a, b) => b.score - a.score || b.occurrences - a.occurrences)
		.slice(0, 3);

	return { cycles, profiles, topPatterns };
}

export function loadBreakResponseProfiles(): BreakResponseProfiles {
	// Always return empty - no persistence
	return {};
}

export function saveBreakResponseProfiles(_profiles: BreakResponseProfiles): void {
	// No-op - database-only architecture
}
