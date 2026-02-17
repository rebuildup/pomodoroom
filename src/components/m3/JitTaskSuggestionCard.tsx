/**
 * JIT Task Suggestion Card Component
 *
 * Displays a single JIT (Just-In-Time) task suggestion with rank, score,
 * and reason. Shows energy match and priority information.
 *
 * @example
 * ```tsx
 * <JitTaskSuggestionCard
 *   suggestion={suggestion}
 *   rank={1}
 *   onSelect={handleSelect}
 *   compact={false}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";
import type { TaskSuggestion } from "@/types/jit";
import { getEnergyColor, getEnergyLabel } from "@/types/task";
import { getSuggestionReasonLabel, getSuggestionReasonIcon } from "@/types/jit";

export interface JitTaskSuggestionCardProps {
	/** Task suggestion to display */
	suggestion: TaskSuggestion;
	/** Rank position (1-3) for display */
	rank: number;
	/** Called when user selects this task */
	onSelect?: (taskId: string) => void;
	/** Show compact variant */
	compact?: boolean;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Get rank badge color based on position.
 */
function getRankBadgeColor(rank: number): string {
	switch (rank) {
		case 1:
			return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
		case 2:
			return "bg-gray-400/20 text-gray-300 border-gray-400/30";
		case 3:
			return "bg-orange-600/20 text-orange-400 border-orange-600/30";
		default:
			return "bg-gray-600/20 text-gray-400 border-gray-600/30";
	}
}

/**
 * Get score color class based on score value.
 */
function getScoreColor(score: number): string {
	if (score >= 80) return "text-green-400";
	if (score >= 60) return "text-blue-400";
	if (score >= 40) return "text-yellow-400";
	return "text-gray-400";
}

/**
 * Format duration for display.
 */
function formatDuration(minutes: number | null): string {
	if (!minutes) return "Flexible";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * JIT Task Suggestion Card Component.
 */
export const JitTaskSuggestionCard: React.FC<JitTaskSuggestionCardProps> = ({
	suggestion,
	rank,
	onSelect,
	compact = false,
	className = "",
}) => {
	const { task, score, reason } = suggestion;
	const scoreColor = getScoreColor(score);
	const rankColor = getRankBadgeColor(rank);
	const energyColor = getEnergyColor(task.energy);
	const reasonLabel = getSuggestionReasonLabel(reason);
	const reasonIcon = getSuggestionReasonIcon(reason);

	const handleClick = () => {
		if (onSelect) {
			onSelect(task.id);
		}
	};

	// Compact variant for inline display
	if (compact) {
		return (
			<button
				type="button"
				onClick={handleClick}
				className={`flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 hover:border-blue-500/30 hover:bg-gray-800 transition-all duration-200 text-left w-full ${className}`.trim()}
			>
				{/* Rank badge */}
				<span
					className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${rankColor}`}
				>
					{rank}
				</span>

				{/* Task info */}
				<div className="flex-1 min-w-0">
					<h4 className="text-sm font-medium text-gray-200 truncate">{task.title}</h4>
					<div className="flex items-center gap-2 mt-1">
						<span className="text-xs text-gray-500">{formatDuration(task.required_minutes)}</span>
						<span className={`text-xs ${scoreColor}`}>{score}</span>
					</div>
				</div>

				{/* Reason */}
				<span className="text-xs text-gray-400 bg-gray-700/30 px-2 py-1 rounded hidden sm:block">
					{reasonIcon} {reasonLabel}
				</span>
			</button>
		);
	}

	// Full card variant
	return (
		<div
			className={`bg-gradient-to-br from-gray-800 to-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:border-blue-500/30 transition-all duration-200 ${className}`.trim()}
		>
			{/* Header with rank and score */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-2">
					{/* Rank badge */}
					<span
						className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold border ${rankColor}`}
					>
						{rank}
					</span>

					{/* Reason with icon */}
					<span className="flex items-center gap-1.5 text-sm text-gray-400 bg-gray-700/30 px-2.5 py-1 rounded-full">
						<span>{reasonIcon}</span>
						<span>{reasonLabel}</span>
					</span>
				</div>

				{/* Score */}
				<div className="flex flex-col items-end gap-1">
					<span className={`text-lg font-bold ${scoreColor}`}>{score}</span>
					<span className="text-xs text-gray-600">score</span>
				</div>
			</div>

			{/* Task title */}
			<h3 className="text-base font-medium text-white mb-3">{task.title}</h3>

			{/* Task metadata */}
			<div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
				{/* Duration */}
				<span className="flex items-center gap-1 text-gray-500">
					<Icon name="schedule" size={14} />
					{formatDuration(task.required_minutes)}
				</span>

				{/* Energy level */}
				<span className={`flex items-center gap-1 ${energyColor}`}>
					<Icon name="bolt" size={14} />
					{getEnergyLabel(task.energy)}
				</span>

				{/* Priority */}
				<span className="flex items-center gap-1 text-gray-500">
					<Icon name="flag" size={14} />
					Priority: {task.priority}
				</span>
			</div>

			{/* Action button */}
			<button
				type="button"
				onClick={handleClick}
				className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg transition-colors font-medium"
			>
				<Icon name="play_arrow" size={18} />
				Start This Task
			</button>
		</div>
	);
};

export default JitTaskSuggestionCard;
