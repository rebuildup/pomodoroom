/**
 * CalendarPanel — 月/週/年カレンダー切り替え表示.
 *
 * - Month: 月カレンダー（日ごとのポモドーロ数をドット表示）
 * - Week: 週カレンダー（時間軸付き）
 * - Year: GitHub風ヒートマップ
 *
 * Google Calendarイベントを色分けして表示可能
 */
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useGoogleCalendar, getEventColor } from "@/hooks/useGoogleCalendar";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Per-day activity data (pomodoro count) */
export interface DayActivity {
	date: string; // YYYY-MM-DD
	pomodoros: number;
	focusMinutes: number;
}

type CalendarView = "month" | "week" | "year";

interface CalendarPanelProps {
	/** Activity data keyed by YYYY-MM-DD */
	activities: DayActivity[];
	className?: string;
	/** Show Google Calendar events (requires authentication) */
	showCalendarEvents?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const WEEKDAYS_SHORT = ["日", "月", "火", "水", "木", "金", "土"];
const MONTHS_SHORT = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function toDateKey(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
	const result = new Date(d);
	result.setDate(result.getDate() - result.getDay());
	result.setHours(0, 0, 0, 0);
	return result;
}

function addDays(d: Date, n: number): Date {
	const result = new Date(d);
	result.setDate(result.getDate() + n);
	return result;
}

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function heatLevel(count: number): number {
	if (count === 0) return 0;
	if (count <= 2) return 1;
	if (count <= 4) return 2;
	if (count <= 6) return 3;
	return 4;
}

function heatColor(level: number): string {
	switch (level) {
		case 0: return "var(--color-border)";
		case 1: return "var(--color-text-muted)";
		case 2: return "var(--color-text-secondary)";
		case 3: return "var(--color-accent-secondary)";
		case 4: return "var(--color-text-primary)";
		default: return "var(--color-border)";
	}
}

// ─── Month View ─────────────────────────────────────────────────────────────

function MonthView({
	year,
	month,
	activityMap,
	today,
	googleEvents,
	showGoogleEvents,
}: {
	year: number;
	month: number;
	activityMap: Map<string, DayActivity>;
	today: Date;
	googleEvents: ReturnType<typeof useGoogleCalendar>["events"];
	showGoogleEvents: boolean;
}) {
	const firstDay = new Date(year, month, 1);
	const startDow = firstDay.getDay(); // 0=Sun
	const daysInMonth = new Date(year, month + 1, 0).getDate();

	const cells: (number | null)[] = [];
	for (let i = 0; i < startDow; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) cells.push(d);
	// pad to full weeks
	while (cells.length % 7 !== 0) cells.push(null);

	return (
		<div>
			{/* Weekday headers */}
			<div className="grid grid-cols-7 mb-1">
				{WEEKDAYS_SHORT.map((w) => (
					<div key={w} className="text-center text-[10px] font-mono text-(--color-text-muted) py-0.5">
						{w}
					</div>
				))}
			</div>

			{/* Day grid */}
			<div className="grid grid-cols-7 gap-px">
				{cells.map((day, i) => {
					if (day === null) {
						return <div key={`e-${i}`} className="aspect-square" />;
					}
					const date = new Date(year, month, day);
					const key = toDateKey(date);
					const activity = activityMap.get(key);
					const count = activity?.pomodoros ?? 0;
					const isToday = isSameDay(date, today);

					// Get Google Calendar events for this day
					const dayEvents = showGoogleEvents
						? googleEvents.filter(e => {
								const eventStart = e.start.dateTime ?? e.start.date;
								return eventStart?.startsWith(key);
							})
						: [];
					const hasGoogleEvents = dayEvents.length > 0;

					return (
						<div
							key={key}
							className={`
								aspect-square flex flex-col items-center justify-center text-[10px] font-mono relative
								${isToday ? "bg-(--color-surface)" : ""}
							`}
							title={
								count > 0 || hasGoogleEvents
									? `${key}${count > 0 ? `: ${count} pomodoros` : ""}${hasGoogleEvents ? ` + ${dayEvents.length} events` : ""}`
									: key
							}
						>
							<span className={isToday ? "font-bold text-(--color-text-primary)" : "text-(--color-text-secondary)"}>
								{day}
							</span>
							{/* Activity dots */}
							{count > 0 && (
								<div className="flex gap-px mt-0.5">
									{Array.from({ length: Math.min(count, 4) }, (_, j) => (
										<div
											key={j}
											className="w-1 h-1 bg-(--color-text-primary)"
										/>
									))}
									{count > 4 && <span className="text-[7px] text-(--color-text-muted)">+</span>}
								</div>
							)}
							{/* Google Calendar event indicator */}
							{hasGoogleEvents && (
								<div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-px">
									{dayEvents.slice(0, 3).map((event) => (
										<div
											key={event.id}
											className="w-1.5 h-1.5 rounded-full"
											style={{ backgroundColor: getEventColor(event) }}
											title={event.summary}
										/>
									))}
									{dayEvents.length > 3 && (
										<span className="text-[6px] text-(--color-text-muted)">+</span>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ─── Week View ──────────────────────────────────────────────────────────────

function WeekView({
	weekStart,
	activityMap,
	today,
	googleEvents,
	showGoogleEvents,
}: {
	weekStart: Date;
	activityMap: Map<string, DayActivity>;
	today: Date;
	googleEvents: ReturnType<typeof useGoogleCalendar>["events"];
	showGoogleEvents: boolean;
}) {
	const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

	return (
		<div className="flex gap-px h-full">
			{days.map((date) => {
				const key = toDateKey(date);
				const activity = activityMap.get(key);
				const count = activity?.pomodoros ?? 0;
				const minutes = activity?.focusMinutes ?? 0;
				const isToday = isSameDay(date, today);

				// Get Google Calendar events for this day
				const dayEvents = showGoogleEvents
					? googleEvents.filter(e => {
							const eventStart = e.start.dateTime ?? e.start.date;
							return eventStart?.startsWith(key);
						})
					: [];
				const hasGoogleEvents = dayEvents.length > 0;

				return (
					<div
						key={key}
						className={`
							flex-1 flex flex-col items-center py-2 transition-colors
							${isToday ? "bg-(--color-surface)" : ""}
						`}
					>
						{/* Day name */}
						<span className="text-[10px] font-mono text-(--color-text-muted)">
							{WEEKDAYS_SHORT[date.getDay()]}
						</span>
						{/* Date number */}
						<span
							className={`text-sm font-mono tabular-nums mt-0.5 ${
								isToday ? "font-bold text-(--color-text-primary)" : "text-(--color-text-secondary)"
							}`}
						>
							{date.getDate()}
						</span>
						{/* Pomodoro count bar */}
						<div className="flex-1 flex flex-col justify-end w-full px-1 mt-1">
							{count > 0 && (
								<div
									className="w-full bg-(--color-text-primary) transition-all"
									style={{ height: `${Math.min(count * 12, 100)}%`, minHeight: 2 }}
								/>
							)}
							{/* Google Calendar event indicators */}
							{hasGoogleEvents && (
								<div className="flex flex-wrap gap-px justify-center mt-1">
									{dayEvents.slice(0, 4).map((event) => (
										<div
											key={event.id}
											className="w-1.5 h-1.5 rounded-full"
											style={{ backgroundColor: getEventColor(event) }}
											title={event.summary}
										/>
									))}
									{dayEvents.length > 4 && (
										<span className="text-[6px] text-(--color-text-muted)">+</span>
									)}
								</div>
							)}
						</div>
						{/* Stats */}
						<span className="text-[9px] font-mono text-(--color-text-muted) mt-1 tabular-nums">
							{count > 0 ? `${count}🍅` : "—"}
						</span>
						{minutes > 0 && (
							<span className="text-[8px] font-mono text-(--color-text-muted) tabular-nums">
								{minutes}m
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ─── Year View (GitHub-style heatmap) ───────────────────────────────────────

function YearView({
	year,
	activityMap,
	today,
}: {
	year: number;
	activityMap: Map<string, DayActivity>;
	today: Date;
}) {
	// Build weeks grid: ~53 columns × 7 rows
	const jan1 = new Date(year, 0, 1);
	const start = startOfWeek(jan1);

	const weeks: Date[][] = [];
	let cursor = start;
	while (cursor.getFullYear() <= year || (cursor.getFullYear() === year + 1 && cursor.getMonth() === 0 && cursor.getDate() <= 7)) {
		const week: Date[] = [];
		for (let d = 0; d < 7; d++) {
			week.push(new Date(cursor));
			cursor = addDays(cursor, 1);
		}
		weeks.push(week);
		if (weeks.length > 54) break; // safety
	}

	// Month labels
	const monthLabels: { label: string; col: number }[] = [];
	let lastMonth = -1;
	for (let w = 0; w < weeks.length; w++) {
		// Use the first day in the week that belongs to `year`
		const firstInYear = weeks[w]!.find((d) => d.getFullYear() === year);
		if (firstInYear && firstInYear.getMonth() !== lastMonth) {
			lastMonth = firstInYear.getMonth();
			monthLabels.push({ label: MONTHS_SHORT[lastMonth]!, col: w });
		}
	}

	const cellSize = 10;
	const gap = 2;
	const totalW = weeks.length * (cellSize + gap);

	return (
		<div className="overflow-x-auto">
			{/* Month labels */}
			<div className="relative h-4 ml-6" style={{ width: totalW }}>
				{monthLabels.map(({ label, col }) => (
					<span
						key={`${label}-${col}`}
						className="absolute text-[9px] font-mono text-(--color-text-muted)"
						style={{ left: col * (cellSize + gap) }}
					>
						{label}
					</span>
				))}
			</div>

			<div className="flex gap-0.5">
				{/* Day labels */}
				<div className="flex flex-col shrink-0" style={{ gap, width: 20 }}>
					{WEEKDAYS_SHORT.map((w, i) => (
						<div
							key={w}
							className="text-[8px] font-mono text-(--color-text-muted) flex items-center justify-end pr-1"
							style={{ height: cellSize }}
						>
							{i % 2 === 1 ? w : ""}
						</div>
					))}
				</div>

				{/* Grid */}
				<div className="flex" style={{ gap }}>
					{weeks.map((week, wi) => (
						<div key={wi} className="flex flex-col" style={{ gap }}>
							{week.map((date) => {
								const key = toDateKey(date);
								const inYear = date.getFullYear() === year;
								const activity = activityMap.get(key);
								const count = activity?.pomodoros ?? 0;
								const level = inYear ? heatLevel(count) : -1;
								const isToday = isSameDay(date, today);

								return (
									<div
										key={key}
										style={{
											width: cellSize,
											height: cellSize,
											backgroundColor: level < 0 ? "transparent" : heatColor(level),
											outline: isToday ? "1px solid var(--color-text-primary)" : "none",
										}}
										title={inYear ? `${key}: ${count} pomodoros` : ""}
									/>
								);
							})}
						</div>
					))}
				</div>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-1 mt-2 ml-6">
				<span className="text-[9px] text-(--color-text-muted) mr-1">Less</span>
				{[0, 1, 2, 3, 4].map((level) => (
					<div
						key={level}
						style={{
							width: cellSize,
							height: cellSize,
							backgroundColor: heatColor(level),
						}}
					/>
				))}
				<span className="text-[9px] text-(--color-text-muted) ml-1">More</span>
			</div>
		</div>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CalendarPanel({ activities, className = "", showCalendarEvents = false }: CalendarPanelProps) {
	const [view, setView] = useState<CalendarView>("month");
	const today = useMemo(() => new Date(), []);

	// Google Calendar integration
	const { state: googleState, events: googleEvents } = useGoogleCalendar();

	// Navigation state
	const [monthOffset, setMonthOffset] = useState(0); // relative to current month
	const [weekOffset, setWeekOffset] = useState(0);
	const [yearOffset, setYearOffset] = useState(0);

	const activityMap = useMemo(() => {
		const m = new Map<string, DayActivity>();
		for (const a of activities) m.set(a.date, a);
		return m;
	}, [activities]);

	// Current display date
	const displayMonth = useMemo(() => {
		const d = new Date(today);
		d.setMonth(d.getMonth() + monthOffset);
		return d;
	}, [today, monthOffset]);

	const displayWeekStart = useMemo(() => {
		const base = startOfWeek(today);
		return addDays(base, weekOffset * 7);
	}, [today, weekOffset]);

	const displayYear = today.getFullYear() + yearOffset;

	// Navigation label
	const navLabel = view === "month"
		? `${displayMonth.getFullYear()}年${displayMonth.getMonth() + 1}月`
		: view === "week"
			? (() => {
				const end = addDays(displayWeekStart, 6);
				return `${displayWeekStart.getMonth() + 1}/${displayWeekStart.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`;
			})()
			: `${displayYear}年`;

	const handlePrev = () => {
		if (view === "month") setMonthOffset((o) => o - 1);
		else if (view === "week") setWeekOffset((o) => o - 1);
		else setYearOffset((o) => o - 1);
	};

	const handleNext = () => {
		if (view === "month") setMonthOffset((o) => o + 1);
		else if (view === "week") setWeekOffset((o) => o + 1);
		else setYearOffset((o) => o + 1);
	};

	const handleToday = () => {
		setMonthOffset(0);
		setWeekOffset(0);
		setYearOffset(0);
	};

	const views: { key: CalendarView; label: string }[] = [
		{ key: "month", label: "月" },
		{ key: "week", label: "週" },
		{ key: "year", label: "年" },
	];

	return (
		<div className={`flex flex-col overflow-hidden ${className}`}>
			{/* Header: view tabs + navigation */}
			<div className="flex items-center gap-2 px-3 py-2 shrink-0">
				{/* View tabs */}
				<div className="flex">
					{views.map((v) => (
						<button
							key={v.key}
							type="button"
							className={`px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase transition-colors ${
								view === v.key
									? "text-(--color-text-primary) bg-(--color-surface)"
									: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
							}`}
							onClick={() => setView(v.key)}
						>
							{v.label}
						</button>
					))}
				</div>

				<div className="flex-1" />

				{/* Google Calendar status indicator */}
				{showCalendarEvents && (
					<div className="flex items-center gap-1 mr-2">
						<div
							className={`w-1.5 h-1.5 rounded-full ${
								googleState.isConnected
									? "bg-green-500"
									: googleState.isConnecting
										? "bg-yellow-500 animate-pulse"
										: "bg-gray-500"
							}`}
							title={
								googleState.isConnected
									? "Google Calendar connected"
									: "Google Calendar not connected"
							}
						/>
						{googleEvents.length > 0 && (
							<span className="text-[8px] text-(--color-text-muted)">
								{googleEvents.length} events
							</span>
						)}
					</div>
				)}

				{/* Navigation */}
				<button
					type="button"
					className="p-1 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
					onClick={handlePrev}
				>
					<ChevronLeft size={14} />
				</button>

				<button
					type="button"
					className="text-[10px] font-mono text-(--color-text-secondary) hover:text-(--color-text-primary) px-1 transition-colors"
					onClick={handleToday}
				>
					{navLabel}
				</button>

				<button
					type="button"
					className="p-1 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
					onClick={handleNext}
				>
					<ChevronRight size={14} />
				</button>
			</div>

			<div className="h-px bg-(--color-border)" />

			{/* Content */}
			<div className="flex-1 overflow-auto px-3 py-2">
				{view === "month" && (
					<MonthView
						year={displayMonth.getFullYear()}
						month={displayMonth.getMonth()}
						activityMap={activityMap}
						today={today}
						googleEvents={googleEvents}
						showGoogleEvents={showCalendarEvents && googleState.isConnected}
					/>
				)}
				{view === "week" && (
					<WeekView
						weekStart={displayWeekStart}
						activityMap={activityMap}
						today={today}
						googleEvents={googleEvents}
						showGoogleEvents={showCalendarEvents && googleState.isConnected}
					/>
				)}
				{view === "year" && (
					<YearView
						year={displayYear}
						activityMap={activityMap}
						today={today}
					/>
				)}
			</div>
		</div>
	);
}
