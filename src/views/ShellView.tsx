/**
 * ShellView -- Main application view using M3 App Shell
 *
 * Uses the new App Shell structure with Navigation Rail and Top App Bar.
 * Connects to M3 components for each destination.
 * Uses useTaskStore for task state management (Phase 0-2).
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppShell } from '@/components/m3/AppShell';
import { type NavDestination } from '@/components/m3/NavigationRail';
import { useTheme } from '@/hooks/useTheme';
import { GuidanceBoard } from '@/components/m3/GuidanceBoard';
import { StatusTimelineBar } from '@/components/m3/StatusTimelineBar';
import { TaskDetailDrawer } from '@/components/m3/TaskDetailDrawer';
import { CalendarSidePanel } from '@/components/m3/CalendarSidePanel';
import { RecurringTaskEditor, type RecurringAction } from '@/components/m3/RecurringTaskEditor';
import { useTauriTimer } from '@/hooks/useTauriTimer';
import { useTaskStore } from '@/hooks/useTaskStore';
import { useCachedGoogleCalendar, getEventsForDate } from '@/hooks/useCachedGoogleCalendar';
import { usePressure } from '@/hooks/usePressure';
import SettingsView from '@/views/SettingsView';
import type { TaskState } from '@/types/task-state';
import { STATE_TO_STATUS_MAP } from '@/types/taskstream';
import type { Task } from '@/types/task';

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('overview');
	const { theme, toggleTheme } = useTheme();
	const timer = useTauriTimer();
	const taskStore = useTaskStore();
	const calendar = useCachedGoogleCalendar();
	const { calculateUIPressure } = usePressure();

	const [taskSearch, setTaskSearch] = useState('');
	const [quickTaskTitle, setQuickTaskTitle] = useState('');
	const [quickTaskMinutes, setQuickTaskMinutes] = useState(25);
	const [quickTaskProject, setQuickTaskProject] = useState('');
	const [recurringAction, setRecurringAction] = useState<{ action: RecurringAction; nonce: number } | null>(null);

	// Task detail drawer state (Phase2-4) - for v2 Task from useTaskStore
	const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
	const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

	// Global keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl+N to focus task workspace
			if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
				e.preventDefault();
				setActiveDestination('tasks');
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	/**
	 * Calculate UI pressure based on task states and timer state.
	 * Updates dynamically as tasks change state and timer progresses.
	 * Memoized work items to avoid recalculating on every timer tick.
	 */
	const workItems = useMemo(() => {
		return taskStore.tasks.map((task) => ({
			estimatedMinutes: task.estimatedMinutes ?? 25,
			completed: task.state === 'DONE',
			status: STATE_TO_STATUS_MAP[task.state],
		}));
	}, [taskStore.tasks]);

	useEffect(() => {
		// Calculate UI pressure with timer state
		// Only recalculate when work items or significant timer state changes
		calculateUIPressure(workItems, {
			remainingMs: timer.remainingMs,
			totalMs: timer.snapshot?.total_ms ?? 25 * 60 * 1000,
			isActive: timer.isActive,
		});
	}, [workItems, timer.isActive, timer.snapshot?.total_ms, calculateUIPressure]);
	// Note: timer.remainingMs intentionally excluded from deps to avoid 10x/sec updates
	// The pressure calculation itself handles timer progress via the throttling in usePressure

	/**
	 * Unified handler for task operations that coordinates state transitions with timer operations.
	 * Validates transitions, executes state changes, and synchronizes timer state.
	 */
	const handleTaskOperation = useCallback(
		async (taskId: string, operation: 'start' | 'complete' | 'pause' | 'resume' | 'extend') => {
			// Get current state from taskStore
			const currentState = taskStore.getState(taskId);

			if (!currentState) {
				console.warn(`Task ${taskId} not found in state map`);
				return;
			}

			// Determine target state based on operation
			let targetState: TaskState;
			switch (operation) {
				case 'start':
					targetState = 'RUNNING';
					break;
				case 'complete':
					targetState = 'DONE';
					break;
				case 'pause':
					targetState = 'PAUSED';
					break;
				case 'resume':
					targetState = 'RUNNING';
					break;
				case 'extend':
					targetState = 'RUNNING';
					break;
				default:
					console.warn(`Unknown operation: ${operation}`);
					return;
			}

			// Validate transition before attempting
			if (!taskStore.canTransition(taskId, targetState)) {
				console.warn(
					`Invalid state transition for task ${taskId}: ${currentState} -> ${targetState} (operation: ${operation})`,
				);
				return;
			}

			// Determine anchor to pause outside try/catch to satisfy React Compiler
			const currentAnchor = taskStore.anchorTask;
			const shouldPauseAnchor = operation === 'start' && currentAnchor && currentAnchor.id !== taskId;
			const anchorIdToPause = shouldPauseAnchor ? currentAnchor?.id : null;

			try {
				// Handle special case: starting a new task should pause the current anchor
				if (anchorIdToPause) {
					// Pause the current anchor task first
					taskStore.transition(anchorIdToPause, 'PAUSED', 'pause');
					taskStore.updateTask(anchorIdToPause, {
						state: 'PAUSED',
						pausedAt: new Date().toISOString()
					});
				}

				// Execute state transition
				taskStore.transition(taskId, targetState, operation);

				// Update task data with timestamps
				if (operation === 'complete') {
					taskStore.updateTask(taskId, {
						state: 'DONE',
						completedAt: new Date().toISOString()
					});
				} else if (operation === 'pause') {
					taskStore.updateTask(taskId, {
						state: 'PAUSED',
						pausedAt: new Date().toISOString()
					});
				} else if (operation === 'resume') {
					taskStore.updateTask(taskId, {
						state: 'RUNNING',
						pausedAt: null
					});
				}

				// Simplify timer state access for compiler
				const timerActive = timer.isActive;
				const timerPaused = timer.isPaused;

				// Then execute corresponding timer operation
				switch (operation) {
					case 'start':
						if (!timerActive && !timerPaused) {
							await timer.start();
						} else if (timerPaused) {
							await timer.resume();
						}
						break;

					case 'complete':
						if (timerActive || timerPaused) {
							await timer.skip();
						}
						break;

					case 'pause':
						if (timerActive) {
							await timer.pause();
						}
						break;

					case 'resume':
						if (timerPaused) {
							await timer.resume();
						} else if (!timerActive) {
							await timer.start();
						}
						break;

					case 'extend':
						await timer.reset();
						await timer.start();
						break;
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`[ShellView] Error executing task operation ${operation} on task ${taskId}:`, errorMessage);
				// Re-throw to let calling code handle the error
				throw error;
			}
		},
		[taskStore, timer],
	);

	const handleCreateQuickTask = useCallback(() => {
		const title = quickTaskTitle.trim();
		if (!title) return;

		taskStore.createTask({
			title,
			description: '',
			estimatedPomodoros: Math.ceil(Math.max(5, quickTaskMinutes) / 25),
			completedPomodoros: 0,
			completed: false,
			state: 'READY',
			estimatedMinutes: Math.max(5, quickTaskMinutes),
			elapsedMinutes: 0,
			project: quickTaskProject.trim() || null,
			group: null,
			energy: 'medium',
			tags: [],
			priority: 0,
			category: 'active',
			completedAt: null,
			pausedAt: null,
		});

		setQuickTaskTitle('');
		setQuickTaskMinutes(25);
		setQuickTaskProject('');
	}, [quickTaskTitle, quickTaskMinutes, quickTaskProject, taskStore]);

	/**
	 * Handle task click to open detail drawer (Phase2-4).
	 * Opens TaskDetailDrawer for v2 Tasks from useTaskStore.
	 */
	const handleTaskDetailClick = useCallback((taskId: string) => {
		setDetailTaskId(taskId);
		setIsDetailDrawerOpen(true);
	}, []);

	/**
	 * Handle task update from TaskDetailDrawer (Phase2-4).
	 */
	const handleDetailUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
		taskStore.updateTask(id, updates);
	}, [taskStore]);

	/**
	 * Handle task transition from TaskDetailDrawer (Phase2-4).
	 */
	const handleDetailTransitionTask = useCallback((id: string, to: TaskState, operation?: string) => {
		if (operation && ['start', 'complete', 'pause', 'resume', 'extend'].includes(operation)) {
			handleTaskOperation(id, operation as any);
		} else {
			taskStore.transition(id, to, operation);
		}
	}, [taskStore, handleTaskOperation]);

	/**
	 * Handle task delete from TaskDetailDrawer (Phase2-4).
	 */
	const handleDetailDeleteTask = useCallback((id: string) => {
		taskStore.deleteTask(id);
	}, [taskStore]);

	/**
	 * Check if task can transition (Phase2-4).
	 */
	const handleCanTransition = useCallback((id: string, to: TaskState) => {
		return taskStore.canTransition(id, to);
	}, [taskStore]);

	const nextCandidates = useMemo(() => taskStore.readyTasks.slice(0, 5), [taskStore.readyTasks]);

	// Show empty state message when no tasks
	const isEmptyState = taskStore.totalCount === 0;
	const filteredTasks = useMemo(() => {
		const q = taskSearch.trim().toLowerCase();
		const items = [...taskStore.tasks].sort((a, b) => {
			const ta = new Date(a.updatedAt).getTime();
			const tb = new Date(b.updatedAt).getTime();
			return tb - ta;
		});
		if (!q) return items;
		return items.filter((task) => {
			const fields = [
				task.title,
				task.description ?? '',
				task.project ?? '',
				...(task.tags ?? []),
			];
			return fields.join(' ').toLowerCase().includes(q);
		});
	}, [taskStore.tasks, taskSearch]);
	const todayDate = useMemo(() => new Date(), []);
	const statusTimelineSegments = useMemo(() => {
		const fromCalendar = getEventsForDate(calendar.events, todayDate).map((e) => ({
			start: e.start.dateTime ?? e.start.date ?? "",
			end: e.end.dateTime ?? e.end.date ?? "",
		})).filter((s) => Boolean(s.start && s.end));

		if (!timer.isActive) return fromCalendar;

		const now = new Date();
		const end = new Date(now.getTime() + Math.max(0, timer.remainingMs));
		return [
			...fromCalendar,
			{ start: now.toISOString(), end: end.toISOString() },
		];
	}, [calendar.events, todayDate, timer.isActive, timer.remainingMs]);

	// Title and subtitle based on active destination
	const getTitle = () => {
		switch (activeDestination) {
			case 'overview':
				return { title: 'Overview', subtitle: isEmptyState ? 'Add tasks to get started' : 'Today at a glance' };
			case 'tasks':
				return { title: 'Tasks', subtitle: 'Focus and manage tasks in one place' };
			case 'life':
				return { title: '生活時間', subtitle: '毎日の生活リズムを編集' };
			case 'settings':
				return { title: 'Settings', subtitle: 'Configure Pomodoroom' };
		}
	};

	const { title, subtitle } = getTitle();

	// Render content based on active destination
	const renderContent = () => {
		switch (activeDestination) {
			case 'overview':
				return (
					<div className="h-full overflow-y-auto p-6">
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
								<div className="text-xs opacity-70">Total</div>
								<div className="text-2xl font-semibold">{taskStore.totalCount}</div>
							</div>
							<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
								<div className="text-xs opacity-70">Running</div>
								<div className="text-2xl font-semibold">{taskStore.getTasksByState('RUNNING').length}</div>
							</div>
							<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
								<div className="text-xs opacity-70">Ready</div>
								<div className="text-2xl font-semibold">{taskStore.readyTasks.length}</div>
							</div>
							<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
								<div className="text-xs opacity-70">Completed</div>
								<div className="text-2xl font-semibold">{taskStore.getTasksByState('DONE').length}</div>
							</div>
						</div>

						<div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
							<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
								<div className="text-sm font-medium mb-3">Current Focus</div>
								{taskStore.getTasksByState('RUNNING').length === 0 ? (
									<div className="text-sm opacity-70">No running tasks.</div>
								) : (
									<ul className="space-y-2">
										{taskStore.getTasksByState('RUNNING').slice(0, 5).map((t) => (
											<li key={t.id} className="text-sm truncate">{t.title}</li>
										))}
									</ul>
								)}
							</div>
							<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
								<div className="text-sm font-medium mb-3">Next Candidates</div>
								{nextCandidates.length === 0 ? (
									<div className="text-sm opacity-70">No candidate tasks.</div>
								) : (
									<ul className="space-y-2">
										{nextCandidates.map((t) => (
											<li key={t.id} className="text-sm truncate">{t.title}</li>
										))}
									</ul>
								)}
							</div>
						</div>
					</div>
				);
			case 'tasks':
				return (
					<div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 p-6">
						<section className="rounded-2xl bg-[var(--md-ref-color-surface-container-high)] min-h-0 overflow-hidden flex flex-col">
							<div className="px-3 pt-3 pb-2 border-b border-[var(--md-ref-color-outline-variant)]">
								<div className="flex items-center justify-between gap-2 pb-2">
									<h2 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">タスク一覧</h2>
									<span className="text-xs text-[var(--md-ref-color-on-surface-variant)]">{filteredTasks.length}件</span>
								</div>
								<input
									value={taskSearch}
									onChange={(e) => setTaskSearch(e.target.value)}
									placeholder="タスクを検索"
									className="w-full h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
								/>
							</div>
							<div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 scrollbar-hover">
								{filteredTasks.length === 0 ? (
									<div className="px-3 py-4 text-sm text-[var(--md-ref-color-on-surface-variant)]">該当するタスクがありません。</div>
								) : (
									filteredTasks.map((task) => (
										<button
											key={task.id}
											type="button"
											onClick={() => handleTaskDetailClick(task.id)}
											className="w-full text-left rounded-lg px-3 py-2 hover:bg-[var(--md-ref-color-surface)]"
										>
											<div className="text-sm text-[var(--md-ref-color-on-surface)] truncate">{task.title}</div>
											<div className="text-xs text-[var(--md-ref-color-on-surface-variant)] truncate">
												{task.state} · {task.project ?? 'No Project'} · {task.estimatedMinutes ?? 25}m
											</div>
										</button>
									))
								)}
							</div>
						</section>

						<section className="rounded-2xl bg-[var(--md-ref-color-surface-container-low)] p-4 space-y-3">
							<h2 className="text-sm font-semibold text-[var(--md-ref-color-on-surface)]">タスク作成</h2>
							<div className="space-y-2">
								<input
									value={quickTaskTitle}
									onChange={(e) => setQuickTaskTitle(e.target.value)}
									placeholder="タスク名"
									className="w-full h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
								/>
								<div className="grid grid-cols-2 gap-2">
									<input
										type="number"
										min={5}
										step={5}
										value={quickTaskMinutes}
										onChange={(e) => setQuickTaskMinutes(Math.max(5, Number(e.target.value) || 5))}
										className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									/>
									<input
										value={quickTaskProject}
										onChange={(e) => setQuickTaskProject(e.target.value)}
										placeholder="プロジェクト(任意)"
										className="h-10 rounded-lg bg-[var(--md-ref-color-surface)] px-3 text-sm text-[var(--md-ref-color-on-surface)]"
									/>
								</div>
							</div>
							<button
								type="button"
								onClick={handleCreateQuickTask}
								className="h-9 px-3 rounded-lg bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] text-sm"
							>
								作成
							</button>
						</section>
					</div>
				);
			case 'life':
				return (
					<div className="h-full overflow-y-auto p-6">
						<RecurringTaskEditor action={recurringAction?.action} actionNonce={recurringAction?.nonce} />
					</div>
				);
			case 'settings':
				return <SettingsView />;
		}
	};

	return (
		<>
			<AppShell
				activeDestination={activeDestination}
				onNavigate={setActiveDestination}
				title={title}
				subtitle={subtitle}
				/* Guidance board replaces the standard top app bar */
				showTopAppBar={false}
				alwaysOnTop={timer.windowState.always_on_top}
				onTogglePin={() => timer.setAlwaysOnTop(!timer.windowState.always_on_top)}
				createActions={[
					{
						id: 'create-task',
						label: 'タスク',
						icon: 'check_circle',
						onSelect: () => {
							setActiveDestination('tasks');
						},
					},
					{
						id: 'create-event',
						label: '予定',
						icon: 'calendar_month',
						onSelect: () => {
							setActiveDestination('life');
							setRecurringAction({ action: 'new-event', nonce: Date.now() });
						},
					},
					{
						id: 'create-life',
						label: '生活時間',
						icon: 'schedule',
						onSelect: () => {
							setActiveDestination('life');
							setRecurringAction({ action: 'focus-life', nonce: Date.now() });
						},
					},
				]}
				rightPanel={<CalendarSidePanel />}
				bottomSection={(
					<StatusTimelineBar
						segments={statusTimelineSegments}
						date={todayDate}
					/>
				)}
				topSection={(
					<div>
						<GuidanceBoard
							remainingMs={timer.remainingMs}
							runningTasks={taskStore.getTasksByState('RUNNING').map(t => ({ id: t.id, title: t.title }))}
							nextTask={taskStore.readyTasks[0] ? { id: taskStore.readyTasks[0].id, title: taskStore.readyTasks[0].title } : null}
						/>
					</div>
				)}
				theme={theme}
				onThemeToggle={toggleTheme}
			>
				{renderContent()}
			</AppShell>

			{/* Task Detail Drawer (Phase2-4) - v2 Task from useTaskStore */}
			{detailTaskId && (
				<TaskDetailDrawer
					isOpen={isDetailDrawerOpen}
					task={taskStore.getTask(detailTaskId) ?? null}
					onClose={() => setIsDetailDrawerOpen(false)}
					onUpdateTask={handleDetailUpdateTask}
					onTransitionTask={handleDetailTransitionTask}
					onDeleteTask={handleDetailDeleteTask}
					canTransition={handleCanTransition}
				/>
			)}
		</>
	);
}
