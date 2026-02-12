import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCachedGoogleCalendar, getEventsForDate, type GoogleCalendarEvent } from "@/hooks/useCachedGoogleCalendar";
import { GoogleCalendarSettingsModal } from "@/components/GoogleCalendarSettingsModal";
import { useTaskStore } from "@/hooks/useTaskStore";
import { Timeline } from "@/components/m3/Timeline";
import { invoke } from "@tauri-apps/api/core";

type CalendarMode = "month" | "week";

// Google Tasks types
interface GoogleTaskList {
	id: string;
	title: string;
	updated: string;
}

interface GoogleTask {
	id: string;
	title: string;
	notes?: string;
	status: "needsAction" | "completed";
	due?: string;
	updated: string;
}


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

function isAllDay(e: GoogleCalendarEvent): boolean {
	return Boolean(e.start.date && !e.start.dateTime);
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
	const active = "bg-[var(--md-ref-color-on-surface)] text-[var(--md-app-bg)]";
	const idle = "bg-transparent text-[var(--md-ref-color-on-surface)] hover:bg-current/5";

	return (
		<div className="inline-flex rounded-full overflow-hidden border border-[var(--md-ref-color-outline-variant)]">
			<button
				type="button"
				onClick={() => onChange("month")}
				className={`${base} ${mode === "month" ? active : idle}`}
			>
				Month
			</button>
			<button
				type="button"
				onClick={() => onChange("week")}
				className={`${base} ${mode === "week" ? active : idle}`}
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
	const [mode, setMode] = useState<CalendarMode>("month");
	const [anchorDate] = useState<Date>(() => new Date()); // Changed from fixed date to current date
	const calendar = useCachedGoogleCalendar();
	const taskStore = useTaskStore();
	const [now, setNow] = useState(() => new Date());
	const todayScrollRef = useRef<HTMLDivElement>(null);
	const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

	// Google Tasks state
	const [tasksTasklists, setTasksTasklists] = useState<GoogleTaskList[]>([]);
	const [tasksListId, setTasksListId] = useState<string | null>(null);
	const [googleTasks, setGoogleTasks] = useState<GoogleTask[]>([]);
	const [isTasksLoading, setIsTasksLoading] = useState(false);

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
		if (calendar.state.isConnected && tasksTasklists.length === 0) {
			console.log("[CalendarSidePanel] Connected, fetching tasklists...");
			fetchTasksTasklists().catch((err) => {
				console.error("[CalendarSidePanel] Failed to fetch tasklists:", err);
			});
		}
	}, [calendar.state.isConnected]);

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
			const isAlreadyImported = taskStore.tasks.some(t =>
				t.description?.includes(`[calendar:${event.id}]`)
			);

			if (isAlreadyImported) {
				console.log(`[CalendarSidePanel] Event ${event.id} already imported, skipping`);
				continue;
			}

			// Import as task (await to ensure persistence before next event)
			if (event && event.start && event.end) {
				console.log(`[CalendarSidePanel] Importing event ${event.id}: ${event.summary}`);
				await taskStore.importCalendarEvent({
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
	}, [calendar.events, mode, anchorDate, taskStore.importCalendarEvent]);

	/**
	 * Fetch Google Tasks tasklists.
	 */
	const fetchTasksTasklists = useCallback(async () => {
		try {
			const result = await invoke<GoogleTaskList[]>("cmd_google_tasks_list_tasklists");
			setTasksTasklists(result);
			// Select default list if none selected or still using placeholder
			if (!tasksListId || tasksListId === "@default") {
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
			}
		} catch (error) {
			console.error("[CalendarSidePanel] Failed to fetch tasklists:", error);
		}
	}, []);

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
			const result = await invoke<GoogleTask[]>("cmd_google_tasks_list_tasks", {
				tasklistId: tasksListId,
				showCompleted: false,
				showHidden: false,
			});
			setGoogleTasks(result);
		} catch (error) {
			console.error("[CalendarSidePanel] Failed to fetch tasks:", error);
			// Check if error is about invalid tasklist
			if (String(error).includes("400") || String(error).includes("Invalid task list ID")) {
				console.error("[CalendarSidePanel] Invalid tasklist ID, clearing selection");
				setTasksListId("@default"); // Reset to trigger re-selection
			}
		} finally {
			setIsTasksLoading(false);
		}
	}, [tasksListId]);

	/**
	 * Import Google Tasks as Pomodoroom tasks.
	 */
	const handleImportTasksAsTasks = useCallback(async () => {
		const incompleteTasks = googleTasks.filter(t => t.status !== "completed");

		console.log(`[CalendarSidePanel] Importing ${incompleteTasks.length} Google Tasks as tasks...`);

		for (const task of incompleteTasks) {
			// Check if already imported
			const isAlreadyImported = taskStore.tasks.some(t =>
				t.description?.includes(`[gtodo:${task.id}]`)
			);

			if (isAlreadyImported) {
				console.log(`[CalendarSidePanel] Task ${task.id} already imported, skipping`);
				continue;
			}

			// Import as task
			console.log(`[CalendarSidePanel] Importing task ${task.id}: ${task.title}`);
			await taskStore.importTodoTask({
				id: task.id,
				title: task.title,
				notes: task.notes,
				status: task.status,
				due: task.due,
			});
			console.log(`[CalendarSidePanel] Successfully imported task ${task.id}`);
		}

		console.log(`[CalendarSidePanel] Finished importing ${incompleteTasks.length} Google Tasks`);
	}, [googleTasks, taskStore.tasks, taskStore.importTodoTask]);

	// Keep current-time indicator up to date.
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(t);
	}, []);

	// Calculate timeline range: current hour ± 12 hours (24 hours total)
	const timelineRange = useMemo(() => {

		
		// Simple approach: always show full 24 hours with current time in middle
		// Timeline will scroll to current time automatically
		return { startHour: 0, endHour: 24 };
	}, [now]);

	const today = useMemo(() => startOfDay(now), [now]);
	const tomorrow = useMemo(() => addDays(today, 1), [today]);

	const todayEvents = useMemo(() => {
		const events = getEventsForDate(calendar.events, today).slice().sort(eventSort);
		
		// Debug: Check for duplicates
		const eventIds = events.map(e => e.id);
		const uniqueIds = new Set(eventIds);
		if (eventIds.length !== uniqueIds.size) {
			console.warn("[CalendarSidePanel] Duplicate event IDs detected in todayEvents!", eventIds);
		}
		
		console.log("[CalendarSidePanel] Today events:", events.length, events.map(e => ({
			id: e.id,
			summary: e.summary,
			start: e.start,
			end: e.end,
		})));
		return events;
	}, [calendar.events, today]);

	const todayTimelineBlocks = useMemo(() => {
		// Sort all events by start time
		const sortedEvents = [...todayEvents].sort((a, b) => {
			const aStart = a.start.dateTime ?? a.start.date ?? "";
			const bStart = b.start.dateTime ?? b.start.date ?? "";
			return aStart.localeCompare(bStart);
		});

		const blocks = sortedEvents.map((event) => {
			let startTime: string;
			let endTime: string;
			let startDate: Date;
			let endDate: Date;

			// Handle all-day events vs timed events
			if (event.start.date && !event.start.dateTime) {
				// All-day event: Display as full day (0:00-24:00)
				const year = today.getFullYear();
				const month = String(today.getMonth() + 1).padStart(2, '0');
				const day = String(today.getDate()).padStart(2, '0');
				const dateStr = `${year}-${month}-${day}`;
				
				// Display as full day: 0:00-23:59:59
				startTime = `${dateStr}T00:00:00`;
				endTime = `${dateStr}T23:59:59`;
				
				startDate = new Date(startTime);
				endDate = new Date(endTime);
				
				console.log("[CalendarSidePanel] All-day event:", event.summary, "→", { startTime, endTime, duration: "24h" });
			} else {
				// Timed event: Use actual times
				startTime = event.start.dateTime ?? "";
				endTime = event.end.dateTime ?? "";
				startDate = new Date(startTime);
				endDate = new Date(endTime);
				
				console.log("[CalendarSidePanel] Timed event:", event.summary, "→", { startTime, endTime, blockType: "calendar" });
			}

			return {
				id: `calendar-${event.id}`,
				blockType: "calendar" as const, // Back to calendar type for proper styling
				startTime,
				endTime,
				startDate,
				endDate,
				locked: true,
				label: event.summary ?? "Untitled",
				lane: 0, // Will be calculated below
			};
		}).filter((b) => Boolean(b.startTime && b.endTime));

		// Calculate lanes to avoid overlaps (blocks that overlap in time go to different lanes)
		const maxLanes = 3;
		const laneEndTimes: (Date | null)[] = new Array(maxLanes).fill(null);

		blocks.forEach((block) => {
			// Find first available lane where this block doesn't overlap with existing blocks
			let assignedLane = 0;
			for (let lane = 0; lane < maxLanes; lane++) {
				// Check if this lane is available (previous block in this lane ends before this block starts)
				// Use < instead of <= to treat adjacent blocks (A ends at 10:00, B starts at 10:00) as non-overlapping
				if (!laneEndTimes[lane] || laneEndTimes[lane]!.getTime() < block.startDate.getTime()) {
					assignedLane = lane;
					break;
				}
			}
			block.lane = assignedLane;
			laneEndTimes[assignedLane] = block.endDate;
			
			console.log(`  Lane ${assignedLane}:`, block.label, {
				start: block.startTime,
				end: block.endTime,
			});
		});
		
		console.log("[CalendarSidePanel] Today timeline blocks:", blocks.length);
		
		return blocks;
	}, [todayEvents, today]);

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
										onClick={handleImportEventsAsTasks}
										className="text-xs opacity-60 hover:opacity-100 transition-opacity px-2 py-1 rounded bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:opacity-90 disabled:opacity-50"
										disabled={calendar.isLoading}
										title="Import events as tasks"
									>
										{/* 📋 - ワタスクとして取り込む */}
									</button>
								)}
								{calendar.state.isConnected && googleTasks.length > 0 && (
									<button
										onClick={handleImportTasksAsTasks}
										className="text-xs opacity-60 hover:opacity-100 transition-opacity px-2 py-1 rounded bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)] hover:opacity-90 disabled:opacity-50"
										disabled={isTasksLoading}
										title="Import Google Tasks as tasks"
									>
										{/* ✅ Todo - ツードとして取り込む */}
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

				{/* Connection status and calendar view */}
				{!calendar.state.isConnected ? (
					<div className="h-[220px] flex items-center justify-center px-4">
						<div className="text-center">
							<p className="text-sm opacity-60 mb-3">Google Calendar not connected</p>
							<button
								onClick={handleConnect}
								disabled={calendar.state.isConnecting}
								className="px-4 py-2 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
							>
								{calendar.state.isConnecting ? "Connecting..." : "Connect Google Calendar"}
							</button>
						</div>
					</div>
				) : (
					<div className="h-[220px] overflow-y-auto scrollbar-hover pl-4 pr-0">
						<div className={mode === "month" ? "pr-4" : "pr-3"}>
							{mode === "month" ? (
								<MonthGrid events={rangeEvents} anchorDate={anchorDate} />
							) : (
								<WeekStrip events={rangeEvents} anchorDate={anchorDate} />
							)}
						</div>
					</div>
				)}
			</section>

			{/* Settings Modal */}
			<GoogleCalendarSettingsModal
				theme="dark"
				isOpen={isSettingsModalOpen}
				onClose={() => setIsSettingsModalOpen(false)}
				onSave={() => {
					// Refresh events after saving calendar selection
					calendar.fetchEvents().catch((err) => console.error("Failed to refresh events:", err));
					setIsSettingsModalOpen(false);
				}}
			/>

			{/* Today (panel): header fixed, timeline scrolls inside */}
			<section className="flex-1 min-h-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden flex flex-col">
				<div className="px-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 py-2">
						NEXT 24H {todayEvents.length > 0 && <span className="ml-2 opacity-60">({todayEvents.length})</span>}
					</div>
				</div>
				
				{!calendar.state.isConnected ? (
					<div className="flex-1 flex items-center justify-center px-4">
						<p className="text-sm opacity-40">Connect Google Calendar to view events</p>
					</div>
				) : calendar.isLoading ? (
					<div className="flex-1 flex items-center justify-center px-4">
						<p className="text-sm opacity-40">Loading events...</p>
					</div>
				) : (
					<div ref={todayScrollRef} className="flex-1 min-h-0 pl-4 pr-0 overflow-y-auto scrollbar-hover">
						<div className="pr-4">
							<Timeline
								blocks={todayTimelineBlocks}
								date={today}
								currentTime={now}
								startHour={timelineRange.startHour}
								endHour={timelineRange.endHour}
								timeLabelWidth={56}
								timeLabelFormat="hm"
								timeLabelAlign="left"
								hourHeight={52}
								enableDragReschedule={false}
								showCurrentTimeIndicator={true}
								scrollMode="external"
								externalScrollRef={todayScrollRef as React.RefObject<HTMLDivElement>}
								className="bg-transparent"
								maxLanes={3}
							/>
						</div>
					</div>
				)}
			</section>

			{/* Google Tasks (panel) */}
			{calendar.state.isConnected && googleTasks.length > 0 && (
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

			{/* Tomorrow (panel) */}
			<section className="shrink-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden">
				<div className="p-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 pb-2">
						TOMORROW {tomorrowEvents.length > 0 && <span className="ml-2">({tomorrowEvents.length})</span>}
					</div>
					{!calendar.state.isConnected ? (
						<div className="px-2 py-2 text-sm opacity-40">Connect Google Calendar to view events</div>
					) : calendar.isLoading ? (
						<div className="px-2 py-2 text-sm opacity-40">Loading events...</div>
					) : tomorrowEvents.length === 0 ? (
						<div className="px-2 py-2 text-sm opacity-60">No events.</div>
					) : (
						<ul className="space-y-1">
							{tomorrowEvents.map((e) => {
								const sd = getEventStartDate(e);
								const allDay = isAllDay(e);
								const timeStr = allDay
									? "All day"
									: sd
										? formatHm(sd)
										: "—";
								
								// Calculate duration for timed events
								let durationStr = "";
								if (!allDay && e.start.dateTime && e.end.dateTime) {
									const start = new Date(e.start.dateTime);
									const end = new Date(e.end.dateTime);
									const durationMs = end.getTime() - start.getTime();
									const durationMins = Math.floor(durationMs / 60000);
									const hours = Math.floor(durationMins / 60);
									const mins = durationMins % 60;
									if (hours > 0) {
										durationStr = mins > 0 ? ` • ${hours}h ${mins}m` : ` • ${hours}h`;
									} else {
										durationStr = ` • ${mins}m`;
									}
								}

								return (
									<li key={e.id} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-current/5 cursor-pointer">
										<div className="w-16 shrink-0 text-xs opacity-70 tabular-nums pt-0.5">{timeStr}</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-baseline gap-2">
												<div className="text-sm font-medium truncate">{e.summary || "(untitled)"}</div>
												{durationStr && (
													<span className="text-xs opacity-50 whitespace-nowrap">{durationStr}</span>
												)}
											</div>
											{e.description && (
												<div className="text-xs opacity-60 mt-1 line-clamp-2">
													{e.description}
												</div>
											)}
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</section>
		</div>
	);
}

export default CalendarSidePanel;
