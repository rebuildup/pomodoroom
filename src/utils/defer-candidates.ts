import { toCandidateIso } from "@/utils/notification-time";

export interface DeferCandidate {
	reason: string;
	iso: string;
}

interface BuildDeferCandidatesInput {
	nowMs: number;
	durationMs: number;
	nextScheduledMs: number | null;
	maxCandidates?: number;
}

export function buildDeferCandidates({
	nowMs,
	durationMs,
	nextScheduledMs,
	maxCandidates = 3,
}: BuildDeferCandidatesInput): DeferCandidate[] {
	const raw: Array<{ reason: string; atMs: number }> = [
		{ reason: "15分後", atMs: nowMs + 15 * 60_000 },
		{ reason: "30分後", atMs: nowMs + 30 * 60_000 },
	];

	if (nextScheduledMs !== null) {
		raw.push(
			{ reason: "次タスク開始時刻", atMs: nextScheduledMs },
			{ reason: "次タスク後", atMs: nextScheduledMs + durationMs },
		);
	}

	const unique = new Map<string, DeferCandidate>();
	for (const candidate of raw) {
		const iso = toCandidateIso(candidate.atMs);
		if (Date.parse(iso) <= nowMs) continue;
		if (!unique.has(iso)) {
			unique.set(iso, { reason: candidate.reason, iso });
		}
		if (unique.size >= maxCandidates) break;
	}

	const candidates = [...unique.values()];
	if (candidates.length === 0) {
		candidates.push({
			reason: "15分後",
			iso: toCandidateIso(nowMs + 15 * 60_000),
		});
	}
	return candidates;
}
