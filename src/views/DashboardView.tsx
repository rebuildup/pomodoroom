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
import BoardPanel from "@/components/BoardPanel";
import BacklogPanel from "@/components/BacklogPanel";
import CalendarPanel from "@/components/CalendarPanel";
import TaskPool from "@/components/TaskPool";
import type { DayActivity } from "@/components/CalendarPanel";
import DaySchedulePanel from "@/components/DaySchedulePanel";
import ToolsPanel from "@/components/ToolsPanel";
import QuickBar from "@/components/QuickBar";
import { TaskDialog } from "@/components/TaskDialog";
import { TaskDrawer, useTaskDrawer } from "@/components/TaskDrawer";
import type { PomodoroSettings } from "@/types";
import type { Task, DailyTemplate } from "@/types/schedule";
import type { ScheduleBlock } from "@/types/schedule";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";
import type { TaskStreamItem, QuickSettings } from "@/types/taskstream";
import { DEFAULT_QUICK_SETTINGS, createMockTaskStream } from "@/types/taskstream";
import { DEFAULT_SETTINGS } from "@/constants/defaults";
import { playNotificationSound } from "@/utils/soundPlayer";
import { useNotifications } from "@/hooks/useNotifications";
import { generateSchedule, createMockProjects, createMockCalendarEvents } from "@/utils/scheduler";
import { useScheduler, getTodayIso } from "@/hooks/useScheduler";
import { invoke } from "@tauri-apps/api/core";

// ─── Main Dashboard View ────────────────────────────────────────────────────────

