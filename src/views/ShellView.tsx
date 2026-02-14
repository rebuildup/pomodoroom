/**
 * ShellView -- Main application view using M3 App Shell
 *
 * Uses the new App Shell structure with Navigation Rail and Top App Bar.
 * Connects to M3 components for each destination.
 * Uses useTaskStore for task state management (Phase 0-2).
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AppShell } from '@/components/m3/AppShell';
import { type NavDestination } from '@/components/m3/NavigationRail';
import { useTheme } from '@/hooks/useTheme';
import { GuidanceBoard } from '@/components/m3/GuidanceBoard';
import { StatusTimelineBar } from '@/components/m3/StatusTimelineBar';
import { TaskDetailDrawer } from '@/components/m3/TaskDetailDrawer';
import { CalendarSidePanel } from '@/components/m3/CalendarSidePanel';
import { DayTimelinePanel } from '@/components/m3/DayTimelinePanel';
import { TaskCard } from '@/components/m3/TaskCard';
import { RecurringTaskEditor, type RecurringAction } from '@/components/m3/RecurringTaskEditor';
import { useTauriTimer } from '@/hooks/useTauriTimer';
import { useTaskStore } from '@/hooks/useTaskStore';
import { showActionNotification } from '@/hooks/useActionNotification';
import { useCachedGoogleCalendar, getEventsForDate } from '@/hooks/useCachedGoogleCalendar';
import { selectDueScheduledTask, selectNextBoardTasks } from '@/utils/next-board-tasks';
import SettingsView from '@/views/SettingsView';
import TasksView from '@/views/TasksView';
import { isValidTransition, type TaskState } from '@/types/task-state';
import type { Task } from '@/types/task';

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('overview');
	const [guidanceAnchorTaskId, setGuidanceAnchorTaskId] = useState<string | null>(null);
	const { theme, toggleTheme } = useTheme();

	const timer = useTauriTimer();
	const taskStore = useTaskStore();
	const calendar = useCachedGoogleCalendar();

	// Force re-render when guidance refresh event is received (e.g., on navigation)
	const [guidanceRefreshNonce, setGuidanceRefreshNonce] = useState(0);

	// Memoized values for GuidanceBoard
	const runningTasks = useMemo(() => {
		const running = taskStore.getTasksByState('RUNNING');
		if (guidanceAnchorTaskId && running.some((t) => t.id === guidanceAnchorTaskId)) {
			const anchor = running.find((t) => t.id === guidanceAnchorTaskId)!;
			const rest = running.filter((t) => t.id !== guidanceAnchorTaskId);
			return [anchor, ...rest].map(t => ({
				id: t.id,
				title: t.title,
				requiredMinutes: t.requiredMinutes,
				elapsedMinutes: t.elapsedMinutes,
			}));
		}
		return running.map(t => ({
			id: t.id,
			title: t.title,
			requiredMinutes: t.requiredMinutes,
			elapsedMinutes: t.elapsedMinutes,
		}));
	}, [taskStore.tasks, guidanceRefreshNonce, guidanceAnchorTaskId]);

	useEffect(() => {
		if (!guidanceAnchorTaskId) return;
		const stillRunning = taskStore.getTasksByState('RUNNING').some((t) => t.id === guidanceAnchorTaskId);
		if (!stillRunning) {
			setGuidanceAnchorTaskId(null);
		}
	}, [taskStore.tasks, guidanceAnchorTaskId, taskStore]);

	/**
	 * Select ambient candidates (READY/PAUSED tasks for suggestion).
	 * Priority: PAUSED > same project as running > high energy > recent.
	 * Auto-calculates suggested start time for tasks without scheduled time.
	 */
	const ambientCandidates = useMemo(() => {
		const readyTasks = taskStore.getTasksByState('READY');
		const pausedTasks = taskStore.getTasksByState('PAUSED');

		// Get current running projects for context
		const runningProjects = new Set(
			taskStore.getTasksByState('RUNNING').map(t => t.project).filter(Boolean) as string[]
		);

		// Calculate next available start time
		const calculateNextStartTime = (task: Task): string | null => {
			// If task already has scheduled time, use it
			if (task.fixedStartAt) return task.fixedStartAt;
			if (task.windowStartAt) return task.windowStartAt;
			
			// Auto-calculate: use current time + 5 minutes as next available slot
			const now = new Date();
			const nextSlot = new Date(now.getTime() + 5 * 60 * 1000); // +5 minutes
			return nextSlot.toISOString();
		};

		// Candidate generator with reason and auto-scheduled time
		const makeCandidate = (task: Task, reason: string) => ({
			id: task.id,
			title: task.title,
			state: task.state as 'READY' | 'PAUSED',
			requiredMinutes: task.requiredMinutes,
			elapsedMinutes: task.elapsedMinutes,
			project: task.project,
			energy: task.energy,
			reason,
			autoScheduledStartAt: calculateNextStartTime(task),
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
	const duePromptGuardRef = useRef<string | null>(null);

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
	 * Unified handler for task operations that coordinates state transitions with timer operations.
	 * Validates transitions, executes state changes, and synchronizes timer state.
	 */
	const handleTaskOperation = useCallback(
		async (taskId: string, operation: 'start' | 'complete' | 'pause' | 'resume' | 'extend' | 'delete' | 'defer' | 'postpone') => {
			// Handle delete separately
			if (operation === 'delete') {
				taskStore.deleteTask(taskId);
				setGuidanceRefreshNonce(prev => prev + 1);
				return;
			}

			// Handle defer/postpone separately (same behavior)
			if (operation === 'defer' || operation === 'postpone') {
				// TODO: Implement defer logic (move task to later time)
				console.log(`Defer task ${taskId} - not yet implemented`);
				return;
			}

			const task = taskStore.getTask(taskId);
			if (!task) {
				console.warn(`Task ${taskId} not found`);
				return;
			}
			const currentState = task.state as TaskState;

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

			// Validate transition before attempting (use actual persisted task state)
			if (!isValidTransition(currentState, targetState)) {
				console.warn(
					`Invalid state transition for task ${taskId}: ${currentState} -> ${targetState} (operation: ${operation})`,
				);
				return;
			}

			// Pre-calculate timer states before try/catch to satisfy React Compiler
			const isTimerActive = timer.isActive;
			const isTimerPaused = timer.isPaused;
			const canStartNewTimer = !isTimerActive && !isTimerPaused;
			const canResumeTimer = isTimerPaused;
			const canPauseTimer = isTimerActive;
			const canSkipTimer = isTimerActive || isTimerPaused;
			const canResumeOrStart = isTimerPaused || !isTimerActive;

			try {
				// Persist state transition using source-of-truth task store
				if (operation === 'complete') {
					taskStore.updateTask(taskId, {
						state: 'DONE',
						completedAt: new Date().toISOString(),
						pausedAt: null,
						completed: true,
					});
				} else if (operation === 'pause') {
					taskStore.updateTask(taskId, {
						state: 'PAUSED',
						pausedAt: new Date().toISOString(),
					});
				} else if (operation === 'resume') {
					taskStore.updateTask(taskId, {
						state: 'RUNNING',
						pausedAt: null,
					});
				} else if (operation === 'start') {
					taskStore.updateTask(taskId, {
						state: 'RUNNING',
						pausedAt: null,
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

	const handleRequestStartNotification = useCallback((taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task) return;
		showActionNotification({
			title: 'タスク開始',
			message: task.title,
			buttons: [
				{
					label: '開始',
					action: { start_task: { id: task.id, resume: task.state === 'PAUSED' } },
				},
				{
					label: 'あとで',
					action: { start_later_pick: { id: task.id } },
				},
			],
		}).catch((error) => {
			console.error('[ShellView] Failed to show NEXT start notification:', error);
		});
	}, [taskStore]);

	const handleRequestInterruptNotification = useCallback((taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task || task.state !== 'RUNNING') return;

		const now = new Date();
		const nowMs = now.getTime();

		const roundUpToQuarter = (date: Date): Date => {
			const rounded = new Date(date);
			const minutes = rounded.getMinutes();
			const roundedMinutes = Math.ceil(minutes / 15) * 15;
			if (roundedMinutes === 60) {
				rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
				return rounded;
			}
			rounded.setMinutes(roundedMinutes, 0, 0);
			return rounded;
		};
		const toLabel = (iso: string) =>
			new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
		const toCandidateIso = (ms: number) => roundUpToQuarter(new Date(ms)).toISOString();

		const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;

		// Explicit scheduled blocks (fixed/window) for schedule-linked recommendations
		const explicitBlocks = taskStore.tasks
			.filter((t) => t.id !== task.id && t.state !== 'DONE')
			.map((t) => {
				const startIso = t.fixedStartAt ?? t.windowStartAt;
				if (!startIso) return null;
				const startMs = Date.parse(startIso);
				if (Number.isNaN(startMs)) return null;
				const endMs = startMs + Math.max(1, t.requiredMinutes ?? 25) * 60_000;
				return { startMs, endMs };
			})
			.filter((v): v is { startMs: number; endMs: number } => v !== null)
			.sort((a, b) => a.startMs - b.startMs);

		// If currently inside a scheduled block, suggest right after it ends
		const currentBlocking = explicitBlocks.find((b) => nowMs >= b.startMs && nowMs < b.endMs);
		const afterCurrentBlockMs = currentBlocking ? currentBlocking.endMs : nowMs + 15 * 60_000;

		// Next scheduled task (READY/PAUSED) as another recommendation anchor
		const nextScheduledMs = taskStore.tasks
			.filter((t) => t.id !== task.id && (t.state === 'READY' || t.state === 'PAUSED'))
			.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
			.filter((v): v is string => Boolean(v))
			.map((v) => Date.parse(v))
			.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
			.sort((a, b) => a - b)[0] ?? null;

		const candidatesRaw: Array<{ label: string; atMs: number }> = [
			{ label: '次の空き時間', atMs: afterCurrentBlockMs },
			...(nextScheduledMs
				? [{ label: '次タスク開始時刻', atMs: nextScheduledMs }]
				: []),
			...(nextScheduledMs
				? [{ label: '次タスク後に再開', atMs: nextScheduledMs + durationMs }]
				: []),
			{ label: '30分後', atMs: nowMs + 30 * 60_000 },
		];

		const unique = new Map<string, { label: string; iso: string }>();
		for (const c of candidatesRaw) {
			const iso = toCandidateIso(c.atMs);
			if (Date.parse(iso) <= nowMs) continue;
			if (!unique.has(iso)) {
				unique.set(iso, { label: c.label, iso });
			}
			if (unique.size >= 3) break;
		}
		const candidates = [...unique.values()];
		if (candidates.length === 0) {
			const fallbackIso = toCandidateIso(nowMs + 15 * 60_000);
			candidates.push({ label: '15分後', iso: fallbackIso });
		}

		showActionNotification({
			title: 'タスク中断',
			message: `${task.title} の再開時刻を選択してください`,
			buttons: [
				...candidates.map((c) => ({
					label: `${c.label} (${toLabel(c.iso)})`,
					action: { interrupt_task: { id: task.id, resume_at: c.iso } },
				})),
				{
					label: 'キャンセル',
					action: { dismiss: null },
				},
			],
		}).catch((error) => {
			console.error('[ShellView] Failed to show interrupt notification:', error);
		});
	}, [taskStore]);

	const handleRequestPostponeNotification = useCallback((taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task) return;

		const now = new Date();
		const nowMs = now.getTime();
		const roundUpToQuarter = (date: Date): Date => {
			const rounded = new Date(date);
			const minutes = rounded.getMinutes();
			const roundedMinutes = Math.ceil(minutes / 15) * 15;
			if (roundedMinutes === 60) {
				rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
				return rounded;
			}
			rounded.setMinutes(roundedMinutes, 0, 0);
			return rounded;
		};
		const toLabel = (iso: string) =>
			new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
		const toCandidateIso = (ms: number) => roundUpToQuarter(new Date(ms)).toISOString();
		const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;

		const nextScheduledMs = taskStore.tasks
			.filter((t) => t.id !== task.id && (t.state === 'READY' || t.state === 'PAUSED'))
			.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
			.filter((v): v is string => Boolean(v))
			.map((v) => Date.parse(v))
			.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
			.sort((a, b) => a - b)[0] ?? null;

		const candidatesRaw: Array<{ label: string; atMs: number }> = [
			{ label: "15分後", atMs: nowMs + 15 * 60_000 },
			{ label: "30分後", atMs: nowMs + 30 * 60_000 },
			...(nextScheduledMs ? [{ label: "次タスク開始時刻", atMs: nextScheduledMs }] : []),
			...(nextScheduledMs ? [{ label: "次タスク後", atMs: nextScheduledMs + durationMs }] : []),
		];

		const unique = new Map<string, { label: string; iso: string }>();
		for (const c of candidatesRaw) {
			const iso = toCandidateIso(c.atMs);
			if (Date.parse(iso) <= nowMs) continue;
			if (!unique.has(iso)) unique.set(iso, { label: c.label, iso });
			if (unique.size >= 3) break;
		}
		const candidates = [...unique.values()];
		if (candidates.length === 0) {
			candidates.push({ label: "15分後", iso: toCandidateIso(nowMs + 15 * 60_000) });
		}

		showActionNotification({
			title: 'タスク先送り',
			message: `${task.title} をいつに先送りしますか`,
			buttons: [
				...candidates.map((c) => ({
					label: `${c.label} (${toLabel(c.iso)})`,
					action: { defer_task_until: { id: task.id, defer_until: c.iso } },
				})),
				{ label: 'キャンセル', action: { dismiss: null } },
			],
		}).catch((error) => {
			console.error('[ShellView] Failed to show postpone notification:', error);
		});
	}, [taskStore]);

	const handleTaskCardOperation = useCallback(
		async (taskId: string, operation: 'start' | 'complete' | 'pause' | 'resume' | 'extend' | 'delete' | 'defer' | 'postpone') => {
			const task = taskStore.getTask(taskId);
			if (!task) return;

			if (operation === 'pause') {
				handleRequestInterruptNotification(taskId);
				return;
			}

			if (operation === 'start' || operation === 'resume') {
				showActionNotification({
					title: operation === 'start' ? 'タスク開始' : 'タスク再開',
					message: task.title,
					buttons: [
						{
							label: operation === 'start' ? '開始' : '再開',
							action: { start_task: { id: task.id, resume: operation === 'resume' } },
						},
						{ label: 'キャンセル', action: { dismiss: null } },
					],
				}).catch((error) => {
					console.error('[ShellView] Failed to show task start/resume notification:', error);
				});
				return;
			}

			if (operation === 'complete') {
				showActionNotification({
					title: 'タスク完了',
					message: task.title,
					buttons: [
						{ label: '完了', action: { complete_task: { id: task.id } } },
						{ label: 'キャンセル', action: { dismiss: null } },
					],
				}).catch((error) => {
					console.error('[ShellView] Failed to show complete notification:', error);
				});
				return;
			}

			if (operation === 'extend') {
				showActionNotification({
					title: 'タスク延長',
					message: task.title,
					buttons: [
						{ label: '+5分', action: { extend_task: { id: task.id, minutes: 5 } } },
						{ label: '+15分', action: { extend_task: { id: task.id, minutes: 15 } } },
						{ label: '+25分', action: { extend_task: { id: task.id, minutes: 25 } } },
						{ label: 'キャンセル', action: { dismiss: null } },
					],
				}).catch((error) => {
					console.error('[ShellView] Failed to show extend notification:', error);
				});
				return;
			}

			if (operation === 'delete') {
				showActionNotification({
					title: 'タスク削除',
					message: task.title,
					buttons: [
						{ label: '削除', action: { delete_task: { id: task.id } } },
						{ label: 'キャンセル', action: { dismiss: null } },
					],
				}).catch((error) => {
					console.error('[ShellView] Failed to show delete notification:', error);
				});
				return;
			}

			if (operation === 'postpone' || operation === 'defer') {
				showActionNotification({
					title: 'タスク先送り',
					message: task.title,
					buttons: [
						{ label: '先送り', action: { postpone_task: { id: task.id } } },
						{ label: 'キャンセル', action: { dismiss: null } },
					],
				}).catch((error) => {
					console.error('[ShellView] Failed to show postpone notification:', error);
				});
			}
		},
		[taskStore, handleRequestInterruptNotification]
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

	const nextTasksForBoard = useMemo(() => {
		return selectNextBoardTasks(taskStore.tasks, 3);
	}, [taskStore.tasks]);

	// Ask whether to start when a task reaches scheduled start time (if no running task).
	useEffect(() => {
		if (taskStore.getTasksByState('RUNNING').length > 0) {
			return;
		}

		const dueTask = selectDueScheduledTask(taskStore.tasks, Date.now());
		if (!dueTask) return;

		const dueStart = dueTask.fixedStartAt ?? dueTask.windowStartAt ?? dueTask.estimatedStartAt ?? '';
		const guardKey = `${dueTask.id}:${dueStart}`;
		if (duePromptGuardRef.current === guardKey) return;
		duePromptGuardRef.current = guardKey;

		const scheduledLabel = dueStart
			? new Date(dueStart).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
			: '現在';
		showActionNotification({
			title: '開始時刻です',
			message: `${scheduledLabel} ${dueTask.title}`,
			buttons: [
				{
					label: '開始',
					action: { start_task: { id: dueTask.id, resume: dueTask.state === 'PAUSED' } },
				},
				{
					label: 'あとで',
					action: { start_later_pick: { id: dueTask.id } },
				},
			],
		}).catch((error) => {
			console.error('[ShellView] Failed to show start confirmation notification:', error);
		});
	}, [taskStore.tasks, taskStore, handleTaskOperation]);

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
		const segments: { start: string; end: string }[] = [];

		// Add calendar events
		const fromCalendar = getEventsForDate(calendar.events, todayDate).map((e) => ({
			start: e.start.dateTime ?? e.start.date ?? "",
			end: e.end.dateTime ?? e.end.date ?? "",
		})).filter((s) => Boolean(s.start && s.end));
		segments.push(...fromCalendar);

		// Add tasks with scheduled time
		const todayStart = new Date(todayDate);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		taskStore.tasks.forEach((task) => {
			if (task.state === "DONE") return;

			const startTime = task.fixedStartAt || task.windowStartAt;
			const endTime = task.fixedEndAt || task.windowEndAt;

			if (!startTime) return;

			const taskStart = new Date(startTime);
			// Check if task is today
			if (taskStart < todayStart || taskStart >= todayEnd) return;

			let taskEnd: Date;
			if (endTime) {
				taskEnd = new Date(endTime);
			} else if (task.requiredMinutes) {
				taskEnd = new Date(taskStart.getTime() + task.requiredMinutes * 60 * 1000);
			} else {
				taskEnd = new Date(taskStart.getTime() + 30 * 60 * 1000); // Default 30 min
			}

			segments.push({
				start: taskStart.toISOString(),
				end: taskEnd.toISOString(),
			});
		});

		// Add timer segment if active
		if (timer.isActive) {
			const now = new Date();
			const end = new Date(now.getTime() + Math.max(0, timer.remainingMs));
			segments.push({ start: now.toISOString(), end: end.toISOString() });
		}

		return segments;
	}, [calendar.events, todayDate, taskStore.tasks, timer.isActive, timer.remainingMs]);

	// Today's tasks for DayTimelinePanel
	const todayTasks = useMemo(() => {
		const today = new Date();
		const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		return taskStore.tasks.filter((task) => {
			if (task.state === "DONE") return false;
			const startTime = task.fixedStartAt || task.windowStartAt;
			if (!startTime) return false;
			const taskDate = new Date(startTime);
			return taskDate >= todayStart && taskDate < todayEnd;
		}).sort((a, b) => {
			const aStart = a.fixedStartAt || a.windowStartAt || "";
			const bStart = b.fixedStartAt || b.windowStartAt || "";
			return aStart.localeCompare(bStart);
		}) as Task[];
	}, [taskStore.tasks]);

	// Upcoming tasks (after now, sorted by start time)
	const upcomingTasks = useMemo(() => {
		const now = new Date();
		return taskStore.tasks.filter((task) => {
			if (task.state === "DONE") return false;
			const startTime = task.fixedStartAt || task.windowStartAt;
			if (!startTime) return false;
			return new Date(startTime) > now;
		}).sort((a, b) => {
			const aStart = a.fixedStartAt || a.windowStartAt || "";
			const bStart = b.fixedStartAt || b.windowStartAt || "";
			return aStart.localeCompare(bStart);
		});
	}, [taskStore.tasks]);

	// Project summary with tasks
	const projectSummary = useMemo(() => {
		const projectTasks = new Map<string, Task[]>();
		taskStore.tasks.forEach((task) => {
			if (task.state === "DONE") return;
			const project = task.project || "その他";
			if (!projectTasks.has(project)) {
				projectTasks.set(project, []);
			}
			projectTasks.get(project)!.push(task);
		});
		return Array.from(projectTasks.entries())
			.map(([project, tasks]) => ({
				project,
				count: tasks.length,
				tasks: tasks
					.sort((a, b) => {
						const aStart = a.fixedStartAt || a.windowStartAt || "";
						const bStart = b.fixedStartAt || b.windowStartAt || "";
						return aStart.localeCompare(bStart);
					})
					.slice(0, 3)
			}))
			.sort((a, b) => b.count - a.count);
	}, [taskStore.tasks]);

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
						<div className="max-w-7xl mx-auto space-y-4">
							{/* Stats row */}
							<div className="grid grid-cols-4 gap-3">
								<div className="rounded-lg bg-[var(--md-ref-color-surface-container-high)] p-3 text-center">
									<div className="text-lg font-semibold">{taskStore.totalCount}</div>
									<div className="text-[10px] opacity-60">Total</div>
								</div>
								<div className="rounded-lg bg-[var(--md-ref-color-primary-container)] p-3 text-center">
									<div className="text-lg font-semibold text-[var(--md-ref-color-on-primary-container)]">{taskStore.getTasksByState('RUNNING').length}</div>
									<div className="text-[10px] opacity-60">Running</div>
								</div>
								<div className="rounded-lg bg-[var(--md-ref-color-surface-container-high)] p-3 text-center">
									<div className="text-lg font-semibold">{taskStore.readyTasks.length}</div>
									<div className="text-[10px] opacity-60">Ready</div>
								</div>
								<div className="rounded-lg bg-[var(--md-ref-color-surface-container-high)] p-3 text-center">
									<div className="text-lg font-semibold">{taskStore.getTasksByState('DONE').length}</div>
									<div className="text-[10px] opacity-60">Done</div>
								</div>
							</div>

							{/* Main content: Timeline + Sidebar */}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
								{/* Timeline - 2 columns */}
								<div className="lg:col-span-2 rounded-xl bg-[var(--md-ref-color-surface-container-high)] overflow-hidden flex flex-col" style={{ minHeight: 400 }}>
									<div className="px-4 py-2 border-b border-[var(--md-ref-color-outline-variant)]">
										<div className="text-sm font-medium">今日のタイムライン</div>
									</div>
									<div className="flex-1 min-h-0">
										<DayTimelinePanel
											tasks={todayTasks}
											hourHeight={48}
											timeLabelWidth={48}
											minCardHeight={40}
											laneGap={3}
											emptyMessage="予定がありません"
											testId="overview-timeline"
											className="h-full"
										/>
									</div>
								</div>

								{/* Sidebar - 1 column */}
								<div className="space-y-4">
									{/* Upcoming tasks */}
									<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
										<div className="text-sm font-medium mb-3">今後の予定</div>
										{upcomingTasks.length === 0 ? (
											<div className="text-sm opacity-60">予定はありません</div>
										) : (
											<div className="space-y-2">
												{upcomingTasks.slice(0, 4).map((task) => (
													<TaskCard
														key={task.id}
														task={task}
														allTasks={taskStore.tasks}
														draggable={false}
														density="compact"
														operationsPreset="default"
														showStatusControl={true}
														expandOnClick={true}
														onOperation={handleTaskCardOperation}
													/>
												))}
											</div>
										)}
									</div>

									{/* Projects - show tasks by project */}
									<div className="rounded-xl bg-[var(--md-ref-color-surface-container-high)] p-4">
										<div className="text-sm font-medium mb-3">プロジェクト別</div>
										{projectSummary.length === 0 ? (
											<div className="text-sm opacity-60">プロジェクトはありません</div>
										) : (
											<div className="space-y-3">
												{projectSummary.slice(0, 2).map((p) => (
													<div key={p.project}>
														<div className="flex items-center justify-between mb-1.5">
															<span className="text-xs font-medium truncate">{p.project}</span>
															<span className="text-[10px] opacity-50">{p.count}</span>
														</div>
														<div className="space-y-1.5">
															{p.tasks.slice(0, 2).map((task) => (
																<TaskCard
																	key={task.id}
																	task={task}
																	allTasks={taskStore.tasks}
																	draggable={false}
																	density="compact"
																	operationsPreset="default"
																	showStatusControl={true}
																	expandOnClick={true}
																	onOperation={handleTaskCardOperation}
																/>
															))}
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
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
							activeTimerRemainingMs={timer.remainingMs}
							activeTimerTotalMs={timer.snapshot?.total_ms ?? null}
							isTimerActive={timer.isActive}
							runningTasks={runningTasks}
							ambientCandidates={ambientCandidates}
							onAmbientClick={handleAmbientClick}
							onRequestStartNotification={handleRequestStartNotification}
							onRequestInterruptNotification={handleRequestInterruptNotification}
							onRequestPostponeNotification={handleRequestPostponeNotification}
							onSelectFocusTask={setGuidanceAnchorTaskId}
							onUpdateTask={taskStore.updateTask}
							onOperation={handleTaskCardOperation}
							nextTasks={nextTasksForBoard}
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
