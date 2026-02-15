export interface CognitiveLoadEvent {
	completedAt?: string | Date;
	project?: string | null;
	task?: string | null;
	tags?: readonly string[];
	interrupted?: boolean;
}

export interface CognitiveLoadIndexResult {
	index: number;
	switchCount: number;
	switchRate: number;
	heterogeneity: number;
	interruptionRate: number;
}

export interface DailyCognitiveLoadStats {
	index: number;
	switchCount: number;
	recommendedBreakMinutes: number;
	spike: boolean;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function toTimestamp(value: string | Date | undefined): number {
	if (!value) return 0;
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function getProjectKey(event: CognitiveLoadEvent): string {
	const raw = (event.project ?? event.task ?? "none").toString().trim();
	return raw.length > 0 ? raw.toLowerCase() : "none";
}

function normalizeTag(tag: string): string {
	return tag.trim().toLowerCase();
}

export function estimateCognitiveLoadIndex(events: readonly CognitiveLoadEvent[]): CognitiveLoadIndexResult {
	if (events.length <= 1) {
		return {
			index: 0,
			switchCount: 0,
			switchRate: 0,
			heterogeneity: 0,
			interruptionRate: events.length === 0 ? 0 : (events[0]?.interrupted ? 1 : 0),
		};
	}

	const sorted = [...events].sort((a, b) => toTimestamp(a.completedAt) - toTimestamp(b.completedAt));
	let switchCount = 0;
	let prevProject = getProjectKey(sorted[0] ?? {});

	const projectSet = new Set<string>();
	const tagSet = new Set<string>();
	let interruptedCount = 0;

	for (const event of sorted) {
		const project = getProjectKey(event);
		projectSet.add(project);
		for (const tag of event.tags ?? []) {
			tagSet.add(normalizeTag(tag));
		}
		if (event.interrupted) interruptedCount += 1;

		if (project !== prevProject) {
			switchCount += 1;
		}
		prevProject = project;
	}

	const switchRate = switchCount / Math.max(1, sorted.length - 1);
	const projectDiversity = clamp(projectSet.size / Math.max(1, Math.min(sorted.length, 4)), 0, 1);
	const tagDiversity = clamp(tagSet.size / Math.max(1, Math.min(sorted.length * 2, 8)), 0, 1);
	const heterogeneity = clamp(projectDiversity * 0.7 + tagDiversity * 0.3, 0, 1);
	const interruptionRate = interruptedCount / Math.max(1, sorted.length);

	const weighted = switchRate * 0.55 + heterogeneity * 0.3 + interruptionRate * 0.15;
	const index = Math.round(clamp(weighted * 100, 0, 100));

	return {
		index,
		switchCount,
		switchRate,
		heterogeneity,
		interruptionRate,
	};
}

export function estimateCognitiveLoadFromTaskSequence(
	tasks: readonly { project?: string | null; tags?: readonly string[] }[],
): number {
	const pseudoEvents: CognitiveLoadEvent[] = tasks.map((task, idx) => ({
		completedAt: new Date(1_700_000_000_000 + idx * 60_000).toISOString(),
		project: task.project ?? null,
		tags: task.tags ?? [],
	}));
	return estimateCognitiveLoadIndex(pseudoEvents).index;
}

export function isCognitiveLoadSpike(index: number): boolean {
	return index >= 65;
}

export function recommendBreakMinutesFromCognitiveLoad(baseBreakMinutes: number, index: number): number {
	if (index >= 85) return baseBreakMinutes + 6;
	if (index >= 65) return baseBreakMinutes + 3;
	return baseBreakMinutes;
}

export function getSchedulerCognitiveLoadSignal(index: number): number {
	return clamp(index / 100, 0, 1);
}

export function buildDailyCognitiveLoadStats(
	events: readonly CognitiveLoadEvent[],
	date: Date = new Date(),
): DailyCognitiveLoadStats {
	const dateStr = date.toISOString().slice(0, 10);
	const daily = events.filter((event) => {
		const raw = event.completedAt;
		if (!raw) return false;
		const d = raw instanceof Date ? raw : new Date(raw);
		if (Number.isNaN(d.getTime())) return false;
		return d.toISOString().startsWith(dateStr);
	});
	const result = estimateCognitiveLoadIndex(daily);
	return {
		index: result.index,
		switchCount: result.switchCount,
		recommendedBreakMinutes: recommendBreakMinutesFromCognitiveLoad(5, result.index),
		spike: isCognitiveLoadSpike(result.index),
	};
}
