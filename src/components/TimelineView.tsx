import type { TimelineItem } from '../types';

interface TimelineViewProps {
	items: TimelineItem[];
	currentTime: Date;
	date?: Date;
	onItemClick?: (item: TimelineItem) => void;
}

/**
 * Timeline view component displaying items chronologically
 * Flat design with clear visual hierarchy (SHIG principle)
 */
export function TimelineView({ items, currentTime, date = new Date(), onItemClick }: TimelineViewProps) {
	// Generate hours for the day
	const hours: Date[] = [];
	for (let i = 0; i < 24; i++) {
		const hour = new Date(date);
		hour.setHours(i, 0, 0, 0);
		hours.push(hour);
	}

	// Group items by hour
	const itemsByHour = new Map<number, TimelineItem[]>();
	hours.forEach(hour => itemsByHour.set(hour.getHours(), []));

	items.forEach(item => {
		const itemHour = new Date(item.startTime).getHours();
		const hourItems = itemsByHour.get(itemHour) ?? [];
		hourItems.push(item);
		itemsByHour.set(itemHour, hourItems);
	});

	// Format time as HH:mm
	const formatTime = (hour: number): string => {
		return `${hour.toString().padStart(2, '0')}:00`;
	};

	const isSameHour = (a: Date, b: Date): boolean => {
		return a.getHours() === b.getHours() &&
			a.getDate() === b.getDate() &&
			a.getMonth() === b.getMonth() &&
			a.getFullYear() === b.getFullYear();
	};

	return (
		<div className="h-full overflow-y-auto">
			<div className="flex">
				{/* Time labels column */}
				<div className="w-16 flex-shrink-0 border-r border-[var(--color-border)]">
					{hours.map(hour => (
						<div
							key={hour.getHours()}
							className="h-16 px-2 text-xs text-[var(--color-text-muted)] tabular-nums"
						>
							{formatTime(hour.getHours())}
						</div>
					))}
				</div>

				{/* Timeline content */}
				<div className="flex-1 min-w-0">
					{hours.map(hour => {
						const hourNum = hour.getHours();
						const hourItems = itemsByHour.get(hourNum) ?? [];
						const isCurrent = isSameHour(hour, currentTime);

						return (
							<div
								key={hourNum}
								className={`h-16 border-b border-[var(--color-border)] relative ${
									isCurrent ? 'bg-[var(--color-accent-primary)]/5' : ''
								}`}
							>
								{/* Current time indicator */}
								{isCurrent && (
									<div className="absolute left-0 right-0 top-0 h-px bg-[var(--color-accent-primary)] z-10" />
								)}

								{/* Items for this hour */}
								<div className="px-3 py-1 space-y-1">
									{hourItems.map(item => (
										<TimelineItemCard
											key={item.id}
											item={item}
											onClick={() => onItemClick?.(item)}
										/>
									))}

									{/* Empty slot indicator */}
									{hourItems.length === 0 && !isCurrent && (
										<div className="h-6 rounded-sm border border-dashed border-[var(--color-border)] flex items-center justify-center text-xs text-[var(--color-text-muted)]">
											Available
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

interface TimelineItemCardProps {
	item: TimelineItem;
	onClick?: () => void;
}

function TimelineItemCard({ item, onClick }: TimelineItemCardProps) {
	const getBorderColor = () => {
		if (item.completed) return 'border-[var(--color-status-active)]';
		if (item.source === 'google') return 'border-[var(--color-accent-primary)]';
		if (item.source === 'notion') return 'border-[var(--color-accent-secondary)]';
		if (item.source === 'linear') return 'border-purple-400';
		return 'border-[var(--color-border)]';
	};

	const getBgColor = () => {
		if (item.completed) return 'bg-[var(--color-status-active)]/10';
		return 'bg-[var(--color-surface)]';
	};

	return (
		<button
			onClick={onClick}
			className={`${getBgColor()} ${getBorderColor()} border rounded-sm px-3 py-1.5 text-left hover:opacity-80 transition-opacity w-full text-sm`}
		>
			<div className="flex items-center gap-2">
				<span className="font-medium text-[var(--color-text-primary)] truncate">
					{item.title}
				</span>
				{item.completed && (
					<span className="text-[var(--color-status-active)]">✓</span>
				)}
				{item.priority && item.priority > 70 && (
					<span className="text-[var(--color-accent-danger)] text-xs">!</span>
				)}
			</div>
			{item.description && (
				<div className="text-xs text-[var(--color-text-secondary)] truncate">
					{item.description}
				</div>
			)}
		</button>
	);
}
