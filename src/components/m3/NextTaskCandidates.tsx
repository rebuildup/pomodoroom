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
import type { TaskSuggestion, SuggestionReason } from "@/types/suggestions";

export interface NextTaskCandidatesProps {
	/** Available tasks to suggest from (READY + PAUSED for Ambient resume) */
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
	/** Additional context for scoring (Phase1-3) */
	context?: {
		/** Recently completed task groups for context continuity bonus */
		recentlyCompletedGroups?: readonly string[];
		/** Current anchor task for group comparison */
		currentAnchorGroup?: string | null;
	};
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
 * Enhanced scoring per issues_v2.json Phase1-3 requirements.
 */
function calculateConfidence(
	task: TaskStreamItem,
	energyLevel: EnergyLevel,
	timeAvailable: number | undefined,
	context?: {
		/** Recently completed task groups for context continuity bonus */
		recentlyCompletedGroups?: readonly string[];
		/** Current anchor task for group comparison */
		currentAnchorGroup?: string | null;
	},
): { confidence: number; reasons: SuggestionReason[]; fitsTimeSlot: boolean; energyMatch: boolean } {
	const preferences = ENERGY_PREFERENCES[energyLevel];
	let score = 50;
	const reasons: SuggestionReason[] = [];
	const fitsTimeSlot = timeAvailable === undefined || task.estimatedMinutes <= timeAvailable;
	const energyMatch = task.estimatedMinutes <= preferences.maxMinutes;

	// 1. Interrupted tasks get priority (Ambient resume)
	if (task.interruptCount > 0) {
		const interruptBonus = 15 * task.interruptCount;
		score += interruptBonus;
		reasons.push({ text: `中断中のタスク（${task.interruptCount}回）`, score: interruptBonus });
	}

	// 2. Same group as current task (context continuity)
	if (context?.currentAnchorGroup && task.projectId === context.currentAnchorGroup) {
		score += 20;
		reasons.push({ text: "同じプロジェクトの文脈継続", score: 20 });
	}

	// 3. Recently completed group bonus
	if (context?.recentlyCompletedGroups && context.recentlyCompletedGroups.length > 0) {
		for (const group of context.recentlyCompletedGroups) {
			if (task.projectId === group) {
				score += 10;
				reasons.push({ text: "直近完了したプロジェクト", score: 10 });
				break;
			}
		}
	}

	// Time fit check
	if (fitsTimeSlot) {
		score += 15;
		reasons.push({ text: "時間内に完了可能", score: 15 });
	} else {
		score -= 20;
		reasons.push({ text: "時間超過", score: -20 });
	}

	// Energy level match
	if (energyMatch) {
		score += 10;
		reasons.push({ text: "エネルギーレベル一致", score: 10 });
	} else {
		score -= 5;
	}

	// 4. Urgent tags (緊急度タグ)
	if (task.tags.includes("urgent")) {
		score += 25;
		reasons.push({ text: "緊急タスク", score: 25 });
	}
	if (task.tags.includes("timebox")) {
		score += 15;
		reasons.push({ text: "タイムボックス", score: 15 });
	}

	// 5. Energy-based tag matching
	if (task.tags.includes("quick") && energyLevel === "low") {
		score += 20;
		reasons.push({ text: "低エネルギー向け短時間タスク", score: 20 });
	}
	if (task.tags.includes("deep") && energyLevel === "high") {
		score += 25;
		reasons.push({ text: "高エネルギー向け深い作業", score: 25 });
	}
	if (task.tags.includes("focus")) {
		score += 15;
		reasons.push({ text: "フォーカスタスク", score: 15 });
	}

	// 6. Priority value (deferred tasks have lower priority)
	// Higher priority = better (0 is neutral, negative is deferred)
	if (task.tags.includes("deferred") || (task as any).priority < 0) {
		score -= 30;
		reasons.push({ text: "先送り済み", score: -30 });
	}

	// Penalty for longer tasks (shorter tasks preferred)
	const shortTaskBonus = Math.max(0, 10 - Math.floor(task.estimatedMinutes / 10));
	if (shortTaskBonus > 0) {
		score += shortTaskBonus;
	}

	// Penalties
	if (task.tags.includes("waiting")) {
		score -= 30;
		reasons.push({ text: "待機中", score: -30 });
	}
	if (task.tags.includes("blocked")) {
		score -= 40;
		reasons.push({ text: "ブロック中", score: -40 });
	}

	// Normalize to 0-100
	const confidence = Math.max(0, Math.min(100, score));

	return { confidence, reasons, fitsTimeSlot, energyMatch };
}

/**
 * Generate task suggestions based on context.
 * Returns top 2-3 suggestions per docs requirements.
 *
 * @param tasks - Available tasks to suggest from
 * @param energyLevel - Current energy level for matching
 * @param timeAvailable - Available time in minutes
 * @param maxCount - Maximum number of suggestions (default: 3, max: 3)
 * @param context - Additional context for scoring (recent groups, current anchor)
 */
export function generateTaskSuggestions(
	tasks: TaskStreamItem[],
	energyLevel: EnergyLevel = "medium",
	timeAvailable?: number,
	maxCount: number = 3,
	context?: {
		/** Recently completed task groups for context continuity bonus */
		recentlyCompletedGroups?: readonly string[];
		/** Current anchor task for group comparison */
		currentAnchorGroup?: string | null;
	},
): TaskSuggestion[] {
	// Filter for READY tasks + PAUSED tasks (Ambient resume per Phase1-3)
	const candidateTasks = tasks.filter((t) => t.state === "READY" || t.state === "PAUSED");

	if (candidateTasks.length === 0) {
		return [];
	}

	// Mark PAUSED tasks as interrupted for scoring bonus
	const tasksWithInterruptBonus = candidateTasks.map((task) => ({
		...task,
		interruptCount: task.state === "PAUSED" ? (task.interruptCount || 0) + 1 : task.interruptCount || 0,
	}));

	// Calculate confidence for each task
	const scored: TaskSuggestion[] = tasksWithInterruptBonus.map((task) => {
		const result = calculateConfidence(task, energyLevel, timeAvailable, context);
		const priority: "high" | "medium" | "low" =
			result.confidence >= 70 ? "high" : result.confidence >= 50 ? "medium" : "low";
		return {
			task,
			confidence: result.confidence,
			reasons: result.reasons,
			priority,
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
	context,
}) => {
	const [currentEnergy, setCurrentEnergy] = useState<EnergyLevel>(initialEnergyLevel);
	const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

	// Generate suggestions based on current state
	const suggestions = useMemo(() => {
		const available = tasks.filter((t) => !skippedIds.has(t.id));
		return generateTaskSuggestions(available, currentEnergy, timeAvailable, maxSuggestions, context);
	}, [tasks, currentEnergy, timeAvailable, maxSuggestions, skippedIds, context]);

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
