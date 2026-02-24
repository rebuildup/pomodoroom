/**
 * useTaskSuggestions - React hook for task suggestion system.
 *
 * Provides next task suggestions with context-aware priority logic:
 * 1. Paused tasks (resume context)
 * 2. Same group as current task (continuity)
 * 3. Short tasks before fixed events (time-aware)
 *
 * Per docs/ui-redesign-strategy.md:
 * - Show 2-3 candidates max (strictly max 3)
 * - 4-second display duration (NOT user-configurable)
 * - 15-second cooldown between suggestions (NOT user-configurable)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskStreamItem } from "../types/taskstream";
import type {
	SuggestionContext,
	SuggestionPanelState,
	SuggestionPriority,
	SuggestionReason,
	TaskSuggestion,
	UseTaskSuggestionsProps,
	UseTaskSuggestionsReturn,
} from "../types/suggestions";
import { SUGGESTION_CONFIG } from "../types/suggestions";

/**
 * Energy level preferences for task matching.
 */
const ENERGY_PREFERENCES: Readonly<
	Record<"low" | "medium" | "high", { maxMinutes: number; complexityBonus: number }>
> = {
	low: { maxMinutes: 30, complexityBonus: -20 },
	medium: { maxMinutes: 60, complexityBonus: 0 },
	high: { maxMinutes: 120, complexityBonus: 20 },
} as const;

/**
 * Create a suggestion reason.
 */
function createReason(text: string, score: number): SuggestionReason {
	return { text, score };
}

/**
 * Get priority level from confidence score.
 */
function getPriorityFromConfidence(confidence: number): SuggestionPriority {
	if (confidence >= 70) return "high";
	if (confidence >= 50) return "medium";
	return "low";
}

/**
 * Calculate confidence score for a task suggestion.
 */
function calculateConfidence(
	task: TaskStreamItem,
	context: SuggestionContext,
): {
	confidence: number;
	reasons: SuggestionReason[];
	fitsTimeSlot: boolean;
	energyMatch: boolean;
} {
	const preferences = ENERGY_PREFERENCES[context.energyLevel];
	let score = 50;
	const reasons: SuggestionReason[] = [];

	const fitsTimeSlot =
		context.timeAvailable === null || task.estimatedMinutes <= context.timeAvailable;
	const energyMatch = task.estimatedMinutes <= preferences.maxMinutes;

	// Priority 1: Paused tasks (resume context) - highest bonus
	if (task.state === "PAUSED" || task.status === "interrupted") {
		const interruptBonus = 15 * Math.min(task.interruptCount, 3);
		score += interruptBonus;
		reasons.push(createReason(`Resume - interrupted ${task.interruptCount}x`, interruptBonus));
	}

	// Priority 2: Same group as current task (continuity)
	if (context.currentTask && context.currentTask.projectId === task.projectId && task.projectId) {
		score += 12;
		reasons.push(createReason("Continues current project", 12));
	}

	// Priority 3: Short tasks before fixed events (time-aware)
	const nextEvent = context.upcomingEvents[0];
	if (nextEvent) {
		const eventTime = new Date(nextEvent.startTime).getTime();
		const now = Date.now();
		const timeUntilEvent = (eventTime - now) / 60000; // minutes

		if (timeUntilEvent > 0 && timeUntilEvent < 120 && task.estimatedMinutes <= timeUntilEvent) {
			score += 15;
			reasons.push(createReason(`Fits before ${nextEvent.title}`, 15));
		}
	}

	// Time fit check
	if (fitsTimeSlot) {
		score += 15;
		if (context.timeAvailable !== null) {
			reasons.push(createReason(`Fits ${context.timeAvailable}m slot`, 15));
		}
	} else {
		score -= 25;
		reasons.push(createReason("Exceeds available time", -25));
	}

	// Energy level match
	if (energyMatch) {
		score += 10;
		reasons.push(createReason("Matches your energy", 10));
	} else {
		score -= 10;
	}

	// Tag-based bonuses
	if (task.tags.includes("urgent")) {
		score += 20;
		reasons.push(createReason("Marked urgent", 20));
	}
	if (task.tags.includes("quick")) {
		score += 10;
		reasons.push(createReason("Quick task", 10));
	}
	if (task.tags.includes("quickwin")) {
		score += 12;
		reasons.push(createReason("Quick win", 12));
	}
	if (task.tags.includes("deep") && context.energyLevel === "high") {
		score += 15;
		reasons.push(createReason("Deep work matches high energy", 15));
	}
	if (task.tags.includes("focus")) {
		score += 8;
		reasons.push(createReason("Marked as focus", 8));
	}

	// Penalties
	if (task.tags.includes("waiting")) {
		score -= 25;
		reasons.push(createReason("Blocked/Waiting", -25));
	}
	if (task.tags.includes("blocked")) {
		score -= 35;
		reasons.push(createReason("Blocked", -35));
	}

	// Normalize to 0-100
	const confidence = Math.max(0, Math.min(100, score));

	return { confidence, reasons, fitsTimeSlot, energyMatch };
}

/**
 * Generate task suggestions based on context.
 */
