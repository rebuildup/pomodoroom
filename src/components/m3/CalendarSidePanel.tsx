import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCachedGoogleCalendar, getEventsForDate, type GoogleCalendarEvent } from "@/hooks/useCachedGoogleCalendar";
import { Timeline } from "@/components/m3/Timeline";
import type { ScheduleBlock } from "@/types";

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
	const [anchorDate] = useState(() => new Date());
	const calendar = useCachedGoogleCalendar();
	const [now, setNow] = useState(() => new Date());
	const todayScrollRef = useRef<HTMLDivElement>(null);

	// Ensure we have events covering the visible range.
	useEffect(() => {
		if (!calendar.state.isConnected || !calendar.state.syncEnabled) return;
		const start = mode === "month" ? startOfMonth(anchorDate) : startOfWeekMonday(anchorDate);
		const end = mode === "month" ? endOfMonthExclusive(anchorDate) : endOfWeekMonday(anchorDate);
		calendar.fetchEvents(start, end).catch(() => {});
	}, [calendar.state.isConnected, calendar.state.syncEnabled, mode, anchorDate]);

	// Handle Google Calendar connection
	const handleConnect = async () => {
		try {
			await calendar.connectInteractive();
		} catch (error) {
			console.error("Failed to connect to Google Calendar:", error);
		}
	};

	// Keep current-time indicator up to date.
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(t);
	}, []);

	const today = useMemo(() => startOfDay(now), [now]);
	const tomorrow = useMemo(() => addDays(today, 1), [today]);

	const todayEvents = useMemo(() => {
		return getEventsForDate(calendar.events, today).slice().sort(eventSort);
	}, [calendar.events, today]);

	const todayTimelineBlocks = useMemo(() => {
		return todayEvents.map((event) => {
			const startDateTime = event.start.dateTime ?? event.start.date;
			const endDateTime = event.end.dateTime ?? event.end.date;
			return {
				id: `calendar-${event.id}`,
				blockType: "calendar" as const,
				startTime: startDateTime ?? "",
				endTime: endDateTime ?? "",
				locked: true,
				label: event.summary,
				lane: 0,
			} satisfies ScheduleBlock;
		}).filter((b) => Boolean(b.startTime && b.endTime));
	}, [todayEvents]);

	const tomorrowEvents = useMemo(() => {
		return getEventsForDate(calendar.events, tomorrow).slice().sort(eventSort);
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
							<ModeToggle mode={mode} onChange={setMode} />
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

			{/* Today (panel): header fixed, timeline scrolls inside */}
			<section className="flex-1 min-h-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden flex flex-col">
				<div className="px-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 py-2">
						TODAY
					</div>
				</div>
				{!calendar.state.isConnected ? (
					<div className="flex-1 flex items-center justify-center px-4">
						<p className="text-sm opacity-40">Connect Google Calendar to view events</p>
					</div>
				) : (
					<div ref={todayScrollRef} className="flex-1 min-h-0 pl-4 pr-0 overflow-y-auto scrollbar-hover">
						<div className="pr-4">
							<Timeline
								blocks={todayTimelineBlocks}
								date={today}
								currentTime={now}
								startHour={6}
								endHour={24}
								timeLabelWidth={56}
								timeLabelFormat="hm"
								timeLabelAlign="left"
								hourHeight={52}
								enableDragReschedule={false}
								showCurrentTimeIndicator={true}
								scrollMode="external"
								externalScrollRef={todayScrollRef as React.RefObject<HTMLDivElement>}
								className="bg-transparent"
							/>
						</div>
					</div>
				)}
			</section>

			{/* Tomorrow (panel) */}
			<section className="shrink-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden">
				<div className="p-4">
					<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 pb-2">
						TOMORROW
					</div>
					{!calendar.state.isConnected ? (
						<div className="px-2 py-2 text-sm opacity-40">Connect Google Calendar to view events</div>
					) : tomorrowEvents.length === 0 ? (
						<div className="px-2 py-2 text-sm opacity-60">No events.</div>
					) : (
						<ul className="space-y-1">
							{tomorrowEvents.map((e) => {
								const d = getEventStartDate(e);
								const left = isAllDay(e) ? "All day" : d ? formatHm(d) : "";
								return (
									<li key={e.id} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-current/5">
										<div className="w-16 shrink-0 text-xs opacity-70 tabular-nums pt-0.5">{left}</div>
										<div className="min-w-0 flex-1">
											<div className="text-sm font-medium truncate">{e.summary || "(untitled)"}</div>
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
