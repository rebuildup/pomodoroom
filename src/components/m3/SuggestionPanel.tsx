/**
 * Material 3 Suggestion Panel Component
 *
 * Displays task suggestions with smooth enter/exit transitions.
 * Fixed 4-second display duration with Material 3 motion animations.
 *
 * Per docs/ui-redesign-strategy.md section 6:
 * - Show 2-3 candidates max (strictly max 3)
 * - Each with short "why" reason
 * - Auto-approve on click
 * - Ignore/dismiss option
 *
 * @example
 * ```tsx
 * <SuggestionPanel
 *   state={suggestionState}
 *   onApprove={handleApprove}
 *   onDismiss={handleDismiss}
 *   onExpire={handleExpire}
 * />
 * ```
 */

import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { SuggestionPanelState, TaskSuggestion } from "@/types/suggestions";
import { SUGGESTION_CONFIG } from "@/types/suggestions";
import type { TaskStreamItem } from "@/types/taskstream";

export interface SuggestionPanelProps {
	/** Current suggestion state */
	state: SuggestionPanelState;
	/** Called when user accepts a suggestion */
	onApprove: (task: TaskStreamItem) => void;
	/** Called when user dismisses a suggestion */
	onDismiss: (taskId: string) => void;
	/** Called when display duration expires */
	onExpire: () => void;
	/** Custom className for styling */
	className?: string;
	/** Show compact variant */
	compact?: boolean;
}

/**
 * Material 3 easing for motion.
 * Uses standard-emphasized easing for natural feel.
 */
const M3_EASING = "cubic-bezier(0.2, 0.0, 0.0, 1.0)";

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
 * Get confidence color class based on score.
 */
function getConfidenceColor(confidence: number): string {
	if (confidence >= 70) return "text-green-400";
	if (confidence >= 50) return "text-blue-400";
	return "text-yellow-400";
}

/**
 * Suggestion card for individual task.
 */
