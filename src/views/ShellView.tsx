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
import { showActionNotification } from '@/hooks/useActionNotification';
import { useCachedGoogleCalendar, getEventsForDate } from '@/hooks/useCachedGoogleCalendar';
import { usePressure } from '@/hooks/usePressure';
import SettingsView from '@/views/SettingsView';
import TasksView from '@/views/TasksView';
import type { TaskState } from '@/types/task-state';
import { STATE_TO_STATUS_MAP } from '@/types/taskstream';
import type { Task } from '@/types/task';

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('overview');
	const { theme, toggleTheme } = useTheme();

	const timer = useTauriTimer();
	const taskStore = useTaskStore();
	const calendar = useCachedGoogleCalendar();
	const { calculateUIPressure, state: pressureState } = usePressure();

	// Force re-render when guidance refresh event is received (e.g., on navigation)
	const [guidanceRefreshNonce, setGuidanceRefreshNonce] = useState(0);

	// Memoized values for GuidanceBoard
	const runningTasks = useMemo(() =>
		taskStore.getTasksByState('RUNNING').map(t => ({
			id: t.id,
			title: t.title,
			estimatedMinutes: t.estimatedMinutes,
			elapsedMinutes: t.elapsedMinutes,
		})),
		[taskStore.tasks, guidanceRefreshNonce]
	);

	/**
	 * Select ambient candidates (READY/PAUSED tasks for suggestion).
	 * Priority: PAUSED > same project as running > high energy > recent.
	 */
	const ambientCandidates = useMemo(() => {
		const readyTasks = taskStore.getTasksByState('READY');
		const pausedTasks = taskStore.getTasksByState('PAUSED');

		// Get current running projects for context
		const runningProjects = new Set(
			taskStore.getTasksByState('RUNNING').map(t => t.project).filter(Boolean) as string[]
		);

		// Candidate generator with reason
		const makeCandidate = (task: Task, reason: string) => ({
			id: task.id,
			title: task.title,
			state: task.state as 'READY' | 'PAUSED',
			estimatedMinutes: task.estimatedMinutes,
			elapsedMinutes: task.elapsedMinutes,
			project: task.project,
			energy: task.energy,
			reason,
		});

		// Priority 1: PAUSED tasks (resume is natural)
		const pausedCandidates = pausedTasks.slice(0, 1).map(t =>
			makeCandidate(t, '一時停止中')
		);

		// Priority 2: Same project as running tasks
		const sameProjectCandidates = readyTasks
			.filter(t => t.project && runningProjects.has(t.project))
			.slice(0, 1)
			.map(t => makeCandidate(t, `${t.project}の関連タスク`));

		// Priority 3: High energy tasks
		const highEnergyCandidates = readyTasks
			.filter(t => t.energy === 'high')
			.slice(0, 1)
			.map(t => makeCandidate(t, '高エネルギー'));

		// Priority 4: Recent tasks (fallback)
		const recentCandidates = readyTasks
			.slice(0, 1)
			.map(t => makeCandidate(t, '最近更新'));

		// Combine candidates (max 2-3 total)
		const combined = [
			...pausedCandidates,
			...sameProjectCandidates,
			...highEnergyCandidates,
			...recentCandidates,
		];

		// Deduplicate by ID
		const seen = new Set<string>();
		const unique: typeof combined = [];
		for (const candidate of combined) {
			if (!seen.has(candidate.id)) {
				seen.add(candidate.id);
				unique.push(candidate);
			}
			if (unique.length >= 2) break; // Max 2 candidates
		}

		return unique;
	}, [taskStore.tasks, guidanceRefreshNonce]);

	const [taskSearch] = useState('');
	const [recurringAction, setRecurringAction] = useState<{ action: RecurringAction; nonce: number } | null>(null);

	// Task detail drawer state (Phase2-4) - for v2 Task from useTaskStore
	const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
	const [detailTaskId] = useState<string | null>(null);

	useEffect(() => {
		const handleGuidanceRefresh = () => {
			setGuidanceRefreshNonce(n => n + 1);
		};

		window.addEventListener('guidance-refresh', handleGuidanceRefresh);
		return () => window.removeEventListener('guidance-refresh', handleGuidanceRefresh);
	}, []);

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
			const anchorIdToPause = shouldPauseAnchor ? (currentAnchor?.id ?? null) : null;

			// Pre-calculate timer states before try/catch to satisfy React Compiler
			const isTimerActive = timer.isActive;
			const isTimerPaused = timer.isPaused;
			const canStartNewTimer = !isTimerActive && !isTimerPaused;
			const canResumeTimer = isTimerPaused;
			const canPauseTimer = isTimerActive;
			const canSkipTimer = isTimerActive || isTimerPaused;
			const canResumeOrStart = isTimerPaused || !isTimerActive;

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

				// Execute corresponding timer operation
				switch (operation) {
					case 'start':
						if (canStartNewTimer) {
							await timer.start();
						} else if (canResumeTimer) {
							await timer.resume();
						}
						break;

					case 'complete':
						if (canSkipTimer) {
							await timer.skip();
						}
						break;

					case 'pause':
						if (canPauseTimer) {
							await timer.pause();
						}
						break;

					case 'resume':
						if (canResumeTimer) {
							await timer.resume();
						} else if (canResumeOrStart) {
							// Note: canResumeOrStart is redundant if we already checked canResumeTimer,
							// but it helps the compiler understand the logic without logical NOT inside try/catch
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

	/**
	 * Handle ambient task click -> transition to RUNNING (start/resume).
	 */
	const handleAmbientClick = useCallback(
		async (taskId: string) => {
			const currentState = taskStore.getState(taskId);
			if (!currentState) return;

			// Determine operation based on current state
			const operation = currentState === 'PAUSED' ? 'resume' : 'start';
			await handleTaskOperation(taskId, operation);
		},
		[handleTaskOperation]
	);

	// Initialize notification integration and step complete callback
	useEffect(() => {
		timer.initNotificationIntegration(showActionNotification);

		// Initialize step complete callback for auto-starting next task
		timer.initStepCompleteCallback(async (stepInfo) => {
			console.log('[ShellView] Step complete:', stepInfo);

			// Only auto-start next task on focus step completion
			if (stepInfo.stepType !== 'focus') {
				return;
			}

			// Get next READY task
			const readyTasks = taskStore.getTasksByState('READY');
			if (readyTasks.length === 0) {
				console.log('[ShellView] No ready tasks to auto-start');
				return;
			}

			// Select first READY task as next
			const nextTask = readyTasks[0];
			if (!nextTask) return;
			console.log('[ShellView] Auto-starting next task:', nextTask.title);

			// Start the next task
			await handleTaskOperation(nextTask.id, 'start');
		});
	}, [timer.initNotificationIntegration, timer.initStepCompleteCallback, taskStore, handleTaskOperation]);

	/**
	 * Determine next task to start (for NEXT section).
	 * Returns null if there are running tasks, otherwise selects PAUSED or READY task.
	 */
	const nextTaskToStart = useMemo(() => {
		const runningTasks = taskStore.getTasksByState('RUNNING');
		const pausedTasks = taskStore.getTasksByState('PAUSED');
		const readyTasks = taskStore.getTasksByState('READY');

		// If there are running tasks, no "next to start" needed
		if (runningTasks.length > 0) {
			return null;
		}

		// Priority: PAUSED (resume) > READY (start)
		if (pausedTasks.length > 0) {
			const task = pausedTasks[0];
			if (!task) return null;
			return {
				id: task.id,
				title: task.title,
				state: 'PAUSED' as const,
			};
		}

		if (readyTasks.length > 0) {
			const task = readyTasks[0];
			if (!task) return null;
			return {
				id: task.id,
				title: task.title,
				state: 'READY' as const,
			};
		}

		return null;
	}, [taskStore.tasks]);

	// Show empty state message when no tasks
	const isEmptyState = taskStore.totalCount === 0;
	useMemo(() => {
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
			case 'tasks':
				return <TasksView />;
			case 'overview':
				return (
					<div className="h-full overflow-y-auto p-4">
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

						<div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
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
								{ambientCandidates.length === 0 ? (
									<div className="text-sm opacity-70">No candidate tasks.</div>
								) : (
									<ul className="space-y-2">
										{ambientCandidates.map((t) => (
											<li key={t.id} className="text-sm truncate">{t.title}</li>
										))}
									</ul>
								)}
							</div>
						</div>
					</div>
				);
			case 'life':
				return (
					<div className="h-full overflow-y-auto p-4">
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
							runningTasks={runningTasks}
							ambientCandidates={ambientCandidates}
							onAmbientClick={handleAmbientClick}
							pressureState={pressureState}
							nextTaskToStart={nextTaskToStart}
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
