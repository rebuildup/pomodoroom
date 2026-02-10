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
import { Icon } from '@/components/m3/Icon';
import { NowHub } from '@/components/m3/NowHub';
import { TaskBoard } from '@/components/m3/TaskBoard';
import { NextTaskCandidates } from '@/components/m3/NextTaskCandidates';
import { AmbientTaskList, type AmbientTask } from '@/components/m3/AmbientTaskList';
import { M3TimelineView } from '@/views/M3TimelineView';
import type { ScheduleBlock } from '@/types';
import { useTauriTimer } from '@/hooks/useTauriTimer';
import { useTaskStore } from '@/hooks/useTaskStore';
import { usePressure } from '@/hooks/usePressure';
import type { TaskState } from '@/types/task-state';
import type { TaskStreamItem } from '@/types/taskstream';
import { STATE_TO_STATUS_MAP } from '@/types/taskstream';

// Mock data for schedule demonstration
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

// Convert Task to TaskStreamItem for NextTaskCandidates compatibility
function taskToTaskStreamItem(task: import('@/types/task').Task): TaskStreamItem {
	return {
		id: task.id,
		title: task.title,
		status: STATE_TO_STATUS_MAP[task.state],
		state: task.state,
		markdown: task.description,
		estimatedMinutes: task.estimatedMinutes ?? 25,
		actualMinutes: task.elapsedMinutes,
		projectId: task.project ?? undefined,
		tags: task.tags,
		createdAt: task.createdAt,
		order: 0,
		interruptCount: 0,
	};
}

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('timer');
	const { theme, toggleTheme } = useTheme();
	const timer = useTauriTimer();
	const taskStore = useTaskStore();
	const { state: pressureState, calculateUIPressure } = usePressure();

	/**
	 * Calculate UI pressure based on task states and timer state.
	 * Updates dynamically as tasks change state and timer progresses.
	 */
	useEffect(() => {
		// Convert Task to WorkItem for pressure calculation
		const workItems = taskStore.tasks.map((task) => ({
			estimatedMinutes: task.estimatedMinutes ?? 25,
			completed: task.state === 'DONE',
			status: STATE_TO_STATUS_MAP[task.state],
		}));

		// Calculate UI pressure with timer state
		calculateUIPressure(workItems, {
			remainingMs: timer.remainingMs,
			totalMs: timer.snapshot?.total_ms ?? 25 * 60 * 1000,
			isActive: timer.isActive,
		});
	}, [taskStore.tasks, timer.remainingMs, timer.isActive, timer.snapshot?.total_ms, calculateUIPressure]);

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

			try {
				// Handle special case: starting a new task should pause the current anchor
				if (operation === 'start' && taskStore.anchorTask && taskStore.anchorTask.id !== taskId) {
					// Pause the current anchor task first
					taskStore.transition(taskStore.anchorTask.id, 'PAUSED', 'pause');
					taskStore.updateTask(taskStore.anchorTask.id, {
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

				// Then execute corresponding timer operation
				switch (operation) {
					case 'start':
						if (!timer.isActive && !timer.isPaused) {
							await timer.start();
						} else if (timer.isPaused) {
							await timer.resume();
						}
						break;

					case 'complete':
						if (timer.isActive || timer.isPaused) {
							await timer.skip();
						}
						break;

					case 'pause':
						if (timer.isActive) {
							await timer.pause();
						}
						break;

					case 'resume':
						if (timer.isPaused) {
							await timer.resume();
						} else if (!timer.isActive) {
							await timer.start();
						}
						break;

					case 'extend':
						await timer.reset();
						await timer.start();
						break;
				}
			} catch (error) {
				console.error(`Error executing task operation ${operation} on task ${taskId}:`, error);
			}
		},
		[taskStore, timer],
	);

	/**
	 * Handle task state changes from TaskBoard.
	 * Delegates to handleTaskOperation for coordinated state/timer updates.
	 */
	const handleTaskStateChange = useCallback(
		(taskId: string, newState: TaskState) => {
			// Map state changes to operations
			const currentState = taskStore.getState(taskId);
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
		[taskStore, handleTaskOperation],
	);

	/**
	 * Handle resume action for Ambient tasks.
	 * Promotes an Ambient task (PAUSED) to Anchor (RUNNING).
	 * If another task is currently RUNNING, it will be paused first.
	 */
	const handleResumeAmbientTask = useCallback((taskId: string) => {
		// If there's a current Anchor task, pause it first
		if (taskStore.anchorTask) {
			handleTaskOperation(taskStore.anchorTask.id, 'pause');
		}

		// Resume the selected Ambient task to make it the new Anchor
		handleTaskOperation(taskId, 'resume');
	}, [taskStore, handleTaskOperation]);

	/**
	 * Handle start task from NextTaskCandidates.
	 */
	const handleStartTask = useCallback((taskId: string) => {
		handleTaskOperation(taskId, 'start');
	}, [handleTaskOperation]);

	/**
	 * Handle defer task from NextTaskCandidates.
	 */
	const handleDeferTask = useCallback((taskId: string) => {
		const task = taskStore.getTask(taskId);
		if (!task) return;

		// Defer: decrease priority
		taskStore.updateTask(taskId, { priority: task.priority - 1 });
	}, [taskStore]);

	// Convert ambient tasks to AmbientTask for AmbientTaskList
	const ambientTaskListItems = useMemo(() => {
		return taskStore.ambientTasks.map(task => ({
			id: task.id,
			title: task.title,
			pausedAt: task.pausedAt ?? task.updatedAt,
			projectId: task.project ?? undefined,
		} as AmbientTask));
	}, [taskStore.ambientTasks]);

	// Convert ready tasks + ambient tasks to TaskStreamItem for NextTaskCandidates
	const candidateTasks = useMemo(() => {
		const readyItems = taskStore.readyTasks.map(taskToTaskStreamItem);
		const ambientItems = taskStore.ambientTasks.map(taskToTaskStreamItem);
		return [...ambientItems, ...readyItems];
	}, [taskStore.readyTasks, taskStore.ambientTasks]);

	// Convert tasks to Task for TaskBoard
	const boardTasks = useMemo(() => {
		return [...taskStore.readyTasks, ...taskStore.ambientTasks].map(t => ({
			id: t.id,
			title: t.title,
			description: t.description,
			estimatedPomodoros: Math.ceil((t.estimatedMinutes ?? 25) / 25),
			completedPomodoros: Math.floor(t.elapsedMinutes / 25),
			completed: t.state === 'DONE',
			state: t.state,
			projectId: t.project ?? undefined,
			tags: t.tags,
			category: 'active' as const,
			createdAt: t.createdAt,
		}));
	}, [taskStore.readyTasks, taskStore.ambientTasks]);

	// Show empty state message when no tasks
	const isEmptyState = taskStore.totalCount === 0;

	// Title and subtitle based on active destination
	const getTitle = () => {
		switch (activeDestination) {
			case 'timer':
				return { title: 'Timer', subtitle: isEmptyState ? 'Add tasks to get started' : 'Focus on your task' };
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
					<div className="flex flex-col items-center h-full py-8 overflow-y-auto">
						{/* Empty state when no tasks */}
						{isEmptyState ? (
							<div className="flex flex-col items-center justify-center h-full gap-4">
								<Icon name="add_circle" size={64} className="opacity-30" />
								<div className="text-center">
									<p className="text-lg font-medium text-white/50">No tasks yet</p>
									<p className="text-sm text-white/30 mt-1">Add tasks from the Tasks tab to get started</p>
								</div>
							</div>
						) : (
							<>
								{/* NowHub with Anchor task - Central focus area */}
								<div className="flex-shrink-0">
									<NowHub
										remainingMs={timer.remainingMs}
										totalMs={timer.snapshot?.total_ms ?? 25 * 60 * 1000}
										isActive={timer.isActive}
										stepType={timer.stepType}
										currentTask={taskStore.anchorTask?.title ?? null}
										currentTaskState={taskStore.anchorTask ? taskStore.getState(taskStore.anchorTask.id) ?? undefined : undefined}
										pressureMode={pressureState.mode}
										pressureValue={pressureState.value}
										onPlayPause={() => {
											if (timer.isActive) {
												timer.pause();
											} else {
												timer.resume();
											}
										}}
										onSkip={() => timer.skip()}
										onComplete={() => taskStore.anchorTask && handleTaskOperation(taskStore.anchorTask.id, 'complete')}
										onExtend={() => {
											if (taskStore.anchorTask) {
												handleTaskOperation(taskStore.anchorTask.id, 'extend');
											}
										}}
										onPause={() => taskStore.anchorTask && handleTaskOperation(taskStore.anchorTask.id, 'pause')}
										onResume={() => taskStore.anchorTask && handleTaskOperation(taskStore.anchorTask.id, 'resume')}
									/>
								</div>

								{/* Middle section: Ambient tasks list - displayed below NowHub */}
								{taskStore.ambientTasks.length > 0 && (
									<div className="mt-12 w-full max-w-lg px-6 flex-shrink-0">
										<AmbientTaskList
											tasks={ambientTaskListItems}
											onResume={handleResumeAmbientTask}
										/>
									</div>
								)}

								{/* Bottom section: Suggested next tasks - shown only when timer is idle */}
								{!timer.isActive && !timer.isPaused && (
									<div className="mt-12 w-full max-w-2xl px-6 flex-shrink-0">
										<NextTaskCandidates
											tasks={candidateTasks}
											energyLevel="medium"
											timeAvailable={25}
											maxSuggestions={3}
											onStart={(task) => handleStartTask(task.id)}
											onSkip={(taskId) => handleDeferTask(taskId)}
											onRefresh={() => console.log('Refresh suggestions')}
											compact={false}
										/>
									</div>
								)}
							</>
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
