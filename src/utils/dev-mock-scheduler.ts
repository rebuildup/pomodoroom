/**
 * Development mock scheduler for UI development and testing.
 *
 * This is a lightweight mock implementation used when:
 * - Developing UI components without running the full Tauri desktop app
 * - Running unit tests in a browser environment
 * - Demonstrating the UI without backend connection
 *
 * For production, use the Rust AutoScheduler via Tauri IPC (useScheduler hook).
 */

import type { ScheduleBlock, DailyTemplate, Task, Project } from "@/types/schedule";

// Progressive durations (minutes): warm-up → deep work → flow
const PROGRESSIVE_FOCUS = [15, 30, 45, 60, 75];
const BREAK_SHORT = 5;
const BREAK_LONG = 30;
const LONG_BREAK_EVERY = 5; // after every 5 focus sessions

/** Helpers ---------------------------------------------------------------- */

function todayAt(hhmm?: string | null, defaultHour: number = 0, defaultMinute: number = 0): Date {
	if (!hhmm) {
		const d = new Date();
		d.setHours(defaultHour, defaultMinute, 0, 0);
		return d;
	}
	const parts = hhmm.split(":").map(Number);
	const d = new Date();
	d.setHours(parts[0] ?? defaultHour, parts[1] ?? defaultMinute, 0, 0);
	return d;
}

function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() + minutes * 60_000);
}

function minutesBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 60_000);
}

let _blockId = 0;
function blockId(): string {
	return `blk-${Date.now()}-${++_blockId}`;
}

/** Interval type for gap detection */
interface Interval {
	start: Date;
	end: Date;
}

/** Find free gaps between locked blocks within a time range */
function findGaps(locked: Interval[], rangeStart: Date, rangeEnd: Date): Interval[] {
	const sorted = [...locked].sort((a, b) => a.start.getTime() - b.start.getTime());
	const gaps: Interval[] = [];
	let cursor = rangeStart;

	for (const block of sorted) {
		if (block.start > cursor) {
			gaps.push({ start: new Date(cursor), end: new Date(block.start) });
		}
		if (block.end > cursor) {
			cursor = new Date(block.end);
		}
	}
	if (cursor < rangeEnd) {
		gaps.push({ start: new Date(cursor), end: new Date(rangeEnd) });
	}
	return gaps;
}

/** Pick the best progressive focus duration that fits in `available` minutes */
function pickFocusDuration(available: number, sessionIndex: number): number | null {
	// Minimum useful block: focus + break = 20 min
	if (available < 20) return null;

	// Cycle through progressive durations
	const idx = sessionIndex % PROGRESSIVE_FOCUS.length;
	const fallback = PROGRESSIVE_FOCUS[0];
	const preferred = PROGRESSIVE_FOCUS[idx] ?? fallback;

	// If preferred + break fits, use it. Otherwise find largest that fits.
	const breakLen = (sessionIndex + 1) % LONG_BREAK_EVERY === 0 ? BREAK_LONG : BREAK_SHORT;
	if (preferred + breakLen <= available) return preferred;

	// Try smaller durations
	for (let i = idx - 1; i >= 0; i--) {
		const dur = PROGRESSIVE_FOCUS[i];
		if (dur != null && dur + breakLen <= available) return dur;
	}
	// Last resort: whatever fits
	const maxFocus = available - BREAK_SHORT;
	return maxFocus >= 15 ? maxFocus : null;
}

/** Main scheduler --------------------------------------------------------- */

export interface GenerateScheduleOptions {
	template: DailyTemplate;
	calendarEvents?: ScheduleBlock[];
	tasks?: Task[];
	/** Override "now" for testing / demo */
	now?: Date;
	/** Override maxParallelLanes from template */
	maxParallelLanes?: number;
}

/**
 * Generate a mock schedule for UI development.
 *
 * This simulates the Rust AutoScheduler behavior in pure TypeScript.
 * Use this for UI development when the Tauri backend is not available.
 */
