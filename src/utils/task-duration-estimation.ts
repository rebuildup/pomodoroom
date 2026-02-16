/**
 * Task duration estimation utilities.
 *
 * Estimates task duration based on title, notes, and tags.
 * Used for improving initial accuracy of imported tasks from external integrations.
 */

/**
 * Duration hints extracted from task content.
 */
interface DurationHints {
	/** Estimated base duration in minutes */
	baseMinutes: number;
	/** Confidence level (0-1) */
	confidence: number;
	/** Hints used for estimation */
	hints: string[];
}

/**
 * Keywords and phrases that suggest longer tasks.
 */
const LONG_TASK_KEYWORDS = [
	// Time-intensive verbs
	"implement", "build", "create", "develop", "design", "refactor",
	"rewrite", "migrate", "integrate", "setup", "configure", "deploy",
	// Documentation
	"document", "write", "tutorial", "guide", "readme",
	// Complex work
	"research", "investigate", "analyze", "optimize", "debug", "fix",
	// Multiple items
	"tasks", "items", "features", "modules", "components", "pages",
	"multiple", "several", "various",
	// Meeting/collaboration
	"meeting", "discussion", "review", "sync", "planning",
];

/**
 * Keywords and phrases that suggest shorter tasks.
 */
const SHORT_TASK_KEYWORDS = [
	// Quick actions
	"update", "fix", "change", "adjust", "tweak", "minor", "small",
	"quick", "simple", "basic",
	// Single items
	"typo", "formatting", "spacing", "indent", "comment",
	// Routine
	"check", "verify", "validate", "test", "run",
];

/**
 * Task type patterns with typical durations (in minutes).
 */
const TASK_TYPE_PATTERNS: Array<[RegExp, number]> = [
	[/fix|bug|debug/i, 45], // Bug fix: 45 min
	[/feature|implement|add/i, 90], // Feature: 90 min
	[/refactor|rewrite/i, 120], // Refactor: 2 hours
	[/review|code.?review|pr/i, 30], // Review: 30 min
	[/meeting|sync|discuss/i, 60], // Meeting: 60 min
	[/test|spec|write/i, 60], // Testing/writing: 60 min
	[/docs|document|readme/i, 45], // Documentation: 45 min
	[/config|setup|install/i, 30], // Configuration: 30 min
];

/**
 * Estimate task duration from title and notes.
 *
 * @param title - Task title
 * @param notes - Optional task notes/description
 * @returns Estimated duration in minutes
 */
export function estimateTaskDuration(
	title: string,
	notes?: string
): number {
	const content = `${title} ${notes || ""}`.toLowerCase();

	// Check for explicit duration mentions
	const explicitMinutes = extractExplicitDuration(content);
	if (explicitMinutes !== null) {
		return explicitMinutes;
	}

	// Check task type patterns
	for (const [pattern, duration] of TASK_TYPE_PATTERNS) {
		if (pattern.test(content)) {
			return duration;
		}
	}

	// Analyze content complexity
	const hints = analyzeContentComplexity(content);
	const complexity = calculateComplexity(hints);

	// Base duration by complexity
	if (complexity < 0.3) {
		return 30; // Quick task
	} else if (complexity < 0.6) {
		return 60; // Medium task (current default)
	} else if (complexity < 0.8) {
		return 90; // Long task
	} else {
		return 120; // Complex task
	}
}

/**
 * Extract explicit duration mentions from text.
 *
 * @param content - Text to search
 * @returns Duration in minutes, or null if not found
 */
