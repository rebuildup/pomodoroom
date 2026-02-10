/**
 * ShellView -- Main application view using M3 App Shell
 *
 * Uses the new App Shell structure with Navigation Rail and Top App Bar.
 * Connects to M3 components for each destination.
 */

import { useState, useMemo } from 'react';
import { AppShell } from '@/components/m3/AppShell';
import { type NavDestination } from '@/components/m3/NavigationRail';
import { useTheme } from '@/hooks/useTheme';
import { Icon } from '@/components/m3/Icon';
import { NowHub } from '@/components/m3/NowHub';
import { TaskBoard } from '@/components/m3/TaskBoard';
import { NextTaskCandidates } from '@/components/m3/NextTaskCandidates';
import { M3TimelineView } from '@/views/M3TimelineView';
import type { ScheduleBlock } from '@/types';
import { useTauriTimer } from '@/hooks/useTauriTimer';
import { createMockTaskStream } from '@/types/taskstream';
import type { TaskStreamItem } from '@/types/taskstream';

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

	// Mock task data for NextTaskCandidates (will be replaced with real data)
	const mockTasks = useMemo(() => createMockTaskStream().filter(t => t.state === 'READY'), []);

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
					<div className="flex flex-col items-center justify-center h-full">
						<NowHub
							remainingMs={timer.remainingMs}
							totalMs={timer.snapshot?.total_ms ?? 25 * 60 * 1000}
							isActive={timer.isActive}
							stepType={timer.stepType}
							currentTask={null}
							pressureMode="normal"
							onPlayPause={() => {
								if (timer.isActive) {
									timer.pause();
								} else {
									timer.resume();
								}
							}}
							onSkip={() => timer.skip()}
						/>
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
										timer.start();
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
				return <TaskBoard tasks={boardTasks} />;
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