export function generateMockSchedule(opts: GenerateScheduleOptions): ScheduleBlock[] {
	const { template, calendarEvents = [], tasks = [] } = opts;
	const now = opts.now ?? new Date();
	const lanes = Math.min(5, Math.max(1, opts.maxParallelLanes ?? template.maxParallelLanes ?? 1));

	const dayStart = todayAt(template.wakeUp);
	const dayEnd = todayAt(template.sleep);

	// 1. Build locked blocks from template fixed events
	const today = now.getDay(); // 0=Sun
	const lockedBlocks: ScheduleBlock[] = [];

	for (const ev of template.fixedEvents) {
		if (!ev.enabled || !ev.days.includes(today)) continue;
		const start = todayAt(ev.startTime);
		const end = addMinutes(start, ev.durationMinutes);
		lockedBlocks.push({
			id: `routine-${ev.id}`,
			blockType: "routine",
			startTime: start.toISOString(),
			endTime: end.toISOString(),
			locked: true,
			label: ev.name,
		});
	}

	// 2. Add calendar events
	for (const cal of calendarEvents) {
		lockedBlocks.push({ ...cal, locked: true });
	}

	// 3. Find free gaps
	const lockedIntervals: Interval[] = lockedBlocks.map((b) => ({
		start: new Date(b.startTime),
		end: new Date(b.endTime),
	}));
	const gaps = findGaps(lockedIntervals, dayStart, dayEnd);

	// 4. Fill gaps with pomodoro blocks across parallel lanes
	const pomodoroBlocks: ScheduleBlock[] = [];
	const sessionIdxPerLane = new Array(lanes).fill(0) as number[];

	// Sort active tasks by priority (highest first)
	const activeTasks = tasks
		.filter((t) => !t.completed && t.category === "active")
		.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
	let taskCursor = 0;
	let taskPomodorosUsed = 0;

	// Track per-lane cursors within each gap
	for (const gap of gaps) {
		const laneCursors = new Array(lanes)
			.fill(gap.start.getTime())
			.map((t) => new Date(t as number));

		// Round-robin across lanes until all are exhausted
		let anyProgress = true;
		while (anyProgress) {
			anyProgress = false;
			for (let lane = 0; lane < lanes; lane++) {
				const cursor = laneCursors[lane];
				if (cursor >= gap.end) continue;

				const available = minutesBetween(cursor, gap.end);
				const sessionIdx = sessionIdxPerLane[lane];
				const focusDur = pickFocusDuration(available, sessionIdx);
				if (focusDur === null) {
					laneCursors[lane] = gap.end; // mark lane as done
					continue;
				}

				anyProgress = true;
				const isLongBreak = (sessionIdx + 1) % LONG_BREAK_EVERY === 0;
				const breakDur = isLongBreak ? BREAK_LONG : BREAK_SHORT;

				// Assign task if available
				let taskId: string | undefined;
				let taskLabel: string | undefined;
				if (taskCursor < activeTasks.length) {
					const t = activeTasks[taskCursor];
					taskId = t.id;
					taskLabel = t.title;
					taskPomodorosUsed++;
					if (taskPomodorosUsed >= t.estimatedPomodoros - t.completedPomodoros) {
						taskCursor++;
						taskPomodorosUsed = 0;
					}
				}

				// Focus block
				const focusEnd = addMinutes(cursor, focusDur);
				pomodoroBlocks.push({
					id: blockId(),
					blockType: "focus",
					taskId,
					startTime: cursor.toISOString(),
					endTime: focusEnd.toISOString(),
					locked: false,
					label: taskLabel ?? `Focus L${lane + 1}-${sessionIdx + 1}`,
					lane,
				});

				// Break block (only on lane 0 to avoid cluttering)
				const breakEnd = addMinutes(focusEnd, breakDur);
				if (breakEnd <= gap.end) {
					if (lane === 0) {
						pomodoroBlocks.push({
							id: blockId(),
							blockType: "break",
							startTime: focusEnd.toISOString(),
							endTime: breakEnd.toISOString(),
							locked: false,
							label: isLongBreak ? "Long Break" : "Break",
							lane: 0,
						});
					}
					laneCursors[lane] = breakEnd;
				} else {
					laneCursors[lane] = focusEnd;
				}

				sessionIdxPerLane[lane] = sessionIdx + 1;
			}
		}
	}

	// 5. Merge and sort all blocks
	const allBlocks = [...lockedBlocks, ...pomodoroBlocks];
	allBlocks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

	return allBlocks;
}

// ─── Mock Data Factory ──────────────────────────────────────────────────────

/**
 * Create mock projects and tasks for UI development.
 *
 * These are sample tasks used for UI mockups and demonstrations.
 */
