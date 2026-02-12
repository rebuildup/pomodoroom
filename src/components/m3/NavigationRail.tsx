/**
 * Material 3 Navigation Rail Component
 *
 * Vertical navigation with icons for destop/tablet layouts.
 * Shows: Overview, Tasks, Stats, Settings
 *
 * Reference: https://m3.material.io/components/navigation-rails/overview
 */

import React from 'react';
import { Icon, type MSIconName } from './Icon';

export type NavDestination = 'overview' | 'tasks' | 'life' | 'settings';

interface NavItem {
	id: NavDestination;
	label: string;
	icon: MSIconName;
}

const NAV_ITEMS: NavItem[] = [
	{ id: 'overview', label: 'Overview', icon: 'home' },
	{ id: 'tasks', label: 'Tasks', icon: 'check_circle' },
	{ id: 'life', label: '生活時間', icon: 'schedule' },
	{ id: 'settings', label: 'Settings', icon: 'settings' },
];

export interface NavigationRailProps {
	/**
	 * Currently active destination
	 */
	active: NavDestination;

	/**
	 * Callback when navigation item is clicked
	 */
	onNavigate: (destination: NavDestination) => void;

	/**
	 * Whether the rail is collapsed (mobile)
	 */
	collapsed?: boolean;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

/**
 * Navigation Rail for App Shell
 *
 * @example
 * ```tsx
 * <NavigationRail
 *   active="timer"
 *   onNavigate={(dest) => console.log(dest)}
 * />
 * ```
 */
export const NavigationRail: React.FC<NavigationRailProps> = ({
	active,
	onNavigate,
	className = '',
}) => {
	const mainItems = NAV_ITEMS.filter(i => i.id !== 'settings');
	const settingsItem = NAV_ITEMS.find(i => i.id === 'settings');

	return (
		<nav
			className={`
				flex flex-col items-center h-full py-2
				transition-all duration-200 ease-in-out
				w-16
				${className}
			`.trim()}
			aria-label="Main navigation"
			role="navigation"
		>
			<div className="flex flex-col items-center w-full">
				{mainItems.map((item) => {
					const isActive = active === item.id;

					return (
						<button
							key={item.id}
							onClick={() => {
								onNavigate(item.id);
								// Update guidance board when navigating to overview/tasks
								if (item.id === 'overview' || item.id === 'tasks') {
									window.dispatchEvent(new CustomEvent('guidance-refresh'));
								}
							}}
							className={`
								group relative flex items-center justify-center
								rounded-full mb-1
								w-11 h-11
								transition-all duration-150 ease-out
								${isActive
									? 'bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface)]'
									: 'text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] hover:text-[var(--md-ref-color-on-surface)]'
								}
							`.trim()}
							aria-current={isActive ? 'page' : undefined}
							aria-label={item.label}
							aria-pressed={isActive}
							title={item.label}
						>
							<Icon
								name={item.icon}
								size={24}
								weight={isActive ? 600 : 400}
								filled={isActive}
								className={`
									transition-opacity duration-150
									${isActive ? 'opacity-100' : 'opacity-65 group-hover:opacity-90'}
								`.trim()}
								aria-hidden="true"
							/>
						</button>
					);
				})}
			</div>

			{settingsItem && (
				<button
					key={settingsItem.id}
					onClick={() => {
						onNavigate(settingsItem.id);
						// Update guidance board when navigating to settings
						window.dispatchEvent(new CustomEvent('guidance-refresh'));
					}}
					className={`
						group relative flex items-center justify-center
						rounded-full
						w-11 h-11 mt-auto
						transition-all duration-150 ease-out
						${active === settingsItem.id
							? 'bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface)]'
							: 'text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)] hover:text-[var(--md-ref-color-on-surface)]'
						}
					`.trim()}
					aria-current={active === settingsItem.id ? 'page' : undefined}
					aria-label={settingsItem.label}
					aria-pressed={active === settingsItem.id}
					title={settingsItem.label}
				>
					<Icon
						name={settingsItem.icon}
						size={24}
						weight={active === settingsItem.id ? 600 : 400}
						filled={active === settingsItem.id}
						className={`
							transition-opacity duration-150
							${active === settingsItem.id ? 'opacity-100' : 'opacity-65 group-hover:opacity-90'}
						`.trim()}
						aria-hidden="true"
					/>
				</button>
			)}
		</nav>
	);
};

export default NavigationRail;
