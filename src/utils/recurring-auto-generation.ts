import type { CreateTaskInput } from "@/hooks/useTaskStore";
import type { Task } from "@/types/task";

export type RepeatType = "weekdays" | "interval_days" | "nth_weekday" | "monthly_date";

export interface RepeatConfig {
	type: RepeatType;
	weekdays?: number[];
	intervalDays?: number;
	nthWeek?: number;
	weekday?: number;
	monthDay?: number;
}

export interface RecurringLifeEntry {
	id: string;
	name: string;
	startTime: string;
	durationMinutes: number;
	repeat: RepeatConfig;
	enabled: boolean;
	allowSplit?: boolean;
}

export interface RecurringMacroEntry {
	id: string;
	title: string;
	cadence: "daily" | "weekly" | "monthly";
	windowStartAt: string;
	windowEndAt: string;
	estimatedMinutes: number;
	repeat: RepeatConfig;
	enabled: boolean;
	allowSplit?: boolean;
}

export interface ExistingTaskLike {
	description?: string;
}

export function formatLocalDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseTimeToDate(baseDate: Date, hhmm: string): Date {
	const [h = "0", m = "0"] = hhmm.split(":");
	const d = new Date(baseDate);
	d.setHours(Number(h), Number(m), 0, 0);
	return d;
}

export function matchesRepeatDate(repeat: RepeatConfig | undefined | null, date: Date): boolean {
	// Handle undefined/null repeat config
	if (!repeat || !repeat.type) {
		return false;
	}

	const dayOfWeek = date.getDay();
	const dayOfMonth = date.getDate();

	switch (repeat.type) {
		case "weekdays":
			return repeat.weekdays?.includes(dayOfWeek) ?? false;
		case "interval_days": {
			const startOfYear = new Date(date.getFullYear(), 0, 0);
			const diff = date.getTime() - startOfYear.getTime();
			const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
			const interval = repeat.intervalDays || 1;
			return dayOfYear % interval === 0;
		}
		case "nth_weekday":
			if (repeat.weekday !== dayOfWeek) return false;
			return Math.ceil(dayOfMonth / 7) === (repeat.nthWeek ?? 1);
		case "monthly_date":
			return dayOfMonth === (repeat.monthDay ?? 1);
		default:
			return false;
	}
}

function marker(kind: "life" | "macro", id: string, dateKey: string): string {
	return `[recurring:${kind}:${id}:${dateKey}]`;
}

function hasMarker(tasks: ExistingTaskLike[], value: string): boolean {
	return tasks.some((task) => (task.description ?? "").includes(value));
}

function extractRecurringMarker(description?: string): string | null {
	if (!description) return null;
	return description.match(/\[recurring:[^\]]+\]/)?.[0] ?? null;
}

/**
 * Returns task IDs that should be removed because they are duplicates of recurring generated tasks.
 * Keeps the most recently updated task for each recurring marker.
 */
export function findRecurringDuplicateTaskIds(tasks: Task[]): string[] {
	const groups = new Map<string, Task[]>();
	for (const task of tasks) {
		const markerValue = extractRecurringMarker(task.description);
		if (!markerValue) continue;
		const list = groups.get(markerValue) ?? [];
		list.push(task);
		groups.set(markerValue, list);
	}

	const toDelete: string[] = [];
	for (const [, list] of groups) {
		if (list.length <= 1) continue;
		const sorted = [...list].sort((a, b) => {
			const au = Date.parse(a.updatedAt || a.createdAt);
			const bu = Date.parse(b.updatedAt || b.createdAt);
			return bu - au;
		});
		const keepId = sorted[0]?.id;
		for (const task of sorted) {
			if (task.id !== keepId) toDelete.push(task.id);
		}
	}
	return toDelete;
}

export function buildRecurringAutoTasks(params: {
	date: Date;
	lifeEntries: RecurringLifeEntry[];
	macroEntries: RecurringMacroEntry[];
	existingTasks: ExistingTaskLike[];
}): CreateTaskInput[] {
	const { date, lifeEntries, macroEntries, existingTasks } = params;
	const dateKey = formatLocalDateKey(date);
	const baseDate = new Date(date);
	baseDate.setHours(0, 0, 0, 0);
	const now = new Date();

	const out: CreateTaskInput[] = [];

	for (const entry of lifeEntries) {
		if (!entry.enabled) continue;
		if (!entry.repeat || !matchesRepeatDate(entry.repeat, date)) continue;
		const m = marker("life", entry.id, dateKey);
		if (hasMarker(existingTasks, m)) continue;

		const start = parseTimeToDate(baseDate, entry.startTime);
		const minutes = Math.max(1, entry.durationMinutes || 30);
		const end = new Date(start.getTime() + minutes * 60_000);

		// Mark as DONE if already finished
		const isFinished = end < now;
		out.push({
			title: entry.name,
			description: `${m} Auto-generated from life schedule`,
			kind: "fixed_event",
			requiredMinutes: minutes,
			fixedStartAt: start.toISOString(),
			fixedEndAt: end.toISOString(),
			tags: ["life", "auto"],
			state: isFinished ? "DONE" : "READY",
			allowSplit: entry.allowSplit ?? false, // Default: life events should not be split
		});
	}

	for (const entry of macroEntries) {
		if (!entry.enabled) continue;
		const shouldGenerate =
			entry.cadence === "daily"
				? true
				: entry.repeat
					? matchesRepeatDate(entry.repeat, date)
					: false;
		if (!shouldGenerate) continue;

		const m = marker("macro", entry.id, dateKey);
		if (hasMarker(existingTasks, m)) continue;

		const ws = new Date(entry.windowStartAt);
		const we = new Date(entry.windowEndAt);
		if (Number.isNaN(ws.getTime()) || Number.isNaN(we.getTime())) continue;

		const displayStart = new Date(baseDate);
		displayStart.setHours(ws.getHours(), ws.getMinutes(), 0, 0);
		const displayEnd = new Date(baseDate);
		displayEnd.setHours(we.getHours(), we.getMinutes(), 0, 0);

		// Mark as DONE if window has already closed
		const isFinished = displayEnd < now;
		out.push({
			title: entry.title,
			description: `${m} Auto-generated from macro schedule`,
			kind: "flex_window",
			requiredMinutes: Math.max(1, entry.estimatedMinutes || 30),
			windowStartAt: displayStart.toISOString(),
			windowEndAt: displayEnd.toISOString(),
			tags: ["macro", "auto"],
			state: isFinished ? "DONE" : "READY",
			allowSplit: entry.allowSplit ?? true, // Default: macro tasks can be split
		});
	}

	return out;
}
