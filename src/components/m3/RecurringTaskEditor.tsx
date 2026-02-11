import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";
import type { DailyTemplate, FixedEvent } from "@/types/schedule";

type MacroCadence = "daily" | "weekly" | "monthly";
type EntryKind = "life-core" | "fixed-event" | "macro-task";
export type RecurringAction = "focus-life" | "new-event" | "new-macro";

interface MacroTask {
	id: string;
	title: string;
	cadence: MacroCadence;
	anchor: string;
	estimatedMinutes: number;
	enabled: boolean;
}

interface RecurringTaskEditorProps {
	action?: RecurringAction;
	actionNonce?: number;
}

interface Entry {
	id: string;
	kind: EntryKind;
	label: string;
	secondary?: string;
}

const LIFE_STORAGE_KEY = "pomodoroom-life-template";
const MACRO_STORAGE_KEY = "pomodoroom-macro-tasks";
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const DEFAULT_MACRO_TASKS: MacroTask[] = [
	{
		id: "macro-weekly-review",
		title: "週次レビュー",
		cadence: "weekly",
		anchor: "Fri 18:00",
		estimatedMinutes: 45,
		enabled: true,
	},
	{
		id: "macro-monthly-plan",
		title: "月次計画",
		cadence: "monthly",
		anchor: "1st 09:00",
		estimatedMinutes: 60,
		enabled: true,
	},
];

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

function createFixedEvent(): FixedEvent {
	return {
		id: `fixed-${Date.now()}`,
		name: "新しい定期予定",
		startTime: "09:00",
		durationMinutes: 30,
		days: [1, 2, 3, 4, 5],
		enabled: true,
	};
}

function createMacroTask(): MacroTask {
	return {
		id: `macro-${Date.now()}`,
		title: "新しいマクロタスク",
		cadence: "weekly",
		anchor: "Mon 09:00",
		estimatedMinutes: 30,
		enabled: true,
	};
}

function cadenceLabel(cadence: MacroCadence): string {
	switch (cadence) {
		case "daily":
			return "日次";
		case "weekly":
			return "週次";
		case "monthly":
			return "月次";
	}
}

function daysLabel(days: number[]): string {
	if (days.length === 0) return "曜日なし";
	if (days.length === 7) return "毎日";
	return days.map((d) => DAY_LABELS[d] ?? "").join(" ");
}

function timeToMinutes(hhmm: string): number {
	const [h = "0", m = "0"] = hhmm.split(":");
	return Number(h) * 60 + Number(m);
}

