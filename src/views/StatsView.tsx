/**
 * StatsView -- Standalone statistics window.
 *
 * Shows session history and stats from Rust backend + localStorage.
 * Includes daily, weekly, and monthly views with charts.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { Icon, type MSIconName } from "@/components/m3/Icon";
import type { PomodoroSession, PomodoroStats } from "@/types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import PomodoroChart from "@/components/charts/PomodoroChart";
import ProjectPieChart from "@/components/charts/ProjectPieChart";
import WeeklyHeatmap from "@/components/charts/WeeklyHeatmap";
import { useTheme } from "@/hooks/useTheme";
import { buildDailyCognitiveLoadStats } from "@/utils/cognitive-load-estimator";

// Tab options
type TabType = "today" | "week" | "month" | "projects" | "all";

// Format minutes to readable string
const formatMinutes = (minutes: number): string => {
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${minutes}m`;
};

// Get start of week (Monday)
const getStartOfWeek = (date: Date): Date => {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1);
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d;
};

// Get start of month
const getStartOfMonth = (date: Date): Date => {
	return new Date(date.getFullYear(), date.getMonth(), 1);
};

// Calculate streak (consecutive days with at least one focus session)
const calculateStreak = (sessions: PomodoroSession[]): { current: number; longest: number } => {
	const focusSessions = sessions.filter((s) => s.type === "focus" || s.type === "work");
	if (focusSessions.length === 0) return { current: 0, longest: 0 };

	// Group sessions by date
	const sessionsByDate = new Map<string, number>();
	for (const s of focusSessions) {
		const dateStr = new Date(s.completedAt).toISOString().slice(0, 10);
		sessionsByDate.set(dateStr, (sessionsByDate.get(dateStr) ?? 0) + 1);
	}

	// Sort dates
	const dates = Array.from(sessionsByDate.keys()).sort().reverse();

	// Calculate current streak
	let currentStreak = 0;
	const today = new Date().toISOString().slice(0, 10);
	const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

	if (dates.includes(today) || dates.includes(yesterday)) {
		for (let i = 0; i < dates.length; i++) {
			const expectedDate = i === 0 && dates[0] !== today
				? yesterday
				: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
			if (dates[i] === expectedDate || (i === 0 && dates[i] === today)) {
				currentStreak++;
			} else {
				break;
			}
		}
	}

	// Calculate longest streak
	let longestStreak = 0;
	let tempStreak = 1;
	for (let i = 1; i < dates.length; i++) {
		const prevDate = new Date(dates[i - 1] ?? "");
		const currDate = new Date(dates[i] ?? "");
		const dayDiff = (prevDate.getTime() - currDate.getTime()) / 86400000;

		if (dayDiff === 1) {
			tempStreak++;
		} else {
			longestStreak = Math.max(longestStreak, tempStreak);
			tempStreak = 1;
		}
	}
	longestStreak = Math.max(longestStreak, tempStreak);

	return { current: currentStreak, longest: longestStreak };
};

// Calculate project-wise statistics
const calculateProjectStats = (sessions: PomodoroSession[]): { project: string; count: number; focusTime: number }[] => {
	const focusSessions = sessions.filter((s) => s.type === "focus" || s.type === "work");
	const projectMap = new Map<string, { count: number; focusTime: number }>();

	for (const s of focusSessions) {
		const project = s.project || "No Project";
		const existing = projectMap.get(project) ?? { count: 0, focusTime: 0 };
		projectMap.set(project, {
			count: existing.count + 1,
			focusTime: existing.focusTime + s.duration,
		});
	}

	return Array.from(projectMap.entries())
		.map(([project, data]) => ({ project, ...data }))
		.sort((a, b) => b.count - a.count);
};

// Calculate task completion rate
const calculateCompletionRate = (sessions: PomodoroSession[]): { completed: number; total: number; rate: number } => {
	const focusSessions = sessions.filter((s) => s.type === "focus" || s.type === "work");
	const completed = focusSessions.filter((s) => s.completed !== false && !s.interrupted).length;
	const total = focusSessions.length;
	return {
		completed,
		total,
		rate: total > 0 ? Math.round((completed / total) * 100) : 0,
	};
};

// Mini bar chart component
function BarChart({
	data,
	theme,
	height = 100,
}: {
	data: { label: string; value: number; highlight?: boolean }[];
	theme: "light" | "dark";
	height?: number;
}) {
	const max = Math.max(...data.map((d) => d.value), 1);
	const isDark = theme === "dark";

	return (
		<div className="flex items-end justify-between gap-1 w-full" style={{ height }}>
			{data.map((d, i) => (
				<div
					key={`${d.label}-${i}`}
					className="flex-1 flex flex-col items-center gap-1 h-full"
				>
					<div className="flex-1 w-full flex items-end">
						<div
							className={`w-full rounded-t-sm transition-all ${
								d.highlight
									? "bg-blue-500"
									: isDark
										? "bg-gray-700"
										: "bg-gray-300"
							}`}
							style={{
								height: `${Math.max(4, (d.value / max) * 100)}%`,
							}}
						/>
					</div>
					<span
						className={`text-[10px] ${
							d.highlight
							? (isDark
								? "bg-(--md-ref-color-surface-container) text-(--md-ref-color-on-surface)"
								: "bg-(--md-ref-color-surface) text-(--md-ref-color-on-surface)")
							: isDark
								? "text-gray-500"
								: "text-gray-400"
						}`}
					>
						{d.label}
					</span>
				</div>
			))}
		</div>
	);
}

// Stat card component
function StatCard({
	iconName,
	label,
	value,
	subValue,
	theme,
	color = "blue",
}: {
	iconName: MSIconName;
	label: string;
	value: string | number;
	subValue?: string;
	theme: "light" | "dark";
	color?: "blue" | "green" | "orange" | "purple";
}) {
	const isDark = theme === "dark";
	const colorClasses = {
		blue: isDark ? "text-blue-400 bg-blue-500/20" : "text-blue-600 bg-blue-100",
		green: isDark ? "text-green-400 bg-green-500/20" : "text-green-600 bg-green-100",
		orange: isDark ? "text-orange-400 bg-orange-500/20" : "text-orange-600 bg-orange-100",
		purple: isDark ? "text-purple-400 bg-purple-500/20" : "text-purple-600 bg-purple-100",
	};

	return (
		<div
			className={`rounded-xl p-4 ${
				isDark ? "bg-gray-800" : "bg-gray-50"
			}`}
		>
			<div className="flex items-center gap-3">
				<div className={`p-2 rounded-lg ${colorClasses[color]}`}>
					<Icon name={iconName} size={20} />
				</div>
				<div className="flex-1 min-w-0">
					<div
						className={`text-xs font-medium ${
							isDark ? "text-gray-400" : "text-gray-500"
						}`}
					>
						{label}
					</div>
					<div className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
						{value}
					</div>
					{subValue && (
						<div
							className={`text-xs ${
								isDark ? "text-gray-500" : "text-gray-400"
							}`}
						>
							{subValue}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// Session list item
function SessionItem({
	session,
	theme,
}: {
	session: PomodoroSession;
	theme: "light" | "dark";
}) {
	const isDark = theme === "dark";
	const date = new Date(session.completedAt);
	const isFocus = session.type === "focus" || session.type === "work";

	return (
		<div
			className={`flex items-center justify-between py-2 px-3 rounded-lg ${
				isDark ? "bg-gray-800/50" : "bg-gray-50"
			}`}
		>
			<div className="flex items-center gap-3">
				<div
					className={`w-2 h-2 rounded-full ${
						isFocus ? "bg-blue-500" : "bg-green-500"
					}`}
				/>
				<div>
					<div className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
						{isFocus ? "Focus" : "Break"}
					</div>
					<div className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
						{date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
					</div>
				</div>
			</div>
			<div className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
				{formatMinutes(session.duration)}
			</div>
		</div>
	);
}

export default function StatsView() {
	// localStorage sessions removed - use backend stats only
	const sessions: PomodoroSession[] = [];

	const [activeTab, setActiveTab] = useState<TabType>("today");
	const [backendStats, setBackendStats] = useState<{
		today: PomodoroStats | null;
		all: PomodoroStats | null;
	}>({ today: null, all: null });
	const [isLoading, setIsLoading] = useState(false);
	const { theme } = useTheme();
	const isDark = theme === "dark";

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// Fetch stats from Rust backend
	const fetchBackendStats = useCallback(async () => {
		setIsLoading(true);
		try {
			const [todayResult, allResult] = await Promise.all([
				invoke<PomodoroStats>("cmd_stats_today").catch(() => null),
				invoke<PomodoroStats>("cmd_stats_all").catch(() => null),
			]);
			setBackendStats({ today: todayResult, all: allResult });
		} catch (error) {
			console.error("Failed to fetch backend stats:", error);
		}
		setIsLoading(false);
	}, []);

	// Fetch on mount
	useEffect(() => {
		fetchBackendStats();
	}, [fetchBackendStats]);

	// Pre-compute session classifications to avoid repeated filtering
	const sessionClassifications = useMemo(() => {
		const focusSessions = sessions.filter(
			(s) => s.type === "work" || s.type === "focus"
		);
		const breakSessions = sessions.filter(
			(s) => s.type === "shortBreak" || s.type === "longBreak" || s.type === "break"
		);
		return { focusSessions, breakSessions };
	}, [sessions]);

	// Compute stats from localStorage sessions
	const localStats = useMemo(() => {
		const now = new Date();
		const todayStr = now.toISOString().slice(0, 10);
		const startOfWeekDate = getStartOfWeek(now);
		const startOfMonthDate = getStartOfMonth(now);

		const { focusSessions, breakSessions } = sessionClassifications;

		// Today
		const todaySessions = sessions.filter(
			(s) => s.endTime?.startsWith(todayStr) || new Date(s.completedAt).toISOString().startsWith(todayStr)
		);
		const todayFocus = todaySessions.filter((s) => s.type === "focus" || s.type === "work");
		const todayBreak = todaySessions.filter((s) => s.type !== "focus" && s.type !== "work");
		const cognitiveLoadToday = buildDailyCognitiveLoadStats(todayFocus, now);

		// Week
		const weekSessions = sessions.filter((s) => {
			const d = new Date(s.completedAt);
			return d >= startOfWeekDate && d <= now;
		});
		const weekFocus = weekSessions.filter((s) => s.type === "focus" || s.type === "work");

		// Month
		const monthSessions = sessions.filter((s) => {
			const d = new Date(s.completedAt);
			return d >= startOfMonthDate && d <= now;
		});
		const monthFocus = monthSessions.filter((s) => s.type === "focus" || s.type === "work");

		// Daily data for week chart
		const weekChartData: { label: string; value: number; highlight?: boolean }[] = [];
		const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
		for (let i = 0; i < 7; i++) {
			const d = new Date(startOfWeekDate);
			d.setDate(d.getDate() + i);
			const dateStr = d.toISOString().slice(0, 10);
			const dayFocus = sessions
				.filter((s) => (s.endTime?.startsWith(dateStr) || new Date(s.completedAt).toISOString().startsWith(dateStr)) && (s.type === "focus" || s.type === "work"))
				.reduce((sum, s) => sum + s.duration, 0);
			weekChartData.push({
				label: weekDays[i] ?? "",
				value: dayFocus,
				highlight: d.toDateString() === now.toDateString(),
			});
		}

		// Weekly data for month chart
		const monthChartData: { label: string; value: number; highlight?: boolean }[] = [];
		for (let i = 0; i < 4; i++) {
			const weekStart = new Date(startOfMonthDate);
			weekStart.setDate(weekStart.getDate() + i * 7);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 7);
			const weekFocusMin = sessions
				.filter((s) => {
					const d = new Date(s.completedAt);
					return d >= weekStart && d < weekEnd && (s.type === "focus" || s.type === "work");
				})
				.reduce((sum, s) => sum + s.duration, 0);
			monthChartData.push({
				label: `W${i + 1}`,
				value: weekFocusMin,
				highlight: now >= weekStart && now < weekEnd,
			});
		}

		// Calculate streaks (memoized separately below)
		const streaks = calculateStreak(focusSessions);

		// Calculate project-wise stats (memoized separately below)
		const projectStats = calculateProjectStats(focusSessions);

		// Calculate completion rate (memoized separately below)
		const completionRate = calculateCompletionRate(focusSessions);

		// Generate heatmap data (last 12 weeks)
		const heatmapData: { date: string; value: number }[] = [];
		for (let i = 84; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const dateStr = d.toISOString().slice(0, 10);
			const dayPomodoros = focusSessions.filter((s) =>
				new Date(s.completedAt).toISOString().startsWith(dateStr)
			).length;
			heatmapData.push({ date: dateStr, value: dayPomodoros });
		}

		// Daily pomodoro counts (for bar chart)
		const dailyPomodoroCounts: { label: string; value: number; highlight?: boolean }[] = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const dateStr = d.toISOString().slice(0, 10);
			const dayPomodoros = focusSessions.filter((s) =>
				new Date(s.completedAt).toISOString().startsWith(dateStr)
			).length;
			dailyPomodoroCounts.push({
				label: d.toLocaleDateString("en-US", { weekday: "short" }),
				value: dayPomodoros,
				highlight: i === 0,
			});
		}

		return {
			today: {
				sessions: todaySessions.length,
				focusTime: todayFocus.reduce((sum, s) => sum + s.duration, 0),
				breakTime: todayBreak.reduce((sum, s) => sum + s.duration, 0),
				pomodoros: todayFocus.length,
				cognitiveLoadIndex: cognitiveLoadToday.index,
				cognitiveLoadSpike: cognitiveLoadToday.spike,
				recommendedBreakMinutes: cognitiveLoadToday.recommendedBreakMinutes,
			},
			week: {
				sessions: weekSessions.length,
				focusTime: weekFocus.reduce((sum, s) => sum + s.duration, 0),
				pomodoros: weekFocus.length,
				chartData: weekChartData,
			},
			month: {
				sessions: monthSessions.length,
				focusTime: monthFocus.reduce((sum, s) => sum + s.duration, 0),
				pomodoros: monthFocus.length,
				chartData: monthChartData,
			},
			all: {
				totalSessions: sessions.length,
				totalFocusTime: focusSessions.reduce((sum, s) => sum + s.duration, 0),
				totalBreakTime: breakSessions.reduce((sum, s) => sum + s.duration, 0),
				completedPomodoros: focusSessions.length,
			},
			recentSessions: sessions
				.slice()
				.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
				.slice(0, 10),
			// New stats
			streaks,
			projectStats,
			completionRate,
			heatmapData,
			dailyPomodoroCounts,
		};
	}, [sessions, sessionClassifications]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			if (e.key === "Escape") {
				getCurrentWindow().close();
			} else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
				fetchBackendStats();
			} else if (e.key === "1") {
				setActiveTab("today");
			} else if (e.key === "2") {
				setActiveTab("week");
			} else if (e.key === "3") {
				setActiveTab("month");
			} else if (e.key === "4") {
				setActiveTab("projects");
			} else if (e.key === "5") {
				setActiveTab("all");
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [fetchBackendStats, setActiveTab]);

	const tabs: { id: TabType; label: string }[] = [
		{ id: "today", label: "Today" },
		{ id: "week", label: "Week" },
		{ id: "month", label: "Month" },
		{ id: "projects", label: "Projects" },
		{ id: "all", label: "All Time" },
	];

	return (
		<KeyboardShortcutsProvider theme={theme}>
			<DetachedWindowShell title="Statistics" showMinMax={false}>
			<div
				className={`absolute inset-0 flex flex-col overflow-hidden select-none ${
					isDark ? "bg-(--md-ref-color-surface-container) text-(--md-ref-color-on-surface)" : "bg-(--md-ref-color-surface) text-(--md-ref-color-on-surface)"
				}`}
				onMouseDown={handleRightDown}
				onContextMenu={(e) => e.preventDefault()}
			>
			{/* Tab navigation */}
			<div
				className={`flex items-center justify-between px-4 py-2 border-b ${
					isDark ? "border-gray-700" : "border-gray-200"
				}`}
			>
				<div className="flex items-center gap-1">
					{tabs.map((tab, index) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
								activeTab === tab.id
									? isDark
										? "bg-blue-600 text-white"
										: "bg-blue-500 text-white"
									: isDark
										? "text-gray-400 hover:text-white hover:bg-gray-800"
										: "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
							}`}
							title={`${tab.label} (${index + 1})`}
						>
							{tab.label}
						</button>
					))}
				</div>

				<button
					type="button"
					onClick={fetchBackendStats}
					disabled={isLoading}
					className={`p-1.5 rounded-lg transition-colors ${
						isDark
							? "hover:bg-gray-800 text-gray-400 hover:text-white"
							: "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
					} ${isLoading ? "animate-spin" : ""}`}
					title="Refresh (R)"
				>
					<Icon name="refresh" size={18} />
				</button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto scrollbar-stable-y p-4">
				{/* Today View */}
				{activeTab === "today" && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="schedule"
								label="Focus Time"
								value={formatMinutes(localStats.today.focusTime)}
								theme={theme}
								color="blue"
							/>
							<StatCard
								iconName="flag"
								label="Pomodoros"
								value={localStats.today.pomodoros}
								theme={theme}
								color="green"
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="trending_up"
								label="Sessions"
								value={localStats.today.sessions}
								theme={theme}
								color="purple"
							/>
							<StatCard
								iconName="local_fire_department"
								label="Break Time"
								value={formatMinutes(localStats.today.breakTime)}
								theme={theme}
								color="orange"
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="trending_up"
								label="Cognitive Load"
								value={localStats.today.cognitiveLoadIndex}
								subValue={localStats.today.cognitiveLoadSpike ? "Spike detected" : "Stable"}
								theme={theme}
								color={localStats.today.cognitiveLoadSpike ? "orange" : "blue"}
							/>
							<StatCard
								iconName="schedule"
								label="Recommended Break"
								value={`${localStats.today.recommendedBreakMinutes}m`}
								subValue="Adaptive from context switching"
								theme={theme}
								color="green"
							/>
						</div>

						{/* Recent sessions */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								Recent Sessions
							</h3>
							<div className="space-y-2 max-h-48 overflow-y-auto">
								{localStats.recentSessions.length > 0 ? (
									localStats.recentSessions.map((session) => (
										<SessionItem key={session.id} session={session} theme={theme} />
									))
								) : (
									<div className={`text-sm text-center py-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
										No sessions yet
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				{/* Week View */}
				{activeTab === "week" && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="schedule"
								label="Weekly Focus"
								value={formatMinutes(localStats.week.focusTime)}
								theme={theme}
								color="blue"
							/>
							<StatCard
								iconName="flag"
								label="Pomodoros"
								value={localStats.week.pomodoros}
								theme={theme}
								color="green"
							/>
						</div>

						{/* Weekly chart */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								Daily Focus Time
							</h3>
							<BarChart data={localStats.week.chartData} theme={theme} height={120} />
						</div>

						<StatCard
							iconName="trending_up"
							label="Total Sessions"
							value={localStats.week.sessions}
							subValue="This week"
							theme={theme}
							color="purple"
						/>
					</div>
				)}

				{/* Month View */}
				{activeTab === "month" && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="schedule"
								label="Monthly Focus"
								value={formatMinutes(localStats.month.focusTime)}
								theme={theme}
								color="blue"
							/>
							<StatCard
								iconName="flag"
								label="Pomodoros"
								value={localStats.month.pomodoros}
								theme={theme}
								color="green"
							/>
						</div>

						{/* Monthly chart */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								Weekly Focus Time
							</h3>
							<BarChart data={localStats.month.chartData} theme={theme} height={120} />
						</div>

						<StatCard
							iconName="trending_up"
							label="Total Sessions"
							value={localStats.month.sessions}
							subValue="This month"
							theme={theme}
							color="purple"
						/>
					</div>
				)}

				{/* All Time View */}
				{activeTab === "all" && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="schedule"
								label="Total Focus Time"
								value={formatMinutes(localStats.all.totalFocusTime)}
								theme={theme}
								color="blue"
							/>
							<StatCard
								iconName="flag"
								label="Completed"
								value={localStats.all.completedPomodoros}
								subValue="Pomodoros"
								theme={theme}
								color="green"
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<StatCard
								iconName="bolt"
								label="Current Streak"
								value={localStats.streaks.current}
								subValue={`Best: ${localStats.streaks.longest} days`}
								theme={theme}
								color="orange"
							/>
							<StatCard
								iconName="timeline"
								label="Completion Rate"
								value={`${localStats.completionRate.rate}%`}
								subValue={`${localStats.completionRate.completed}/${localStats.completionRate.total}`}
								theme={theme}
								color="purple"
							/>
						</div>

						{/* Activity Heatmap */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								Activity (Last 12 weeks)
							</h3>
							<div className="overflow-x-auto">
								<WeeklyHeatmap data={localStats.heatmapData} theme={theme} cellSize={10} />
							</div>
						</div>

						{/* Backend stats if available */}
						{backendStats.all && (
							<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
								<h3 className={`text-sm font-medium mb-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
									Database Stats
								</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<div className={isDark ? "text-gray-500" : "text-gray-400"}>Sessions</div>
										<div className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
											{backendStats.all.totalSessions}
										</div>
									</div>
									<div>
										<div className={isDark ? "text-gray-500" : "text-gray-400"}>Pomodoros</div>
										<div className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
											{backendStats.all.completedPomodoros}
										</div>
									</div>
								</div>
							</div>
						)}

						{/* Achievement */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<div className="flex items-center gap-3">
								<div className={`p-2 rounded-lg ${isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-600"}`}>
									<Icon name="award" size={20} />
								</div>
								<div>
									<div className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
										{localStats.streaks.current >= 7
											? "On fire! 🔥"
											: localStats.streaks.current >= 3
												? "Building momentum!"
												: "Keep going!"}
									</div>
									<div className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
										{localStats.streaks.current > 0
											? `${localStats.streaks.current} day streak • ${localStats.streaks.longest} day best`
											: "Start your streak today!"}
									</div>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Projects View */}
				{activeTab === "projects" && (
					<div className="space-y-4">
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								<ProjectPieChart
									data={localStats.projectStats.map((p) => ({
										name: p.project,
										value: p.count,
									}))}
									theme={theme}
									size={180}
								/>
							</h3>
						</div>

						{/* Project breakdown list */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								Project Breakdown
							</h3>
							<div className="space-y-3">
								{localStats.projectStats.length > 0 ? (
									localStats.projectStats.map((project) => (
										<div
											key={project.project}
											className={`flex items-center justify-between py-2 px-3 rounded-lg ${
												isDark ? "bg-gray-700/50" : "bg-gray-100"
											}`}
										>
											<div className="flex items-center gap-3">
												<div className="w-3 h-3 rounded-full bg-blue-500" />
												<div>
													<div className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
														{project.project}
													</div>
													<div className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
														{formatMinutes(project.focusTime)} focus time
													</div>
												</div>
											</div>
											<div className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
												{project.count} {project.count === 1 ? "pomodoro" : "pomodoros"}
											</div>
										</div>
									))
								) : (
									<div className={`text-sm text-center py-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
										No project data yet. Assign projects to your sessions to see breakdown.
									</div>
								)}
							</div>
						</div>

						{/* Daily pomodoro counts */}
						<div className={`rounded-xl p-4 ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
							<h3 className={`text-sm font-medium mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
								Last 7 Days
							</h3>
							<PomodoroChart
								data={localStats.dailyPomodoroCounts}
								theme={theme}
								height={120}
								showValues={true}
								unit=""
							/>
						</div>
					</div>
				)}
			</div>

			{/* Keyboard hints */}
			<div
				className={`px-4 py-2 text-xs border-t ${
					isDark ? "border-gray-800 text-gray-600" : "border-gray-100 text-gray-400"
				}`}
			>
				1-5 Switch tabs • R Refresh • Esc Close
			</div>
			</div>
			</DetachedWindowShell>
		</KeyboardShortcutsProvider>
	);
}