function extractExplicitDuration(content: string): number | null {
	// Patterns like "2h", "90min", "1.5 hours"
	const hourMatch = content.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?/i);
	if (hourMatch) {
		return Math.round(parseFloat(hourMatch[1]) * 60);
	}

	// Patterns like "90min", "90 minutes", "90 m"
	const minMatch = content.match(/(\d+)\s*(?:min|minutes?|m\b)/i);
	if (minMatch) {
		return parseInt(minMatch[1], 10);
	}

	// Patterns like "2-3 hours", "30-45 min"
	const rangeHourMatch = content.match(/(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)\s*h/i);
	if (rangeHourMatch) {
		const low = parseFloat(rangeHourMatch[1]) * 60;
		const high = parseFloat(rangeHourMatch[2]) * 60;
		return Math.round((low + high) / 2);
	}

	const rangeMinMatch = content.match(/(\d+)\s*[-~]\s*(\d+)\s*(?:minutes?|mins?|m)/i);
	if (rangeMinMatch) {
		const low = parseInt(rangeMinMatch[1], 10);
		const high = parseInt(rangeMinMatch[2], 10);
		return Math.round((low + high) / 2);
	}

	// Pomodoro mentions: "2 pomodoros", "3 poms"
	const pomoMatch = content.match(/(\d+)\s*(?:pomodoros?|poms?|🍅)/i);
	if (pomoMatch) {
		return parseInt(pomoMatch[1], 10) * 25;
	}

	return null;
}

/**
 * Analyze content complexity indicators.
 *
 * @param content - Text to analyze
 * @returns Array of complexity hints
 */
function analyzeContentComplexity(content: string): string[] {
	const hints: string[] = [];

	// Check for long task indicators
	for (const keyword of LONG_TASK_KEYWORDS) {
		if (content.includes(keyword)) {
			hints.push(`long:${keyword}`);
		}
	}

	// Check for short task indicators
	for (const keyword of SHORT_TASK_KEYWORDS) {
		if (content.includes(keyword)) {
			hints.push(`short:${keyword}`);
		}
	}

	// Title length
	if (content.split(/\s+/).length > 15) {
		hints.push("long-title");
	}

	// Question marks indicate uncertainty/complexity
	if (content.includes("?") || content.includes("how")) {
		hints.push("question");
	}

	// Exclamation marks indicate urgency (often quick tasks)
	if (content.includes("!")) {
		hints.push("urgent");
	}

	return hints;
}

/**
 * Calculate complexity score from hints.
 *
 * @param hints - Complexity hints
 * @returns Complexity score (0-1)
 */
function calculateComplexity(hints: string[]): number {
	let score = 0.5; // Start with medium complexity

	for (const hint of hints) {
		if (hint.startsWith("long:")) {
			score += 0.1;
		} else if (hint.startsWith("short:")) {
			score -= 0.1;
		} else if (hint === "long-title") {
			score += 0.15;
		} else if (hint === "question") {
			score += 0.2;
		} else if (hint === "urgent") {
			score -= 0.15;
		}
	}

	return Math.max(0, Math.min(1, score));
}

/**
 * Estimate task duration with confidence score.
 *
 * @param title - Task title
 * @param notes - Optional task notes
 * @returns Duration hints with confidence
 */
export function estimateTaskDurationWithConfidence(
	title: string,
	notes?: string
): DurationHints {
	const content = `${title} ${notes || ""}`.toLowerCase();

	// Check for explicit duration (high confidence)
	const explicitMinutes = extractExplicitDuration(content);
	if (explicitMinutes !== null) {
		return {
			baseMinutes: explicitMinutes,
			confidence: 0.9,
			hints: ["explicit-duration"],
		};
	}

	// Check task type patterns (medium confidence)
	for (const [pattern, duration] of TASK_TYPE_PATTERNS) {
		if (pattern.test(content)) {
			return {
				baseMinutes: duration,
				confidence: 0.7,
				hints: ["pattern-match"],
			};
		}
	}

	// Fallback to complexity analysis (low confidence)
	const hints = analyzeContentComplexity(content);
	const complexity = calculateComplexity(hints);

	let baseMinutes: number;
	if (complexity < 0.3) {
		baseMinutes = 30;
	} else if (complexity < 0.6) {
		baseMinutes = 60;
	} else if (complexity < 0.8) {
		baseMinutes = 90;
	} else {
		baseMinutes = 120;
	}

	return {
		baseMinutes,
		confidence: 0.4,
		hints,
	};
}

/**
 * Get rounded duration in 15-minute increments.
 *
 * @param title - Task title
 * @param notes - Optional task notes
 * @returns Duration rounded to nearest 15 minutes
 */
export function estimateTaskDurationRounded(
	title: string,
	notes?: string
): number {
	const estimated = estimateTaskDuration(title, notes);
	return Math.round(estimated / 15) * 15;
}