function generateSuggestions(
	tasks: readonly TaskStreamItem[],
	context: SuggestionContext,
	dismissedIds: Set<string>,
): TaskSuggestion[] {
	// Filter for READY or PAUSED tasks, excluding dismissed
	const availableTasks = tasks.filter(
		(t) => (t.state === "READY" || t.state === "PAUSED") && !dismissedIds.has(t.id),
	);

	if (availableTasks.length === 0) {
		return [];
	}

	// Calculate confidence for each task
	const scored: TaskSuggestion[] = availableTasks.map((task) => {
		const result = calculateConfidence(task, context);
		return {
			task,
			confidence: result.confidence,
			reasons: result.reasons.slice(0, 3), // Max 3 reasons
			priority: getPriorityFromConfidence(result.confidence),
			fitsTimeSlot: result.fitsTimeSlot,
			energyMatch: result.energyMatch,
		};
	});

	// Sort by confidence (high to low)
	scored.sort((a, b) => b.confidence - a.confidence);

	// Filter by minimum confidence and limit to max
	const qualified = scored.filter((s) => s.confidence >= SUGGESTION_CONFIG.MIN_CONFIDENCE);
	return qualified.slice(0, SUGGESTION_CONFIG.MAX_SUGGESTIONS);
}

/**
 * React hook for task suggestion system.
 *
 * @example
 * ```tsx
 * const { state, approve, dismiss, canShow } = useTaskSuggestions({
 *   tasks,
 *   currentTask,
 *   energyLevel: "medium",
 *   timeAvailable: 45,
 *   autoShow: true,
 * });
 * ```
 */
export function useTaskSuggestions({
	tasks,
	currentTask,
	energyLevel = "medium",
	timeAvailable = null,
	upcomingEvents = [],
	autoShow = false,
}: UseTaskSuggestionsProps): UseTaskSuggestionsReturn {
	const [state, setState] = useState<SuggestionPanelState>({
		visible: false,
		suggestions: [],
		shownAt: null,
		dismissedAt: null,
		dismissedIds: new Set(),
	});

	const displayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear display timeout on unmount
	useEffect(() => {
		return () => {
			if (displayTimeoutRef.current) {
				clearTimeout(displayTimeoutRef.current);
			}
			if (cooldownTimeoutRef.current) {
				clearTimeout(cooldownTimeoutRef.current);
			}
		};
	}, []);

	// Generate suggestions from current context
	const generateFromContext = useCallback((): TaskSuggestion[] => {
		const context: SuggestionContext = {
			currentTask,
			energyLevel,
			timeAvailable,
			upcomingEvents,
		};
		return generateSuggestions(tasks, context, state.dismissedIds);
	}, [tasks, currentTask, energyLevel, timeAvailable, upcomingEvents, state.dismissedIds]);

	// Check if suggestions can be shown (cooldown)
	const canShow = useCallback((): boolean => {
		const now = Date.now();

		// Check if currently visible
		if (state.visible) return false;

		// Check cooldown
		if (state.dismissedAt !== null) {
			const timeSinceDismiss = now - state.dismissedAt;
			if (timeSinceDismiss < SUGGESTION_CONFIG.COOLDOWN_DURATION) {
				return false;
			}
		}

		// Check if we have suggestions to show
		const suggestions = generateFromContext();
		return suggestions.length >= SUGGESTION_CONFIG.MIN_SUGGESTIONS;
	}, [state.visible, state.dismissedAt, generateFromContext]);

	// Show suggestions
	const show = useCallback(() => {
		if (!canShow()) return;

		const suggestions = generateFromContext();
		if (suggestions.length < SUGGESTION_CONFIG.MIN_SUGGESTIONS) return;

		setState((prev) => ({
			...prev,
			visible: true,
			suggestions,
			shownAt: Date.now(),
		}));

		// Auto-hide after display duration
		if (displayTimeoutRef.current) {
			clearTimeout(displayTimeoutRef.current);
		}
		displayTimeoutRef.current = setTimeout(() => {
			setState((prev) => ({
				...prev,
				visible: false,
				shownAt: null,
			}));
		}, SUGGESTION_CONFIG.DISPLAY_DURATION);
	}, [canShow, generateFromContext]);

	// Hide suggestions
	const hide = useCallback(() => {
		if (displayTimeoutRef.current) {
			clearTimeout(displayTimeoutRef.current);
		}
		setState((prev) => ({
			...prev,
			visible: false,
			shownAt: null,
		}));
	}, []);

	// Dismiss a specific suggestion
	const dismiss = useCallback((taskId: string) => {
		setState((prev) => {
			const newDismissedIds = new Set(prev.dismissedIds);
			newDismissedIds.add(taskId);

			return {
				...prev,
				visible: false,
				shownAt: null,
				dismissedAt: Date.now(),
				dismissedIds: newDismissedIds,
			};
		});

		// Clear display timeout
		if (displayTimeoutRef.current) {
			clearTimeout(displayTimeoutRef.current);
		}
	}, []);

	// Approve and start a task
	const approve = useCallback((_task: TaskStreamItem) => {
		// Clear dismissed IDs on successful approve
		setState((prev) => ({
			...prev,
			visible: false,
			shownAt: null,
			dismissedIds: new Set(),
		}));

		// Clear display timeout
		if (displayTimeoutRef.current) {
			clearTimeout(displayTimeoutRef.current);
		}
	}, []);

	// Reset dismissed tasks
	const resetDismissed = useCallback(() => {
		setState((prev) => ({
			...prev,
			dismissedIds: new Set(),
			dismissedAt: null,
		}));
	}, []);

	// Auto-show when context changes (if enabled)
	useEffect(() => {
		if (autoShow && canShow()) {
			show();
		}
	}, [autoShow, canShow, show]);

	return {
		state,
		show,
		hide,
		dismiss,
		approve,
		resetDismissed,
		canShow,
	};
}

export default useTaskSuggestions;
