import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "@/components/m3/Icon";
import { TimePicker, DateTimePicker } from "@/components/m3/DateTimePicker";
import { TextField } from "@/components/m3/TextField";
import { IconPillButton } from "@/components/m3/IconPillButton";
import { DayTimelinePanel } from "@/components/m3/DayTimelinePanel";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";
import type { DailyTemplate } from "@/types/schedule";
import type { Task } from "@/types/task";
import { useTaskStore } from "@/hooks/useTaskStore";
import { buildRecurringAutoTasks, findRecurringDuplicateTaskIds, formatLocalDateKey } from "@/utils/recurring-auto-generation";

type EntryKind = "life" | "macro";
type MacroCadence = "daily" | "weekly" | "monthly";
export type RecurringAction = "focus-life" | "new-event" | "new-macro";

// Repeat pattern types
type RepeatType = "weekdays" | "interval_days" | "nth_weekday" | "monthly_date";

interface RepeatConfig {
	type: RepeatType;
	weekdays?: number[];        // 0-6 (Sun-Sat) for weekdays type
	intervalDays?: number;      // e.g., every 3 days
	nthWeek?: number;           // 1-5 (first to fifth week)
	weekday?: number;           // 0-6 for nth_weekday type
	monthDay?: number;          // 1-31 for monthly_date type
}

// Extended FixedEvent with repeat config
interface ExtendedFixedEvent {
	id: string;
	name: string;
	startTime: string;
	durationMinutes: number;
	repeat: RepeatConfig;
	enabled: boolean;
}

interface MacroTask {
	id: string;
	title: string;
	cadence: MacroCadence;
	windowStartAt: string;
	windowEndAt: string;
	estimatedMinutes: number;
	repeat: RepeatConfig;
	enabled: boolean;
}

interface RecurringTaskEditorProps {
	action?: RecurringAction;
	actionNonce?: number;
}

const LIFE_STORAGE_KEY = "pomodoroom-life-template";
const MACRO_STORAGE_KEY = "pomodoroom-macro-tasks";
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const NTH_WEEK_LABELS = ["第1", "第2", "第3", "第4", "第5"] as const;
const recurringCreateGuard = new Set<string>();

function isTauriEnvironment(): boolean {
	if (typeof window === "undefined") return false;
	const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
	return w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined;
}

const DEFAULT_REPEAT_CONFIG: RepeatConfig = {
	type: "weekdays",
	weekdays: [1, 2, 3, 4, 5],
};

const DEFAULT_MACRO_TASKS: MacroTask[] = [
	{
		id: "macro-weekly-review",
		title: "週次レビュー",
		cadence: "weekly",
		windowStartAt: "",
		windowEndAt: "",
		estimatedMinutes: 45,
		repeat: { type: "weekdays", weekdays: [5] },
		enabled: true,
	},
	{
		id: "macro-monthly-plan",
		title: "月次計画",
		cadence: "monthly",
		windowStartAt: "",
		windowEndAt: "",
		estimatedMinutes: 60,
		repeat: { type: "monthly_date", monthDay: 1 },
		enabled: true,
	},
];

// Timeline view filter type
type TimelineFilter = "all" | "today" | "weekday";

function readStorage<T>(key: string, fallback: T): T {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeStorage<T>(key: string, value: T): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(key, JSON.stringify(value));
}

function parseTimeToDate(baseDate: Date, hhmm: string): Date {
	const [h = "0", m = "0"] = hhmm.split(":");
	const d = new Date(baseDate);
	d.setHours(Number(h), Number(m), 0, 0);
	return d;
}

// Check if a repeat config matches a given date
function matchesDate(repeat: RepeatConfig, date: Date): boolean {
	const dayOfWeek = date.getDay();
	const dayOfMonth = date.getDate();

	switch (repeat.type) {
		case "weekdays":
			return repeat.weekdays?.includes(dayOfWeek) ?? false;
		case "interval_days":
			// Simplified: check if day of year is divisible by interval
			const startOfYear = new Date(date.getFullYear(), 0, 0);
			const diff = date.getTime() - startOfYear.getTime();
			const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
			return dayOfYear % (repeat.intervalDays ?? 1) === 0;
		case "nth_weekday":
			if (repeat.weekday !== dayOfWeek) return false;
			const nthWeek = Math.ceil(dayOfMonth / 7);
			return nthWeek === (repeat.nthWeek ?? 1);
		case "monthly_date":
			return dayOfMonth === (repeat.monthDay ?? 1);
		default:
			return false;
	}
}

// Convert ExtendedFixedEvent to Task format for TaskCard
function fixedEventToTask(event: ExtendedFixedEvent, baseDate: Date): Task {
	const startTime = parseTimeToDate(baseDate, event.startTime);
	const endTime = new Date(startTime.getTime() + event.durationMinutes * 60 * 1000);
	const now = new Date().toISOString();

	return {
		id: event.id,
		title: event.name,
		description: undefined,
		kind: "fixed_event",
		state: "READY",
		tags: [],
		estimatedPomodoros: Math.ceil(event.durationMinutes / 25),
		completedPomodoros: 0,
		completed: false,
		category: "active",
		createdAt: now,
		// V2 fields
		requiredMinutes: event.durationMinutes,
		fixedStartAt: startTime.toISOString(),
		fixedEndAt: endTime.toISOString(),
		windowStartAt: null,
		windowEndAt: null,
		estimatedStartAt: null,
		elapsedMinutes: 0,
		project: null,
		group: null,
		energy: "medium",
		priority: null,
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
	};
}

