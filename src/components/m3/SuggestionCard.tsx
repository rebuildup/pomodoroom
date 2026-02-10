/**
 * Material 3 Suggestion Card Component
 *
 * Individual task suggestion card with confidence meter,
 * reason display, and action buttons.
 *
 * @example
 * ```tsx
 * <SuggestionCard
 *   task={task}
 *   confidence={85}
 *   reasons={["Fits available time", "Matches energy"]}
 *   onStart={handleStart}
 *   onSkip={handleSkip}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";
import type { TaskStreamItem } from "@/types/taskstream";

export interface SuggestionCardProps {
	/** Task being suggested */
	task: TaskStreamItem;
	/** Confidence score (0-100) */
	confidence: number;
	/** Reasons for this suggestion */
	reasons: string[];
	/** Whether task fits available time slot */
	fitsTimeSlot: boolean;
	/** Whether task matches current energy level */
	energyMatch: boolean;
	/** Called when user accepts suggestion */
	onStart: () => void;
	/** Called when user skips this suggestion */
	onSkip: () => void;
	/** Custom className for styling */
	className?: string;
	/** Show compact variant */
	compact?: boolean;
}

/**
 * Get confidence color class based on score.
 */
function getConfidenceColor(confidence: number): string {
	if (confidence >= 80) return "text-green-400";
	if (confidence >= 60) return "text-blue-400";
	if (confidence >= 40) return "text-yellow-400";
	return "text-gray-400";
}

/**
 * Get confidence label based on score.
 */
function getConfidenceLabel(confidence: number): string {
	if (confidence >= 80) return "Great match";
	if (confidence >= 60) return "Good fit";
	if (confidence >= 40) return "Fair choice";
	return "Consider";
}

/**
 * Format duration in minutes to human-readable.
 */
function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Material 3 Suggestion Card.
 *
 * Displays a single task suggestion with visual indicators
 * for confidence, fit, and available actions.
 */
export const SuggestionCard: React.FC<SuggestionCardProps> = ({
	task,
	confidence,
	reasons,
	fitsTimeSlot,
	energyMatch,
	onStart,
	onSkip,
	className = "",
	compact = false,
}) => {
	const confidenceColor = getConfidenceColor(confidence);
	const confidenceLabel = getConfidenceLabel(confidence);

	if (compact) {
		return (
			<div
				className={`bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 hover:border-blue-500/30 transition-all duration-200 ${className}`.trim()}
			>
				<div className="flex items-center gap-3">
					{/* Task info */}
					<div className="flex-1 min-w-0">
						<h4 className="text-sm font-medium text-gray-200 truncate">{task.title}</h4>
						<div className="flex items-center gap-2 mt-1">
							<span className="text-xs text-gray-500">{formatDuration(task.estimatedMinutes)}</span>
							<span className={`text-xs ${confidenceColor}`}>{confidenceLabel}</span>
						</div>
					</div>

					{/* Actions */}
					<button
						type="button"
						onClick={onStart}
						className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
					>
						<Icon name="play_arrow" size={14} />
						Start
					</button>
					<button
						type="button"
						onClick={onSkip}
						className="p-1.5 text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 rounded-lg transition-colors"
						title="Skip"
					>
						<Icon name="skip_next" size={14} />
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`bg-gradient-to-br from-gray-800 to-gray-800/50 border ${
				fitsTimeSlot && energyMatch
					? "border-blue-500/30 shadow-lg shadow-blue-500/10"
					: "border-gray-700/50"
			} rounded-lg p-4 transition-all duration-200 ${className}`.trim()}
		>
			{/* Header with confidence */}
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-2">
					<Icon
						name="auto_awesome"
						size={16}
						className={confidence >= 70 ? "text-blue-400" : "text-gray-500"}
					/>
					<span className={`text-sm font-semibold ${confidenceColor}`}>
						{confidenceLabel}
					</span>
					<span className="text-xs text-gray-500">({confidence}%)</span>
				</div>

				{/* Confidence meter */}
				<div className="flex items-center gap-2">
					<div className="w-16 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
						<div
							className={`h-full transition-all duration-500 ${
								confidence >= 80
									? "bg-green-500"
									: confidence >= 60
										? "bg-blue-500"
										: confidence >= 40
											? "bg-yellow-500"
											: "bg-gray-500"
							}`}
							style={{ width: `${confidence}%` }}
						/>
					</div>
				</div>
			</div>

			{/* Task title */}
			<h3 className="text-base font-medium text-white mb-2">{task.title}</h3>

			{/* Reasons */}
			{reasons.length > 0 && (
				<div className="mb-3">
					<div className="flex flex-wrap gap-1.5">
						{reasons.slice(0, 2).map((reason, i) => (
							<span
								key={i}
								className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/30 rounded text-xs text-gray-400"
							>
								<Icon name="check_circle" size={12} className="text-gray-500" />
								{reason.text}
							</span>
						))}
						{reasons.length > 2 && (
							<span className="inline-flex items-center px-2 py-0.5 bg-gray-700/30 rounded text-xs text-gray-500">
								+{reasons.length - 2} more
							</span>
						)}
					</div>
				</div>
			)}

			{/* Task metadata */}
			<div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
				<span className="flex items-center gap-1">
					<Icon name="schedule" size={12} />
					{formatDuration(task.estimatedMinutes)}
					{!fitsTimeSlot && (
						<span className="text-orange-400">(exceeds available)</span>
					)}
				</span>
				{task.projectId && (
					<span className="flex items-center gap-1">
						<Icon name="folder" size={12} />
						{task.projectId}
					</span>
				)}
				{task.interruptCount > 0 && (
					<span className="flex items-center gap-1 text-orange-400">
						<Icon name="local_fire_department" size={12} />
						Interrupted {task.interruptCount}x
					</span>
				)}
			</div>

			{/* Tags */}
			{task.tags.length > 0 && (
				<div className="flex flex-wrap gap-1 mb-4">
					{task.tags.slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="px-2 py-0.5 bg-gray-700/30 rounded text-xs text-gray-400"
						>
							#{tag}
						</span>
					))}
					{task.tags.length > 3 && (
						<span className="px-2 py-0.5 bg-gray-700/30 rounded text-xs text-gray-500">
							+{task.tags.length - 3}
						</span>
					)}
				</div>
			)}

			{/* Actions */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onStart}
					className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition-colors font-medium"
				>
					<Icon name="play_arrow" size={16} />
					Start Now
				</button>
				<button
					type="button"
					onClick={onSkip}
					className="flex items-center gap-1 px-3 py-2 border border-gray-700 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors"
					title="Show next suggestion"
				>
					<Icon name="skip_next" size={16} />
				</button>
			</div>
		</div>
	);
};

export default SuggestionCard;
