/**
 * Suggestion system types for Pomodoroom.
 *
 * Provides next task suggestions with context-aware priority logic.
 *
 * Per docs/ui-redesign-strategy.md section 6:
 * - Show 2-3 candidates max (strictly max 3)
 * - Each with short "why" reason
 * - 4-second display duration
 * - 15-second cooldown between suggestions
 * - Auto-approve on click
 * - Ignore/dismiss option
 *
 * Priority logic:
 * 1. Paused tasks (resume context)
 * 2. Same group as current task (continuity)
 * 3. Short tasks before fixed events (time-aware)
 */

import type { TaskStreamItem } from "./taskstream";

/**
 * Suggestion priority levels for sorting.
 */
export type SuggestionPriority = "high" | "medium" | "low";

/**
 * Suggestion reason type with localized messages.
 */
export interface SuggestionReason {
	/** Short reason text (max ~30 chars) */
	text: string;
	/** Priority contribution score */
	score: number;
}

/**
 * Task suggestion with metadata.
 */
export interface TaskSuggestion {
	/** Task being suggested */
	task: TaskStreamItem;
	/** Calculated confidence score (0-100) */
	confidence: number;
	/** Reasons why this task is suggested (max 3) */
	reasons: SuggestionReason[];
	/** Priority level */
	priority: SuggestionPriority;
	/** Whether task fits available time slot */
	fitsTimeSlot: boolean;
	/** Whether task matches current energy level */
	energyMatch: boolean;
}

/**
 * Suggestion panel state.
 */
export interface SuggestionPanelState {
	/** Whether panel is visible */
	visible: boolean;
	/** Current suggestions being displayed */
	suggestions: TaskSuggestion[];
	/** Timestamp when suggestions were shown */
	shownAt: number | null;
	/** Timestamp when last suggestion was dismissed */
	dismissedAt: number | null;
	/** Task IDs that have been dismissed */
	dismissedIds: Set<string>;
}

/**
 * Suggestion display configuration (fixed values per strategy doc).
 */
export const SUGGESTION_CONFIG = {
	/** Maximum number of suggestions to show (strict) */
	MAX_SUGGESTIONS: 3,
	/** Minimum number of suggestions to show */
	MIN_SUGGESTIONS: 2,
	/** Display duration in milliseconds (NOT user-configurable) */
	DISPLAY_DURATION: 4000,
	/** Cooldown between suggestions in milliseconds (NOT user-configurable) */
	COOLDOWN_DURATION: 15000,
	/** Minimum confidence score to show a suggestion */
	MIN_CONFIDENCE: 30,
} as const;

/**
 * Suggestion context for generating recommendations.
 */
export interface SuggestionContext {
	/** Current task (if any) */
	currentTask: TaskStreamItem | null;
	/** Current energy level */
	energyLevel: "low" | "medium" | "high";
	/** Available time in minutes */
	timeAvailable: number | null;
	/** Upcoming fixed events (for time-aware suggestions) */
	upcomingEvents: readonly FixedEvent[];
}

/**
 * Fixed event for time-aware suggestions.
 */
export interface FixedEvent {
	/** Event ID */
	id: string;
	/** Event title */
	title: string;
	/** Event start time (ISO timestamp) */
	startTime: string;
	/** Event duration in minutes */
	durationMinutes: number;
}

/**
 * Suggestion panel props.
 */
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
 * Task suggestions hook props.
 */
export interface UseTaskSuggestionsProps {
	/** Available tasks to suggest from */
	tasks: readonly TaskStreamItem[];
	/** Current task context */
	currentTask: TaskStreamItem | null;
	/** Current energy level */
	energyLevel?: "low" | "medium" | "high";
	/** Available time in minutes */
	timeAvailable?: number | null;
	/** Upcoming fixed events */
	upcomingEvents?: readonly FixedEvent[];
	/** Whether to auto-show suggestions */
	autoShow?: boolean;
}

/**
 * Task suggestions hook return value.
 */
export interface UseTaskSuggestionsReturn {
	/** Current suggestion state */
	state: SuggestionPanelState;
	/** Show suggestions manually */
	show: () => void;
	/** Hide suggestions */
	hide: () => void;
	/** Dismiss a specific suggestion */
	dismiss: (taskId: string) => void;
	/** Approve and start a task */
	approve: (task: TaskStreamItem) => void;
	/** Reset dismissed tasks */
	resetDismissed: () => void;
	/** Check if suggestions can be shown (cooldown check) */
	canShow: () => boolean;
}
