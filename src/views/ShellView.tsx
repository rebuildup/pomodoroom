/**
 * ShellView -- Main application view using M3 App Shell
 *
 * Uses the new App Shell structure with Navigation Rail and Top App Bar.
 * Connects to M3 components for each destination.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppShell } from '@/components/m3/AppShell';
import { type NavDestination } from '@/components/m3/NavigationRail';
import { useTheme } from '@/hooks/useTheme';
import { Icon } from '@/components/m3/Icon';
import { NowHub } from '@/components/m3/NowHub';
import { TaskBoard } from '@/components/m3/TaskBoard';
import { NextTaskCandidates } from '@/components/m3/NextTaskCandidates';
import { AmbientTaskList, type AmbientTask } from '@/components/m3/AmbientTaskList';
import { M3TimelineView } from '@/views/M3TimelineView';
import type { ScheduleBlock } from '@/types';
import { useTauriTimer } from '@/hooks/useTauriTimer';
import { useTaskStateMap } from '@/hooks/useTaskState';
import { usePressure } from '@/hooks/usePressure';
import { createMockTaskStream, STATE_TO_STATUS_MAP } from '@/types/taskstream';
import type { TaskStreamItem } from '@/types/taskstream';
import type { TaskState } from '@/types/task-state';

// Mock data for demonstration
const mockScheduleBlocks: ScheduleBlock[] = [
	{
		id: '1',
		blockType: 'focus',
		startTime: new Date().toISOString(),
		endTime: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
		locked: false,
		label: 'Focus Session',
		lane: 0,
	},
];

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('timer');
	const { theme, toggleTheme } = useTheme();
	const timer = useTauriTimer();
	const taskStateMap = useTaskStateMap();
	const { state: pressureState, calculateUIPressure } = usePressure();

	// State to track tasks with their current states
	const [tasks, setTasks] = useState<TaskStreamItem[]>(() => createMockTaskStream());

	// Filter ready tasks for NextTaskCandidates
	const mockTasks = useMemo(() => tasks.filter(t => t.state === 'READY'), [tasks]);

	// Get task states from taskStateMap for syncing
	const taskStates = useMemo(() => {
		const states: Record<string, TaskState> = {};
		tasks.forEach(task => {
			const state = taskStateMap.getState(task.id);
			if (state) {
				states[task.id] = state;
			}
		});
		return states;
	}, [tasks, taskStateMap]);

	/**
	 * Extract Anchor task (single RUNNING task).
	 * Anchor is the task the user should focus on NOW.
	 * Max 1 RUNNING task at any time.
	 */
	const anchorTask = useMemo(() => {
		return tasks.find(task => {
			const state = taskStateMap.getState(task.id);
			return state === 'RUNNING';
		});
	}, [tasks, taskStateMap]);

	/**
	 * Extract Ambient tasks (all PAUSED tasks).
	 * Ambient are background awareness tasks that the user
	 * has interrupted but may want to resume later.
	 */
	const ambientTasks = useMemo(() => {
		return tasks
			.filter(task => {
				const state = taskStateMap.getState(task.id);
				return state === 'PAUSED';
			})
			.map(task => ({
				id: task.id,
				title: task.title,
				pausedAt: task.startedAt, // Use startedAt as pause time approximation
				projectId: task.projectId,
			} as AmbientTask));
	}, [tasks, taskStateMap]);

	/**
	 * Calculate UI pressure based on task states and timer state.
	 * Updates dynamically as tasks change state and timer progresses.
	 *
	 * Uses relative 0-100 scale:
	 * - Baseline: 50
	 * - Time pressure: +20 based on timer progress
	 * - Ready tasks: +3 per task
	 * - Completed tasks: -5 per task
	 * - Running task bonus: -10 (focused work reduces pressure)
	 */
	useEffect(() => {
		// Convert TaskStreamItem to WorkItem for pressure calculation
		const workItems = tasks.map((task) => ({
			estimatedMinutes: task.estimatedMinutes,
			completed: task.state === 'DONE',
			status: task.status,
		}));

		// Calculate UI pressure with timer state
		calculateUIPressure(workItems, {
			remainingMs: timer.remainingMs,
			totalMs: timer.snapshot?.total_ms ?? 25 * 60 * 1000,
			isActive: timer.isActive,
		});
	}, [tasks, timer.remainingMs, timer.isActive, timer.snapshot?.total_ms, calculateUIPressure]);

	/**
	 * Unified handler for task operations that coordinates state transitions with timer operations.
	 * Validates transitions, executes state changes, and synchronizes timer state.
	 *
	 * This is the central coordination point for all task operations, ensuring that
	 * task state and timer state remain synchronized throughout the application.
	 *
	 * @param taskId - ID of the task to operate on
	 * @param operation - Operation to perform: 'start' | 'complete' | 'pause' | 'resume' | 'extend'
	 */
	const handleTaskOperation = useCallback(
		async (taskId: string, operation: 'start' | 'complete' | 'pause' | 'resume' | 'extend') => {
			// Get current state to validate transition
			const currentState = taskStateMap.getState(taskId);

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
			if (!taskStateMap.canTransition(taskId, targetState)) {
				console.warn(
					`Invalid state transition for task ${taskId}: ${currentState} -> ${targetState} (operation: ${operation})`,
				);
				return;
			}

			try {
				// Execute state transition first
				taskStateMap.transition(taskId, targetState, operation);

				// Then execute corresponding timer operation
				switch (operation) {
					case 'start':
						// Task Start (READY → RUNNING): Start timer if not already running
						if (!timer.isActive && !timer.isPaused) {
							await timer.start();
						} else if (timer.isPaused) {
							await timer.resume();
						}
						break;

					case 'complete':
						// Task Complete (RUNNING → DONE): Skip to next step (completes current session)
						if (timer.isActive || timer.isPaused) {
							await timer.skip();
						}
						break;

					case 'pause':
						// Task Pause (RUNNING → PAUSED): Pause timer
						if (timer.isActive) {
							await timer.pause();
						}
						break;

					case 'resume':
						// Task Resume (PAUSED → RUNNING): Resume timer
						if (timer.isPaused) {
							await timer.resume();
						} else if (!timer.isActive) {
							await timer.start();
						}
						break;

					case 'extend':
						// Task Extend (RUNNING → RUNNING with timer reset): Reset and restart timer
						await timer.reset();
						await timer.start();
						break;
				}

				// Update task state in local state for pressure calculation
				setTasks(prev => prev.map(task => {
					if (task.id === taskId) {
						// Update both state and status for consistency
						return {
							...task,
							state: targetState,
							status: STATE_TO_STATUS_MAP[targetState],
						};
					}
					return task;
				}));
			} catch (error) {
				console.error(`Error executing task operation ${operation} on task ${taskId}:`, error);
				// Note: State is already transitioned; timer may be out of sync
				// In production, implement rollback mechanism here
			}
		},
		[taskStateMap, timer],
	);

	/**
	 * Handle task state changes from TaskBoard.
	 * Delegates to handleTaskOperation for coordinated state/timer updates.
	 */
	const handleTaskStateChange = useCallback(
		(taskId: string, newState: TaskState) => {
			// Map state changes to operations
			const currentState = taskStateMap.getState(taskId);
			if (!currentState) return;

			let operation: 'start' | 'complete' | 'pause' | 'resume' | 'extend' | null;

			switch (newState) {
				case 'RUNNING':
					operation = currentState === 'PAUSED' ? 'resume' : 'start';
					break;
				case 'DONE':
					operation = 'complete';
					break;
				case 'PAUSED':
					operation = 'pause';
					break;
				default:
					return;
			}

			if (operation) {
				handleTaskOperation(taskId, operation);
			}
		},
		[taskStateMap, handleTaskOperation],
	);

	/**
	 * Handle resume action for Ambient tasks.
	 * Promotes an Ambient task (PAUSED) to Anchor (RUNNING).
	 * If another task is currently RUNNING, it will be paused first.
	 */
	const handleResumeAmbientTask = useCallback((taskId: string) => {
		// If there's a current Anchor task, pause it first
		if (anchorTask) {
			handleTaskOperation(anchorTask.id, 'pause');
		}

		// Resume the selected Ambient task to make it the new Anchor
		handleTaskOperation(taskId, 'resume');
	}, [anchorTask, handleTaskOperation]);

	// Convert TaskStreamItem to Task for TaskBoard
	const boardTasks = useMemo(() => {
		return mockTasks.map(t => ({
			id: t.id,
			title: t.title,
			description: t.markdown,
			estimatedPomodoros: Math.ceil(t.estimatedMinutes / 25),
			completedPomodoros: 0,
			completed: t.state === 'DONE',
			state: t.state,
			projectId: t.projectId,
			tags: t.tags,
			category: 'active' as const,
			createdAt: t.createdAt,
		}));
	}, [mockTasks]);

	// Title and subtitle based on active destination
	const getTitle = () => {
		switch (activeDestination) {
			case 'timer':
				return { title: 'Timer', subtitle: 'Focus on your task' };
			case 'tasks':
				return { title: 'Tasks', subtitle: 'Manage your task board' };
			case 'schedule':
				return { title: 'Schedule', subtitle: 'Plan your day' };
			case 'stats':
				return { title: 'Statistics', subtitle: 'Track your progress' };
			case 'settings':
				return { title: 'Settings', subtitle: 'Configure Pomodoroom' };
		}
	};

	const { title, subtitle } = getTitle();

	// Render content based on active destination
	const renderContent = () => {
		switch (activeDestination) {
			case 'timer':
				return (
					<div className="flex flex-col items-center justify-center h-full py-8">
						{/* NowHub with Anchor task */}
						<NowHub
							remainingMs={timer.remainingMs}
							totalMs={timer.snapshot?.total_ms ?? 25 * 60 * 1000}
							isActive={timer.isActive}
							stepType={timer.stepType}
							currentTask={anchorTask?.title ?? null}
							currentTaskState={anchorTask ? taskStateMap.getState(anchorTask.id) ?? undefined : undefined}
							pressureMode={pressureState.mode}
							pressureValue={pressureState.value}
							isAnchor={!!anchorTask}
							anchorTaskId={anchorTask?.id ?? null}
							onPlayPause={() => {
								if (timer.isActive) {
									timer.pause();
								} else {
									timer.resume();
								}
							}}
							onSkip={() => timer.skip()}
							onComplete={() => anchorTask && handleTaskOperation(anchorTask.id, 'complete')}
							onExtend={() => {
								// Extend: reset timer for same task (RUNNING -> RUNNING)
								if (anchorTask) {
									handleTaskOperation(anchorTask.id, 'extend');
								}
							}}
							onPause={() => anchorTask && handleTaskOperation(anchorTask.id, 'pause')}
							onResume={() => anchorTask && handleTaskOperation(anchorTask.id, 'resume')}
						/>

						{/* Ambient tasks list - shown below timer */}
						{ambientTasks.length > 0 && (
							<div className="mt-12 w-full max-w-lg px-6">
								<AmbientTaskList
									tasks={ambientTasks}
									onResume={handleResumeAmbientTask}
								/>
							</div>
						)}

						{/* Suggested next tasks when timer is idle */}
						{!timer.isActive && !timer.isPaused && (
							<div className="mt-12 w-full max-w-2xl px-6">
								<NextTaskCandidates
									tasks={mockTasks}
									energyLevel="medium"
									timeAvailable={25}
									maxSuggestions={3}
									onStart={(task) => {
										console.log('Starting task:', task.title);
										handleTaskOperation(task.id, 'start');
									}}
									onSkip={(taskId) => console.log('Skipped task:', taskId)}
									onRefresh={() => console.log('Refresh suggestions')}
									compact={false}
								/>
							</div>
						)}
					</div>
				);
			case 'tasks':
				return <TaskBoard tasks={boardTasks} onTaskStateChange={handleTaskStateChange} />;
			case 'schedule':
				return <M3TimelineView blocks={mockScheduleBlocks} />;
			case 'stats':
				return (
					<div className="flex flex-col items-center justify-center h-full text-center">
						<Icon name="bar_chart" size={64} className="mb-4 opacity-50" />
						<h2 className="text-xl font-medium mb-2">Statistics</h2>
						<p className="text-sm opacity-70">Stats dashboard will be implemented</p>
					</div>
				);
			case 'settings':
				return (
					<div className="flex flex-col items-center justify-center h-full text-center">
						<Icon name="settings" size={64} className="mb-4 opacity-50" />
						<h2 className="text-xl font-medium mb-2">Settings</h2>
						<p className="text-sm opacity-70">Settings will be implemented</p>
					</div>
				);
		}
	};

	return (
		<AppShell
			activeDestination={activeDestination}
			onNavigate={setActiveDestination}
			title={title}
			subtitle={subtitle}
			theme={theme}
			onThemeToggle={toggleTheme}
		>
			{renderContent()}
		</AppShell>
	);
}
