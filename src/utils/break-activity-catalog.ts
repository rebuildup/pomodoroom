export type BreakFatigueLevel = "low" | "medium" | "high";

export interface BreakActivity {
	id: string;
	title: string;
	description: string;
	durationBucket: number;
	tags: string[];
	enabled: boolean;
	pinned: boolean;
	usageCount: number;
	selectedCount: number;
	dismissedCount: number;
	lastSelectedAt?: string;
}

export interface BreakActivitySuggestionOptions {
	breakMinutes: number;
	fatigueLevel: BreakFatigueLevel;
	limit?: number;
}

interface BreakActivityInput {
	id: string;
	title: string;
	description: string;
	durationBucket: number;
	tags: string[];
	enabled?: boolean;
}

type BreakActivityFeedback = "selected" | "dismissed";

const STORAGE_KEY = "break_activity_catalog_v1";
const LAST_TOP_KEY = "break_activity_last_top_v1";

const DEFAULT_CATALOG: BreakActivity[] = [
	{
		id: "hydration",
		title: "水分補給",
		description: "コップ一杯の水を飲む",
		durationBucket: 5,
		tags: ["recovery", "high-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "walk-quick",
		title: "クイック散歩",
		description: "室内または屋外を軽く歩く",
		durationBucket: 5,
		tags: ["movement", "medium-fatigue", "high-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "stretch-upper",
		title: "上半身ストレッチ",
		description: "首と肩を中心にゆっくり伸ばす",
		durationBucket: 10,
		tags: ["movement", "high-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "breathing-reset",
		title: "呼吸リセット",
		description: "4-4-6 の深呼吸を5セット",
		durationBucket: 5,
		tags: ["mindful", "high-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "desk-tidy",
		title: "デスク整理",
		description: "机の上を片付けて視界を整える",
		durationBucket: 10,
		tags: ["reset", "low-fatigue", "medium-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "eye-rest",
		title: "目の休憩",
		description: "20-20-20ルールで視線を遠くに移す",
		durationBucket: 5,
		tags: ["recovery", "high-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "mobility-flow",
		title: "全身モビリティ",
		description: "腰・背中・脚を順番に動かす",
		durationBucket: 15,
		tags: ["movement", "medium-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
	{
		id: "micro-nap",
		title: "マイクロ仮眠",
		description: "目を閉じて静かに休む",
		durationBucket: 30,
		tags: ["recovery", "high-fatigue"],
		enabled: true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	},
];

function readJson<T>(_key: string, fallback: T): T {
	// No localStorage persistence - database-only architecture
	return fallback;
}

function writeJson(_key: string, _value: unknown): void {
	// No-op - database-only architecture
}

function contextKey(options: BreakActivitySuggestionOptions): string {
	return `${options.breakMinutes}:${options.fatigueLevel}`;
}

function normalizeBucket(minutes: number): number {
	if (minutes <= 5) return 5;
	if (minutes <= 10) return 10;
	if (minutes <= 15) return 15;
	return 30;
}

function getCatalog(): BreakActivity[] {
	const catalog = readJson<BreakActivity[]>(STORAGE_KEY, DEFAULT_CATALOG);
	if (!Array.isArray(catalog) || catalog.length === 0) {
		writeJson(STORAGE_KEY, DEFAULT_CATALOG);
		return [...DEFAULT_CATALOG];
	}
	return catalog.map((item) => ({
		...item,
		enabled: item.enabled ?? true,
		pinned: item.pinned ?? false,
		usageCount: item.usageCount ?? 0,
		selectedCount: item.selectedCount ?? 0,
		dismissedCount: item.dismissedCount ?? 0,
		tags: Array.isArray(item.tags) ? item.tags : [],
	}));
}

function saveCatalog(catalog: BreakActivity[]): void {
	writeJson(STORAGE_KEY, catalog);
}

function scoreActivity(
	item: BreakActivity,
	options: BreakActivitySuggestionOptions,
): number {
	const bucket = normalizeBucket(options.breakMinutes);
	const fatigueTag = `${options.fatigueLevel}-fatigue`;
	let score = 0;
	score += Math.max(0, 30 - Math.abs(item.durationBucket - bucket) * 3);
	score += item.pinned ? 100 : 0;
	score += item.selectedCount * 12;
	score -= item.dismissedCount * 4;
	score -= item.usageCount * 2;
	score += item.tags.includes(fatigueTag) ? 24 : 0;
	score += item.tags.includes("recovery") && options.fatigueLevel === "high" ? 10 : 0;
	score += item.tags.includes("movement") && options.fatigueLevel !== "high" ? 6 : 0;
	return score;
}

export function getBreakActivityCatalog(): BreakActivity[] {
	return getCatalog().sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return a.title.localeCompare(b.title, "ja");
	});
}

export function upsertBreakActivity(input: BreakActivityInput): BreakActivity {
	const catalog = getCatalog();
	const index = catalog.findIndex((item) => item.id === input.id);
	if (index >= 0) {
		const updated: BreakActivity = {
			...catalog[index],
			title: input.title,
			description: input.description,
			durationBucket: normalizeBucket(input.durationBucket),
			tags: [...new Set(input.tags)],
			enabled: input.enabled ?? catalog[index].enabled,
		};
		catalog[index] = updated;
		saveCatalog(catalog);
		return updated;
	}
	const created: BreakActivity = {
		id: input.id,
		title: input.title,
		description: input.description,
		durationBucket: normalizeBucket(input.durationBucket),
		tags: [...new Set(input.tags)],
		enabled: input.enabled ?? true,
		pinned: false,
		usageCount: 0,
		selectedCount: 0,
		dismissedCount: 0,
	};
	catalog.push(created);
	saveCatalog(catalog);
	return created;
}

export function setBreakActivityEnabled(id: string, enabled: boolean): BreakActivity | null {
	const catalog = getCatalog();
	const index = catalog.findIndex((item) => item.id === id);
	if (index < 0) return null;
	const next = { ...catalog[index], enabled };
	catalog[index] = next;
	saveCatalog(catalog);
	return next;
}

export function togglePinBreakActivity(id: string, pinned?: boolean): BreakActivity | null {
	const catalog = getCatalog();
	const index = catalog.findIndex((item) => item.id === id);
	if (index < 0) return null;
	const nextPinned = pinned ?? !catalog[index].pinned;
	const next = { ...catalog[index], pinned: nextPinned };
	catalog[index] = next;
	saveCatalog(catalog);
	return next;
}

export function recordBreakActivityFeedback(
	id: string,
	feedback: BreakActivityFeedback,
): BreakActivity | null {
	const catalog = getCatalog();
	const index = catalog.findIndex((item) => item.id === id);
	if (index < 0) return null;
	const current = catalog[index];
	const next: BreakActivity = {
		...current,
		usageCount: current.usageCount + 1,
		selectedCount: feedback === "selected" ? current.selectedCount + 1 : current.selectedCount,
		dismissedCount: feedback === "dismissed" ? current.dismissedCount + 1 : current.dismissedCount,
		lastSelectedAt: feedback === "selected" ? new Date().toISOString() : current.lastSelectedAt,
	};
	catalog[index] = next;
	saveCatalog(catalog);
	return next;
}

export function getBreakActivitySuggestions(
	options: BreakActivitySuggestionOptions,
): BreakActivity[] {
	const catalog = getCatalog().filter((item) => item.enabled);
	const ranked = catalog
		.map((item) => ({ item, score: scoreActivity(item, options) }))
		.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "ja"));

	if (ranked.length === 0) return [];

	const key = contextKey(options);
	const lastTopByContext = readJson<Record<string, string>>(LAST_TOP_KEY, {});
	const lastTop = lastTopByContext[key];
	if (ranked.length > 1 && ranked[0]?.item.id === lastTop) {
		const first = ranked.shift();
		if (first) ranked.push(first);
	}

	const limit = Math.max(1, options.limit ?? 3);
	const selected = ranked.slice(0, limit).map(({ item }) => item);
	if (selected[0]) {
		lastTopByContext[key] = selected[0].id;
		writeJson(LAST_TOP_KEY, lastTopByContext);
	}
	return selected;
}

export function __resetBreakActivityCatalogForTests(): void {
	// No-op - database-only architecture
}