interface SuggestionCardProps {
	suggestion: TaskSuggestion;
	onApprove: () => void;
	onDismiss: () => void;
	compact: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onApprove, onDismiss, compact }) => {
	const { task, confidence, reasons } = suggestion;
	const confidenceColor = getConfidenceColor(confidence);

	if (compact) {
		return (
			<div className="flex items-center gap-3 bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 hover:border-blue-500/30 transition-all duration-200">
				{/* Task info */}
				<div className="flex-1 min-w-0">
					<h4 className="text-sm font-medium text-gray-200 truncate">{task.title}</h4>
					<div className="flex items-center gap-2 mt-1">
						<span className="text-xs text-gray-500">{formatDuration(task.estimatedMinutes)}</span>
						<span className={`text-xs ${confidenceColor}`}>{confidence}%</span>
					</div>
				</div>

				{/* Primary reason */}
				{reasons.length > 0 && (
					<span className="text-xs text-gray-400 bg-gray-700/30 px-2 py-1 rounded hidden sm:block">
						{reasons[0].text}
					</span>
				)}

				{/* Actions */}
				<button
					type="button"
					onClick={onApprove}
					className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
				>
					<Icon name="play_arrow" size={14} />
					Start
				</button>
				<button
					type="button"
					onClick={onDismiss}
					className="p-1.5 text-gray-500 hover:text-gray-400 hover:bg-gray-700/50 rounded-lg transition-colors"
					title="Dismiss"
				>
					<Icon name="close" size={14} />
				</button>
			</div>
		);
	}

	return (
		<div
			className={`bg-gradient-to-br from-gray-800 to-gray-800/50 border ${
				suggestion.fitsTimeSlot && suggestion.energyMatch
					? "border-blue-500/30 shadow-lg shadow-blue-500/10"
					: "border-gray-700/50"
			} rounded-lg p-4 transition-all duration-200`}
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
						{confidence}% match
					</span>
				</div>

				{/* Confidence meter */}
				<div className="flex items-center gap-2">
					<div className="w-16 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
						<div
							className={`h-full transition-all duration-500 ${
								confidence >= 70
									? "bg-green-500"
									: confidence >= 50
										? "bg-blue-500"
										: "bg-yellow-500"
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
						{reasons.map((reason, i) => (
							<span
								key={i}
								className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/30 rounded text-xs text-gray-400"
							>
								<Icon name="check_circle" size={12} className="text-gray-500" />
								{reason.text}
							</span>
						))}
					</div>
				</div>
			)}

			{/* Task metadata */}
			<div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
				<span className="flex items-center gap-1">
					<Icon name="schedule" size={12} />
					{formatDuration(task.estimatedMinutes)}
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

			{/* Actions */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onApprove}
					className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition-colors font-medium"
				>
					<Icon name="play_arrow" size={16} />
					Start Now
				</button>
				<button
					type="button"
					onClick={onDismiss}
					className="flex items-center gap-1 px-3 py-2 border border-gray-700 hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 rounded-lg transition-colors"
					title="Dismiss suggestion"
				>
					<Icon name="close" size={16} />
				</button>
			</div>
		</div>
	);
};

/**
 * Material 3 Suggestion Panel.
 *
 * Container for task suggestions with smooth enter/exit animations.
 * Auto-dismisses after fixed duration per strategy document.
 */
export const SuggestionPanel: React.FC<SuggestionPanelProps> = ({
	state,
	onApprove,
	onDismiss,
	onExpire,
	className = "",
	compact = false,
}) => {
	const [isAnimating, setIsAnimating] = useState(false);
	const [animationState, setAnimationState] = useState<"entering" | "visible" | "exiting" | "hidden">(
		"hidden",
	);

	// Handle enter animation
	useEffect(() => {
		if (state.visible && animationState === "hidden") {
			setAnimationState("entering");
			setIsAnimating(true);

			// Switch to visible after enter animation completes
			const enterTimer = setTimeout(() => {
				setAnimationState("visible");
				setIsAnimating(false);
			}, 300); // 300ms enter duration

			return () => clearTimeout(enterTimer);
		}
	}, [state.visible, animationState]);

	// Handle auto-expire after display duration
	useEffect(() => {
		if (state.visible && state.shownAt && animationState === "visible") {
			const remainingTime = SUGGESTION_CONFIG.DISPLAY_DURATION - (Date.now() - state.shownAt);

			if (remainingTime > 0) {
				const expireTimer = setTimeout(() => {
					setAnimationState("exiting");
					setIsAnimating(true);

					// Fully hide after exit animation
					setTimeout(() => {
						setAnimationState("hidden");
						setIsAnimating(false);
						onExpire();
					}, 250); // 250ms exit duration
				}, remainingTime);

				return () => clearTimeout(expireTimer);
			}
		}
	}, [state.visible, state.shownAt, animationState, onExpire]);

	// Handle manual hide
	useEffect(() => {
		if (!state.visible && animationState === "visible") {
			setAnimationState("exiting");
			setIsAnimating(true);

			const exitTimer = setTimeout(() => {
				setAnimationState("hidden");
				setIsAnimating(false);
			}, 250);

			return () => clearTimeout(exitTimer);
		}
	}, [state.visible, animationState]);

	// Don't render if hidden and not animating
	if (animationState === "hidden" && !state.visible) {
		return null;
	}

	// Animation styles based on state
	const getAnimationStyle = (): React.CSSProperties => {
		const baseStyle: React.CSSProperties = {
			transitionTimingFunction: M3_EASING,
		};

		switch (animationState) {
			case "entering":
				return {
					...baseStyle,
					opacity: 1,
					transform: "translateY(0)",
					transitionProperty: "opacity, transform",
					transitionDuration: "300ms",
				};
			case "exiting":
				return {
					...baseStyle,
					opacity: 0,
					transform: "translateY(-8px)",
					transitionProperty: "opacity, transform",
					transitionDuration: "250ms",
				};
			case "visible":
				return {
					opacity: 1,
					transform: "translateY(0)",
				};
			default:
				return {
					opacity: 0,
					transform: "translateY(8px)",
				};
		}
	};

	// Empty state
	if (state.suggestions.length === 0) {
		return null;
	}

	return (
		<div
			className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 ${className}`.trim()}
			style={getAnimationStyle()}
		>
			<div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
					<div className="flex items-center gap-2">
						<Icon name="auto_awesome" size={18} className="text-blue-400" />
						<h3 className="text-base font-semibold text-gray-200">
							{state.suggestions.length === 1 ? "Suggested task" : "Suggested tasks"}
						</h3>
					</div>
					<button
						type="button"
						onClick={() => {
							setAnimationState("exiting");
							setIsAnimating(true);
							setTimeout(() => {
								setAnimationState("hidden");
								setIsAnimating(false);
								onExpire();
							}, 250);
						}}
						className="p-1 text-gray-500 hover:text-gray-400 hover:bg-white/5 rounded-lg transition-colors"
						title="Dismiss all"
					>
						<Icon name="close" size={18} />
					</button>
				</div>

				{/* Suggestions */}
				<div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
					{state.suggestions.map((suggestion) => (
						<SuggestionCard
							key={suggestion.task.id}
							suggestion={suggestion}
							onApprove={() => onApprove(suggestion.task)}
							onDismiss={() => onDismiss(suggestion.task.id)}
							compact={compact}
						/>
					))}
				</div>

				{/* Footer with countdown indicator */}
				{state.shownAt && animationState === "visible" && (
					<div className="px-4 py-2 bg-gray-800/50 border-t border-gray-700/50">
						<div className="flex items-center justify-between text-xs text-gray-500">
							<span>Auto-dismiss in</span>
							<span className="font-mono">
								{Math.max(0, Math.ceil((SUGGESTION_CONFIG.DISPLAY_DURATION - (Date.now() - state.shownAt)) / 1000))}s
							</span>
						</div>
						<div className="mt-1.5 h-1 bg-gray-700/50 rounded-full overflow-hidden">
							<div
								className="h-full bg-blue-500 transition-all duration-100 ease-linear"
								style={{
									width: `${
										((SUGGESTION_CONFIG.DISPLAY_DURATION - (Date.now() - state.shownAt)) /
											SUGGESTION_CONFIG.DISPLAY_DURATION) *
										100
									}%`,
								}}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default SuggestionPanel;
