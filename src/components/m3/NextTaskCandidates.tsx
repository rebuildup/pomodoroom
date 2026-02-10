/**
 * Material 3 Next Task Candidates Component
 *
 * AI-powered task suggestions showing 2-3 candidate tasks.
 * Each suggestion includes confidence score, reasoning, and energy matching.
 *
 * Per docs/ui-redesign-strategy.md:
 * - Show 2-3 suggestions max (never overwhelm user)
 * - Always include short reason for each suggestion
 * - Examples: "interrupted task", "same group context", "short task before fixed event"
 *
 * @example
 * ```tsx
 * <NextTaskCandidates
 *   tasks={tasks}
 *   energyLevel="medium"
 *   timeAvailable={45}
 *   onStart={handleStart}
 *   onSkip={handleSkip}
 * />
 * ```
 */

import React, { useState, useMemo } from "react";
import { Icon } from "./Icon";
import { EnergyPicker, type EnergyLevel } from "./EnergyPicker";
import { SuggestionCard } from "./SuggestionCard";
import type { TaskStreamItem } from "@/types/taskstream";

export interface TaskSuggestion {
	task: TaskStreamItem;
	confidence: number;
	reasons: string[];
	fitsTimeSlot: boolean;
	energyMatch: boolean;
}

export interface NextTaskCandidatesProps {
	/** Available tasks to suggest from */
	tasks: TaskStreamItem[];
	/** Current energy level (affects task type matching) */
	energyLevel?: EnergyLevel;
	/** Available time in minutes */
	timeAvailable?: number;
	/** Maximum number of suggestions to show (default: 3, max: 3 per docs) */
	maxSuggestions?: number;
	/** Called when user accepts a suggestion */
	onStart: (task: TaskStreamItem) => void;
	/** Called when user skips a specific suggestion */
	onSkip: (taskId: string) => void;
	/** Called when user refreshes suggestions */
	onRefresh?: () => void;
	/** Custom className for styling */
	className?: string;
	/** Show compact variant */
	compact?: boolean;
}

/**
 * Energy level preferences for task matching.
 * - Low: routine, simple, short tasks
 * - Medium: regular tasks, moderate complexity
 * - High: complex, creative, deep work tasks
 */
const ENERGY_PREFERENCES: Readonly<
	Record<EnergyLevel, { maxMinutes: number; complexityBonus: number }>
> = {
	low: { maxMinutes: 30, complexityBonus: -20 },
	medium: { maxMinutes: 60, complexityBonus: 0 },
	high: { maxMinutes: 120, complexityBonus: 20 },
} as const;

/**
 * Calculate confidence score for a task suggestion.
 */
function calculateConfidence(
	task: TaskStreamItem,
	energyLevel: EnergyLevel,
	timeAvailable: number | undefined,
): { confidence: number; reasons: string[]; fitsTimeSlot: boolean; energyMatch: boolean } {
	const preferences = ENERGY_PREFERENCES[energyLevel];
	let score = 50;
	const reasons: string[] = [];
	const fitsTimeSlot = timeAvailable === undefined || task.estimatedMinutes <= timeAvailable;
	const energyMatch = task.estimatedMinutes <= preferences.maxMinutes;

	// Time fit check
	if (fitsTimeSlot) {
		score += 20;
		reasons.push(`Fits available time`);
	} else {
		score -= 30;
		reasons.push(`Exceeds available time`);
	}

	// Energy level match
	if (energyMatch) {
		score += 15;
		reasons.push(`Matches current energy`);
	} else {
		score -= 10;
	}

	// Interrupted tasks get priority
	if (task.interruptCount > 0) {
		score += 10 * task.interruptCount;
		reasons.push(`Interrupted ${task.interruptCount}x - needs completion`);
	}

	// Tag-based preferences
	if (task.tags.includes("urgent")) {
		score += 25;
		reasons.push("Marked urgent");
	}
	if (task.tags.includes("quick") && energyLevel === "low") {
		score += 15;
		reasons.push("Quick win for low energy");
	}
	if (task.tags.includes("deep") && energyLevel === "high") {
		score += 20;
		reasons.push("Deep work matches high energy");
	}
	if (task.tags.includes("focus")) {
		score += 10;
		reasons.push("Marked as focus task");
	}

	// Penalties
	if (task.tags.includes("waiting")) {
		score -= 30;
		reasons.push("Blocked/Waiting");
	}
	if (task.tags.includes("blocked")) {
		score -= 40;
		reasons.push("Blocked");
	}

	// Normalize to 0-100
	const confidence = Math.max(0, Math.min(100, score));

	return { confidence, reasons, fitsTimeSlot, energyMatch };
}

/**
 * Generate task suggestions based on context.
 * Returns top 2-3 suggestions per docs requirements.
 */
