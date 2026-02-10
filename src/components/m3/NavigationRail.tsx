/**
 * Material 3 Navigation Rail Component
 *
 * Vertical navigation with icons for destop/tablet layouts.
 * Shows: Timer, Tasks, Schedule, Stats, Settings
 *
 * Reference: https://m3.material.io/components/navigation-rails/overview
 */

import React from 'react';
import { Icon, type MSIconName } from './Icon';

export type NavDestination = 'timer' | 'tasks' | 'schedule' | 'stats' | 'settings';

interface NavItem {
	id: NavDestination;
	label: string;
	icon: MSIconName;
}

const NAV_ITEMS: NavItem[] = [
	{ id: 'timer', label: 'Timer', icon: 'timer' },
	{ id: 'tasks', label: 'Tasks', icon: 'check_circle' },
	{ id: 'schedule', label: 'Schedule', icon: 'schedule' },
	{ id: 'stats', label: 'Stats', icon: 'bar_chart' },
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
	collapsed = false,
	className = '',
}) => {
	return (
		<nav
			className={`
				flex flex-col items-center py-4
				bg-[var(--md-ref-color-surface-container)]
				border-r border-[var(--md-ref-color-outline-variant)]
				transition-all duration-200 ease-in-out
				${collapsed ? 'w-16' : 'w-20'}
				${className}
			`.trim()}
			aria-label="Main navigation"
			role="navigation"
		>
			{NAV_ITEMS.map((item) => {
				const isActive = active === item.id;

				return (
					<button
						key={item.id}
						onClick={() => onNavigate(item.id)}
						className={`
							relative flex flex-col items-center justify-center
							gap-1 rounded-full mb-2
							w-14 h-16
							transition-all duration-150 ease-out
							${isActive
								? 'bg-[var(--md-ref-color-secondary-container)] text-[var(--md-ref-color-on-secondary-container)]'
								: 'text-[var(--md-ref-color-on-surface-variant)] hover:bg-[var(--md-ref-color-surface-container-high)]'
							}
						`.trim()}
						aria-current={isActive ? 'page' : undefined}
						aria-label={item.label}
						aria-pressed={isActive}
						title={item.label}
					>
						{/* Active indicator dot */}
						{isActive && (
							<span
								className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full"
								style={{ backgroundColor: 'var(--md-ref-color-primary)' }}
								aria-hidden="true"
							/>
						)}

						<Icon
							name={item.icon}
							size={24}
							className={isActive ? 'filled' : ''}
							aria-hidden="true"
						/>

						{!collapsed && (
							<span className="text-[10px] font-medium truncate max-w-full">
								{item.label}
							</span>
						)}
					</button>
				);
			})}
		</nav>
	);
};

export default NavigationRail;