export default function DashboardView() {
	const { handleRightDown } = useRightClickDrag();
	const timer = useTauriTimer();
	const { requestPermission, showNotification } = useNotifications();
	const taskDrawer = useTaskDrawer();

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

	// ── Demo mode toggle ───────────────────────────────────────────────────────
	const [demoMode] = useLocalStorage("pomodoroom-demo-mode", true);

	// ── Backend scheduler integration ───────────────────────────────────────────
	const {
		blocks: scheduledBlocks,
		generateSchedule: generateBackendSchedule,
	} = useScheduler();

	// ── Schedule data (backend or mock) ───────────────────────────────────────
	const [template, setTemplate] = useState<DailyTemplate>(DEFAULT_DAILY_TEMPLATE);
	const [tasks, setTasks] = useState<Task[]>([]);

	// Fetch daily template from backend
	useEffect(() => {
		invoke<any>("cmd_template_get")
			.then((result) => {
				if (result) {
					setTemplate(result);
				}
			})
			.catch((err) => {
				console.error("Failed to fetch template:", err);
			});
	}, []);

	// Fetch tasks from backend
	useEffect(() => {
		invoke<Task[]>("cmd_task_list")
			.then(setTasks)
			.catch((err) => {
				console.error("Failed to fetch tasks:", err);
				// Fall back to mock data on error
				const { tasks: mockTasks } = createMockProjects();
				setTasks(mockTasks);
			});
	}, []);

	// Generate schedule from backend or use mock
	useEffect(() => {
		if (!demoMode && tasks.length > 0) {
			// Use backend scheduler (no calendar events for now)
			generateBackendSchedule(getTodayIso());
		}
	}, [demoMode, tasks, generateBackendSchedule]);

	// Use either backend scheduled blocks or mock data
	const scheduleBlocks = useMemo(() => {
		if (demoMode) {
			const mockCalendarEvents = createMockCalendarEvents();
			return generateSchedule({ template, calendarEvents: mockCalendarEvents, tasks });
		}
		// Use backend scheduled blocks
		return scheduledBlocks.length > 0 ? scheduledBlocks : [];
	}, [demoMode, template, tasks, scheduledBlocks]);

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

	// ── Task Dialog State ────────────────────────────────────────────────
	const [taskDialogOpen, setTaskDialogOpen] = useState(false);
	const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<Task | undefined>();

	const handleSaveTask = useCallback((task: Task) => {
		// TODO: Implement task save logic
		console.log("Save task:", task);
		setTaskDialogOpen(false);
	}, []);

	const handleTimelineBlockClick = useCallback((block: ScheduleBlock) => {
		if (block.taskId) {
			const task = tasks.find((t) => t.id === block.taskId);
			if (task) {
				taskDrawer.openDrawer(task);
			}
		}
	}, [tasks, taskDrawer]);

	// Task click handlers for TaskStream, BoardPanel
	const handleTaskClick = useCallback((task: Task) => {
		taskDrawer.openDrawer(task);
	}, [taskDrawer]);

	const handleTaskStreamItemClick = useCallback((item: TaskStreamItem) => {
		// For TaskStream items, convert to Task for drawer
		// TODO: Fetch full task data from backend
		const task: Task = {
			id: item.id,
			title: item.title,
			description: item.markdown,
			estimatedPomodoros: Math.ceil(item.estimatedMinutes / 25),
			completedPomodoros: 0,
			completed: item.status === "log",
			projectId: item.projectId,
			tags: item.tags,
			priority: 50,
			category: "active",
			createdAt: item.createdAt,
		};
		taskDrawer.openDrawer(task);
	}, [taskDrawer]);

	// Drawer action handlers
	const handleDrawerEdit = useCallback((task: Task) => {
		setSelectedTaskForEdit(task);
		setTaskDialogOpen(true);
		taskDrawer.closeDrawer();
	}, [taskDrawer]);

	const handleDrawerDelete = useCallback((taskId: string) => {
		// TODO: Implement task deletion
		console.log("Delete task:", taskId);
		// Remove from stream items if it's a TaskStream item
		setStreamItems((prev) => prev.filter((i) => i.id !== taskId));
		taskDrawer.closeDrawer();
	}, [taskDrawer]);

	const handleDrawerStart = useCallback((taskId: string) => {
		// Start timer for this task
		if (!timer.isActive) {
			timer.start();
		}
		// Move task to doing if it's in stream
		handleStreamAction(taskId, "start");
		taskDrawer.closeDrawer();
	}, [timer, handleStreamAction, taskDrawer]);

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

	// ── Dashboard layout state ──────────────────────────────────────────────────
	const [leftPanelVisible, setLeftPanelVisible] = useLocalStorage(
		"pomodoroom-left-panel-visible",
		true,
	);
	const [rightPanelTab, setRightPanelTab] = useLocalStorage<"calendar" | "tools" | "backlog" | "taskpool">(
		"pomodoroom-right-panel-tab",
		"calendar",
	);

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

			{/* ─────────────────────────────────────────────────────────────────────
			    3-Layer Dashboard Layout:

			    ┌─────────────────────────────────────────┐
			    │  QuickBar (settings + clock)             │
			    ├─────────────────────────────────────────┤
			    │  NowHub (Timer + Doing + Next queue)     │
			    ├─────────────────────────────────────────┤
			    │  BoardPanel (Departure board)            │
			    ├─────────────────┬───────────────────────┤
			    │  TaskStream     │  Calendar/Tools       │
			    │  (Plan→Doing→Log)│  (Right sidebar)      │
			    ├─────────────────┴───────────────────────┤
			    │  TimelineBar (horizontal schedule)       │
			    └─────────────────────────────────────────┘
			─────────────────────────────────────────────────────────────────────── */}
			<div className="flex-1 overflow-hidden pt-10">
				<div ref={contentRef} className="flex flex-col h-full">
					{/* ── Layer 1: QuickBar ──────────────────────────────────────── */}
					<QuickBar
						settings={quickSettings}
						onUpdateSettings={handleUpdateQuickSettings}
						currentTime={currentTime}
						sidebarVisible={sidebarVisible}
						onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
						className="shrink-0"
					/>

					{/* ── Layer 2: NowHub (Timer + Doing + Next) ─────────────────── */}
					<NowHub
						timer={timer}
						doingItems={doingItems}
						nextItems={nextItems}
						interruptedItems={interruptedItems}
						allPlanItems={streamItems.filter((i) => i.status === "plan")}
						onAction={handleStreamAction}
						className="shrink-0"
					/>

					<div className="h-px bg-(--color-border)" />

					{/* ── Layer 3: BoardPanel (Departure board style) ─────────────── */}
					<div className="shrink-0">
						<BoardPanel
							blocks={scheduleBlocks}
							tasks={tasksWithToggle}
							visibleWaiting={3}
							visibleDone={3}
							onTaskClick={handleTaskClick}
							className="max-h-48"
						/>
					</div>

					<div className="h-px bg-(--color-border)" />

					{/* ── Main Body: TaskStream + Sidebar ─────────────────────────── */}
					<div className="flex-1 flex overflow-hidden min-h-0">
						{/* ── Left panel toggle (collapsible TaskStream/Backlog) ───── */}
						{leftPanelVisible ? (
							<>
								{/* TaskStream: Plan → Doing → Log */}
								<TaskStream
									items={streamItems}
									onAction={handleStreamAction}
									onAddTask={handleAddStreamTask}
									compact={isCompact}
									onPopOut={() => handleOpenWindow("task-stream")}
									onTaskClick={handleTaskStreamItemClick}
									className="flex-1 min-w-0"
								/>

								{/* Left panel drag handle */}
								<div
									className="w-px bg-(--color-border) hover:bg-(--color-text-muted) transition-colors cursor-col-resize"
									onMouseDown={beginSidebarDrag}
									role="separator"
									aria-label="Resize sidebar"
								/>
							</>
						) : (
							/* Collapsed left panel toggle button */
							<button
								type="button"
								className="shrink-0 px-2 py-1 text-xs text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-border) transition-colors"
								onClick={() => setLeftPanelVisible(true)}
								title="Show TaskStream"
							>
								► Tasks
							</button>
						)}

						{/* ── Right sidebar: Calendar / Tools / Backlog ────────────── */}
						{sidebarVisible && (
							<>
								<div
									className="shrink-0 flex flex-col overflow-hidden min-w-0"
									style={{ width: sidebarWidth }}
								>
									{/* Sidebar tabs */}
									<div className="flex items-center shrink-0 border-b border-(--color-border)">
										{[
											{ id: "calendar" as const, label: "Calendar", icon: "📅" },
											{ id: "backlog" as const, label: "Backlog", icon: "📁" },
											{ id: "taskpool" as const, label: "Pool", icon: "🎯" },
											{ id: "tools" as const, label: "Tools", icon: "🔧" },
										].map((tab) => (
											<button
												key={tab.id}
												type="button"
												className={`flex-1 px-3 py-2 text-xs font-bold tracking-widest uppercase transition-colors ${
													rightPanelTab === tab.id
														? "text-(--color-text-primary) bg-(--color-surface)"
														: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
												}`}
												onClick={() => setRightPanelTab(tab.id)}
											>
												<span className="mr-1">{tab.icon}</span>
												{tab.label}
											</button>
										))}
									</div>

									{/* Tab content */}
									<div className="flex-1 overflow-hidden">
										{rightPanelTab === "calendar" && (
											<div className="h-full flex flex-col overflow-hidden">
												{/* Calendar heatmap */}
												{!isCompact && (
													<div className="shrink-0">
														<CalendarPanel
															activities={mockActivities}
															className="p-3"
														/>
													</div>
												)}

												{/* Day schedule */}
												<div className="flex-1 min-h-0 border-t border-(--color-border)">
													<DaySchedulePanel
														blocks={scheduleBlocks}
														tasks={tasksWithToggle}
														dayStart={template.wakeUp}
														dayEnd={template.sleep}
														className="h-full"
													/>
												</div>
											</div>
										)}

										{rightPanelTab === "backlog" && (
											<BacklogPanel className="h-full" />
										)}

										{rightPanelTab === "taskpool" && (
											<TaskPool
												className="h-full"
												theme={theme}
												onTaskSelect={(task) => {
													console.log("Task selected:", task);
													setSelectedTaskForEdit(task);
													setTaskDialogOpen(true);
												}}
											/>
										)}

										{rightPanelTab === "tools" && (
											<div className="p-3">
												<ToolsPanel onOpenWindow={handleOpenWindow} />
											</div>
										)}
									</div>
								</div>

								{/* Right panel drag handle */}
								<div
									className="w-px bg-(--color-border) cursor-col-resize hover:bg-(--color-text-muted) transition-colors"
									onMouseDown={beginSidebarDrag}
									role="separator"
									aria-label="Resize sidebar"
								/>
							</>
						)}
					</div>

					{/* ── Bottom: TimelineBar (horizontal schedule) ──────────────── */}
					<div className="shrink-0 px-4 py-2 border-t border-(--color-border)">
						<TimelineBar
							blocks={scheduleBlocks}
							dayStart={template.wakeUp}
							dayEnd={template.sleep}
							onBlockClick={handleTimelineBlockClick}
							onBlockDrop={(blockId, newStartTime, newEndTime) => {
								console.log("Block dropped:", { blockId, newStartTime, newEndTime });
								// TODO: Update schedule block times in backend
								// For now, just log the drop operation
							}}
						/>
					</div>
				</div>
			</div>

			{/* Task Dialog */}
			<TaskDialog
				isOpen={taskDialogOpen}
				onClose={() => setTaskDialogOpen(false)}
				onSave={handleSaveTask}
				task={selectedTaskForEdit}
				theme={theme}
			/>

			{/* Task Drawer */}
			<TaskDrawer
				isOpen={taskDrawer.isOpen}
				onClose={taskDrawer.closeDrawer}
				taskId={taskDrawer.selectedTaskId}
				task={taskDrawer.selectedTask}
				theme={theme}
				onEdit={handleDrawerEdit}
				onDelete={handleDrawerDelete}
				onStart={handleDrawerStart}
				projects={tasks
					.map((t) => t.projectId)
					.filter((p): p is string => p != null)
					// Deduplicate projects
					.filter((value, index, self) => self.indexOf(value) === index)
					.map((id) => ({
						id,
						name: id.replace(/^p-/, "").replace(/^project-/, ""),
						createdAt: new Date().toISOString(),
						tasks: [],
					}))}
			/>
		</div>
	);
}