export function generateTaskSuggestions(
	tasks: TaskStreamItem[],
	energyLevel: EnergyLevel = "medium",
	timeAvailable?: number,
	maxCount: number = 3,
): TaskSuggestion[] {
	// Filter for READY tasks only
	const readyTasks = tasks.filter((t) => t.state === "READY");

	if (readyTasks.length === 0) {
		return [];
	}

	// Calculate confidence for each task
	const scored = readyTasks.map((task) => {
		const result = calculateConfidence(task, energyLevel, timeAvailable);
		return {
			task,
			confidence: result.confidence,
			reasons: result.reasons,
			fitsTimeSlot: result.fitsTimeSlot,
			energyMatch: result.energyMatch,
		};
	});

	// Sort by confidence
	scored.sort((a, b) => b.confidence - a.confidence);

	// Filter out very low confidence and limit to maxCount
	const filtered = scored.filter((s) => s.confidence >= 30);
	return filtered.slice(0, Math.min(maxCount, 3)); // Max 3 per docs
}

/**
 * Material 3 Next Task Candidates.
 *
 * Container for AI-powered task suggestions.
 * Shows 2-3 task cards with confidence scores and reasoning.
 */
export const NextTaskCandidates: React.FC<NextTaskCandidatesProps> = ({
	tasks,
	energyLevel: initialEnergyLevel = "medium",
	timeAvailable,
	maxSuggestions = 3,
	onStart,
	onSkip,
	onRefresh,
	className = "",
	compact = false,
}) => {
	const [currentEnergy, setCurrentEnergy] = useState<EnergyLevel>(initialEnergyLevel);
	const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

	// Generate suggestions based on current state
	const suggestions = useMemo(() => {
		const available = tasks.filter((t) => !skippedIds.has(t.id));
		return generateTaskSuggestions(available, currentEnergy, timeAvailable, maxSuggestions);
	}, [tasks, currentEnergy, timeAvailable, maxSuggestions, skippedIds]);

	// Handle task start
	const handleStart = (task: TaskStreamItem) => {
		onStart(task);
		// Clear skipped IDs on successful start
		setSkippedIds(new Set());
	};

	// Handle skip
	const handleSkip = (taskId: string) => {
		setSkippedIds((prev) => new Set([...prev, taskId]));
		onSkip(taskId);
	};

	// Handle refresh
	const handleRefresh = () => {
		setSkippedIds(new Set());
		onRefresh?.();
	};

	// Empty state
	if (suggestions.length === 0) {
		return (
			<div
				className={`bg-gray-800/30 border border-gray-700/50 rounded-lg p-6 ${className}`.trim()}
			>
				<div className="flex flex-col items-center gap-3 text-center">
					<Icon name="auto_awesome" size={24} className="text-gray-600" />
					<div>
						<p className="text-sm font-medium text-gray-400">No task suggestions</p>
						<p className="text-xs text-gray-500 mt-1">
							{skippedIds.size > 0
								? "All tasks have been skipped. Try refreshing."
								: "No available tasks match your current context."}
						</p>
					</div>
					{(skippedIds.size > 0 || onRefresh) && (
						<button
							type="button"
							onClick={handleRefresh}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
						>
							<Icon name="refresh" size={14} />
							Refresh suggestions
						</button>
					)}
				</div>
			</div>
		);
	}

	// Header
	const header = !compact && (
		<div className="flex items-center justify-between mb-4">
			<div className="flex items-center gap-2">
				<Icon name="auto_awesome" size={18} className="text-blue-400" />
				<h3 className="text-base font-semibold text-gray-200">
					{suggestions.length === 1
						? "Suggested next task"
						: `Suggested next tasks (${suggestions.length})`}
				</h3>
			</div>
			<div className="flex items-center gap-3">
				<EnergyPicker value={currentEnergy} onChange={setCurrentEnergy} size="sm" />
				{onRefresh && (
					<button
						type="button"
						onClick={handleRefresh}
						className="p-1.5 text-gray-500 hover:text-gray-400 hover:bg-white/5 rounded-lg transition-colors"
						title="Refresh suggestions"
					>
						<Icon name="refresh" size={16} />
					</button>
				)}
			</div>
		</div>
	);

	return (
		<div className={className}>
			{header}
			<div className={`flex ${compact ? "flex-col" : "flex-col"} gap-3`}>
				{suggestions.map((suggestion, index) => (
					<SuggestionCard
						key={suggestion.task.id}
						task={suggestion.task}
						confidence={suggestion.confidence}
						reasons={suggestion.reasons}
						fitsTimeSlot={suggestion.fitsTimeSlot}
						energyMatch={suggestion.energyMatch}
						onStart={() => handleStart(suggestion.task)}
						onSkip={() => handleSkip(suggestion.task.id)}
						compact={compact}
					/>
				))}
			</div>
		</div>
	);
};

export default NextTaskCandidates;
