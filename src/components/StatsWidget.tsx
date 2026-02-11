import { useMemo, useState } from "react";
import type { PomodoroSession, PomodoroStats } from "@/types";

type ChartDatum = { label: string; value: number };

const metrics = [
	"id:todayFocus",
	"id:weekFocus",
	"id:monthFocus",
	"id:currentStreak",
	"id:longestStreak",
	"id:completedPomodoros",
	"id:avgSession",
	"id:focusBreakRatio",
	"id:longestFocusSession",
	"id:last7days",
] as const;

const METRIC_LABELS: Record<(typeof metrics)[number], string> = {
	"id:todayFocus": "Today's Focus",
	"id:weekFocus": "This Week",
	"id:monthFocus": "This Month",
	"id:currentStreak": "Current Streak",
	"id:longestStreak": "Longest Streak",
	"id:completedPomodoros": "Completed",
	"id:avgSession": "Avg Session",
	"id:focusBreakRatio": "Focus/Break Ratio",
	"id:longestFocusSession": "Longest Session",
	"id:last7days": "Last 7 Days",
};

const MinutesText = ({ minutes }: { minutes: number }) => {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? (
		<span>
			{h}h {m}m
		</span>
	) : (
		<span>{m}m</span>
	);
};

const Sparkline = ({ data }: { data: ChartDatum[] }) => {
	if (!data.length) return null;
	const max = Math.max(...data.map((d) => d.value), 1);
	const points = data
		.map((d, i) => {
			const x = (i / Math.max(1, data.length - 1)) * 100;
			const y = 100 - (d.value / max) * 100;
			return `${x},${y}`;
		})
		.join(" ");
	return (
		<svg viewBox="0 0 100 100" className="w-full h-16">
			<polyline
				points={points}
				fill="none"
				stroke="#2563eb"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{data.map((d, i) => {
				const x = (i / Math.max(1, data.length - 1)) * 100;
				const y = 100 - (d.value / max) * 100;
				return <circle key={d.label} cx={x} cy={y} r="2.4" fill="#2563eb" />;
			})}
		</svg>
	);
};

const MiniBars = ({ data }: { data: ChartDatum[] }) => {
	const max = Math.max(...data.map((d) => d.value), 1);
	return (
		<div className="flex items-end justify-between gap-1 w-full">
			{data.map((d) => (
				<div key={d.label} className="flex-1 flex flex-col items-center gap-1">
					<div
						className="w-full rounded-full bg-blue-500"
						style={{ height: `${Math.max(6, (d.value / max) * 42)}px` }}
					/>
					<span className="text-[10px] opacity-60">{d.label}</span>
				</div>
			))}
		</div>
	);
};

