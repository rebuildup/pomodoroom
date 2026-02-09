import { useState, useEffect } from 'react';
import { TimelineView } from '../components/TimelineView';
import { TaskProposalCard } from '../components/TaskProposalCard';
import { ThemeToggle } from '../components/ThemeProvider';
import type { TimelineItem, TaskProposal } from '../types';

/**
 * Main view combining timer and timeline
 * Flat design with clear sections (SHIG principle)
 */
export default function MainView() {
	const [currentTime, setCurrentTime] = useState(new Date());
	const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
	const [proposal, setProposal] = useState<TaskProposal | null>(null);
	const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);

	// Update current time every minute
	useEffect(() => {
		const interval = setInterval(() => setCurrentTime(new Date()), 60000);
		return () => clearInterval(interval);
	}, []);

	// TODO: Load timeline items from Tauri bridge
	useEffect(() => {
		// Mock data for now
		const mockItems: TimelineItem[] = [
			{
				id: '1',
				type: 'event',
				source: 'google',
				title: 'Team Standup',
				description: 'Daily sync with the team',
				startTime: new Date().toISOString(),
				endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
			},
			{
				id: '2',
				type: 'task',
				source: 'notion',
				title: 'Review PR #42',
				description: 'Authentication refactor',
				startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
				endTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
				priority: 80,
			},
		];
		setTimelineItems(mockItems);
	}, []);

	const handleItemSelect = (item: TimelineItem) => {
		setSelectedItem(item);
	};

	const handleProposalAccept = () => {
		if (proposal) {
			console.log('Accepted task:', proposal.task.title);
			setProposal(null);
		}
	};

	const handleProposalReject = () => {
		setProposal(null);
	};

	const handleProposalSnooze = () => {
		// TODO: Snooze for later
		setProposal(null);
	};

	return (
		<div className="h-full flex flex-col bg-[var(--color-bg)]">
			{/* Header */}
			<header className="drag-region flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
				<div className="flex items-center gap-3">
					<h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
						Pomodoroom
					</h1>
					<span className="text-xs text-[var(--color-text-muted)]">
						{currentTime.toLocaleDateString()}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<ThemeToggle />
				</div>
			</header>

			{/* Main content */}
			<div className="flex-1 flex overflow-hidden">
				{/* Timeline - main area */}
				<div className="flex-1 border-r border-[var(--color-border)]">
					<TimelineView
						items={timelineItems}
						currentTime={currentTime}
						onItemClick={handleItemSelect}
					/>
				</div>

				{/* Sidebar - task proposals */}
				<aside className="w-80 flex flex-col bg-[var(--color-surface)]">
					<div className="p-4 border-b border-[var(--color-border)]">
						<h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
							Suggestions
						</h2>
						<p className="text-xs text-[var(--color-text-muted)] mt-1">
							Based on your calendar and priorities
						</p>
					</div>

					<div className="flex-1 overflow-y-auto p-4">
						{proposal ? (
							<TaskProposalCard
								proposal={proposal}
								onAccept={handleProposalAccept}
								onReject={handleProposalReject}
								onSnooze={handleProposalSnooze}
							/>
						) : (
							<div className="text-sm text-[var(--color-text-muted)] text-center py-8">
								No current suggestions
							</div>
						)}
					</div>

					{/* Selected item details */}
					{selectedItem && (
						<div className="p-4 border-t border-[var(--color-border)]">
							<h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">
								Selected
							</h3>
							<div className="text-sm">
								<div className="font-medium">{selectedItem.title}</div>
								{selectedItem.description && (
									<div className="text-[var(--color-text-secondary)] mt-1">
										{selectedItem.description}
									</div>
								)}
							</div>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}
