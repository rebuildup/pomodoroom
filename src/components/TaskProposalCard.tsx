import type { TaskProposal } from "../types";

interface TaskProposalCardProps {
	proposal: TaskProposal;
	onAccept: () => void;
	onReject: () => void;
	onSnooze?: () => void;
}

/**
 * Task proposal card for suggested tasks
 * Designed for one-click adoption (SHIG: direct manipulation)
 */
export function TaskProposalCard({
	proposal,
	onAccept,
	onReject,
	onSnooze,
}: TaskProposalCardProps) {
	const { gap, task, reason, confidence } = proposal;

	const formatDuration = (minutes: number): string => {
		if (minutes < 60) return `${minutes}m`;
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	};

	const getConfidenceColor = () => {
		if (confidence >= 80) return "text-[var(--color-accent-secondary)]";
		if (confidence >= 50) return "text-[var(--color-accent-warning)]";
		return "text-[var(--color-text-muted)]";
	};

	const getPriorityColor = (priority: number | null) => {
		if (priority === null) return "text-[var(--color-text-muted)]";
		if (priority >= 80) return "text-red-500 font-semibold";
		if (priority >= 60) return "text-orange-400";
		if (priority >= 40) return "text-yellow-400";
		return "text-[var(--color-text-muted)]";
	};

	const getSourceIcon = () => {
		switch (task.source) {
			case "notion":
				return "📝";
			case "linear":
				return "🔲";
			case "github":
				return "🐙";
			case "google":
				return "📅";
			default:
				return "📌";
		}
	};

	return (
		<div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-4 shadow-sm">
			{/* Header: Gap info */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<span className="text-[var(--color-text-muted)] text-sm">
						{formatDuration(gap.duration)} available
					</span>
					<span className="text-[var(--color-text-muted)]">·</span>
					<span className={`${getConfidenceColor()} text-sm`}>{confidence}% match</span>
				</div>
				<span className="text-lg">{getSourceIcon()}</span>
			</div>

			{/* Task title */}
			<h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
				{task.title}
			</h3>

			{/* Reason */}
			<p className="text-sm text-[var(--color-text-secondary)] mb-3">{reason}</p>

			{/* Task metadata */}
			{(task.deadline || task.priority) && (
				<div className="flex items-center gap-3 mb-4 text-xs text-[var(--color-text-muted)]">
					{task.deadline && <span>Due: {new Date(task.deadline).toLocaleDateString()}</span>}
					{task.priority !== undefined && (
						<span className={getPriorityColor(task.priority)}>Priority: {task.priority}/100</span>
					)}
				</div>
			)}

			{/* Action buttons */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onAccept}
					className="flex-1 bg-[var(--color-accent-primary)] hover:opacity-90 text-white py-2 rounded-sm transition-opacity font-medium"
				>
					Start Now
				</button>
				<button
					type="button"
					onClick={onSnooze}
					className="px-4 py-2 border border-[var(--color-border)] hover:bg-[var(--color-border)] rounded-sm transition-colors"
				>
					Later
				</button>
				<button
					type="button"
					onClick={onReject}
					className="px-3 py-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
					aria-label="Skip this suggestion"
				>
					✕
				</button>
			</div>
		</div>
	);
}

/**
 * Compact version for side panel
 */
interface TaskProposalCardCompactProps {
	proposal: TaskProposal;
	onAccept: () => void;
	onDismiss: () => void;
}

export function TaskProposalCardCompact({
	proposal,
	onAccept,
	onDismiss,
}: TaskProposalCardCompactProps) {
	const { task, confidence } = proposal;

	return (
		<div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-sm p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex-1 min-w-0">
					<h4 className="text-sm font-medium text-[var(--color-text-primary)] truncate">
						{task.title}
					</h4>
					<p className="text-xs text-[var(--color-text-muted)]">{confidence}% match</p>
				</div>
				<button
					type="button"
					onClick={onAccept}
					className="px-3 py-1 bg-[var(--color-accent-primary)] hover:opacity-90 text-white text-sm rounded-sm transition-opacity whitespace-nowrap"
				>
					Start
				</button>
				<button
					type="button"
					onClick={onDismiss}
					className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
				>
					✕
				</button>
			</div>
		</div>
	);
}
