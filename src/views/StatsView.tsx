/**
 * StatsView -- Standalone statistics window.
 *
 * Shows session history and stats from Rust backend + localStorage.
 */
import { useMemo, useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import TitleBar from "@/components/TitleBar";
import StatsWidget from "@/components/StatsWidget";
import type { PomodoroSettings, PomodoroSession, PomodoroStats } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	shortBreakDuration: 5,
	longBreakDuration: 30,
	sessionsUntilLongBreak: 4,
	notificationSound: true,
	notificationVolume: 50,
	vibration: true,
	theme: "dark",
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
};

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

	// Right-click drag
	const rightDragRef = useRef<{
		startX: number;
		startY: number;
		winX: number;
		winY: number;
		scale: number;
	} | null>(null);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = rightDragRef.current;
			if (!d) return;
			const dx = (e.screenX - d.startX) * d.scale;
			const dy = (e.screenY - d.startY) * d.scale;
			getCurrentWindow().setPosition(
				new PhysicalPosition(d.winX + dx, d.winY + dy),
			);
		};
		const onUp = () => {
			rightDragRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	const handleRightDown = useCallback(async (e: React.MouseEvent) => {
		if (e.button !== 2) return;
		e.preventDefault();
		try {
			const win = getCurrentWindow();
			const [pos, scale] = await Promise.all([
				win.outerPosition(),
				win.scaleFactor(),
			]);
			rightDragRef.current = {
				startX: e.screenX,
				startY: e.screenY,
				winX: pos.x,
				winY: pos.y,
				scale,
			};
		} catch {
			// Not in Tauri
		}
	}, []);

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