export function RecurringTaskEditor({ action, actionNonce }: RecurringTaskEditorProps) {
	const [lifeTemplate, setLifeTemplate] = useState<DailyTemplate>(() => {
		const saved = readStorage<DailyTemplate>(LIFE_STORAGE_KEY, DEFAULT_DAILY_TEMPLATE);
		return {
			...DEFAULT_DAILY_TEMPLATE,
			...saved,
			fixedEvents: saved.fixedEvents ?? DEFAULT_DAILY_TEMPLATE.fixedEvents,
		};
	});
	const [macroTasks, setMacroTasks] = useState<MacroTask[]>(
		() => readStorage<MacroTask[]>(MACRO_STORAGE_KEY, DEFAULT_MACRO_TASKS),
	);
	const [selectedEntryId, setSelectedEntryId] = useState<string>("life-core");

	useEffect(() => {
		writeStorage(LIFE_STORAGE_KEY, lifeTemplate);
	}, [lifeTemplate]);

	useEffect(() => {
		writeStorage(MACRO_STORAGE_KEY, macroTasks);
	}, [macroTasks]);

	const entries = useMemo(() => {
		const lifeEntries: Entry[] = lifeTemplate.fixedEvents
			.slice()
			.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
			.map((event) => ({
				id: event.id,
				kind: "fixed-event" as const,
				label: event.name || "定期予定",
				secondary: `${event.startTime} / ${daysLabel(event.days)}`,
			}));
		const macroEntries: Entry[] = macroTasks.map((task) => ({
			id: task.id,
			kind: "macro-task" as const,
			label: task.title || "マクロタスク",
			secondary: `${cadenceLabel(task.cadence)} / ${task.anchor}`,
		}));
		return { lifeEntries, macroEntries };
	}, [lifeTemplate, macroTasks]);

	useEffect(() => {
		if (selectedEntryId === "life-core") return;
		const exists =
			lifeTemplate.fixedEvents.some((event) => event.id === selectedEntryId) ||
			macroTasks.some((task) => task.id === selectedEntryId);
		if (!exists) {
			setSelectedEntryId("life-core");
		}
	}, [selectedEntryId, lifeTemplate.fixedEvents, macroTasks]);

	useEffect(() => {
		if (!action || !actionNonce) return;
		if (action === "focus-life") {
			setSelectedEntryId("life-core");
			return;
		}
		if (action === "new-event") {
			const newEvent = createFixedEvent();
			setLifeTemplate((prev) => ({ ...prev, fixedEvents: [...prev.fixedEvents, newEvent] }));
			setSelectedEntryId(newEvent.id);
			return;
		}
		if (action === "new-macro") {
			const newTask = createMacroTask();
			setMacroTasks((prev) => [...prev, newTask]);
			setSelectedEntryId(newTask.id);
		}
	}, [action, actionNonce]);

	const updateFixedEvent = (eventId: string, updater: (event: FixedEvent) => FixedEvent) => {
		setLifeTemplate((prev) => ({
			...prev,
			fixedEvents: prev.fixedEvents.map((event) => (event.id === eventId ? updater(event) : event)),
		}));
	};

	const removeFixedEvent = (eventId: string) => {
		setLifeTemplate((prev) => ({
			...prev,
			fixedEvents: prev.fixedEvents.filter((event) => event.id !== eventId),
		}));
		setSelectedEntryId("life-core");
	};

	const updateMacroTask = (taskId: string, updater: (task: MacroTask) => MacroTask) => {
		setMacroTasks((prev) => prev.map((task) => (task.id === taskId ? updater(task) : task)));
	};

	const removeMacroTask = (taskId: string) => {
		setMacroTasks((prev) => prev.filter((task) => task.id !== taskId));
		setSelectedEntryId("life-core");
	};

	const toggleDay = (event: FixedEvent, day: number): number[] => {
		return event.days.includes(day)
			? event.days.filter((d) => d !== day)
			: [...event.days, day].sort((a, b) => a - b);
	};

	const selectedFixedEvent = lifeTemplate.fixedEvents.find((event) => event.id === selectedEntryId) ?? null;
	const selectedMacroTask = macroTasks.find((task) => task.id === selectedEntryId) ?? null;

	return (
		<div className="h-full overflow-hidden p-6">
			<div className="h-full grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
				<section className="rounded-2xl bg-[var(--md-ref-color-surface-container-high)] p-3 flex flex-col min-h-0">
					<div className="px-2 pb-2">
						<h2 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">一覧</h2>
					</div>

					<div className="min-h-0 flex flex-col gap-3">
						<div
							data-testid="life-timeline-scroll"
							className="min-h-0 flex-1 overflow-y-auto scrollbar-hover"
						>
							<div className="px-2 pb-2 flex items-center justify-between">
								<h3 className="text-xs text-[var(--md-ref-color-on-surface-variant)]">生活時間</h3>
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => setSelectedEntryId("life-core")}
										className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface)] hover:text-[var(--md-ref-color-on-surface)]"
										aria-label="生活時間の基本設定"
										title="基本設定"
									>
										<Icon name="tune" size={16} />
									</button>
									<button
										type="button"
										onClick={() => {
											const newEvent = createFixedEvent();
											setLifeTemplate((prev) => ({ ...prev, fixedEvents: [...prev.fixedEvents, newEvent] }));
											setSelectedEntryId(newEvent.id);
										}}
										className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface)] hover:text-[var(--md-ref-color-on-surface)]"
										aria-label="定期予定を追加"
										title="定期予定を追加"
									>
										<Icon name="add" size={18} />
									</button>
								</div>
							</div>
							<div data-testid="life-timeline-track" className="relative pl-2 space-y-2">
								<div className="absolute left-[3.45rem] top-0 bottom-0 w-px bg-[var(--md-ref-color-outline-variant)]" />
								<div className="relative flex items-start gap-2">
									<div className="w-12 pt-1 text-xs text-[var(--md-ref-color-on-surface-variant)]">{lifeTemplate.wakeUp}</div>
									<div className="mt-3 h-2 w-2 rounded-full bg-[var(--md-ref-color-on-surface-variant)] opacity-60" />
									<button
										type="button"
										onClick={() => setSelectedEntryId("life-core")}
										className={`flex-1 rounded-lg px-2 py-2 text-left min-w-0 ${
											selectedEntryId === "life-core"
												? "bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
												: "text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container)]"
										}`}
									>
										<div className="text-sm truncate">生活時間</div>
										<div className="text-xs opacity-70 truncate">{lifeTemplate.wakeUp} - {lifeTemplate.sleep}</div>
									</button>
								</div>

								{entries.lifeEntries.map((entry) => (
									<div key={entry.id} className="relative flex items-start gap-2">
										<div className="w-12 pt-1 text-xs text-[var(--md-ref-color-on-surface-variant)]">{entry.secondary?.slice(0, 5) ?? '--:--'}</div>
										<div className="mt-3 h-2 w-2 rounded-full bg-[var(--md-ref-color-on-surface-variant)] opacity-60" />
										<button
											type="button"
											onClick={() => setSelectedEntryId(entry.id)}
											className={`flex-1 rounded-lg px-2 py-2 text-left min-w-0 ${
												selectedEntryId === entry.id
													? "bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
													: "text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container)]"
											}`}
										>
											<div className="text-sm truncate">{entry.label}</div>
											{entry.secondary && (
												<div className="text-xs opacity-70 truncate">
													{daysLabel(
														lifeTemplate.fixedEvents.find((event) => event.id === entry.id)?.days ?? [],
													)}
												</div>
											)}
										</button>
									</div>
								))}
							</div>
							{entries.lifeEntries.length === 0 && (
								<button
									type="button"
									onClick={() => {
										const newEvent = createFixedEvent();
										setLifeTemplate((prev) => ({ ...prev, fixedEvents: [...prev.fixedEvents, newEvent] }));
										setSelectedEntryId(newEvent.id);
									}}
									className="mt-2 w-full h-10 rounded-lg bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface)] inline-flex items-center justify-center"
									aria-label="定期予定を追加"
									title="定期予定を追加"
								>
									<Icon name="add" size={18} />
								</button>
							)}
						</div>

						<div data-testid="macro-time-slot" className="mt-auto shrink-0">
							<div className="px-2 pb-1 flex items-center justify-between">
								<h3 className="text-xs text-[var(--md-ref-color-on-surface-variant)]">マクロ時間</h3>
								<button
									type="button"
									onClick={() => {
										const newTask = createMacroTask();
										setMacroTasks((prev) => [...prev, newTask]);
										setSelectedEntryId(newTask.id);
									}}
									className="h-8 w-8 rounded-full inline-flex items-center justify-center text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface)] hover:text-[var(--md-ref-color-on-surface)]"
									aria-label="マクロタスクを追加"
									title="マクロタスクを追加"
								>
									<Icon name="add" size={18} />
								</button>
							</div>
							<div className="space-y-1">
								{entries.macroEntries.map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={() => setSelectedEntryId(entry.id)}
										className={`w-full rounded-lg px-2 py-2 text-left ${
											selectedEntryId === entry.id
												? "bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
												: "text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container)]"
										}`}
									>
										<div className="text-sm truncate">{entry.label}</div>
										{entry.secondary && <div className="text-xs opacity-70 truncate">{entry.secondary}</div>}
									</button>
								))}
							</div>
							{entries.macroEntries.length === 0 && (
								<button
									type="button"
									onClick={() => {
										const newTask = createMacroTask();
										setMacroTasks((prev) => [...prev, newTask]);
										setSelectedEntryId(newTask.id);
									}}
									className="mt-2 w-full h-10 rounded-lg bg-[var(--md-ref-color-surface-container)] text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface)] inline-flex items-center justify-center"
									aria-label="マクロタスクを追加"
									title="マクロタスクを追加"
								>
									<Icon name="add" size={18} />
								</button>
							)}
						</div>
					</div>
				</section>

				<section className="rounded-2xl bg-[var(--md-ref-color-surface-container-low)] p-4 min-h-0 overflow-y-auto scrollbar-hover">
					<h2 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)] mb-3">編集</h2>

					{selectedEntryId === "life-core" && (
						<div className="space-y-3">
							<h3 className="text-base font-semibold text-[var(--md-ref-color-on-surface)]">生活時間</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								<label className="flex flex-col gap-1">
									<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">起床</span>
									<input
										type="time"
										value={lifeTemplate.wakeUp}
										onChange={(e) => setLifeTemplate((prev) => ({ ...prev, wakeUp: e.target.value }))}
										className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									/>
								</label>
								<label className="flex flex-col gap-1">
									<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">就寝</span>
									<input
										type="time"
										value={lifeTemplate.sleep}
										onChange={(e) => setLifeTemplate((prev) => ({ ...prev, sleep: e.target.value }))}
										className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									/>
								</label>
							</div>
						</div>
					)}

					{selectedFixedEvent && (
						<div className="space-y-3">
							<h3 className="text-base font-semibold text-[var(--md-ref-color-on-surface)]">定期予定</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								<input
									value={selectedFixedEvent.name}
									onChange={(e) =>
										updateFixedEvent(selectedFixedEvent.id, (prev) => ({ ...prev, name: e.target.value }))
									}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									placeholder="予定名"
								/>
								<input
									type="time"
									value={selectedFixedEvent.startTime}
									onChange={(e) =>
										updateFixedEvent(selectedFixedEvent.id, (prev) => ({ ...prev, startTime: e.target.value }))
									}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
								/>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-2">
								<input
									type="number"
									min={5}
									step={5}
									value={selectedFixedEvent.durationMinutes}
									onChange={(e) =>
										updateFixedEvent(selectedFixedEvent.id, (prev) => ({
											...prev,
											durationMinutes: Math.max(5, Number(e.target.value) || 5),
										}))
									}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
								/>
								<button
									type="button"
									onClick={() => updateFixedEvent(selectedFixedEvent.id, (prev) => ({ ...prev, enabled: !prev.enabled }))}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] text-sm text-[var(--md-ref-color-on-surface)]"
								>
									{selectedFixedEvent.enabled ? "有効" : "無効"}
								</button>
							</div>
							<div className="flex gap-1">
								{DAY_LABELS.map((label, day) => (
									<button
										key={`${selectedFixedEvent.id}-${label}`}
										type="button"
										onClick={() =>
											updateFixedEvent(selectedFixedEvent.id, (prev) => ({
												...prev,
												days: toggleDay(prev, day),
											}))
										}
										className="h-8 min-w-8 px-2 rounded-lg text-xs bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
									>
										{label}
									</button>
								))}
							</div>
							<button
								type="button"
								onClick={() => removeFixedEvent(selectedFixedEvent.id)}
								className="h-9 px-3 rounded-lg bg-[var(--md-ref-color-surface)] text-sm text-[var(--md-ref-color-on-surface)] inline-flex items-center gap-2"
							>
								<Icon name="delete" size={16} />
								予定を削除
							</button>
						</div>
					)}

					{selectedMacroTask && (
						<div className="space-y-3">
							<h3 className="text-base font-semibold text-[var(--md-ref-color-on-surface)]">マクロ時間</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								<input
									value={selectedMacroTask.title}
									onChange={(e) => updateMacroTask(selectedMacroTask.id, (prev) => ({ ...prev, title: e.target.value }))}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									placeholder="タスク名"
								/>
								<select
									value={selectedMacroTask.cadence}
									onChange={(e) =>
										updateMacroTask(selectedMacroTask.id, (prev) => ({ ...prev, cadence: e.target.value as MacroCadence }))
									}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
								>
									<option value="daily">{cadenceLabel("daily")}</option>
									<option value="weekly">{cadenceLabel("weekly")}</option>
									<option value="monthly">{cadenceLabel("monthly")}</option>
								</select>
							</div>
							<div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-2">
								<input
									value={selectedMacroTask.anchor}
									onChange={(e) => updateMacroTask(selectedMacroTask.id, (prev) => ({ ...prev, anchor: e.target.value }))}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									placeholder="実行タイミング"
								/>
								<input
									type="number"
									min={5}
									step={5}
									value={selectedMacroTask.estimatedMinutes}
									onChange={(e) =>
										updateMacroTask(selectedMacroTask.id, (prev) => ({
											...prev,
											estimatedMinutes: Math.max(5, Number(e.target.value) || 5),
										}))
									}
									className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
								/>
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => updateMacroTask(selectedMacroTask.id, (prev) => ({ ...prev, enabled: !prev.enabled }))}
									className="h-9 px-3 rounded-lg bg-[var(--md-ref-color-surface)] text-sm text-[var(--md-ref-color-on-surface)]"
								>
									{selectedMacroTask.enabled ? "有効" : "無効"}
								</button>
								<button
									type="button"
									onClick={() => removeMacroTask(selectedMacroTask.id)}
									className="h-9 px-3 rounded-lg bg-[var(--md-ref-color-surface)] text-sm text-[var(--md-ref-color-on-surface)] inline-flex items-center gap-2"
								>
									<Icon name="delete" size={16} />
									マクロタスクを削除
								</button>
							</div>
						</div>
					)}
				</section>
			</div>
		</div>
	);
}

export default RecurringTaskEditor;