export default function StatsWidget({
	stats,
	sessions,
}: {
	stats: PomodoroStats;
	sessions: PomodoroSession[];
}) {
	const [metric, setMetric] =
		useState<(typeof metrics)[number]>("id:todayFocus");

	const now = useMemo(() => new Date(), []);
	const todayStr = now.toISOString().slice(0, 10);
	const startOfWeek = useMemo(() => {
		const d = new Date(now);
		d.setDate(now.getDate() - ((now.getDay() + 6) % 7));
		return d;
	}, [now]);
	const startOfMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);

	const sessionsDone = sessions.filter((s) => s.completed && s.endTime);

	const minutesToday = useMemo(
		() =>
			sessionsDone
				.filter((s) => s.endTime?.startsWith(todayStr))
				.filter((s) => s.type === "focus")
				.reduce((acc, s) => acc + s.duration, 0),
		[sessionsDone, todayStr],
	);

	const minutesWeek = useMemo(
		() =>
			sessionsDone
				.filter(
					(s) => s.endTime && new Date(s.endTime) >= startOfWeek && s.type === "focus",
				)
				.reduce((acc, s) => acc + s.duration, 0),
		[sessionsDone, startOfWeek],
	);
	const minutesMonth = useMemo(
		() =>
			sessionsDone
				.filter(
					(s) => s.endTime && new Date(s.endTime) >= startOfMonth && s.type === "focus",
				)
				.reduce((acc, s) => acc + s.duration, 0),
		[sessionsDone, startOfMonth],
	);

	const avgSession = useMemo(() => {
		const focus = sessionsDone.filter((s) => s.type === "focus");
		if (!focus.length) return 0;
		return focus.reduce((acc, s) => acc + s.duration, 0) / focus.length;
	}, [sessionsDone]);

	const focusBreakRatio = useMemo(() => {
		const focus = sessionsDone
			.filter((s) => s.type === "focus")
			.reduce((a, s) => a + s.duration, 0);
		const breaks = sessionsDone
			.filter((s) => s.type !== "focus")
			.reduce((a, s) => a + s.duration, 0);
		return breaks === 0 ? focus : focus / breaks;
	}, [sessionsDone]);

	const longestFocusSession = useMemo(
		() =>
			sessionsDone
				.filter((s) => s.type === "focus")
				.reduce((max, s) => Math.max(max, s.duration), 0),
		[sessionsDone],
	);

	const last7DaysData = useMemo(() => {
		const days: ChartDatum[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(now.getDate() - i);
			const key = d.toISOString().slice(0, 10);
			const minutes = sessionsDone
				.filter((s) => s.endTime?.startsWith(key))
				.filter((s) => s.type === "focus")
				.reduce((acc, s) => acc + s.duration, 0);
			days.push({
				label: `${d.getMonth() + 1}/${d.getDate()}`,
				value: minutes,
			});
		}
		return days;
	}, [sessionsDone, now]);

	const metricContent = (() => {
		switch (metric) {
			case "id:todayFocus":
				return { label: METRIC_LABELS[metric], value: <MinutesText minutes={minutesToday} /> };
			case "id:weekFocus":
				return { label: METRIC_LABELS[metric], value: <MinutesText minutes={minutesWeek} /> };
			case "id:monthFocus":
				return { label: METRIC_LABELS[metric], value: <MinutesText minutes={minutesMonth} /> };
			case "id:currentStreak":
				return { label: METRIC_LABELS[metric], value: <span>{stats.currentStreak} days</span> };
			case "id:longestStreak":
				return { label: METRIC_LABELS[metric], value: <span>{stats.longestStreak} days</span> };
			case "id:completedPomodoros":
				return { label: METRIC_LABELS[metric], value: <span>{stats.completedPomodoros}</span> };
			case "id:avgSession":
				return { label: METRIC_LABELS[metric], value: <MinutesText minutes={Math.round(avgSession)} /> };
			case "id:focusBreakRatio":
				return { label: METRIC_LABELS[metric], value: <span>{focusBreakRatio.toFixed(2)} : 1</span> };
			case "id:longestFocusSession":
				return { label: METRIC_LABELS[metric], value: <MinutesText minutes={longestFocusSession} /> };
			case "id:last7days":
				return {
					label: METRIC_LABELS[metric],
					value: (
						<div className="w-full space-y-2">
							<Sparkline data={last7DaysData} />
							<MiniBars data={last7DaysData} />
						</div>
					),
				};
			default:
				return { label: "", value: null };
		}
	})();

	return (
		<div className="relative p-2 sm:p-3 h-full w-full text-sm text-black overflow-visible">
			<select
				value={metric}
				onChange={(e) => setMetric(e.target.value as (typeof metrics)[number])}
				className="pointer-events-auto absolute -top-2 left-1/2 -translate-x-1/2 border border-black/20 rounded px-3 py-2 bg-transparent text-sm min-w-[150px] max-w-[220px] text-center shadow-sm"
			>
				{metrics.map((m) => (
					<option value={m} key={m}>
						{METRIC_LABELS[m]}
					</option>
				))}
			</select>
			<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
				<div className="text-xs uppercase tracking-wider opacity-60 leading-tight px-2">
					{metricContent.label}
				</div>
				<div className="text-3xl font-bold leading-none">
					{metricContent.value}
				</div>
			</div>
		</div>
	);
}
