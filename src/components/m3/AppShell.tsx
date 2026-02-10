/**
 * Material 3 App Shell Component
 *
 * Main layout shell with Navigation Rail, Top App Bar, and Panel structure.
 * Provides the skeletal structure for all main views.
 *
 * Reference: https://m3.material.io/foundations/layout/guiding-principles
 */

import React, { ReactNode, useState } from 'react';
import { NavigationRail, type NavDestination } from './NavigationRail';
import { TopAppBar } from './TopAppBar';
import { type Theme } from '@/hooks/useTheme';

export interface Panel {
	/**
	 * Unique identifier for the panel
	 */
	id: string;

	/**
	 * Panel title
	 */
	title: string;

	/**
	 * Panel content
	 */
	content: ReactNode;

	/**
	 * Whether panel is collapsible
	 */
	collapsible?: boolean;

	/**
	 * Initial collapsed state
	 */
	defaultCollapsed?: boolean;
}

export interface AppShellProps {
	/**
	 * Currently active navigation destination
	 */
	activeDestination: NavDestination;

	/**
	 * Navigation callback
	 */
	onNavigate: (destination: NavDestination) => void;

	/**
	 * Page title displayed in Top App Bar
	 */
	title: string;

	/**
	 * Optional subtitle for Top App Bar
	 */
	subtitle?: string;

	/**
	 * Panels to display in main content area
	 */
	panels?: Panel[];

	/**
	 * Custom content for main area (overrides panels)
	 */
	children?: ReactNode;

	/**
	 * Additional actions for Top App Bar
	 */
	actions?: React.ReactNode;

	/**
	 * Whether to show theme toggle in Top App Bar
	 */
	showThemeToggle?: boolean;

	/**
	 * Theme for controlled mode
	 */
	theme?: Theme;

	/**
	 * Theme toggle callback for controlled mode
	 */
	onThemeToggle?: () => void;

	/**
	 * Whether navigation rail is collapsed (mobile)
	 */
	railCollapsed?: boolean;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

/**
 * App Shell with Navigation Rail, Top App Bar, and collapsible panels
 *
 * @example
 * ```tsx
 * <AppShell
 *   activeDestination="timer"
 *   onNavigate={(dest) => console.log(dest)}
 *   title="Timer"
 *   panels={[
 *     { id: 'main', title: 'Current Task', content: <TimerDisplay /> },
 *     { id: 'tasks', title: 'Tasks', content: <TaskList />, collapsible: true }
 *   ]}
 * />
 * ```
 */
export const AppShell: React.FC<AppShellProps> = ({
	activeDestination,
	onNavigate,
	title,
	subtitle,
	panels,
	children,
	actions,
	showThemeToggle = true,
	theme,
	onThemeToggle,
	railCollapsed = false,
	className = '',
}) => {
	// Track collapsed state for each panel
	const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(
		new Set(
			panels
				?.filter((p) => p.defaultCollapsed)
				?.map((p) => p.id) ?? []
		)
	);

	const togglePanel = (panelId: string) => {
		setCollapsedPanels((prev) => {
			const next = new Set(prev);
			if (next.has(panelId)) {
				next.delete(panelId);
			} else {
				next.add(panelId);
			}
			return next;
		});
	};

	return (
		<div
			className={`
				flex flex-col h-screen overflow-hidden
				bg-[var(--md-ref-color-surface)]
				${className}
			`.trim()}
		>
			{/* Top App Bar */}
			<TopAppBar
				title={title}
				subtitle={subtitle}
				actions={actions}
				showThemeToggle={showThemeToggle}
				theme={theme}
				onThemeToggle={onThemeToggle}
			/>

			{/* Main content area with Navigation Rail */}
			<div className="flex flex-1 overflow-hidden">
				{/* Navigation Rail */}
				<NavigationRail
					active={activeDestination}
					onNavigate={onNavigate}
					collapsed={railCollapsed}
				/>

				{/* Main content */}
				<main className="flex-1 overflow-auto p-6">
					{children ? (
						children
					) : panels ? (
						<div className="space-y-4 max-w-7xl mx-auto">
							{panels.map((panel) => {
								const isCollapsed = collapsedPanels.has(panel.id);
								const canCollapse = panel.collapsible ?? false;

								return (
									<section
										key={panel.id}
										className={`
											bg-[var(--md-ref-color-surface-container)]
											rounded-[var(--md-sys-shape-corner-large)]
											overflow-hidden
											transition-all duration-200 ease-in-out
										`.trim()}
									>
										{/* Panel header */}
										<div
											className={`
												flex items-center justify-between
												px-4 py-3
												border-b border-[var(--md-ref-color-outline-variant)]
												${canCollapse ? 'cursor-pointer hover:bg-[var(--md-ref-color-surface-container-high)]' : ''}
											`.trim()}
											onClick={() => canCollapse && togglePanel(panel.id)}
										>
											<h2
												className="text-base font-medium"
												style={{ font: 'var(--md-sys-typescale-title-medium)' }}
											>
												{panel.title}
											</h2>
											{canCollapse && (
												<span
													className={`
														text-[var(--md-ref-color-on-surface-variant)]
														transition-transform duration-200 ease-in-out
														${isCollapsed ? 'rotate-180' : ''}
													`.trim()}
												>
													▼
												</span>
											)}
										</div>

										{/* Panel content */}
										{!isCollapsed && (
											<div className="p-4">
												{panel.content}
											</div>
										)}
									</section>
								);
							})}
						</div>
					) : null}
				</main>
			</div>
		</div>
	);
};

export default AppShell;
