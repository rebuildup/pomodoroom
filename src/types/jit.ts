/**
 * JIT (Just-In-Time) Task Engine Types
 *
 * Event-driven task suggestion system that calculates optimal next tasks
 * on demand rather than pre-computing schedules.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Current context for JIT calculations
 */
export interface JitContext {
	/** Current energy level (0-100) */
	energy: number;
	/** Time since last break (minutes) */
	time_since_last_break_min: number;
	/** Currently running task (if any) */
	current_task: TaskSummary | null;
	/** Number of completed focus sessions today */
	completed_sessions: number;
	/** Current timestamp for context (ISO string) */
	now: string;
}

/**
 * Summary of a task for suggestion purposes
 */
export interface TaskSummary {
	id: string;
	title: string;
	required_minutes: number | null;
	energy: EnergyLevel;
	priority: number;
}

/**
 * Energy level for tasks
 */
export type EnergyLevel = "low" | "medium" | "high";

/**
 * Why this task was suggested
 */
export type SuggestionReason =
	/** Highest priority ready task */
	| "HighPriority"
	/** Matches current energy level */
	| "EnergyMatch"
	/** Quick win (short duration) */
	| "QuickWin"
	/** Most recently deferred */
	| "RecentlyDeferred"
	/** Part of active project */
	| "ActiveProject";

/**
 * Suggested task with priority score
 */
export interface TaskSuggestion {
	task: TaskSummary;
	/** Higher is better (0-100) */
	score: number;
	/** Reason for this suggestion */
	reason: SuggestionReason;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri Command Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invoke handler for JIT commands
 */
export interface JitCommands {
	/**
	 * Suggest next tasks based on current context
	 * @param energy Current energy level (0-100)
	 * @param time_since_break Time since last break in minutes
	 * @param completed_sessions Number of completed sessions today
	 * @returns Up to 3 task suggestions, sorted by score
	 */
	jit_suggest_next_tasks: (
		energy?: number,
		time_since_break?: number,
		completed_sessions?: number,
	) => Promise<TaskSuggestion[]>;

	/**
	 * Suggest optimal break duration based on context
	 * @param energy Current energy level (0-100)
	 * @param completed_sessions Number of completed sessions today
	 * @returns Suggested break duration in minutes
	 */
	jit_suggest_break_duration: (
		energy?: number,
		completed_sessions?: number,
	) => Promise<number>;

	/**
	 * Check if user should take a break now
	 * @param energy Current energy level (0-100)
	 * @param time_since_break Time since last break in minutes
	 * @param completed_sessions Number of completed sessions today
	 * @returns true if break is recommended
	 */
	jit_should_take_break: (
		energy?: number,
		time_since_break?: number,
		completed_sessions?: number,
	) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get suggestion reason label for display
 */
export function getSuggestionReasonLabel(reason: SuggestionReason): string {
	switch (reason) {
		case "HighPriority":
			return "High Priority";
		case "EnergyMatch":
			return "Matches Your Energy";
		case "QuickWin":
			return "Quick Win";
		case "RecentlyDeferred":
			return "Previously Deferred";
		case "ActiveProject":
			return "Active Project";
		default:
			return "Suggested";
	}
}

/**
 * Get suggestion reason icon
 */
export function getSuggestionReasonIcon(reason: SuggestionReason): string {
	switch (reason) {
		case "HighPriority":
			return "🔥";
		case "EnergyMatch":
			return "⚡";
		case "QuickWin":
			return "⚡";
		case "RecentlyDeferred":
			return "🔄";
		case "ActiveProject":
			return "📁";
		default:
			return "💡";
	}
}
