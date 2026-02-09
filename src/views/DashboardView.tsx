/**
 * DashboardView -- TaskShoot方式 + Sociomedia HIG準拠.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  TitleBar                                    │
 *   ├──────────────────────────────────────────────┤
 *   │  QuickBar (compact│通知│sound│sidebar│clock)  │
 *   ├──────────────────────────────────────────────┤
	 *   │  NowHub (Timer + 実行中タスク + Nextキュー)   │
 *   ├─────────────────────────┬────────────────────┤
 *   │  TaskStream             │  Calendar          │
 *   │  (TaskShoot式           │  DaySchedule       │
 *   │   Plan→Doing→Log)       │  Tools             │
 *   ├─────────────────────────┴────────────────────┤
 *   │  Timeline                                    │
 *   └──────────────────────────────────────────────┘
 *
 * Design principles:
 *   - TaskShoot: 上から順に実行、1-click遷移、中断ボタン、全ログ記録
 *   - Sociomedia HIG: direct manipulation, modelessness, object-based UI
 *   - Markdown: ユーザーデータ形式はMarkdownのみ
 *   - Compact mode: 情報量を減らしてフォーカス
 *   - Detachable panels: 各パネルを別ウィンドウで開ける
 *
 * Issues: #86, #87, #88, #93
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import TitleBar from "@/components/TitleBar";
import NowHub from "@/components/NowHub";
import TaskStream from "@/components/TaskStream";
import type { StreamAction } from "@/components/TaskStream";
import TimelineBar from "@/components/TimelineBar";
import CalendarPanel from "@/components/CalendarPanel";
import type { DayActivity } from "@/components/CalendarPanel";
import DaySchedulePanel from "@/components/DaySchedulePanel";
import ToolsPanel from "@/components/ToolsPanel";
import QuickBar from "@/components/QuickBar";
import type { PomodoroSettings } from "@/types";
import type { Task, DailyTemplate } from "@/types/schedule";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";
import type { TaskStreamItem, QuickSettings } from "@/types/taskstream";
import { DEFAULT_QUICK_SETTINGS, createMockTaskStream } from "@/types/taskstream";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { playNotificationSound } from "@/utils/soundPlayer";
import { useNotifications } from "@/hooks/useNotifications";
import { generateSchedule, createMockProjects, createMockCalendarEvents } from "@/utils/scheduler";

// ─── Main Dashboard View ────────────────────────────────────────────────────────

export default function DashboardView() {
	const { handleRightDown } = useRightClickDrag();
	const timer = useTauriTimer();
	const { requestPermission, showNotification } = useNotifications();

	// Settings
	const [settings, setSettings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);

	const theme = settings.theme ?? "dark";

	// ── Quick settings (compact, notifications, sound) ──────────────────────
	const [quickSettings, setQuickSettings] = useLocalStorage<QuickSettings>(
		"pomodoroom-quick-settings",
		DEFAULT_QUICK_SETTINGS,
	);

	const handleUpdateQuickSettings = useCallback(
		(patch: Partial<QuickSettings>) => setQuickSettings((prev) => ({ ...prev, ...patch })),
		[setQuickSettings],
	);

	// ── Sidebar visibility ──────────────────────────────────────────────────
	const [sidebarVisible, setSidebarVisible] = useLocalStorage(
		"pomodoroom-sidebar-visible",
		true,
	);

	// ── Layout state: right sidebar width ───────────────────────────────────
	const [sidebarWidth, setSidebarWidth] = useLocalStorage(
		"pomodoroom-dashboard-sidebar-width",
		280,
	);
	const sidebarRef = useRef(sidebarWidth);
	const contentRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{
		startX: number;
		startWidth: number;
		rect: DOMRect;
	} | null>(null);

	useEffect(() => { sidebarRef.current = sidebarWidth; }, [sidebarWidth]);

	const beginSidebarDrag = useCallback((e: React.MouseEvent) => {
		if (!contentRef.current) return;
		e.preventDefault();
		e.stopPropagation();
		dragRef.current = {
			startX: e.clientX,
			startWidth: sidebarRef.current,
			rect: contentRef.current.getBoundingClientRect(),
		};
	}, []);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = dragRef.current;
			if (!d) return;
			const delta = d.startX - e.clientX;
			const minSidebar = 220;
			const maxSidebar = Math.min(480, d.rect.width - 400);
			const next = Math.min(Math.max(d.startWidth + delta, minSidebar), maxSidebar);
			setSidebarWidth(next);
		};
		const onUp = () => { dragRef.current = null; };
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, [setSidebarWidth]);

	// ── Clock for QuickBar ──────────────────────────────────────────────────
	const [currentTime, setCurrentTime] = useState(() => {
		const n = new Date();
		return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
	});
	useEffect(() => {
		const iv = setInterval(() => {
			const n = new Date();
			setCurrentTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
		}, 10000);
		return () => clearInterval(iv);
	}, []);

	// Request notification permission
	useEffect(() => { requestPermission(); }, [requestPermission]);

	// Notification on timer complete
	useEffect(() => {
		if (timer.isCompleted) {
			const isFocus = timer.stepType === "focus";
			const msg = isFocus ? "Focus session complete!" : "Break time over!";
			if (quickSettings.notificationsEnabled) {
				showNotification({ title: "Pomodoroom", body: msg });
			}
			if (quickSettings.soundEnabled) {
				playNotificationSound();
			}
		}
	}, [timer.isCompleted, timer.stepType, showNotification, quickSettings]);

	// Toggle theme
	const toggleTheme = useCallback(() => {
		setSettings((prev) => ({
			...prev,
			theme: prev.theme === "dark" ? "light" : "dark",
		}));
	}, [setSettings]);

	// ── Schedule data (mock) ──────────────────────────────────────────────────

	const template: DailyTemplate = DEFAULT_DAILY_TEMPLATE;

	const { tasks } = useMemo(() => createMockProjects(), []);
	const calendarEvents = useMemo(() => createMockCalendarEvents(), []);

	const scheduleBlocks = useMemo(
		() => generateSchedule({ template, calendarEvents, tasks }),
		[template, calendarEvents, tasks],
	);

	// ── TaskStream state ────────────────────────────────────────────────────
	const [streamItems, setStreamItems] = useState<TaskStreamItem[]>(
		() => createMockTaskStream(),
	);

	const handleStreamAction = useCallback((taskId: string, action: StreamAction) => {
		setStreamItems((prev) => {
			const now = new Date().toISOString();
			return prev.map((item) => {
				if (item.id !== taskId) return item;
				switch (action) {
					case "start":
						return { ...item, status: "doing" as const, startedAt: now };
					case "complete":
						return {
							...item,
							status: "log" as const,
							completedAt: now,
							actualMinutes: item.startedAt
								? Math.floor((Date.now() - new Date(item.startedAt).getTime()) / 60000)
								: item.actualMinutes,
						};
					case "interrupt":
						return {
							...item,
							status: "interrupted" as const,
							interruptCount: item.interruptCount + 1,
							actualMinutes: item.startedAt
								? Math.floor((Date.now() - new Date(item.startedAt).getTime()) / 60000)
								: item.actualMinutes,
						};
					case "defer":
						return { ...item, status: "defer" as const };
					case "replan":
						return { ...item, status: "plan" as const, startedAt: undefined };
					case "delete":
						return item; // handled below
					default:
						return item;
				}
			}).filter((item) => !(item.id === taskId && action === "delete"));
		});
	}, []);

	const handleAddStreamTask = useCallback((title: string) => {
		const maxOrder = streamItems
			.filter((i) => i.status === "plan")
			.reduce((m, i) => Math.max(m, i.order), -1);
		const newItem: TaskStreamItem = {
			id: `ts-${Date.now()}`,
			title,
			status: "plan",
			estimatedMinutes: 25,
			actualMinutes: 0,
			interruptCount: 0,
			tags: [],
			createdAt: new Date().toISOString(),
			order: maxOrder + 1,
		};
		setStreamItems((prev) => [...prev, newItem]);
	}, [streamItems]);

	// Tasks for schedule blocks compatibility (DaySchedulePanel)
	const tasksWithToggle: Task[] = tasks;

	// ── Filtered items for NowHub ────────────────────────────────────────
	const doingItems = useMemo(
		() => streamItems.filter((i) => i.status === "doing"),
		[streamItems],
	);
	const interruptedItems = useMemo(
		() => streamItems.filter((i) => i.status === "interrupted"),
		[streamItems],
	);
	const nextItems = useMemo(
		() => streamItems
			.filter((i) => i.status === "plan")
			.sort((a, b) => a.order - b.order)
			.slice(0, 3),
		[streamItems],
	);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) return;

			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				if (timer.isActive) timer.pause();
				else timer.start();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [timer]);

	// ── Mock calendar activity data ───────────────────────────────────────────
	const mockActivities: DayActivity[] = useMemo(() => {
		const result: DayActivity[] = [];
		const today = new Date();
		for (let i = 0; i < 365; i++) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const key = d.toISOString().slice(0, 10);
			const isWeekend = d.getDay() === 0 || d.getDay() === 6;
			const base = isWeekend ? 0.3 : 0.7;
			const rand = Math.random();
			const pomodoros = rand < (1 - base) ? 0 : Math.floor(rand * 8) + 1;
			if (pomodoros > 0) {
				result.push({ date: key, pomodoros, focusMinutes: pomodoros * 25 });
			}
		}
		return result;
	}, []);

	// Pop-out handler (stub)
	const handleOpenWindow = useCallback((windowLabel: string) => {
		console.log(`[Dashboard] Open window: ${windowLabel}`);
	}, []);

	const isCompact = quickSettings.compactMode;

	return (
		<div
			className="w-screen h-screen flex flex-col overflow-hidden select-none bg-(--color-bg) text-(--color-text-primary)"
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar
				theme={theme}
				showModeToggles
				floatMode={timer.windowState.float_mode}
				alwaysOnTop={timer.windowState.always_on_top}
				onToggleFloat={() => timer.setFloatMode(!timer.windowState.float_mode)}
				onTogglePin={() => timer.setAlwaysOnTop(!timer.windowState.always_on_top)}
				showMenu
				onToggleTheme={toggleTheme}
			/>

			{/* Main content: QuickBar → NowHub(全幅) → TaskStream+Sidebar → Timeline */}
			<div className="flex-1 overflow-hidden pt-10">
				<div ref={contentRef} className="flex flex-col h-full">
					{/* ── QuickBar (設定 + 時計) ──────────────────────────── */}
					<QuickBar
						settings={quickSettings}
						onUpdateSettings={handleUpdateQuickSettings}
						currentTime={currentTime}
						sidebarVisible={sidebarVisible}
						onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
					/>

					{/* ── NowHub: Timer + 実行中タスク + 次キュー (全幅) ── */}
					<NowHub
						timer={timer}
						doingItems={doingItems}
						nextItems={nextItems}
						interruptedItems={interruptedItems}
						onAction={handleStreamAction}
						className="shrink-0"
					/>

					<div className="h-px bg-(--color-border)" />

					{/* ── Body: TaskStream + Right sidebar ─────────────── */}
					<div className="flex-1 flex overflow-hidden">
						{/* ── Left column: TaskStream ──────────────────── */}
						<TaskStream
							items={streamItems}
							onAction={handleStreamAction}
							onAddTask={handleAddStreamTask}
							compact={isCompact}
							onPopOut={() => handleOpenWindow("task-stream")}
							className="flex-1 min-w-0"
						/>

						{/* ── Drag handle + Right sidebar ──────────────── */}
						{sidebarVisible && (
							<>
								<div
									className="w-px bg-(--color-border) cursor-col-resize hover:bg-(--color-text-muted) transition-colors"
									onMouseDown={beginSidebarDrag}
									role="separator"
									aria-label="Resize sidebar"
								/>

								<div
									className="shrink-0 flex flex-col overflow-hidden"
									style={{ width: sidebarWidth }}
								>
									{/* Calendar (月/週/年) */}
									{!isCompact && (
										<>
											<CalendarPanel
												activities={mockActivities}
												className="shrink-0"
											/>
											<div className="h-px bg-(--color-border)" />
										</>
									)}

									{/* Day schedule (今日の予定) */}
									<DaySchedulePanel
										blocks={scheduleBlocks}
										tasks={tasksWithToggle}
										dayStart={template.wakeUp}
										dayEnd={template.sleep}
										className="flex-1 min-h-0"
									/>

									<div className="h-px bg-(--color-border)" />

									{/* Tools */}
									{!isCompact && (
										<ToolsPanel
											onOpenWindow={handleOpenWindow}
											className="shrink-0"
										/>
									)}
								</div>
							</>
						)}
					</div>

					{/* ── Bottom: Timeline (全幅) ───────────────────────── */}
					<div className="shrink-0 px-4 py-2 border-t border-(--color-border)">
						<TimelineBar
							blocks={scheduleBlocks}
							dayStart={template.wakeUp}
							dayEnd={template.sleep}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
