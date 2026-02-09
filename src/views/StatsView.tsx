/**
 * StatsView -- Standalone statistics window.
 *
 * Shows session history and stats from Rust backend + localStorage.
 */
import { useMemo } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import TitleBar from "@/components/TitleBar";
import StatsWidget from "@/components/StatsWidget";
import type { PomodoroSettings, PomodoroSession, PomodoroStats } from "@/types";
import { DEFAULT_SETTINGS } from "@/constants/defaults";

export default function StatsView() {
	const [settings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);
	const [sessions] = useLocalStorage<PomodoroSession[]>(
		"pomodoroom-sessions",
		[],
	);

	const theme = settings.theme;

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// Compute stats from sessions
	const stats = useMemo<PomodoroStats>(() => {
		const today = new Date().toDateString();
		const todaySessions = sessions.filter(
			(s) => new Date(s.completedAt).toDateString() === today,
		);
		const workSessions = sessions.filter(
			(s) => s.type === "work" || s.type === "focus",
		);
		const breakSessions = sessions.filter(
			(s) =>
				s.type === "shortBreak" ||
				s.type === "longBreak" ||
				s.type === "break",
		);

		return {
			totalSessions: sessions.length,
			totalWorkTime: workSessions.reduce(
				(sum, s) => sum + (s.duration ?? 0),
				0,
			),
			totalBreakTime: breakSessions.reduce(
				(sum, s) => sum + (s.duration ?? 0),
				0,
			),
			completedPomodoros: workSessions.length,
			currentStreak: 0,
			longestStreak: 0,
			todaysSessions: todaySessions.length,
		};
	}, [sessions]);

	return (
		<div
			className={`w-screen h-screen overflow-auto select-none ${
				theme === "dark"
					? "bg-gray-900 text-white"
					: "bg-white text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar theme={theme} title="Statistics" showMinMax={false} />

			<div className="pt-10 p-4">
				<StatsWidget stats={stats} sessions={sessions} />
			</div>
		</div>
	);
}
