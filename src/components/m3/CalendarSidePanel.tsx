import { useCallback, useEffect, useMemo, useState } from "react";
import { useCachedGoogleCalendar, getEventsForDate, type GoogleCalendarEvent } from "@/hooks/useCachedGoogleCalendar";
import { GoogleCalendarSettingsModal } from "@/components/GoogleCalendarSettingsModal";
import { useTaskStore } from "@/hooks/useTaskStore";
import { useGoogleTasks } from "@/hooks/useGoogleTasks";
import { DayTimelinePanel } from "@/components/m3/DayTimelinePanel";
import { TaskCard } from "@/components/m3/TaskCard";
import type { Task } from "@/types/task";

type CalendarMode = "month" | "week";

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
	const next = new Date(d);
	next.setDate(next.getDate() + days);
	return next;
}

function startOfWeekMonday(d: Date): Date {
	const day = d.getDay(); // 0=Sun
	const diff = (day + 6) % 7; // Mon=0 ... Sun=6
	return addDays(startOfDay(d), -diff);
}

function endOfWeekMonday(d: Date): Date {
	return addDays(startOfWeekMonday(d), 7);
}

function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonthExclusive(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

function formatHm(d: Date): string {
	return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function getEventStartDate(e: GoogleCalendarEvent): Date | null {
	const s = e.start.dateTime ?? e.start.date;
	if (!s) return null;
	const dt = new Date(s);
	return Number.isNaN(dt.getTime()) ? null : dt;
}

function getEventsInRange(events: GoogleCalendarEvent[], start: Date, endExclusive: Date): GoogleCalendarEvent[] {
	const s = start.getTime();
	const e = endExclusive.getTime();
	return events.filter((ev) => {
		const d = getEventStartDate(ev);
		if (!d) return false;
		const t = d.getTime();
		return t >= s && t < e;
	});
}

function eventSort(a: GoogleCalendarEvent, b: GoogleCalendarEvent): number {
	const ad = getEventStartDate(a)?.getTime() ?? 0;
	const bd = getEventStartDate(b)?.getTime() ?? 0;
	if (ad !== bd) return ad - bd;
	return (a.summary ?? "").localeCompare(b.summary ?? "");
}

function ModeToggle({ mode, onChange }: { mode: CalendarMode; onChange: (m: CalendarMode) => void }) {
	const base =
		"h-9 px-3 text-sm font-medium transition-colors";
	const active = "!bg-[var(--md-ref-color-primary)] !text-[var(--md-ref-color-on-primary)]";
	const idle = "!bg-transparent text-[var(--md-ref-color-on-surface)] hover:!bg-[var(--md-ref-color-surface-container-high)]";

	return (
		<div className="inline-flex rounded-full overflow-hidden border border-[var(--md-ref-color-outline-variant)]">
			<button
				type="button"
				onClick={() => onChange("month")}
				className={`no-pill ${base} ${mode === "month" ? active : idle}`}
			>
				Month
			</button>
			<button
				type="button"
				onClick={() => onChange("week")}
				className={`no-pill ${base} ${mode === "week" ? active : idle}`}
			>
				Week
			</button>
		</div>
	);
}

function MonthGrid({ events, anchorDate }: { events: GoogleCalendarEvent[]; anchorDate: Date }) {
	const monthStart = startOfMonth(anchorDate);
	const gridStart = startOfWeekMonday(monthStart);
	const today = startOfDay(new Date());

	const days = useMemo(() => {
		const out: Date[] = [];
		for (let i = 0; i < 42; i++) out.push(addDays(gridStart, i));
		return out;
	}, [gridStart]);

	return (
		<div>
			<div className="grid grid-cols-7 text-[10px] font-semibold opacity-60">
				{["M", "T", "W", "T", "F", "S", "S"].map((d, index) => (
					<div key={`${d}-${index}`} className="h-7 flex items-center justify-center">{d}</div>
				))}
			</div>
			<div className="grid grid-cols-7 gap-0">
				{days.map((d) => {
					const inMonth = d.getMonth() === anchorDate.getMonth();
					const isToday = d.getTime() === today.getTime();
					const count = getEventsForDate(events, d).length;
					return (
						<div
							key={d.toISOString()}
							className="h-8 flex flex-col items-center justify-center"
						>
							<div
								className={[
									"w-7 h-7 rounded-full flex items-center justify-center text-xs",
									inMonth ? "" : "opacity-35",
									isToday ? "bg-current/10 font-semibold" : "hover:bg-current/5",
								].join(" ")}
								title={`${d.getMonth() + 1}/${d.getDate()}`}
							>
								{d.getDate()}
							</div>
							{/* Event dot (text-color only) */}
							<div className="h-1 mt-0.5">
								{count > 0 ? <div className="w-1 h-1 rounded-full bg-current opacity-30" /> : null}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function WeekStrip({ events, anchorDate }: { events: GoogleCalendarEvent[]; anchorDate: Date }) {
	const start = startOfWeekMonday(anchorDate);
	const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
	const today = startOfDay(new Date());

	return (
		<div className="space-y-1">
			{days.map((d) => {
				const isToday = d.getTime() === today.getTime();
				const count = getEventsForDate(events, d).length;
				return (
					<div
						key={d.toISOString()}
						className={[
							"flex items-center justify-between px-3 py-2 rounded-lg",
							"border border-[var(--md-ref-color-outline-variant)] bg-transparent",
							isToday ? "bg-current/5" : "hover:bg-current/5",
						].join(" ")}
					>
						<div className="text-sm font-medium">
							{d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
						</div>
						<div className="text-sm opacity-70">{count}</div>
					</div>
				);
			})}
		</div>
	);
}



export function CalendarSidePanel() {
	const [nowMs, setNowMs] = useState(() => Date.now());

	useEffect(() => {
		const timerId = window.setInterval(() => setNowMs(Date.now()), 60_000);
		return () => window.clearInterval(timerId);
	}, []);

	const [mode, setMode] = useState<CalendarMode>("month");
	const [anchorDate] = useState<Date>(() => new Date()); // Changed from fixed date to current date
	const calendar = useCachedGoogleCalendar();
	const googleTasksApi = useGoogleTasks();
	const { tasks, importCalendarEvent, importTodoTask } = useTaskStore();
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

	// Google Tasks state
	const [tasksListId, setTasksListId] = useState<string | null>(null);
	const [isTasksLoading, setIsTasksLoading] = useState(false);
	const tasksTasklists = googleTasksApi.tasklists;
	const googleTasks = googleTasksApi.tasks;

	// Handle Google Calendar connection
	const handleConnect = async () => {
		try {
			await calendar.connectInteractive();
			// After successful connection, open settings to select calendars
			setIsSettingsModalOpen(true);
		} catch (error) {
			console.error("Failed to connect to Google Calendar:", error);
		}
	};

	/**
	 * Import calendar event as a task.
	 * Imports all visible range events as tasks.
	 */
	const handleImportEventsAsTasks = useCallback(async () => {
		const start = mode === "month" ? startOfMonth(anchorDate) : startOfWeekMonday(anchorDate);
		const end = mode === "month" ? endOfMonthExclusive(anchorDate) : endOfWeekMonday(anchorDate);
		const rangeEvents = getEventsInRange(calendar.events, start, end);

		console.log(`[CalendarSidePanel] Importing ${rangeEvents.length} events as tasks...`);

		// Import each event as a task
		for (const event of rangeEvents) {
			// Check if already imported (by checking description for calendar ID marker)
			const isAlreadyImported = tasks.some(t =>
				t.description?.includes(`[calendar:${event.id}]`)
			);

			if (isAlreadyImported) {
				console.log(`[CalendarSidePanel] Event ${event.id} already imported, skipping`);
				continue;
			}

			// Import as task (await to ensure persistence before next event)
			if (event && event.start && event.end) {
				console.log(`[CalendarSidePanel] Importing event ${event.id}: ${event.summary}`);
				await importCalendarEvent({
					id: event.id,
					summary: event.summary,
					description: event.description,
					start: event.start,
					end: event.end,
				});
				console.log(`[CalendarSidePanel] Successfully imported event ${event.id}`);
			}
		}

		console.log(`[CalendarSidePanel] Finished importing ${rangeEvents.length} events as tasks`);
	}, [calendar.events, mode, anchorDate, tasks, importCalendarEvent]);

	/**
	 * Select default tasklist from the fetched result.
	 */
	const selectDefaultTasklist = useCallback((result: { id: string; title: string }[]) => {
		// Look for list with "default", "My Tasks", or "マイタスク" in title
		const defaultList = result.find(l =>
			l.title.toLowerCase().includes("default") ||
			l.title.toLowerCase().includes("my tasks") ||
			l.title.toLowerCase().includes("マイタスク")
		);
		if (defaultList) {
			console.log("[CalendarSidePanel] Selecting default tasklist:", defaultList.id, defaultList.title);
			setTasksListId(defaultList.id);
		} else if (result.length > 0) {
			// Fallback: use first list
			console.log("[CalendarSidePanel] No default list found, using first list:", result[0].id, result[0].title);
			setTasksListId(result[0].id);
		} else {
			console.warn("[CalendarSidePanel] No tasklists available");
		}
	}, []);

	/**
	 * Fetch Google Tasks tasklists.
	 */
	const fetchTasksTasklists = useCallback(async () => {
		const result = await googleTasksApi.fetchTasklists();
		// Select default list if none selected or still using placeholder
		if (!tasksListId || tasksListId === "@default") {
			selectDefaultTasklist(result);
		}
	}, [tasksListId, selectDefaultTasklist, googleTasksApi]);

	/**
	 * Handle tasklists fetch error.
	 */
	const handleTasklistsError = useCallback((error: unknown) => {
		console.error("[CalendarSidePanel] Failed to fetch tasklists:", error);
		// Check if error is about invalid tasklist
		if (String(error).includes("400") || String(error).includes("Invalid task list ID")) {
			console.error("[CalendarSidePanel] Invalid tasklist ID, clearing selection");
			setTasksListId("@default"); // Reset to trigger re-selection
		}
	}, []);

	/**
	 * Safe fetch Google Tasks tasklists with error handling.
	 */
	const safeFetchTasksTasklists = useCallback(async () => {
		try {
			await fetchTasksTasklists();
		} catch (error) {
			handleTasklistsError(error);
		}
	}, [fetchTasksTasklists, handleTasklistsError]);

	/**
	 * Fetch Google Tasks from selected list.
	 */
	const fetchGoogleTasks = useCallback(async () => {
		if (!tasksListId) {
			console.log("[CalendarSidePanel] No tasklist selected, skipping fetch");
			return;
		}
		setIsTasksLoading(true);
		try {
			await googleTasksApi.setSelectedTasklists([tasksListId]);
			await googleTasksApi.fetchTasks(tasksListId);
		} catch (error) {
			console.error("[CalendarSidePanel] Failed to fetch tasks:", error);
			// Check if error is about invalid tasklist
			if (String(error).includes("400") || String(error).includes("Invalid task list ID")) {
				console.error("[CalendarSidePanel] Invalid tasklist ID, clearing selection");
				setTasksListId("@default"); // Reset to trigger re-selection
			}
		}
		setIsTasksLoading(false);
	}, [tasksListId, googleTasksApi]);

	/**
	 * Import Google Tasks as Pomodoroom tasks.
	 */
	const handleImportTasksAsTasks = useCallback(async () => {
		const incompleteTasks = googleTasks.filter(t => t.status !== "completed");

		console.log(`[CalendarSidePanel] Importing ${incompleteTasks.length} Google Tasks as tasks...`);

		for (const task of incompleteTasks) {
			// Check if already imported
			const isAlreadyImported = tasks.some(t =>
				t.description?.includes(`[gtodo:${task.id}]`)
			);

			if (isAlreadyImported) {
				console.log(`[CalendarSidePanel] Task ${task.id} already imported, skipping`);
				continue;
			}

			// Import as task
			console.log(`[CalendarSidePanel] Importing task ${task.id}: ${task.title}`);
			await importTodoTask({
				id: task.id,
				title: task.title,
				notes: task.notes,
				status: task.status,
				due: task.due,
			});
			console.log(`[CalendarSidePanel] Successfully imported task ${task.id}`);
		}

		console.log(`[CalendarSidePanel] Finished importing ${incompleteTasks.length} Google Tasks`);
	}, [googleTasks, tasks, importTodoTask]);

	// Ensure we have events covering the visible range.
	useEffect(() => {
		if (!calendar.state.isConnected || !calendar.state.syncEnabled) return;
		const start = mode === "month" ? startOfMonth(anchorDate) : startOfWeekMonday(anchorDate);
		const end = mode === "month" ? endOfMonthExclusive(anchorDate) : endOfWeekMonday(anchorDate);
		calendar.fetchEvents(start, end).catch(() => {});
	}, [calendar.state.isConnected, calendar.state.syncEnabled, mode, anchorDate]);

	// Auto-fetch events when first connected
	useEffect(() => {
		if (calendar.state.isConnected && calendar.events.length === 0) {
			console.log("[CalendarSidePanel] Connected, fetching events...");
			calendar.fetchEvents().catch((err) => {
				console.error("[CalendarSidePanel] Failed to fetch events:", err);
			});
		}
	}, [calendar.state.isConnected]);

	// Auto-fetch Google Tasks when first connected
	useEffect(() => {
		if (googleTasksApi.state.isConnected && tasksTasklists.length === 0) {
			console.log("[CalendarSidePanel] Connected, fetching tasklists...");
			safeFetchTasksTasklists().catch((err) => {
				console.error("[CalendarSidePanel] Failed to fetch tasklists:", err);
			});
		}
	}, [googleTasksApi.state.isConnected, tasksTasklists.length, safeFetchTasksTasklists]);

	// Fetch Google Tasks when tasklist is selected
	useEffect(() => {
		if (tasksListId && tasksListId !== null) {
			console.log("[CalendarSidePanel] Tasklist selected, fetching tasks...");
			fetchGoogleTasks();
		}
	}, [tasksListId]);

	// Debug: Log calendar state
	useEffect(() => {
		const eventIds = calendar.events.map(e => e.id);
		const uniqueIds = new Set(eventIds);
		const hasDuplicates = eventIds.length !== uniqueIds.size;

		console.log("[CalendarSidePanel] Calendar state:", {
			isConnected: calendar.state.isConnected,
			syncEnabled: calendar.state.syncEnabled,
			eventCount: calendar.events.length,
			uniqueEventCount: uniqueIds.size,
			hasDuplicates,
			isLoading: calendar.isLoading,
		});

		if (hasDuplicates) {
			console.warn("[CalendarSidePanel] Duplicate events in calendar.events!",
				eventIds.filter((id, index) => eventIds.indexOf(id) !== index)
			);
		}
	}, [calendar.state.isConnected, calendar.state.syncEnabled, calendar.events.length, calendar.isLoading]);

	const today = useMemo(() => startOfDay(new Date(nowMs)), [nowMs]);
	const tomorrow = useMemo(() => addDays(today, 1), [today]);

	// Today tasks for DayTimelinePanel (includes running and done tasks)
	const todayTasks = useMemo(() => {
		// Helper to get effective start time for display
		const getEffectiveStartTime = (task: Task): string | null => {
			// Priority 1: Fixed schedule times
			if (task.fixedStartAt) {
				return task.fixedStartAt;
			}
			// Priority 2: Window start
			if (task.windowStartAt) {
				return task.windowStartAt;
			}
			// Priority 3: Running task actual start
			if (task.state === "RUNNING" && task.startedAt) {
				return task.startedAt;
			}
			// Priority 4: Flex window calculated time
			if (task.kind === "flex_window" && task.windowStartAt && task.windowEndAt && task.requiredMinutes) {
				const windowStart = new Date(task.windowStartAt);
				const windowEnd = new Date(task.windowEndAt);
				const windowCenter = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
				const halfDuration = (task.requiredMinutes / 2) * 60 * 1000;
				return new Date(windowCenter.getTime() - halfDuration).toISOString();
			}
			// Priority 5: Estimated start (auto-scheduled tasks)
			if (task.estimatedStartAt) {
				return task.estimatedStartAt;
			}
			// Priority 6: For done tasks, try to reconstruct from completed time
			if (task.state === "DONE") {
				if (task.completedAt && task.requiredMinutes) {
					const completed = new Date(task.completedAt);
					const started = new Date(completed.getTime() - task.requiredMinutes * 60 * 1000);
					return started.toISOString();
				}
				// Last resort: use updatedAt
				if (task.updatedAt) {
					return task.updatedAt;
				}
			}
			// Priority 7: Created time for tasks without any schedule
			if (task.createdAt) {
				return task.createdAt;
			}
			return null;
		};

		return tasks.filter((task) => {
			const startTime = getEffectiveStartTime(task);
			if (!startTime) return false;
			const taskDate = new Date(startTime);
			const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
			return taskDay.getTime() === today.getTime();
		}).map((task) => {
			// For timeline display, ensure effective start time is set
			const effectiveStart = getEffectiveStartTime(task);
			if (effectiveStart && !task.fixedStartAt && !task.windowStartAt) {
				return { ...task, estimatedStartAt: effectiveStart };
			}
			return task;
		}).sort((a, b) => {
			const aStart = getEffectiveStartTime(a) || "";
			const bStart = getEffectiveStartTime(b) || "";
			const at = Date.parse(aStart);
			const bt = Date.parse(bStart);
			if (!Number.isNaN(at) && !Number.isNaN(bt)) return at - bt;
			return aStart.localeCompare(bStart);
		}) as Task[];
	}, [tasks, today, tomorrow]);

	// Tomorrow task blocks - returns actual Task objects for TaskCard rendering
	const tomorrowTasks = useMemo(() => {
		return tasks.filter((task) => {
			if (task.state === "DONE") return false;

			// For flex window, calculate center time
			let startTime: string | null = null;
			if (task.kind === "flex_window" && task.windowStartAt && task.windowEndAt && task.requiredMinutes) {
				const windowStart = new Date(task.windowStartAt);
				const windowEnd = new Date(task.windowEndAt);
				const windowCenter = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
				const halfDuration = (task.requiredMinutes / 2) * 60 * 1000;
				startTime = new Date(windowCenter.getTime() - halfDuration).toISOString();
			} else {
				startTime = task.fixedStartAt || task.windowStartAt;
			}

			if (!startTime) return false;

			const taskDate = new Date(startTime);
			const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
			return taskDay.getTime() === tomorrow.getTime();
		}).sort((a, b) => {
			// Sort by start time
			const getStartTime = (task: Task) => {
				if (task.kind === "flex_window" && task.windowStartAt && task.windowEndAt && task.requiredMinutes) {
					const windowStart = new Date(task.windowStartAt);
					const windowEnd = new Date(task.windowEndAt);
					const windowCenter = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
					const halfDuration = (task.requiredMinutes / 2) * 60 * 1000;
					return new Date(windowCenter.getTime() - halfDuration).getTime();
				}
				return task.fixedStartAt || task.windowStartAt ? Date.parse(task.fixedStartAt || task.windowStartAt || "") : 0;
			};
			return getStartTime(a) - getStartTime(b);
		}) as Task[];
	}, [tasks, tomorrow]);

	// Tomorrow calendar events
	const tomorrowEvents = useMemo(() => {
		const events = getEventsForDate(calendar.events, tomorrow).slice().sort(eventSort);
		console.log("[CalendarSidePanel] Tomorrow events:", events.length, events);
		return events;
	}, [calendar.events, tomorrow]);

	const rangeEvents = useMemo(() => {
		const start = mode === "month" ? startOfMonth(anchorDate) : startOfWeekMonday(anchorDate);
		const end = mode === "month" ? endOfMonthExclusive(anchorDate) : endOfWeekMonday(anchorDate);
		return getEventsInRange(calendar.events, start, end);
	}, [calendar.events, mode, anchorDate]);

	return (
		<div className="h-full flex flex-col gap-4 text-[var(--md-ref-color-on-surface)]">
			{/* Calendar (panel) */}
			<section className="shrink-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden">
				<div className="px-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 py-2">
						<div className="flex items-center justify-between gap-3">
							<span>CALENDAR</span>
							<div className="flex items-center gap-2">
								{/* Import as tasks button */}
								{calendar.state.isConnected && rangeEvents.length > 0 && (
									<button
										onClick={() => {
											console.log("[CalendarSidePanel] Import button clicked");
											void handleImportEventsAsTasks();
										}}
										className="text-xs opacity-60 hover:opacity-100 transition-opacity px-2 py-1 rounded bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:opacity-90 disabled:opacity-50"
										disabled={calendar.isLoading}
										title="Import events as tasks"
									>
										Import Events
									</button>
								)}
								{googleTasksApi.state.isConnected && googleTasks.length > 0 && (
									<button
										onClick={() => {
											console.log("[CalendarSidePanel] Google Tasks import button clicked");
											void handleImportTasksAsTasks();
										}}
										className="text-xs opacity-60 hover:opacity-100 transition-opacity px-2 py-1 rounded bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)] hover:opacity-90 disabled:opacity-50"
										disabled={isTasksLoading}
										title="Import Google Tasks as tasks"
									>
										Import Todos
									</button>
								)}
								<ModeToggle mode={mode} onChange={setMode} />
								{calendar.state.isConnected && (
									<button
										onClick={() => setIsSettingsModalOpen(true)}
										className="text-xs opacity-60 hover:opacity-100 transition-opacity"
										title="Calendar settings"
									>
										⚙️
									</button>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Calendar view - always visible, shows connect button if not connected */}
				<div className="h-[220px] overflow-y-auto scrollbar-hover pl-4 pr-0">
					<div className={mode === "month" ? "pr-4" : "pr-3"}>
						{mode === "month" ? (
							<MonthGrid events={rangeEvents} anchorDate={anchorDate} />
						) : (
							<WeekStrip events={rangeEvents} anchorDate={anchorDate} />
						)}
						{!calendar.state.isConnected && (
							<div className="mt-2 pb-2">
								<button
									onClick={handleConnect}
									disabled={calendar.state.isConnecting}
									className="w-full px-3 py-2 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
								>
									{calendar.state.isConnecting ? "Connecting..." : "Connect Google Calendar"}
								</button>
							</div>
						)}
					</div>
				</div>
			</section>

			{/* Settings Modal */}
			<GoogleCalendarSettingsModal
				theme="dark"
				isOpen={isSettingsModalOpen}
				onClose={() => setIsSettingsModalOpen(false)}
				onSave={async () => {
					try {
						// Refresh events after saving calendar selection
						await calendar.fetchEvents();
						// Auto-import visible range to tasks for immediate reflection in Total.
						await handleImportEventsAsTasks();
					} catch (err) {
						console.error("Failed to refresh/import events:", err);
					}
					setIsSettingsModalOpen(false);
				}}
			/>

			{/* Today (panel): header fixed, timeline scrolls inside */}
			<section className="flex-1 min-h-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden flex flex-col">
				<div className="px-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 py-2">
						NEXT 24H {todayTasks.length > 0 && <span className="ml-2 opacity-60">({todayTasks.length})</span>}
					</div>
				</div>

				{calendar.isLoading ? (
					<div className="flex-1 flex items-center justify-center px-4">
						<p className="text-sm opacity-40">Loading...</p>
					</div>
				) : (
					<DayTimelinePanel
						tasks={todayTasks}
						hourHeight={52}
						timeLabelWidth={56}
						minCardHeight={50}
						laneGap={4}
						testId="calendar-today-timeline"
						className="pl-4 pr-4"
					/>
				)}
			</section>

			{/* Google Tasks (panel) */}
			{googleTasksApi.state.isConnected && googleTasks.length > 0 && (
				<section className="shrink-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden">
					<div className="px-4 py-3">
						<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 mb-2">
							GOOGLE TASKS
						</div>
						<div className="space-y-1">
							{googleTasks.slice(0, 5).map((task) => (
								<div
									key={task.id}
									className="px-3 py-2 rounded-lg bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors border border-[var(--md-ref-color-outline-variant)]"
								>
									<div className="flex items-start gap-2">
										<div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5 ${
											task.status === "completed" ? "bg-green-400" : "bg-blue-400"
										}`} />
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium">{task.title}</div>
											{task.notes && (
												<div className="text-xs opacity-60 mt-0.5 line-clamp-2">{task.notes}</div>
											)}
											{task.due && (
												<div className="text-xs opacity-50 mt-1">
													📅 {new Date(task.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
												</div>
											)}
										</div>
									</div>
								</div>
							))}
							{googleTasks.length > 5 && (
								<div className="text-xs opacity-60 text-center py-2">
									+{googleTasks.length - 5} more tasks
								</div>
							)}
						</div>
					</div>
				</section>
			)}

			{/* Tomorrow (panel) - shows tasks as TaskCard and calendar events as list */}
			<section className="shrink-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden">
				<div className="p-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 pb-2">
						TOMORROW {(tomorrowTasks.length + tomorrowEvents.length) > 0 && <span className="ml-2">({tomorrowTasks.length + tomorrowEvents.length})</span>}
					</div>
					{calendar.isLoading ? (
						<div className="px-2 py-2 text-sm opacity-40">Loading...</div>
					) : (tomorrowTasks.length + tomorrowEvents.length) > 0 && (
						<div className="space-y-2">
							{/* Show tomorrow tasks as TaskCards */}
							{tomorrowTasks.map((task) => (
								<TaskCard
									key={task.id}
									task={task}
									allTasks={tasks}
									draggable={false}
									density="compact"
									operationsPreset="none"
									showStatusControl={false}
									expandOnClick={true}
								/>
							))}

							{/* Show calendar events as simple list items */}
							{calendar.state.isConnected && tomorrowEvents.map((event) => {
								const sd = event.start.dateTime ? new Date(event.start.dateTime) : event.start.date ? new Date(event.start.date) : null;
								const ed = event.end.dateTime ? new Date(event.end.dateTime) : event.end.date ? new Date(event.end.date) : null;
								const timeStr = sd ? formatHm(sd) : "—";

								// Calculate duration
								let durationStr = "";
								if (sd && ed) {
									const durationMs = ed.getTime() - sd.getTime();
									const durationMins = Math.floor(durationMs / 60000);
									const hours = Math.floor(durationMins / 60);
									const mins = durationMins % 60;
									if (hours > 0) {
										durationStr = mins > 0 ? ` • ${hours}h ${mins}m` : ` • ${hours}h`;
									} else if (mins > 0) {
										durationStr = ` • ${mins}m`;
									}
								}

								return (
									<div key={event.id} className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-current/5 cursor-pointer border border-[var(--md-ref-color-outline-variant)] bg-[var(--md-ref-color-surface-container-low)]">
										<div className="w-12 shrink-0 text-xs opacity-70 tabular-nums pt-0.5">{timeStr}</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-baseline gap-2">
												<div className="text-sm font-medium truncate">{event.summary || "(untitled)"}</div>
												{durationStr && (
													<span className="text-xs opacity-50 whitespace-nowrap">{durationStr}</span>
												)}
												<span className="text-xs px-1.5 py-0.5 rounded bg-[var(--md-ref-color-primary-container)] text-[var(--md-ref-color-on-primary-container)]">Calendar</span>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}

export default CalendarSidePanel;
