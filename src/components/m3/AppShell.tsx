/**
 * Material 3 App Shell Component
 *
 * Main layout shell with Navigation Rail, Top App Bar, and Panel structure.
 * Provides the skeletal structure for all main views.
 *
 * Reference: https://m3.material.io/foundations/layout/guiding-principles
 */

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { NavigationRail, type NavDestination } from './NavigationRail';
import { TopAppBar } from './TopAppBar';
import { type Theme } from '@/hooks/useTheme';
import TitleBar from '@/components/TitleBar';
import { Icon, type MSIconName } from '@/components/m3/Icon';

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
	 * Optional persistent top section (always visible across destinations).
	 * Rendered below the system TitleBar and above the rest of the shell.
	 */
	topSection?: React.ReactNode;

	/**
	 * Optional persistent right side panel (always visible).
	 */
	rightPanel?: React.ReactNode;

	/**
	 * Optional persistent bottom section (always visible at window bottom).
	 */
	bottomSection?: React.ReactNode;

	/**
	 * Optional global creation actions (shown in left column above nav).
	 */
	createActions?: Array<{
		id: string;
		label: string;
		icon?: MSIconName;
		onSelect: () => void;
	}>;

	/**
	 * Whether to show the Top App Bar.
	 * Useful when the active view provides its own "top section" header.
	 */
	showTopAppBar?: boolean;

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
	 * Current window pin state (always-on-top), reflected in TitleBar.
	 */
	alwaysOnTop?: boolean;

	/**
	 * Toggle window pin (always-on-top).
	 */
	onTogglePin?: () => void;

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
	topSection,
	rightPanel,
	bottomSection,
	createActions,
	showTopAppBar = true,
	panels,
	children,
	actions,
	showThemeToggle = true,
	theme,
	onThemeToggle,
	alwaysOnTop = false,
	onTogglePin,
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
	const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
	const createMenuRef = useRef<HTMLDivElement | null>(null);

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

	useEffect(() => {
		if (!isCreateMenuOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (!createMenuRef.current?.contains(target)) {
				setIsCreateMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [isCreateMenuOpen]);

	return (
		<>
			{/* System Title Bar - Hover to reveal window controls */}
			<TitleBar
				theme={theme ?? 'dark'}
				showMenu
				showMinMax
				showModeToggles={Boolean(onTogglePin)}
				alwaysOnTop={alwaysOnTop}
				onTogglePin={onTogglePin}
				onToggleTheme={onThemeToggle}
			/>

			{/* App Shell container (TitleBar is an overlay; do not reserve layout space) */}
			<div
				className={`
					flex flex-col h-screen overflow-hidden
					bg-[var(--md-app-panel-bg)]
					${className}
				`.trim()}
			>
				{/* Persistent top section (does not scroll with main content) */}
				{topSection}

				{/* Top App Bar (optional) */}
				{showTopAppBar && (
					<TopAppBar
						title={title}
						subtitle={subtitle}
						actions={actions}
						showThemeToggle={showThemeToggle}
						theme={theme}
						onThemeToggle={onThemeToggle}
					/>
				)}

				{/* Main content area with Navigation Rail */}
				<div className="flex flex-1 overflow-hidden gap-4 p-4">
					{/* Left column: create + navigation */}
					<div className="shrink-0 flex flex-col gap-4 h-full">
						{createActions && createActions.length > 0 && (
							<div className="relative rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden" ref={createMenuRef}>
								<button
									type="button"
									onClick={() => setIsCreateMenuOpen((prev) => !prev)}
									className="
										w-full h-14 flex items-center justify-center
										text-[var(--md-ref-color-on-surface)]
										transition-colors duration-150
										hover:bg-[var(--md-ref-color-surface-container-high)]
									"
									aria-label="Create"
									title="Create"
									aria-expanded={isCreateMenuOpen}
									aria-haspopup="menu"
								>
									<Icon name="add" size={22} className="opacity-70" aria-hidden="true" />
								</button>

								{isCreateMenuOpen && (
									<div
										role="menu"
										className="
											absolute left-0 top-14 z-30 min-w-40 p-1
											rounded-xl bg-[var(--md-ref-color-surface)]
											shadow-lg border border-[var(--md-ref-color-outline-variant)]
										"
									>
										{createActions.map((action) => (
											<button
												key={action.id}
												type="button"
												role="menuitem"
												onClick={() => {
													action.onSelect();
													setIsCreateMenuOpen(false);
												}}
												className="
													w-full h-9 px-3 rounded-lg
													flex items-center gap-2 text-left
													text-sm text-[var(--md-ref-color-on-surface)]
													hover:bg-[var(--md-ref-color-surface-container-high)]
												"
											>
												{action.icon && <Icon name={action.icon} size={18} className="opacity-80" />}
												<span>{action.label}</span>
											</button>
										))}
									</div>
								)}
							</div>
						)}

						<div className="flex-1 min-h-0 rounded-2xl bg-[var(--md-ref-color-surface)] overflow-hidden">
							<NavigationRail
								active={activeDestination}
								onNavigate={onNavigate}
								collapsed={railCollapsed}
							/>
						</div>
					</div>

					{/* Main content (panel) */}
					<div className="flex-1 overflow-hidden rounded-2xl bg-[var(--md-ref-color-surface)]">
						<main className="h-full overflow-auto p-6 scrollbar-hover">
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

					{/* Right side panel (cards inside) */}
					{rightPanel && (
						<aside className="w-[360px] shrink-0 overflow-hidden">
							{rightPanel}
						</aside>
					)}
				</div>

				{/* Bottom section (window bottom) */}
				{bottomSection && (
					<div className="shrink-0 pb-4">
						{bottomSection}
					</div>
				)}
			</div>
		</>
	);
};

export default AppShell;
