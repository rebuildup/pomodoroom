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
import { type TaskOperation } from '@/components/m3/TaskOperations';
import { RecurringTaskEditor, type RecurringAction } from '@/components/m3/RecurringTaskEditor';
import { OverviewProjectManager, type TasksViewAction } from '@/components/m3/OverviewProjectManager';
import { OverviewPinnedProjects } from '@/components/m3/OverviewPinnedProjects';
import { TeamReferencesPanel } from '@/components/m3/TeamReferencesPanel';
import { useTauriTimer } from '@/hooks/useTauriTimer';
import { useTaskStore } from '@/hooks/useTaskStore';
import { useProjects } from '@/hooks/useProjects';
import { useStatusSync } from '@/hooks/useStatusSync';
import { showActionNotification } from '@/hooks/useActionNotification';
import { useCachedGoogleCalendar, getEventsForDate } from '@/hooks/useCachedGoogleCalendar';
import { selectDueScheduledTask, selectNextBoardTasks } from '@/utils/next-board-tasks';
import { getNextTaskStartMs } from '@/utils/next-task-countdown';
import { toCandidateIso, toTimeLabel } from '@/utils/notification-time';
import { buildDeferCandidates } from '@/utils/defer-candidates';
import {
	acknowledgePrompt,
	getEscalationDecision,
	gatekeeperStart,
	isQuietHours,
	markPromptIgnored,
	readQuietHoursPolicy,
	toCriticalStartPromptKey,
} from '@/utils/gatekeeper';
import { isPermissionGranted, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import {
	evaluateCalendarContextStreakReset,
	loadCalendarStreakPolicies,
	recordCalendarStreakResetLog,
} from '@/utils/calendar-streak-reset-policy';
import { downshiftFocusRampState, resetFocusRampState } from '@/utils/focus-ramp-adaptation';
import SettingsView from '@/views/SettingsView';
import TasksView from '@/views/TasksView';
import { isValidTransition, type TaskState } from '@/types/task-state';
import type { Task } from '@/types/task';

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('overview');
	const [guidanceAnchorTaskId, setGuidanceAnchorTaskId] = useState<string | null>(null);
	const [pendingTasksAction, setPendingTasksAction] = useState<TasksViewAction | null>(null);
	const { theme, toggleTheme } = useTheme();

	const timer = useTauriTimer();
	const taskStore = useTaskStore();
	const projectsStore = useProjects();
	const calendar = useCachedGoogleCalendar();

	// Force re-render when guidance refresh event is received (e.g., on navigation)
	const [guidanceRefreshNonce, setGuidanceRefreshNonce] = useState(0);
	const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
	const [escalationBadges, setEscalationBadges] = useState<Record<string, 'badge' | 'toast' | 'modal'>>({});

	// Memoized values for GuidanceBoard - return tasks directly without transformation
	const runningTasks = useMemo(() => {
		const running = taskStore.getTasksByState('RUNNING');
		const nowIso = new Date().toISOString();
		const activeBreakTask: Task | null =
			running.length === 0 && timer.isActive && timer.stepType === 'break'
				? {
					id: '__active-break__',
					title: '休憩',
					description: 'タイマー休憩ステップ',
					estimatedPomodoros: 1,
					completedPomodoros: 0,
					completed: false,
					state: 'RUNNING',
					kind: 'break',
					requiredMinutes: Math.max(1, Math.round((timer.snapshot?.total_ms ?? timer.remainingMs) / 60_000)),
					fixedStartAt: null,
					fixedEndAt: null,
					windowStartAt: null,
					windowEndAt: null,
					estimatedStartAt: null,
					tags: ['timer-break'],
					priority: -100,
					category: 'active',
					createdAt: nowIso,
					project: null,
					group: null,
					energy: 'low',
					updatedAt: nowIso,
					completedAt: null,
					pausedAt: null,
					elapsedMinutes: 0,
					projectIds: [],
					groupIds: [],
					estimatedMinutes: null,
				}
				: null;
		const withBreak = activeBreakTask ? [activeBreakTask, ...running] : running;

		// Early return for simpler case
		if (!guidanceAnchorTaskId) {
			return withBreak;
		}

		// Find anchor task index for stable ordering
		const anchorIndex = withBreak.findIndex((t) => t.id === guidanceAnchorTaskId);

		// If anchor not found, return all tasks in original order
		if (anchorIndex === -1) {
			return withBreak;
		}

		// Create stable array with anchor first, then rest (no object transformation)
		const anchor = withBreak[anchorIndex];
		const rest = withBreak.filter((_, i) => i !== anchorIndex);

		return [anchor, ...rest];
	}, [taskStore, guidanceRefreshNonce, guidanceAnchorTaskId, timer.isActive, timer.stepType, timer.snapshot?.total_ms, timer.remainingMs]);

	const statusSync = useStatusSync(
		{
			isActive: timer.isActive,
			taskTitle: runningTasks[0]?.title ?? null,
			remainingMinutes: Math.max(0, Math.ceil(timer.remainingMs / 60_000)),
		},
		{
			slack: { autoSyncOnFocus: false, autoSyncOnBreak: false },
			discord: { autoSyncOnFocus: false, autoSyncOnBreak: false },
		}
	);

	useEffect(() => {
		if (!guidanceAnchorTaskId) return;
		const stillRunning = taskStore.getTasksByState('RUNNING').some((t) => t.id === guidanceAnchorTaskId);
		if (!stillRunning) {
			setGuidanceAnchorTaskId(null);
		}
	}, [taskStore, guidanceAnchorTaskId]);

	/**
	 * Select ambient candidates (READY/PAUSED tasks for suggestion).
	 * Priority: PAUSED > same project as running > high energy > recent.
	 * Auto-calculates suggested start time for tasks without scheduled time.
	 */
	// Memoize base task lists (stable dependencies)
	const readyTasks = useMemo(
		() => taskStore.getTasksByState('READY'),
		[taskStore],
	);
	const pausedTasks = useMemo(
		() => taskStore.getTasksByState('PAUSED'),
		[taskStore],
	);
	// Memoize running projects set (derived from running tasks)
	const runningProjects = useMemo(
		() => new Set(taskStore.getTasksByState('RUNNING').map((t) => t.project).filter(Boolean) as string[]),
		[taskStore],
	);

	// Memoize candidates (derived from memoized inputs)
	const ambientCandidates = useMemo(() => {
		// Auto-calculate next available start time (5 minutes from now)
		const nextSlotTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

		// Priority 1: PAUSED tasks (resume is natural) - max 1
		const candidates: Array<Task & { reason: string; state: 'PAUSED' | 'READY'; autoScheduledStartAt: string }> = [];
		if (pausedTasks.length > 0) {
			candidates.push({
				...pausedTasks[0],
				reason: '一時停止中',
				state: 'PAUSED',
				autoScheduledStartAt: pausedTasks[0].fixedStartAt || pausedTasks[0].windowStartAt || nextSlotTime,
			});
		}

		// Priority 2: Same project as running tasks - max 1
		if (candidates.length < 2) {
			const sameProjectTask = readyTasks.find((t) => t.project && runningProjects.has(t.project));
			if (sameProjectTask) {
				candidates.push({
					...sameProjectTask,
					reason: `${sameProjectTask.project}の関連タスク`,
					state: 'READY',
					autoScheduledStartAt: sameProjectTask.fixedStartAt || sameProjectTask.windowStartAt || nextSlotTime,
				});
			}
		}

		// Priority 3: High energy tasks - max 1
		if (candidates.length < 2) {
			const highEnergyTask = readyTasks.find((t) => t.energy === 'high');
			if (highEnergyTask) {
				candidates.push({
					...highEnergyTask,
					reason: '高エネルギー',
					state: 'READY',
					autoScheduledStartAt: highEnergyTask.fixedStartAt || highEnergyTask.windowStartAt || nextSlotTime,
				});
			}
		}

		// Priority 4: Recent tasks (fallback) - max 1
		if (candidates.length < 2) {
			const usedIds = candidates.map((c) => c.id);
			const availableTask = readyTasks.find((t) => !usedIds.includes(t.id));
			if (availableTask) {
				candidates.push({
					...availableTask,
					reason: '最近更新',
					state: 'READY',
					autoScheduledStartAt: availableTask.fixedStartAt || availableTask.windowStartAt || nextSlotTime,
				});
			}
		}

		return candidates;
	}, [readyTasks, pausedTasks, runningProjects]);

	const [taskSearch] = useState('');
	const [recurringAction, setRecurringAction] = useState<{ action: RecurringAction; nonce: number } | null>(null);
	const duePromptGuardRef = useRef<string | null>(null);
	const processedCalendarResetEventsRef = useRef<Set<string>>(new Set());

	// Task detail drawer state (Phase2-4) - for v2 Task from useTaskStore
	const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
	const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

	useEffect(() => {
		const handleGuidanceRefresh = () => {
			setGuidanceRefreshNonce(n => n + 1);
		};

		window.addEventListener('guidance-refresh', handleGuidanceRefresh);
		return () => window.removeEventListener('guidance-refresh', handleGuidanceRefresh);
	}, []);

	useEffect(() => {
		const timerId = window.setInterval(() => {
			setCurrentTimeMs(Date.now());
		}, 60_000);
		return () => window.clearInterval(timerId);
	}, []);

	useEffect(() => {
		let cancelled = false;
		const runCalendarContextReset = async () => {
			if (!calendar.state.isConnected || !calendar.state.syncEnabled || calendar.events.length === 0) {
				return;
			}

			let selectedCalendarIds: string[] = [];
			let result: { calendar_ids: string[] } | null = null;
			try {
				result = await invoke<{ calendar_ids: string[] }>('cmd_google_calendar_get_selected_calendars');
			} catch {
				selectedCalendarIds = [...new Set(calendar.events.map((event) => event.calendarId).filter(Boolean) as string[])];
			}
			if (result) {
				selectedCalendarIds = Array.isArray(result.calendar_ids) ? result.calendar_ids : [];
			}

			const decision = evaluateCalendarContextStreakReset(calendar.events, {
				nowMs: Date.now(),
				selectedCalendarIds,
				policies: loadCalendarStreakPolicies(),
			});
			if (!decision.cause || decision.action === 'none') return;
			if (processedCalendarResetEventsRef.current.has(decision.cause.eventId)) return;
			if (cancelled) return;

			if (decision.action === 'reset') {
				resetFocusRampState(`calendar:${decision.cause.eventId}:${decision.cause.reason}`);
			} else if (decision.action === 'downshift') {
				downshiftFocusRampState(
					1,
					`calendar:${decision.cause.eventId}:${decision.cause.reason}`,
				);
			}
			recordCalendarStreakResetLog(decision.cause);
			processedCalendarResetEventsRef.current.add(decision.cause.eventId);
		};
		void runCalendarContextReset();
		return () => {
			cancelled = true;
		};
	}, [calendar.state.isConnected, calendar.state.syncEnabled, calendar.events]);

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
				const task = taskStore.getTask(taskId);
				if (!task) return;

				const nowMs = Date.now();
				const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;
				const nextScheduledMs = taskStore.tasks
					.filter((t) => t.id !== task.id && (t.state === 'READY' || t.state === 'PAUSED'))
					.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
					.filter((v): v is string => Boolean(v))
					.map((v) => Date.parse(v))
					.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
					.sort((a, b) => a - b)[0] ?? null;
				const candidates = buildDeferCandidates({ nowMs, durationMs, nextScheduledMs });

				showActionNotification({
					title: 'タスク先送り',
					message: `${task.title} をいつに先送りしますか`,
					buttons: [
						...candidates.map((candidate) => ({
							label: `${candidate.reason} (${toTimeLabel(candidate.iso)})`,
							action: { defer_task_until: { id: task.id, defer_until: candidate.iso } },
						})),
						{ label: 'キャンセル', action: { dismiss: null } },
					],
				}).catch((error) => {
					console.error('[ShellView] Failed to show postpone notification:', error);
				});
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

			const effectiveOperation =
				operation === 'start' && currentState === 'PAUSED'
					? 'resume'
					: operation === 'resume' && currentState === 'READY'
						? 'start'
						: operation;

			if (effectiveOperation === 'start' || effectiveOperation === 'resume') {
				acknowledgePrompt(toCriticalStartPromptKey(taskId));
				setEscalationBadges((prev) => {
					if (!prev[taskId]) return prev;
					const next = { ...prev };
					delete next[taskId];
					return next;
				});
			}

			try {
				switch (effectiveOperation) {
					case 'start':
						await invoke('cmd_task_start', { id: taskId });
						break;
					case 'resume':
						await invoke('cmd_task_resume', { id: taskId });
						break;
					case 'pause':
						await invoke('cmd_task_pause', { id: taskId });
						break;
					case 'complete':
						await invoke('cmd_task_complete', { id: taskId });
						break;
					case 'extend':
						await invoke('cmd_task_extend', { id: taskId, minutes: 15 });
						break;
				}

				window.dispatchEvent(new CustomEvent('tasks:refresh'));
				window.dispatchEvent(new CustomEvent('guidance-refresh'));
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error(`[ShellView] Error executing task operation ${effectiveOperation} on task ${taskId}:`, errorMessage);
				window.dispatchEvent(new CustomEvent("tasks:refresh"));
				throw error;
			}
		},
		[taskStore],
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
			const task = taskStore.getTask(taskId);
			if (!task) return;

			// Determine operation based on current state
			const operation = task.state === 'PAUSED' ? 'resume' : 'start';
			await handleTaskOperation(taskId, operation);
		},
		[handleTaskOperation, taskStore]
	);

	const showCriticalStartIntervention = useCallback(
		async (task: Task, title: string, message: string, logContext: string) => {
			const promptKey = toCriticalStartPromptKey(task.id);

			// Start gatekeeper tracking for escalation
			await gatekeeperStart(promptKey, Date.now());

			const quietPolicy = readQuietHoursPolicy();
			const quietHours = await isQuietHours(new Date(), quietPolicy);
			const decision = await getEscalationDecision(promptKey, {
				isQuietHours: quietHours,
				isDnd: statusSync.shouldSuppressNotifications(),
			});

			if (decision.channel === 'badge') {
				setEscalationBadges((prev) => ({ ...prev, [task.id]: 'badge' }));
				await markPromptIgnored(promptKey, 'badge');
				return;
			}

			if (decision.channel === 'toast') {
				setEscalationBadges((prev) => ({ ...prev, [task.id]: 'badge' }));
				markPromptIgnored(promptKey, 'toast');
				try {
					const granted = await isPermissionGranted();
					if (granted) {
						sendNotification({
							title,
							body: message,
							icon: 'icons/32x32.png',
						});
					}
				} catch (error) {
					console.error(`[ShellView] Failed to show escalation toast (${logContext}):`, error);
				}
				return;
			}

			// Clear badge before showing modal (will be re-added on failure)
			const hadBadge = escalationBadges[task.id];
			setEscalationBadges((prev) => {
				if (!prev[task.id]) return prev;
				const next = { ...prev };
				delete next[task.id];
				return next;
			});

			showActionNotification({
				title,
				message,
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
				console.error(`[ShellView] Failed to show escalation modal (${logContext}):`, error);
				// Restore badge on failure so user can retry
				if (hadBadge) {
					setEscalationBadges((prev) => ({ ...prev, [task.id]: hadBadge }));
				}
			});
		},
		[statusSync]
	);

	const handleRequestStartNotification = useCallback((taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task) return;

		// For user-initiated starts, show confirmation modal directly without escalation
		const isResume = task.state === 'PAUSED';
		showActionNotification({
			title: isResume ? 'タスク再開' : 'タスク開始',
			message: task.title,
			buttons: [
				{
					label: isResume ? '再開' : '開始',
					action: { start_task: { id: task.id, resume: isResume } },
				},
				{ label: 'キャンセル', action: { dismiss: null } },
			],
		}).catch((error) => {
			console.error('[ShellView] Failed to show task start notification:', error);
		});
	}, [taskStore]);

	const handleRequestInterruptNotification = useCallback((taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task || task.state !== 'RUNNING') return;

		const now = new Date();
		const nowMs = now.getTime();

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
					label: `${c.label} (${toTimeLabel(c.iso)})`,
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
		const durationMs = Math.max(1, task.requiredMinutes ?? 25) * 60_000;

		const nextScheduledMs = taskStore.tasks
			.filter((t) => t.id !== task.id && (t.state === 'READY' || t.state === 'PAUSED'))
			.map((t) => t.fixedStartAt ?? t.windowStartAt ?? t.estimatedStartAt)
			.filter((v): v is string => Boolean(v))
			.map((v) => Date.parse(v))
			.filter((ms) => !Number.isNaN(ms) && ms > nowMs)
			.sort((a, b) => a - b)[0] ?? null;

		const candidates = buildDeferCandidates({ nowMs, durationMs, nextScheduledMs });

		showActionNotification({
			title: 'タスク先送り',
			message: `${task.title} をいつに先送りしますか`,
			buttons: [
				...candidates.map((c) => ({
					label: `${c.reason} (${toTimeLabel(c.iso)})`,
					action: { defer_task_until: { id: task.id, defer_until: c.iso } },
				})),
				{ label: 'キャンセル', action: { dismiss: null } },
			],
		}).catch((error) => {
			console.error('[ShellView] Failed to show postpone notification:', error);
		});
	}, [taskStore]);

	const handleTaskCardOperation = useCallback(
		async (taskId: string, operation: TaskOperation) => {
			if (taskId === '__active-break__') {
				try {
					if (operation === 'complete') {
						await invoke('cmd_timer_complete');
					} else if (operation === 'extend') {
						await invoke('cmd_timer_extend', { minutes: 5 });
					} else if (operation === 'pause') {
						await invoke('cmd_timer_pause');
					} else if (operation === 'resume' || operation === 'start') {
						await invoke('cmd_timer_resume');
					}
					window.dispatchEvent(new CustomEvent('tasks:refresh'));
					window.dispatchEvent(new CustomEvent('guidance-refresh'));
				} catch (error) {
					console.error('[ShellView] Failed break timer operation:', operation, error);
				}
				return;
			}

			const task = taskStore.getTask(taskId);
			if (!task) return;

			if (operation === 'edit') {
				// Open detail drawer for editing
				setDetailTaskId(taskId);
				setIsDetailDrawerOpen(true);
				return;
			}

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
				handleRequestPostponeNotification(taskId);
			}
		},
		[taskStore, handleRequestInterruptNotification, handleRequestPostponeNotification]
	);

	const handleNavigateToTasks = useCallback((action: TasksViewAction) => {
		setPendingTasksAction(action);
		setActiveDestination('tasks');
	}, []);

	// Execute reference (open URL, file, or show note)
	const handleExecuteReference = useCallback(async (reference: { kind: string; value: string; label?: string }) => {
		const kind = reference.kind.toLowerCase();
		if (kind === "url" || kind === "link") {
			try {
				await invoke("cmd_open_reference", { target: reference.value });
			} catch (error) {
				console.error("Failed to open URL:", error);
			}
		} else if (kind === "file" || kind === "folder") {
			try {
				await invoke("cmd_open_reference", { target: reference.value });
			} catch (error) {
				console.error("Failed to open path:", error);
			}
		}
		// Note: note references are handled differently in TasksView
	}, []);

	// Clear pending action when leaving tasks view
	useEffect(() => {
		if (activeDestination !== 'tasks' && pendingTasksAction) {
			setPendingTasksAction(null);
		}
	}, [activeDestination, pendingTasksAction]);

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

			// Select next actionable task using the same board ordering/filtering rules
			const nextTask = selectNextBoardTasks(taskStore.tasks, 1)[0];
			if (!nextTask) return;
			console.log('[ShellView] Auto-starting next task:', nextTask.title);

			// Start the next task (silently handle errors - auto-start is a convenience feature)
			try {
				const nextOperation = nextTask.state === 'PAUSED' ? 'resume' : 'start';
				await handleTaskOperation(nextTask.id, nextOperation);
			} catch (error) {
				// State mismatch between frontend and database is expected
				// User can manually start the next task if auto-start fails
				console.warn('[ShellView] Auto-start failed (task state may have changed):', error);
			}
		});
	}, [timer.initNotificationIntegration, timer.initStepCompleteCallback, taskStore, handleTaskOperation]);

	const nextTasksForBoard = useMemo(() => {
		return selectNextBoardTasks(taskStore.tasks, 3);
	}, [taskStore.tasks]);

	// Ask whether to start when a task reaches scheduled start time.
	// Uses a timer to trigger notification at the exact scheduled time.
	useEffect(() => {
		const nowMs = Date.now();
		const nextStartMs = getNextTaskStartMs(taskStore.tasks, nowMs);

		// No upcoming scheduled tasks
		if (nextStartMs === null) return;

		const delayMs = nextStartMs - nowMs;

		// If the time has already passed, check immediately
		if (delayMs <= 0) {
			const dueTask = selectDueScheduledTask(taskStore.tasks, nowMs);
			if (!dueTask) return;

			const dueStart = dueTask.fixedStartAt ?? dueTask.windowStartAt ?? dueTask.estimatedStartAt ?? '';
			const guardKey = `${dueTask.id}:${dueStart}`;
			if (duePromptGuardRef.current === guardKey) return;
			duePromptGuardRef.current = guardKey;

			const scheduledLabel = dueStart
				? new Date(dueStart).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
				: '現在';
			void showCriticalStartIntervention(
				dueTask,
				'開始時刻です',
				`${scheduledLabel} ${dueTask.title}`,
				'due'
			);
			return;
		}

		// Set timer for the next scheduled task
		console.log(`[ShellView] Setting notification timer for ${delayMs}ms (${new Date(nextStartMs).toLocaleTimeString('ja-JP')})`);
		const timerId = window.setTimeout(() => {
			const dueTask = selectDueScheduledTask(taskStore.tasks, Date.now());
			if (!dueTask) return;

			const dueStart = dueTask.fixedStartAt ?? dueTask.windowStartAt ?? dueTask.estimatedStartAt ?? '';
			const guardKey = `${dueTask.id}:${dueStart}`;
			if (duePromptGuardRef.current === guardKey) return;
			duePromptGuardRef.current = guardKey;

			const scheduledLabel = dueStart
				? new Date(dueStart).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
				: '現在';
			void showCriticalStartIntervention(
				dueTask,
				'開始時刻です',
				`${scheduledLabel} ${dueTask.title}`,
				'due'
			);
		}, delayMs);

		return () => {
			window.clearTimeout(timerId);
		};
	}, [taskStore.tasks, currentTimeMs, showCriticalStartIntervention]);

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
	}, [taskStore, taskSearch]);
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

			let startTime: string | null = null;
			let endTime: string | null = null;

			// Flex window: center the task in the window with requiredMinutes duration
			if (task.kind === "flex_window" && task.windowStartAt && task.windowEndAt && task.requiredMinutes) {
				const windowStart = new Date(task.windowStartAt);
				const windowEnd = new Date(task.windowEndAt);
				const windowCenter = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
				const halfDuration = (task.requiredMinutes / 2) * 60 * 1000;

				startTime = new Date(windowCenter.getTime() - halfDuration).toISOString();
				endTime = new Date(windowCenter.getTime() + halfDuration).toISOString();
			} else {
				// Fixed event or duration_only: use fixed times or calculate from start + duration
				startTime = task.fixedStartAt || task.windowStartAt;
				endTime = task.fixedEndAt || task.windowEndAt;
			}

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
	}, [calendar.events, todayDate, taskStore, timer.isActive, timer.remainingMs]);

	// Today's tasks for DayTimelinePanel (includes DONE tasks to show completion status)
	const todayTasks = useMemo(() => {
		const today = new Date(currentTimeMs);
		const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		const todayEnd = new Date(todayStart);
		todayEnd.setDate(todayEnd.getDate() + 1);

		return taskStore.tasks.filter((task) => {
			// Include DONE tasks to show completion mark on timeline
			const startTime = task.fixedStartAt || task.windowStartAt;
			if (!startTime) return false;
			const taskDate = new Date(startTime);
			return taskDate >= todayStart && taskDate < todayEnd;
		}).sort((a, b) => {
			const aStart = a.fixedStartAt || a.windowStartAt || "";
			const bStart = b.fixedStartAt || b.windowStartAt || "";
			return aStart.localeCompare(bStart);
		}) as Task[];
	}, [taskStore, currentTimeMs]);

	// Upcoming tasks (after now, sorted by start time)
	const upcomingTasks = useMemo(() => {
		const now = new Date(currentTimeMs);
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
	}, [taskStore, currentTimeMs]);

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
				return <TasksView initialAction={pendingTasksAction} onActionHandled={() => setPendingTasksAction(null)} />;
			case 'overview':
				return (
					<div className="max-w-7xl mx-auto space-y-4">
						<OverviewPinnedProjects
								projects={projectsStore.projects}
								tasks={taskStore.tasks}
								onTaskOperation={handleTaskCardOperation}
								onUpdateProject={projectsStore.updateProject}
								onNavigateToTasks={handleNavigateToTasks}
								onExecuteReference={handleExecuteReference}
							/>

							{/* Stats row */}
							<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
							<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
								{/* Timeline - 2 columns */}
								<div className="xl:col-span-2 flex flex-col rounded-lg bg-[var(--md-ref-color-surface-container-lowest)] border border-[var(--md-ref-color-outline-variant)]" style={{ minHeight: 400 }}>
									<div className="text-sm font-medium p-3 pb-0">今日のタイムライン</div>
									<div className="flex-1 min-h-[300px] overflow-auto">
										<DayTimelinePanel
											tasks={todayTasks}
											hourHeight={48}
											timeLabelWidth={48}
											minCardHeight={40}
											laneGap={3}
											testId="overview-timeline"
											className="h-full"
										/>
									</div>
								</div>

								{/* Sidebar - 1 column */}
								<div className="space-y-4">
									<div className="rounded-lg p-3 bg-[var(--md-ref-color-surface-container-low)] border border-[var(--md-ref-color-outline-variant)]">
										<TeamReferencesPanel onNavigateToTasks={handleNavigateToTasks} />
									</div>

									{/* Upcoming tasks */}
									{upcomingTasks.length > 0 && (
										<div className="rounded-lg p-3 bg-[var(--md-ref-color-surface-container-low)] border border-[var(--md-ref-color-outline-variant)]">
											<div className="text-sm font-medium mb-3">今後の予定</div>
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
										</div>
									)}

									<OverviewProjectManager
										projects={projectsStore.projects}
										tasks={taskStore.tasks}
										onTaskOperation={handleTaskCardOperation}
										onNavigateToTasks={handleNavigateToTasks}
										createProject={projectsStore.createProject}
										updateProject={projectsStore.updateProject}
										deleteProject={projectsStore.deleteProject}
									/>
								</div>
							</div>
						</div>
				);
			case 'life':
				return (
					<div className="h-full overflow-y-auto scrollbar-stable-y p-4">
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
							allTasksForCountdown={taskStore.tasks}
							escalationBadges={escalationBadges}
							showPanelBackground={true}
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