// Convert MacroTask to Task format for TaskCard
function macroTaskToTask(task: MacroTask, baseDate: Date): Task | null {
	if (!task.windowStartAt || !task.windowEndAt) return null;

	const windowStart = new Date(task.windowStartAt);
	const windowEnd = new Date(task.windowEndAt);

	if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) return null;

	// Center the task in the window
	const windowCenter = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
	const taskStart = new Date(windowCenter.getTime() - (task.estimatedMinutes * 60 * 1000) / 2);
	const taskEnd = new Date(taskStart.getTime() + task.estimatedMinutes * 60 * 1000);

	// Set to display date
	const displayStart = new Date(baseDate);
	displayStart.setHours(taskStart.getHours(), taskStart.getMinutes(), 0, 0);
	const displayEnd = new Date(baseDate);
	displayEnd.setHours(taskEnd.getHours(), taskEnd.getMinutes(), 0, 0);

	const now = new Date().toISOString();

	return {
		id: task.id,
		title: task.title,
		description: undefined,
		kind: "flex_window",
		state: "READY",
		tags: [],
		estimatedPomodoros: Math.ceil(task.estimatedMinutes / 25),
		completedPomodoros: 0,
		completed: false,
		category: "active",
		createdAt: now,
		// V2 fields
		requiredMinutes: task.estimatedMinutes,
		fixedStartAt: null,
		fixedEndAt: null,
		windowStartAt: displayStart.toISOString(),
		windowEndAt: displayEnd.toISOString(),
		estimatedStartAt: null,
		elapsedMinutes: 0,
		project: null,
		group: null,
		energy: "medium",
		priority: null,
		updatedAt: now,
		completedAt: null,
		pausedAt: null,
	};
}