export function createMockProjects(): { projects: Project[]; tasks: Task[] } {
	const now = new Date();
	const inDays = (d: number) => {
		const date = new Date(now);
		date.setDate(date.getDate() + d);
		return date.toISOString();
	};

	// Helper to create base task with all required fields
	const baseTask = (overrides: Partial<Task>): Task =>
		({
			projectIds: [],
			groupIds: [],
			kind: "duration_only",
			requiredMinutes: null,
			fixedStartAt: null,
			fixedEndAt: null,
			windowStartAt: null,
			windowEndAt: null,
			description: undefined,
			project: null,
			updatedAt: null,
			pausedAt: null,
			elapsedMinutes: null,
			estimatedMinutes: null,
			...overrides,
		}) as Task;

	const tasks: Task[] = [
		baseTask({
			id: "t-1",
			title: "API設計書を書く",
			estimatedPomodoros: 3,
			completedPomodoros: 1,
			completed: false,
			projectId: "p-1",
			tags: ["docs"],
			priority: 90,
			category: "active",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "t-2",
			title: "認証フロー実装",
			estimatedPomodoros: 4,
			completedPomodoros: 0,
			completed: false,
			projectId: "p-1",
			tags: ["backend"],
			priority: 85,
			category: "active",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "t-3",
			title: "DBスキーマ設計",
			estimatedPomodoros: 2,
			completedPomodoros: 2,
			completed: true,
			projectId: "p-1",
			tags: ["backend"],
			priority: 80,
			category: "active",
			createdAt: now.toISOString(),
			state: "DONE",
		}),
		baseTask({
			id: "t-4",
			title: "LPデザイン案作成",
			estimatedPomodoros: 3,
			completedPomodoros: 0,
			completed: false,
			projectId: "p-2",
			tags: ["design"],
			priority: 70,
			category: "active",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "t-5",
			title: "コンポーネント実装",
			estimatedPomodoros: 5,
			completedPomodoros: 1,
			completed: false,
			projectId: "p-2",
			tags: ["frontend"],
			priority: 65,
			category: "active",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "t-6",
			title: "ユーザーテスト準備",
			estimatedPomodoros: 2,
			completedPomodoros: 0,
			completed: false,
			projectId: "p-2",
			tags: ["ux"],
			priority: 50,
			category: "active",
			createdAt: now.toISOString(),
			state: "READY",
		}),
	];

	const somedayTasks: Task[] = [
		baseTask({
			id: "s-1",
			title: "Rust勉強会の復習",
			estimatedPomodoros: 2,
			completedPomodoros: 0,
			completed: false,
			tags: ["study"],
			priority: 30,
			category: "someday",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "s-2",
			title: "部屋の本棚整理",
			estimatedPomodoros: 1,
			completedPomodoros: 0,
			completed: false,
			tags: ["life"],
			priority: 20,
			category: "someday",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "s-3",
			title: "新しいレシピを試す",
			estimatedPomodoros: 2,
			completedPomodoros: 0,
			completed: false,
			tags: ["life"],
			priority: 10,
			category: "someday",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "s-4",
			title: "OSSにコントリビュート",
			estimatedPomodoros: 3,
			completedPomodoros: 0,
			completed: false,
			tags: ["dev"],
			priority: 40,
			category: "someday",
			createdAt: now.toISOString(),
			state: "READY",
		}),
		baseTask({
			id: "s-5",
			title: "ブログ記事を書く",
			estimatedPomodoros: 2,
			completedPomodoros: 0,
			completed: false,
			tags: ["writing"],
			priority: 25,
			category: "someday",
			createdAt: now.toISOString(),
			state: "READY",
		}),
	];

	const projects: Project[] = [
		{
			id: "p-1",
			name: "SaaS APIリニューアル",
			deadline: inDays(14),
			tasks: tasks.filter((t) => t.projectId === "p-1"),
			createdAt: now.toISOString(),
		},
		{
			id: "p-2",
			name: "ランディングページ刷新",
			deadline: inDays(7),
			tasks: tasks.filter((t) => t.projectId === "p-2"),
			createdAt: now.toISOString(),
		},
	];

	return { projects, tasks: [...tasks, ...somedayTasks] };
}

/**
 * Create mock calendar events for UI development.
 *
 * These are sample events used for UI mockups and demonstrations.
 */
export function createMockCalendarEvents(): ScheduleBlock[] {
	const today = new Date();
	const at = (h: number, m: number) => {
		const d = new Date(today);
		d.setHours(h, m, 0, 0);
		return d.toISOString();
	};

	return [
		{
			id: "cal-1",
			blockType: "calendar",
			startTime: at(10, 0),
			endTime: at(11, 0),
			locked: true,
			label: "チーム定例MTG",
		},
		{
			id: "cal-2",
			blockType: "calendar",
			startTime: at(15, 0),
			endTime: at(16, 0),
			locked: true,
			label: "1on1",
		},
	];
}
