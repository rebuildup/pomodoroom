/**
 * ShellView -- Main application view using M3 App Shell
 *
 * Demonstrates the new App Shell structure with Navigation Rail and Top App Bar.
 * This will replace MainView once the full UI migration is complete.
 */

import { useState } from 'react';
import { AppShell } from '@/components/m3/AppShell';
import { type NavDestination } from '@/components/m3/NavigationRail';
import { useTheme } from '@/hooks/useTheme';
import { Icon } from '@/components/m3/Icon';

// Placeholder components for each destination
const TimerContent = () => (
	<div className="flex flex-col items-center justify-center h-full text-center">
		<Icon name="timer" size={64} className="mb-4 opacity-50" />
		<h2 className="text-xl font-medium mb-2">Timer</h2>
		<p className="text-sm opacity-70">Timer view will be implemented in M2</p>
	</div>
);

const TasksContent = () => (
	<div className="flex flex-col items-center justify-center h-full text-center">
		<Icon name="check_circle" size={64} className="mb-4 opacity-50" />
		<h2 className="text-xl font-medium mb-2">Tasks</h2>
		<p className="text-sm opacity-70">Task board will be implemented in M2</p>
	</div>
);

const ScheduleContent = () => (
	<div className="flex flex-col items-center justify-center h-full text-center">
		<Icon name="schedule" size={64} className="mb-4 opacity-50" />
		<h2 className="text-xl font-medium mb-2">Schedule</h2>
		<p className="text-sm opacity-70">Timeline view will be implemented in M2</p>
	</div>
);

const StatsContent = () => (
	<div className="flex flex-col items-center justify-center h-full text-center">
		<Icon name="bar_chart" size={64} className="mb-4 opacity-50" />
		<h2 className="text-xl font-medium mb-2">Statistics</h2>
		<p className="text-sm opacity-70">Stats dashboard will be implemented in M2</p>
	</div>
);

const SettingsContent = () => (
	<div className="flex flex-col items-center justify-center h-full text-center">
		<Icon name="settings" size={64} className="mb-4 opacity-50" />
		<h2 className="text-xl font-medium mb-2">Settings</h2>
		<p className="text-sm opacity-70">Settings will be implemented in M2</p>
	</div>
);

export default function ShellView() {
	const [activeDestination, setActiveDestination] = useState<NavDestination>('timer');
	const { theme, toggleTheme } = useTheme();

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
				return <TimerContent />;
			case 'tasks':
				return <TasksContent />;
			case 'schedule':
				return <ScheduleContent />;
			case 'stats':
				return <StatsContent />;
			case 'settings':
				return <SettingsContent />;
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
