import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/m3/Icon";
import { Timeline } from "@/components/m3/Timeline";
import { TimePicker } from "@/components/m3/DateTimePicker";
import { Select } from "@/components/m3/Select";
import { IconPillButton } from "@/components/m3/IconPillButton";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";
import type { DailyTemplate, FixedEvent, ScheduleBlock } from "@/types/schedule";

type MacroCadence = "daily" | "weekly" | "monthly";
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

function parseTimeToDate(baseDate: Date, hhmm: string): Date {
	const [h = "0", m = "0"] = hhmm.split(":");
	const d = new Date(baseDate);
	d.setHours(Number(h), Number(m), 0, 0);
	return d;
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
	const [now, setNow] = useState<Date>(() => new Date());

	useEffect(() => {
		writeStorage(LIFE_STORAGE_KEY, lifeTemplate);
	}, [lifeTemplate]);

	useEffect(() => {
		writeStorage(MACRO_STORAGE_KEY, macroTasks);
	}, [macroTasks]);

	useEffect(() => {
		const t = window.setInterval(() => setNow(new Date()), 60_000);
		return () => window.clearInterval(t);
	}, []);

	const macroEntries = useMemo(() => {
		return macroTasks.map((task) => ({
			id: task.id,
			label: task.title || "マクロタスク",
			secondary: `${cadenceLabel(task.cadence)} / ${task.anchor}`,
		}));
	}, [macroTasks]);

	const lifeTimelineBlocks = useMemo<ScheduleBlock[]>(() => {
		const base = new Date();
		base.setHours(0, 0, 0, 0);

		return lifeTemplate.fixedEvents
			.filter((event) => event.enabled)
			.map((event) => {
				const start = parseTimeToDate(base, event.startTime);
				const end = new Date(start.getTime() + event.durationMinutes * 60 * 1000);
				return {
					id: event.id,
					blockType: "routine" as const,
					startTime: start.toISOString(),
					endTime: end.toISOString(),
					locked: false,
					label: event.name || "定期予定",
				};
			})
			.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
	}, [lifeTemplate.fixedEvents]);

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
						<div data-testid="life-timeline-scroll" className="min-h-0 flex-1 flex flex-col">
							<div className="px-2 pb-2 flex items-center justify-between">
								<h3 className="text-xs text-[var(--md-ref-color-on-surface-variant)]">生活時間 24H</h3>
								<div className="flex items-center gap-1">
									<IconPillButton
										icon="tune"
										label="基本設定"
										size="sm"
										onClick={() => setSelectedEntryId("life-core")}
									/>
									<IconPillButton
										icon="add"
										label="予定追加"
										size="sm"
										onClick={() => {
											const newEvent = createFixedEvent();
											setLifeTemplate((prev) => ({ ...prev, fixedEvents: [...prev.fixedEvents, newEvent] }));
											setSelectedEntryId(newEvent.id);
										}}
									/>
								</div>
							</div>
							<div data-testid="life-timeline-track" className="min-h-0 flex-1">
								<Timeline
									blocks={lifeTimelineBlocks}
									date={now}
									currentTime={now}
									startHour={0}
									endHour={24}
									showCurrentTimeIndicator={true}
									onBlockClick={(block) => setSelectedEntryId(block.id)}
									enableDragReschedule={false}
									hourHeight={44}
									className="h-full"
								/>
							</div>
							{lifeTimelineBlocks.length === 0 && (
								<div className="mt-2">
									<IconPillButton
										icon="add"
										label="定期予定を追加"
										onClick={() => {
											const newEvent = createFixedEvent();
											setLifeTemplate((prev) => ({ ...prev, fixedEvents: [...prev.fixedEvents, newEvent] }));
											setSelectedEntryId(newEvent.id);
										}}
										className="w-full justify-center"
									/>
								</div>
							)}
						</div>

						<div data-testid="macro-time-slot" className="mt-auto shrink-0">
							<div className="px-2 pb-1 flex items-center justify-between">
								<h3 className="text-xs text-[var(--md-ref-color-on-surface-variant)]">マクロ時間</h3>
								<IconPillButton
									icon="add"
									label="追加"
									size="sm"
									onClick={() => {
										const newTask = createMacroTask();
										setMacroTasks((prev) => [...prev, newTask]);
										setSelectedEntryId(newTask.id);
									}}
								/>
							</div>
							<div className="space-y-1">
								{macroEntries.map((entry) => (
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
							{macroEntries.length === 0 && (
								<div className="mt-2">
									<IconPillButton
										icon="add"
										label="マクロタスクを追加"
										onClick={() => {
											const newTask = createMacroTask();
											setMacroTasks((prev) => [...prev, newTask]);
											setSelectedEntryId(newTask.id);
										}}
										className="w-full justify-center"
									/>
								</div>
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
								<TimePicker
									label="開始時刻"
									value={selectedFixedEvent.startTime}
									onChange={(v) =>
										updateFixedEvent(selectedFixedEvent.id, (prev) => ({ ...prev, startTime: v }))
									}
									variant="underlined"
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
								<Select
									value={selectedMacroTask.cadence}
									onChange={(value) =>
										updateMacroTask(selectedMacroTask.id, (prev) => ({ ...prev, cadence: value as MacroCadence }))
									}
									options={[
										{ value: "daily", label: cadenceLabel("daily") },
										{ value: "weekly", label: cadenceLabel("weekly") },
										{ value: "monthly", label: cadenceLabel("monthly") },
									]}
									variant="underlined"
								/>
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