export function RecurringTaskEditor({ action, actionNonce }: RecurringTaskEditorProps) {
	const taskStore = useTaskStore();
	const [lifeTemplate, setLifeTemplate] = useState<DailyTemplate>(() => {
		const saved = readStorage<DailyTemplate>(LIFE_STORAGE_KEY, DEFAULT_DAILY_TEMPLATE);
		return {
			...DEFAULT_DAILY_TEMPLATE,
			...saved,
			fixedEvents: saved.fixedEvents ?? DEFAULT_DAILY_TEMPLATE.fixedEvents,
		};
	});

	// Convert legacy fixedEvents to ExtendedFixedEvent format
	const [fixedEvents, setFixedEvents] = useState<ExtendedFixedEvent[]>(() => {
		const saved = readStorage<ExtendedFixedEvent[]>("pomodoroom-extended-events", []);
		if (saved.length > 0) return saved;
		// Migrate from legacy format
		const legacy = lifeTemplate.fixedEvents || [];
		return legacy.map(event => ({
			...event,
			repeat: {
				type: "weekdays" as const,
				weekdays: event.days || [1, 2, 3, 4, 5],
			},
		}));
	});

	const [macroTasks, setMacroTasks] = useState<MacroTask[]>(
		() => readStorage<MacroTask[]>(MACRO_STORAGE_KEY, DEFAULT_MACRO_TASKS),
	);
	const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
	const [now, setNow] = useState<Date>(() => new Date());
	const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");

	// Create form states
	const [newKind, setNewKind] = useState<EntryKind>("life");
	const [newTitle, setNewTitle] = useState("");
	const [newStartTime, setNewStartTime] = useState("09:00");
	const [newDurationTime, setNewDurationTime] = useState("00:30");
	const [newCadence, setNewCadence] = useState<MacroCadence>("weekly");
	const [newWindowStartAt, setNewWindowStartAt] = useState("");
	const [newWindowEndAt, setNewWindowEndAt] = useState("");
	const [newRepeat, setNewRepeat] = useState<RepeatConfig>({ ...DEFAULT_REPEAT_CONFIG });
	const [newTags, setNewTags] = useState<string[]>([]);
	const [tagInput, setTagInput] = useState("");
	const [newMemo, setNewMemo] = useState("");
	const [advancedCollapsed, setAdvancedCollapsed] = useState(true);

	// Edit draft states
	const [editDraft, setEditDraft] = useState<{
		type: "fixed" | "macro";
		name: string;
		startTime: string;
		durationMinutes: number;
		cadence: MacroCadence;
		windowStartAt: string;
		windowEndAt: string;
		estimatedMinutes: number;
		repeat: RepeatConfig;
		enabled: boolean;
	} | null>(null);

	useEffect(() => {
		writeStorage(LIFE_STORAGE_KEY, lifeTemplate);
	}, [lifeTemplate]);

	useEffect(() => {
		writeStorage("pomodoroom-extended-events", fixedEvents);
	}, [fixedEvents]);

	useEffect(() => {
		writeStorage(MACRO_STORAGE_KEY, macroTasks);
	}, [macroTasks]);

	useEffect(() => {
		const t = window.setInterval(() => setNow(new Date()), 60_000);
		return () => window.clearInterval(t);
	}, []);

	const todayKey = useMemo(() => formatLocalDateKey(now), [now]);

	// Auto-generate today's tasks from life/macro schedules.
	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			const existingTaskLikes: Array<{ description?: string }> = taskStore.tasks.map((task) => ({
				description: task.description,
			}));

			// Startup race fix: pull persisted tasks directly from DB before deciding auto-generation.
			if (isTauriEnvironment()) {
				try {
					const persisted = await invoke<Array<Record<string, unknown>>>("cmd_task_list");
					for (const row of persisted) {
						const desc = typeof row.description === "string" ? row.description : undefined;
						existingTaskLikes.push({ description: desc });
					}
				} catch (error) {
					console.error("[RecurringTaskEditor] Failed to load persisted tasks for recurring dedupe:", error);
				}
			}

			// Seed guard from all known tasks (memory + persisted).
			for (const task of existingTaskLikes) {
				const marker = task.description?.match(/\[recurring:[^\]]+\]/)?.[0];
				if (marker) recurringCreateGuard.add(marker);
			}

			const drafts = buildRecurringAutoTasks({
				date: now,
				lifeEntries: fixedEvents,
				macroEntries: macroTasks,
				existingTasks: existingTaskLikes,
			});
			if (drafts.length === 0 || cancelled) return;
			for (const draft of drafts) {
				const marker = draft.description?.match(/\[recurring:[^\]]+\]/)?.[0];
				if (marker) {
					if (recurringCreateGuard.has(marker)) continue;
					recurringCreateGuard.add(marker);
				}
				taskStore.createTask(draft);
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [todayKey, fixedEvents, macroTasks, taskStore.tasks, taskStore.createTask]);

	// Cleanup duplicated recurring-generated tasks (same recurring marker).
	useEffect(() => {
		const duplicateIds = findRecurringDuplicateTaskIds(taskStore.tasks);
		if (duplicateIds.length === 0) return;
		for (const id of duplicateIds) {
			taskStore.deleteTask(id);
		}
	}, [taskStore.tasks, taskStore.deleteTask]);

	// Generate timeline tasks based on filter
	const timelineTasks = useMemo<Task[]>(() => {
		const base = new Date(now);
		base.setHours(0, 0, 0, 0);

		const tasks: Task[] = [];

		// Filter fixed events
		fixedEvents
			.filter((event) => event.enabled)
			.filter((event) => {
				if (timelineFilter === "all") return true;
				if (timelineFilter === "today") return matchesDate(event.repeat, now);
				if (timelineFilter === "weekday") return event.repeat.type === "weekdays";
				return true;
			})
			.forEach((event) => {
				tasks.push(fixedEventToTask(event, base));
			});

		// Add macro tasks as tasks (centered in window)
		macroTasks
			.filter((task) => task.enabled)
			.filter((task) => {
				if (timelineFilter === "all") return true;
				if (timelineFilter === "today") {
					// For macro tasks, show based on cadence
					if (task.cadence === "daily") return true;
					if (task.cadence === "weekly") return matchesDate(task.repeat, now);
					if (task.cadence === "monthly") return matchesDate(task.repeat, now);
					return true;
				}
				if (timelineFilter === "weekday") return task.repeat.type === "weekdays";
				return true;
			})
			.forEach((task) => {
				const converted = macroTaskToTask(task, base);
				if (converted) tasks.push(converted);
			});

		return tasks.sort((a, b) => {
			const aTime = a.fixedStartAt || a.windowStartAt || "";
			const bTime = b.fixedStartAt || b.windowStartAt || "";
			return new Date(aTime).getTime() - new Date(bTime).getTime();
		});
	}, [fixedEvents, macroTasks, now, timelineFilter]);

	useEffect(() => {
		if (selectedEntryId === null) return;
		const exists =
			fixedEvents.some((event) => event.id === selectedEntryId) ||
			macroTasks.some((task) => task.id === selectedEntryId) ||
			selectedEntryId === "life-core";
		if (!exists) {
			setSelectedEntryId(null);
		}
	}, [selectedEntryId, fixedEvents, macroTasks]);

	// Load selected item into edit draft
	useEffect(() => {
		if (selectedEntryId === null || selectedEntryId === "life-core") {
			setEditDraft(null);
			return;
		}

		const fixedEvent = fixedEvents.find((e) => e.id === selectedEntryId);
		if (fixedEvent) {
			setEditDraft({
				type: "fixed",
				name: fixedEvent.name,
				startTime: fixedEvent.startTime,
				durationMinutes: fixedEvent.durationMinutes,
				cadence: "weekly",
				windowStartAt: "",
				windowEndAt: "",
				estimatedMinutes: fixedEvent.durationMinutes,
				repeat: { ...fixedEvent.repeat },
				enabled: fixedEvent.enabled,
			});
			return;
		}

		const macroTask = macroTasks.find((t) => t.id === selectedEntryId);
		if (macroTask) {
			setEditDraft({
				type: "macro",
				name: macroTask.title,
				startTime: "09:00",
				durationMinutes: macroTask.estimatedMinutes,
				cadence: macroTask.cadence,
				windowStartAt: macroTask.windowStartAt,
				windowEndAt: macroTask.windowEndAt,
				estimatedMinutes: macroTask.estimatedMinutes,
				repeat: { ...macroTask.repeat },
				enabled: macroTask.enabled,
			});
			return;
		}

		setEditDraft(null);
	}, [selectedEntryId, fixedEvents, macroTasks]);

	useEffect(() => {
		if (!action || !actionNonce) return;
		if (action === "focus-life") {
			setSelectedEntryId(null);
			return;
		}
		if (action === "new-event") {
			setNewKind("life");
			return;
		}
		if (action === "new-macro") {
			setNewKind("macro");
		}
	}, [action, actionNonce]);

	// Update functions
	const updateFixedEvent = (eventId: string, updater: (event: ExtendedFixedEvent) => ExtendedFixedEvent) => {
		setFixedEvents((prev) => prev.map((event) => (event.id === eventId ? updater(event) : event)));
	};

	const removeFixedEvent = (eventId: string) => {
		setFixedEvents((prev) => prev.filter((event) => event.id !== eventId));
		setSelectedEntryId(null);
	};

	const updateMacroTask = (taskId: string, updater: (task: MacroTask) => MacroTask) => {
		setMacroTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)));
	};

	const removeMacroTask = (taskId: string) => {
		setMacroTasks((prev) => prev.filter((task) => task.id !== taskId));
		setSelectedEntryId(null);
	};

	// Save edit draft to actual data
	const handleSaveEdit = () => {
		if (!editDraft || !selectedEntryId) return;

		if (editDraft.type === "fixed") {
			updateFixedEvent(selectedEntryId, (prev) => ({
				...prev,
				name: editDraft.name,
				startTime: editDraft.startTime,
				durationMinutes: editDraft.durationMinutes,
				repeat: editDraft.repeat,
				enabled: editDraft.enabled,
			}));
		} else {
			updateMacroTask(selectedEntryId, (prev) => ({
				...prev,
				title: editDraft.name,
				cadence: editDraft.cadence,
				windowStartAt: editDraft.windowStartAt,
				windowEndAt: editDraft.windowEndAt,
				estimatedMinutes: editDraft.estimatedMinutes,
				repeat: editDraft.repeat,
				enabled: editDraft.enabled,
			}));
		}

		setSelectedEntryId(null);
		setEditDraft(null);
	};

	// Cancel edit and close panel
	const handleCancelEdit = () => {
		setSelectedEntryId(null);
		setEditDraft(null);
	};

	// Check if there are unsaved changes
	const hasChanges = useMemo(() => {
		if (!editDraft || !selectedEntryId) return false;

		if (editDraft.type === "fixed") {
			const original = fixedEvents.find((e) => e.id === selectedEntryId);
			if (!original) return false;
			return (
				original.name !== editDraft.name ||
				original.startTime !== editDraft.startTime ||
				original.durationMinutes !== editDraft.durationMinutes ||
				JSON.stringify(original.repeat) !== JSON.stringify(editDraft.repeat) ||
				original.enabled !== editDraft.enabled
			);
		} else {
			const original = macroTasks.find((t) => t.id === selectedEntryId);
			if (!original) return false;
			return (
				original.title !== editDraft.name ||
				original.cadence !== editDraft.cadence ||
				original.windowStartAt !== editDraft.windowStartAt ||
				original.windowEndAt !== editDraft.windowEndAt ||
				original.estimatedMinutes !== editDraft.estimatedMinutes ||
				JSON.stringify(original.repeat) !== JSON.stringify(editDraft.repeat) ||
				original.enabled !== editDraft.enabled
			);
		}
	}, [editDraft, selectedEntryId, fixedEvents, macroTasks]);

	// Create new entry
	const handleCreate = () => {
		if (!newTitle.trim()) return;

		const [hours, mins] = newDurationTime.split(":").map(Number);
		const durationMinutes = (hours || 0) * 60 + (mins || 0);

		if (newKind === "life") {
			const newEvent: ExtendedFixedEvent = {
				id: `fixed-${Date.now()}`,
				name: newTitle.trim(),
				startTime: newStartTime,
				durationMinutes: durationMinutes || 30,
				repeat: { ...newRepeat },
				enabled: true,
			};
			setFixedEvents((prev) => [...prev, newEvent]);
		} else {
			const newTask: MacroTask = {
				id: `macro-${Date.now()}`,
				title: newTitle.trim(),
				cadence: newCadence,
				windowStartAt: newWindowStartAt,
				windowEndAt: newWindowEndAt,
				estimatedMinutes: durationMinutes || 30,
				repeat: { ...newRepeat },
				enabled: true,
			};
			setMacroTasks((prev) => [...prev, newTask]);
		}

		// Reset form
		setNewTitle("");
		setNewStartTime("09:00");
		setNewDurationTime("00:30");
		setNewCadence("weekly");
		setNewWindowStartAt("");
		setNewWindowEndAt("");
		setNewRepeat({ ...DEFAULT_REPEAT_CONFIG });
		setNewTags([]);
		setTagInput("");
		setNewMemo("");
	};

	const handleClear = () => {
		setNewTitle("");
		setNewStartTime("09:00");
		setNewDurationTime("00:30");
		setNewCadence("weekly");
		setNewWindowStartAt("");
		setNewWindowEndAt("");
		setNewRepeat({ ...DEFAULT_REPEAT_CONFIG });
		setNewTags([]);
		setTagInput("");
		setNewMemo("");
	};

	// Render repeat config selector
	const renderRepeatConfig = (config: RepeatConfig, onChange: (config: RepeatConfig) => void) => {
		return (
			<div className="space-y-3">
				{/* Repeat type selector */}
				<div>
					<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
						繰り返し方式
					</label>
					<div className="grid grid-cols-2 gap-2">
						{[
							{ value: "weekdays", label: "曜日選択" },
							{ value: "interval_days", label: "◯日ごと" },
							{ value: "nth_weekday", label: "第N週X曜日" },
							{ value: "monthly_date", label: "毎月X日" },
						].map((option) => {
							const isSelected = config.type === option.value;
							return (
								<button
									key={option.value}
									type="button"
									onClick={() => onChange({ type: option.value as RepeatType })}
									className={`
										no-pill h-9 px-3 rounded-lg text-xs font-medium
										transition-all duration-150
										${isSelected
											? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
											: '!bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
										}
									`.trim()}
								>
									{option.label}
								</button>
							);
						})}
					</div>
				</div>

				{/* Weekdays selector */}
				{config.type === "weekdays" && (
					<div>
						<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
							曜日
						</label>
						<div className="flex gap-1">
							{DAY_LABELS.map((label, day) => {
								const isSelected = config.weekdays?.includes(day) ?? false;
								return (
									<button
										key={day}
										type="button"
										onClick={() => onChange({
											...config,
											weekdays: (config.weekdays || []).includes(day)
												? config.weekdays?.filter((d) => d !== day)
												: [...(config.weekdays || []), day].sort((a, b) => a - b),
										})}
										className={`
											no-pill h-9 min-w-9 flex-1 rounded-lg text-xs font-medium
											transition-all duration-150
											${isSelected
												? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
												: '!bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
											}
										`.trim()}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>
				)}

				{/* Interval days */}
				{config.type === "interval_days" && (
					<div className="flex items-center gap-2">
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">毎</span>
						<input
							type="number"
							min={1}
							max={365}
							value={config.intervalDays ?? 1}
							onChange={(e) => onChange({ ...config, intervalDays: Math.max(1, Number(e.target.value) || 1) })}
							className="w-16 h-9 px-2 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-transparent text-sm text-[var(--md-ref-color-on-surface)] text-center"
						/>
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">日ごと</span>
					</div>
				)}

				{/* Nth weekday */}
				{config.type === "nth_weekday" && (
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
								週
							</label>
							<select
								value={config.nthWeek ?? 1}
								onChange={(e) => onChange({ ...config, nthWeek: Number(e.target.value) })}
								className="w-full h-10 px-3 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-transparent text-sm text-[var(--md-ref-color-on-surface)]"
							>
								{NTH_WEEK_LABELS.map((label, index) => (
									<option key={index} value={index + 1}>{label}</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
								曜日
							</label>
							<select
								value={config.weekday ?? 0}
								onChange={(e) => onChange({ ...config, weekday: Number(e.target.value) })}
								className="w-full h-10 px-3 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-transparent text-sm text-[var(--md-ref-color-on-surface)]"
							>
								{DAY_LABELS.map((label, index) => (
									<option key={index} value={index}>{label}曜日</option>
								))}
							</select>
						</div>
					</div>
				)}

				{/* Monthly date */}
				{config.type === "monthly_date" && (
					<div className="flex items-center gap-2">
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">毎月</span>
						<input
							type="number"
							min={1}
							max={31}
							value={config.monthDay ?? 1}
							onChange={(e) => onChange({ ...config, monthDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
							className="w-16 h-9 px-2 rounded-lg border border-[var(--md-ref-color-outline-variant)] bg-transparent text-sm text-[var(--md-ref-color-on-surface)] text-center"
						/>
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">日</span>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="h-full overflow-hidden p-6">
			<div className="h-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-4">
				{/* Left: Timeline (larger) */}
				<section className="flex-1 order-2 lg:order-1 flex flex-col min-h-0">
					{/* Controls row: Filter tabs + Settings button (no wrap) */}
					<div className="pb-2 flex items-center justify-between gap-3 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
						{/* Filter tabs */}
						<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden flex-shrink-0">
							{[
								{ value: "all" as TimelineFilter, label: "全て" },
								{ value: "today" as TimelineFilter, label: "今日" },
								{ value: "weekday" as TimelineFilter, label: "曜日" },
							].map((option, index) => {
								const isSelected = timelineFilter === option.value;
								const isFirst = index === 0;
								const isLast = index === 2;
								return (
									<button
										key={option.value}
										type="button"
										onClick={() => setTimelineFilter(option.value)}
										className={`
											no-pill relative h-8 px-3 text-xs font-medium
											flex items-center justify-center whitespace-nowrap
											transition-all duration-150
											${isFirst ? 'rounded-l-full' : ''}
											${isLast ? 'rounded-r-full' : ''}
											${!isFirst ? 'border-l border-[var(--md-ref-color-outline-variant)]' : ''}
											${isSelected
												? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
												: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container)]'
											}
										`.trim()}
									>
										{option.label}
									</button>
								);
							})}
						</div>

						{/* Settings button */}
						<div className="flex items-center gap-1 flex-shrink-0">
							<IconPillButton
								icon="tune"
								label="基本設定"
								size="sm"
								onClick={() => setSelectedEntryId("life-core")}
							/>
						</div>
					</div>

					{/* Timeline Panel */}
					<DayTimelinePanel
						tasks={timelineTasks}
						hourHeight={60}
						timeLabelWidth={48}
						minCardHeight={50}
						laneGap={4}
						onTaskSelect={(task) => setSelectedEntryId(task.id)}
						testId="life-timeline-track"
					/>
				</section>

				{/* Right: Create/Edit panel (360px) */}
				<section className="w-full lg:w-[360px] order-1 lg:order-2 space-y-3 min-h-0 overflow-y-auto scrollbar-hover">
					{selectedEntryId === null ? (
						/* Create Panel */
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container-low)]">
							{/* Type selector - M3 Segmented Button */}
							<div className="mb-3">
								<div
									className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden"
									role="radiogroup"
									aria-label="Entry type"
								>
									{[
										{ value: "life", label: "生活時間" },
										{ value: "macro", label: "マクロ時間" },
									].map((option, index) => {
										const isSelected = newKind === option.value;
										const isFirst = index === 0;
										const isLast = index === 1;
										return (
											<button
												key={option.value}
												type="button"
												role="radio"
												aria-checked={isSelected}
												onClick={() => setNewKind(option.value as EntryKind)}
												className={`
													no-pill relative h-10 px-4 text-sm font-medium
													flex items-center justify-center
													transition-all duration-150
													${isFirst ? 'rounded-l-full' : ''}
													${isLast ? 'rounded-r-full' : ''}
													${!isFirst ? 'border-l border-[var(--md-ref-color-outline-variant)]' : ''}
													${isSelected
														? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
														: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
													}
												`.trim()}
											>
												{option.label}
											</button>
										);
									})}
								</div>
							</div>

							{/* Title */}
							<div className="mb-3">
								<TextField
									label="タイトル"
									value={newTitle}
									onChange={setNewTitle}
									placeholder={newKind === "life" ? "予定名を入力..." : "タスク名を入力..."}
									variant="underlined"
								/>
							</div>

							{/* Life time: Start time + Duration */}
							{newKind === "life" && (
								<>
									<div className="mb-3">
										<TimePicker
											label="開始時刻"
											value={newStartTime}
											onChange={setNewStartTime}
											variant="underlined"
										/>
									</div>
									<div className="mb-3">
										<TimePicker
											label="所要時間"
											value={newDurationTime}
											onChange={setNewDurationTime}
											variant="underlined"
										/>
									</div>
								</>
							)}

							{/* Macro time: Cadence + Window + Duration */}
							{newKind === "macro" && (
								<>
									<div className="mb-3">
										<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
											周期
										</label>
										<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden">
											{[
												{ value: "daily", label: "日次" },
												{ value: "weekly", label: "週次" },
												{ value: "monthly", label: "月次" },
											].map((option, index) => {
												const isSelected = newCadence === option.value;
												const isFirst = index === 0;
												const isLast = index === 2;
												return (
													<button
														key={option.value}
														type="button"
														onClick={() => setNewCadence(option.value as MacroCadence)}
														className={`
															no-pill relative h-9 px-3 text-xs font-medium
															flex items-center justify-center
															transition-all duration-150
															${isFirst ? 'rounded-l-full' : ''}
															${isLast ? 'rounded-r-full' : ''}
															${!isFirst ? 'border-l border-[var(--md-ref-color-outline-variant)]' : ''}
															${isSelected
																? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
																: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
															}
														`.trim()}
													>
														{option.label}
													</button>
												);
											})}
										</div>
									</div>

									<div className="grid grid-cols-2 gap-3 mb-3">
										<DateTimePicker
											label="Window start"
											value={newWindowStartAt}
											onChange={setNewWindowStartAt}
											variant="underlined"
										/>
										<DateTimePicker
											label="Window end"
											value={newWindowEndAt}
											onChange={setNewWindowEndAt}
											variant="underlined"
										/>
									</div>

									<div className="mb-3">
										<TimePicker
											label="Required time"
											value={newDurationTime}
											onChange={setNewDurationTime}
											variant="underlined"
										/>
									</div>
								</>
							)}

							{/* Repeat config */}
							<div className="mb-3">
								{renderRepeatConfig(newRepeat, setNewRepeat)}
							</div>

							{/* Advanced settings accordion */}
							<div className="mb-3 border border-[var(--md-ref-color-outline-variant)] rounded-lg overflow-hidden">
								<button
									type="button"
									onClick={() => setAdvancedCollapsed(!advancedCollapsed)}
									className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container)] w-full px-4 py-3 flex items-center justify-between transition-colors"
								>
									<span className="text-sm font-medium text-[var(--md-ref-color-on-surface)]">詳細設定</span>
									<Icon name={advancedCollapsed ? "expand_more" : "expand_less"} size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
								</button>
								{!advancedCollapsed && (
									<div className="p-4 space-y-4 border-t border-[var(--md-ref-color-outline-variant)]">
										{/* Tags */}
										<div>
											<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
												Tags
											</label>
											<div className="flex flex-wrap items-center gap-2 min-h-[40px] px-0 py-2 border-b border-[var(--md-ref-color-outline-variant)] focus-within:border-[var(--md-ref-color-primary)] transition-colors">
												{newTags.map((tag, index) => (
													<span
														key={`${tag}-${index}`}
														className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--md-ref-color-surface-container-high)] text-sm text-[var(--md-ref-color-on-surface)]"
													>
														{tag}
														<button
															type="button"
															onClick={() => setNewTags(newTags.filter((_, i) => i !== index))}
															className="no-pill !bg-transparent hover:!bg-[var(--md-ref-color-surface-container-highest)] flex items-center justify-center w-4 h-4 rounded-full text-[var(--md-ref-color-on-surface-variant)]"
															aria-label={`Remove ${tag}`}
														>
															<Icon name="close" size={14} />
														</button>
													</span>
												))}
												<input
													type="text"
													value={tagInput}
													onChange={(e) => setTagInput(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === 'Enter' && tagInput.trim()) {
															e.preventDefault();
															setNewTags([...newTags, tagInput.trim()]);
															setTagInput('');
														} else if (e.key === 'Backspace' && !tagInput && newTags.length > 0) {
															setNewTags(newTags.slice(0, -1));
														}
													}}
													placeholder={newTags.length === 0 ? 'Enterで追加...' : ''}
													className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--md-ref-color-on-surface)] placeholder:text-[var(--md-ref-color-on-surface-variant)]"
												/>
											</div>
										</div>

										{/* Memo */}
										<div>
											<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-1">
												メモ
											</label>
											<textarea
												value={newMemo}
												onChange={(e) => setNewMemo(e.target.value)}
												placeholder="説明を追加..."
												rows={2}
												className="
													w-full px-3 py-2
													bg-transparent
													border-b border-[var(--md-ref-color-outline-variant)]
													focus:border-[var(--md-ref-color-primary)]
													outline-none
													text-sm text-[var(--md-ref-color-on-surface)]
													placeholder:text-[var(--md-ref-color-on-surface-variant)]
													resize-none
													transition-colors duration-150
												"
											/>
										</div>
									</div>
								)}
							</div>

							{/* Action buttons */}
							<div className="flex justify-between gap-2">
								<button
									type="button"
									onClick={handleClear}
									className="h-10 px-6 text-sm font-medium transition-colors rounded-full"
									style={{
										backgroundColor: "var(--md-ref-color-surface-container)",
										color: "var(--md-ref-color-on-surface)",
										border: "1px solid var(--md-ref-color-outline-variant)",
									}}
								>
									クリア
								</button>
								<button
									type="button"
									onClick={handleCreate}
									className="h-10 px-6 text-sm font-medium transition-colors rounded-full"
									style={{
										backgroundColor: "var(--md-ref-color-primary)",
										color: "var(--md-ref-color-on-primary)",
									}}
								>
									追加
								</button>
							</div>
						</div>
					) : selectedEntryId === "life-core" ? (
						/* Life core settings */
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container-low)]">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">基本設定</h3>
								<button
									type="button"
									onClick={() => setSelectedEntryId(null)}
									className="p-1 rounded-lg hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
								>
									<Icon name="close" size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
								</button>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<TimePicker
									label="起床"
									value={lifeTemplate.wakeUp}
									onChange={(v) => setLifeTemplate((prev) => ({ ...prev, wakeUp: v }))}
									variant="underlined"
								/>
								<TimePicker
									label="就寝"
									value={lifeTemplate.sleep}
									onChange={(v) => setLifeTemplate((prev) => ({ ...prev, sleep: v }))}
									variant="underlined"
								/>
							</div>
						</div>
					) : editDraft?.type === "fixed" ? (
						/* Edit Fixed Event */
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container-low)]">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">定期予定を編集</h3>
								<button
									type="button"
									onClick={handleCancelEdit}
									className="p-1 rounded-lg hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
								>
									<Icon name="close" size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
								</button>
							</div>

							<div className="space-y-3">
								<TextField
									label="タイトル"
									value={editDraft.name}
									onChange={(v) => setEditDraft((prev) => prev ? { ...prev, name: v } : prev)}
									variant="underlined"
								/>

								<div className="grid grid-cols-2 gap-3">
									<TimePicker
										label="開始時刻"
										value={editDraft.startTime}
										onChange={(v) => setEditDraft((prev) => prev ? { ...prev, startTime: v } : prev)}
										variant="underlined"
									/>
									<input
										type="number"
										min={5}
										step={5}
										value={editDraft.durationMinutes}
										onChange={(e) =>
											setEditDraft((prev) => prev ? { ...prev, durationMinutes: Math.max(5, Number(e.target.value) || 5) } : prev)
										}
										className="h-10 px-3 rounded-lg border-b border-[var(--md-ref-color-outline-variant)] bg-transparent text-sm text-[var(--md-ref-color-on-surface)] focus:border-[var(--md-ref-color-primary)] outline-none"
										placeholder="所要時間(分)"
									/>
								</div>

								{/* Repeat config */}
								{renderRepeatConfig(editDraft.repeat, (config) =>
									setEditDraft((prev) => prev ? { ...prev, repeat: config } : prev)
								)}

								{/* Enable/Disable */}
								<button
									type="button"
									onClick={() => setEditDraft((prev) => prev ? { ...prev, enabled: !prev.enabled } : prev)}
									className={`
										no-pill w-full h-10 rounded-lg text-sm font-medium transition-colors
										${editDraft.enabled
											? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
											: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
										}
									`}
								>
									{editDraft.enabled ? "✓ 有効" : "無効"}
								</button>

								{/* Action buttons */}
								<div className="flex gap-2 pt-2">
									<button
										type="button"
										onClick={handleCancelEdit}
										className="no-pill flex-1 h-10 rounded-lg border border-[var(--md-ref-color-outline-variant)] text-[var(--md-ref-color-on-surface)] text-sm font-medium transition-colors hover:bg-[var(--md-ref-color-surface-container)]"
									>
										キャンセル
									</button>
									<button
										type="button"
										onClick={handleSaveEdit}
										disabled={!hasChanges}
										className={`
											no-pill flex-1 h-10 rounded-lg text-sm font-medium transition-colors
											${hasChanges
												? 'bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] hover:opacity-90'
												: 'bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] cursor-not-allowed'
											}
										`}
									>
										更新
									</button>
								</div>

								{/* Delete */}
								<button
									type="button"
									onClick={() => {
										if (selectedEntryId) removeFixedEvent(selectedEntryId);
									}}
									className="no-pill w-full h-10 rounded-lg bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-on-error-container)] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
								>
									<Icon name="delete" size={18} />
									予定を削除
								</button>
							</div>
						</div>
					) : editDraft?.type === "macro" ? (
						/* Edit Macro Task */
						<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 bg-[var(--md-ref-color-surface-container-low)]">
							<div className="flex items-center justify-between mb-3">
								<h3 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">マクロタスクを編集</h3>
								<button
									type="button"
									onClick={handleCancelEdit}
									className="p-1 rounded-lg hover:bg-[var(--md-ref-color-surface-container)] transition-colors"
								>
									<Icon name="close" size={20} className="text-[var(--md-ref-color-on-surface-variant)]" />
								</button>
							</div>

							<div className="space-y-3">
								<TextField
									label="タイトル"
									value={editDraft.name}
									onChange={(v) => setEditDraft((prev) => prev ? { ...prev, name: v } : prev)}
									variant="underlined"
								/>

								<div className="mb-3">
									<label className="block text-xs font-medium text-[var(--md-ref-color-on-surface-variant)] mb-2">
										周期
									</label>
									<div className="inline-flex rounded-full border border-[var(--md-ref-color-outline-variant)] overflow-hidden">
										{[
											{ value: "daily", label: "日次" },
											{ value: "weekly", label: "週次" },
											{ value: "monthly", label: "月次" },
										].map((option, index) => {
											const isSelected = editDraft.cadence === option.value;
											const isFirst = index === 0;
											const isLast = index === 2;
											return (
												<button
													key={option.value}
													type="button"
													onClick={() => setEditDraft((prev) => prev ? { ...prev, cadence: option.value as MacroCadence } : prev)}
													className={`
														no-pill relative h-9 px-3 text-xs font-medium
														flex items-center justify-center
														transition-all duration-150
														${isFirst ? 'rounded-l-full' : ''}
														${isLast ? 'rounded-r-full' : ''}
														${!isFirst ? 'border-l border-[var(--md-ref-color-outline-variant)]' : ''}
														${isSelected
															? '!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]'
															: '!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]'
														}
													`.trim()}
												>
													{option.label}
												</button>
											);
										})}
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3 mb-3">
									<DateTimePicker
										label="Window start"
										value={editDraft.windowStartAt}
										onChange={(v) => setEditDraft((prev) => prev ? { ...prev, windowStartAt: v } : prev)}
										variant="underlined"
									/>
									<DateTimePicker
										label="Window end"
										value={editDraft.windowEndAt}
										onChange={(v) => setEditDraft((prev) => prev ? { ...prev, windowEndAt: v } : prev)}
										variant="underlined"
									/>
								</div>

								<div className="mb-3">
									<TimePicker
										label="Required time"
										value={`${String(Math.floor(editDraft.estimatedMinutes / 60)).padStart(2, '0')}:${String(editDraft.estimatedMinutes % 60).padStart(2, '0')}`}
										onChange={(v) => {
											if (v) {
												const [hours, mins] = v.split(':').map(Number);
												const totalMinutes = (hours || 0) * 60 + (mins || 0);
												setEditDraft((prev) => prev ? { ...prev, estimatedMinutes: totalMinutes } : prev);
											}
										}}
										variant="underlined"
									/>
								</div>

								{/* Repeat config */}
								{renderRepeatConfig(editDraft.repeat, (config) =>
									setEditDraft((prev) => prev ? { ...prev, repeat: config } : prev)
								)}

								{/* Enable/Disable */}
								<button
									type="button"
									onClick={() => setEditDraft((prev) => prev ? { ...prev, enabled: !prev.enabled } : prev)}
									className={`
										no-pill w-full h-10 rounded-lg text-sm font-medium transition-colors
										${editDraft.enabled
											? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
											: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
										}
									`}
								>
									{editDraft.enabled ? "✓ 有効" : "無効"}
								</button>

								{/* Action buttons */}
								<div className="flex gap-2 pt-2">
									<button
										type="button"
										onClick={handleCancelEdit}
										className="no-pill flex-1 h-10 rounded-lg border border-[var(--md-ref-color-outline-variant)] text-[var(--md-ref-color-on-surface)] text-sm font-medium transition-colors hover:bg-[var(--md-ref-color-surface-container)]"
									>
										キャンセル
									</button>
									<button
										type="button"
										onClick={handleSaveEdit}
										disabled={!hasChanges}
										className={`
											no-pill flex-1 h-10 rounded-lg text-sm font-medium transition-colors
											${hasChanges
												? 'bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] hover:opacity-90'
												: 'bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface-variant)] cursor-not-allowed'
											}
										`}
									>
										更新
									</button>
								</div>

								{/* Delete */}
								<button
									type="button"
									onClick={() => {
										if (selectedEntryId) removeMacroTask(selectedEntryId);
									}}
									className="no-pill w-full h-10 rounded-lg bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-on-error-container)] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
								>
									<Icon name="delete" size={18} />
									マクロタスクを削除
								</button>
							</div>
						</div>
					) : null}
				</section>
			</div>
		</div>
	);
}

export default RecurringTaskEditor;
