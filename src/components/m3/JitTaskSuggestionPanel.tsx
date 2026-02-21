/**
 * JIT Task Suggestion Panel Component
 *
 * Displays JIT (Just-In-Time) task suggestions from the JIT engine.
 * Shows up to 3 task suggestions with scores, reasons, and context.
 * Refreshes on demand or automatically when timer state changes.
 *
 * @example
 * ```tsx
 * <JitTaskSuggestionPanel
 *   energy={currentEnergy}
 *   timeSinceBreak={minutesSinceBreak}
 *   completedSessions={sessionCount}
 *   onTaskSelect={handleTaskSelect}
 *   compact={false}
 * />
 * ```
 */

import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { JitTaskSuggestionCard } from "./JitTaskSuggestionCard";
import type { TaskSuggestion } from "@/types/jit";

export interface JitTaskSuggestionPanelProps {
	/** Current energy level (0-100) */
	energy?: number;
	/** Time since last break in minutes */
	timeSinceBreak?: number;
	/** Number of completed sessions today */
	completedSessions?: number;
	/** Called when user selects a task */
	onTaskSelect?: (taskId: string) => void;
	/** Show compact variant */
	compact?: boolean;
	/** Auto-refresh suggestions when props change */
	autoRefresh?: boolean;
	/** Additional CSS classes */
	className?: string;
}

/**
 * Loading skeleton for suggestion panel.
 */
const LoadingSkeleton: React.FC<{ compact: boolean }> = ({ compact }) => {
	if (compact) {
		return (
			<div className="flex items-center gap-3 bg-gray-800/30 rounded-lg p-3">
				<div className="w-6 h-6 bg-gray-700/50 rounded-full animate-pulse" />
				<div className="flex-1 space-y-2">
					<div className="h-4 bg-gray-700/50 rounded w-3/4 animate-pulse" />
					<div className="h-3 bg-gray-700/30 rounded w-1/2 animate-pulse" />
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{[1, 2, 3].map((i) => (
				<div key={i} className="bg-gray-800/30 rounded-lg p-4">
					<div className="flex items-center gap-3 mb-3">
						<div className="w-7 h-7 bg-gray-700/50 rounded-full animate-pulse" />
						<div className="flex-1 h-4 bg-gray-700/50 rounded w-1/3 animate-pulse" />
						<div className="w-12 h-6 bg-gray-700/30 rounded animate-pulse" />
					</div>
					<div className="h-5 bg-gray-700/30 rounded w-3/4 mb-3 animate-pulse" />
					<div className="flex gap-2">
						<div className="h-8 bg-gray-700/20 rounded flex-1 animate-pulse" />
					</div>
				</div>
			))}
		</div>
	);
};

/**
 * Empty state when no suggestions available.
 */
const EmptyState: React.FC<{ onRefresh?: () => void }> = ({ onRefresh }) => {
	return (
		<div className="text-center py-8 px-4">
			<Icon name="lightbulb" size={32} className="text-gray-600 mx-auto mb-3" />
			<h3 className="text-sm font-medium text-gray-400 mb-1">No task suggestions</h3>
			<p className="text-xs text-gray-600 mb-4">
				Add READY tasks to your Active list to get suggestions
			</p>
			{onRefresh && (
				<button
					type="button"
					onClick={onRefresh}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
				>
					<Icon name="refresh" size={14} />
					Refresh
				</button>
			)}
		</div>
	);
};

/**
 * JIT Task Suggestion Panel Component.
 */
export const JitTaskSuggestionPanel: React.FC<JitTaskSuggestionPanelProps> = ({
	energy = 50,
	timeSinceBreak = 0,
	completedSessions = 0,
	onTaskSelect,
	compact = false,
	autoRefresh = true,
	className = "",
}) => {
	const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Fetch suggestions from JIT engine.
	 */
	const fetchSuggestions = React.useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			// Call Tauri command
			const result = await (window as any).invoke("cmd_jit_suggest_next_tasks", {
				energy,
				time_since_break: timeSinceBreak,
				completed_sessions: completedSessions,
			}) as TaskSuggestion[];

			setSuggestions(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
			console.error("Failed to fetch JIT suggestions:", err);
		}
		setLoading(false);
	}, [energy, timeSinceBreak, completedSessions]);

	// Auto-refresh when props change
	useEffect(() => {
		if (autoRefresh) {
			fetchSuggestions();
		}
	}, [fetchSuggestions, autoRefresh]);

	// Loading state
	if (loading) {
		return (
			<div className={`bg-gray-900/50 border border-gray-700/30 rounded-xl p-4 ${className}`.trim()}>
				<LoadingSkeleton compact={compact} />
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className={`bg-gray-900/50 border border-red-900/30 rounded-xl p-4 ${className}`.trim()}>
				<div className="flex items-center gap-2 text-red-400 mb-2">
					<Icon name="error" size={16} />
					<span className="text-sm font-medium">Failed to load suggestions</span>
				</div>
				<p className="text-xs text-gray-500 mb-3">{error}</p>
				<button
					type="button"
					onClick={fetchSuggestions}
					className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors"
				>
					<Icon name="refresh" size={14} />
					Retry
				</button>
			</div>
		);
	}

	// Empty state
	if (suggestions.length === 0) {
		return (
			<div className={`bg-gray-900/50 border border-gray-700/30 rounded-xl ${className}`.trim()}>
				<EmptyState onRefresh={fetchSuggestions} />
			</div>
		);
	}

	// Suggestions list
	return (
		<div className={`bg-gray-900/50 border border-gray-700/30 rounded-xl ${className}`.trim()}>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/30">
				<div className="flex items-center gap-2">
					<Icon name="auto_awesome" size={16} className="text-blue-400" />
					<h3 className="text-sm font-medium text-gray-300">
						{suggestions.length === 1 ? "Suggested task" : "Suggested tasks"}
					</h3>
				</div>

				{/* Refresh button */}
				<button
					type="button"
					onClick={fetchSuggestions}
					className="p-1.5 text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 rounded-lg transition-colors"
					title="Refresh suggestions"
				>
					<Icon name="refresh" size={14} />
				</button>
			</div>

			{/* Context info */}
			<div className="px-4 py-2 bg-gray-800/30 border-b border-gray-700/30">
				<div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
					<span className="flex items-center gap-1">
						<Icon name="bolt" size={12} />
						Energy: {energy}/100
					</span>
					<span className="flex items-center gap-1">
						<Icon name="schedule" size={12} />
						{timeSinceBreak}m since break
					</span>
					<span className="flex items-center gap-1">
						<Icon name="check_circle" size={12} />
						{completedSessions} sessions
					</span>
				</div>
			</div>

			{/* Suggestions */}
			<div className="p-4 space-y-3">
				{suggestions.map((suggestion, index) => (
					<JitTaskSuggestionCard
						key={suggestion.task.id}
						suggestion={suggestion}
						rank={index + 1}
						onSelect={onTaskSelect}
						compact={compact}
					/>
				))}
			</div>
		</div>
	);
};

export default JitTaskSuggestionPanel;
