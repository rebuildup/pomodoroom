/**
 * Linear Issue Splitter - Auto-generate task split templates from Linear issues
 *
 * Analyzes Linear issue metadata (labels, estimates, priority) and
 * generates optimal task decomposition patterns.
 *
 * Features:
 * - Label-based split pattern detection
 * - Estimate-based chunk sizing
 * - Priority-aware scheduling
 */

// Linear issue data
export interface LinearIssue {
	id: string;
	identifier: string; // e.g., "ENG-123"
	title: string;
	description: string | null;
	estimate: number | null; // Story points (1, 2, 3, 5, 8, etc.)
	priority: number | null; // 0-4 (urgent to no priority)
	labels: Array<{
		id: string;
		name: string;
		color: string;
	}>;
	state: string;
	team: {
		id: string;
		name: string;
	};
	assignee: {
		id: string;
		name: string;
	} | null;
	dueDate: string | null;
}

// Split template for task decomposition
export interface SplitTemplate {
	id: string;
	name: string;
	description: string;
	pattern: SplitPattern;
	estimatedFocusMinutes: number;
	recommendedBreakMinutes: number;
}

// Split pattern configuration
export interface SplitPattern {
	chunks: SplitChunk[];
	strategy: "sequential" | "parallel" | "phases";
	dependencies: Array<{ from: number; to: number }>;
}

// Individual split chunk
export interface SplitChunk {
	id: string;
	title: string;
	description: string;
	estimatedMinutes: number;
	priority: "high" | "medium" | "low";
	tags: string[];
}

// Split result
export interface SplitResult {
	originalIssue: LinearIssue;
	template: SplitTemplate;
	chunks: SplitChunk[];
	totalEstimatedMinutes: number;
	recommendedSessions: number;
	warnings: string[];
}

// Common split patterns based on label types
const LABEL_PATTERNS: Record<string, Partial<SplitPattern>> = {
	// Feature development
	feature: {
		strategy: "phases",
		chunks: [
			{
				id: "research",
				title: "Research & Design",
				description: "Research and design phase",
				estimatedMinutes: 30,
				priority: "high",
				tags: ["planning"],
			},
			{
				id: "implementation",
				title: "Implementation",
				description: "Implementation phase",
				estimatedMinutes: 60,
				priority: "high",
				tags: ["coding"],
			},
			{
				id: "testing",
				title: "Testing",
				description: "Testing phase",
				estimatedMinutes: 25,
				priority: "medium",
				tags: ["qa"],
			},
			{
				id: "review",
				title: "Code Review",
				description: "Code review phase",
				estimatedMinutes: 15,
				priority: "medium",
				tags: ["review"],
			},
		],
	},
	// Bug fixes
	bug: {
		strategy: "sequential",
		chunks: [
			{
				id: "reproduce",
				title: "Reproduce Issue",
				description: "Reproduce the issue",
				estimatedMinutes: 15,
				priority: "high",
				tags: ["debug"],
			},
			{
				id: "investigate",
				title: "Root Cause Analysis",
				description: "Find root cause",
				estimatedMinutes: 20,
				priority: "high",
				tags: ["debug"],
			},
			{
				id: "fix",
				title: "Implement Fix",
				description: "Implement the fix",
				estimatedMinutes: 25,
				priority: "high",
				tags: ["coding"],
			},
			{
				id: "verify",
				title: "Verify Fix",
				description: "Verify the fix works",
				estimatedMinutes: 15,
				priority: "medium",
				tags: ["qa"],
			},
		],
	},
	// Documentation
	documentation: {
		strategy: "sequential",
		chunks: [
			{
				id: "outline",
				title: "Create Outline",
				description: "Create documentation outline",
				estimatedMinutes: 15,
				priority: "medium",
				tags: ["docs"],
			},
			{
				id: "write",
				title: "Write Documentation",
				description: "Write documentation content",
				estimatedMinutes: 30,
				priority: "medium",
				tags: ["docs"],
			},
			{
				id: "review",
				title: "Review & Polish",
				description: "Review and polish documentation",
				estimatedMinutes: 15,
				priority: "low",
				tags: ["review"],
			},
		],
	},
	// Refactoring
	refactor: {
		strategy: "phases",
		chunks: [
			{
				id: "analyze",
				title: "Analyze Current Code",
				description: "Analyze existing code",
				estimatedMinutes: 20,
				priority: "high",
				tags: ["analysis"],
			},
			{
				id: "plan",
				title: "Plan Refactoring",
				description: "Plan refactoring approach",
				estimatedMinutes: 15,
				priority: "high",
				tags: ["planning"],
			},
			{
				id: "implement",
				title: "Implement Changes",
				description: "Implement refactoring changes",
				estimatedMinutes: 45,
				priority: "high",
				tags: ["coding"],
			},
			{
				id: "test",
				title: "Run Tests",
				description: "Run tests to verify changes",
				estimatedMinutes: 15,
				priority: "medium",
				tags: ["qa"],
			},
		],
	},
	// Testing
	testing: {
		strategy: "sequential",
		chunks: [
			{
				id: "plan",
				title: "Test Planning",
				description: "Plan test strategy",
				estimatedMinutes: 15,
				priority: "high",
				tags: ["planning", "qa"],
			},
			{
				id: "write",
				title: "Write Tests",
				description: "Write test cases",
				estimatedMinutes: 45,
				priority: "high",
				tags: ["coding", "qa"],
			},
			{
				id: "run",
				title: "Run & Verify",
				description: "Run and verify tests",
				estimatedMinutes: 15,
				priority: "medium",
				tags: ["qa"],
			},
		],
	},
};

// Default pattern for unlabeled issues
const DEFAULT_PATTERN: SplitPattern = {
	strategy: "sequential",
	chunks: [
		{
			id: "analyze",
			title: "Analyze Task",
			description: "Analyze task requirements",
			estimatedMinutes: 15,
			priority: "high",
			tags: ["planning"],
		},
		{
			id: "implement",
			title: "Implement",
			description: "Implement the solution",
			estimatedMinutes: 45,
			priority: "high",
			tags: ["coding"],
		},
		{
			id: "review",
			title: "Review & Verify",
			description: "Review and verify implementation",
			estimatedMinutes: 15,
			priority: "medium",
			tags: ["review"],
		},
	],
	dependencies: [],
};

/**
 * Detect split pattern from issue labels
 */
function detectPatternFromLabels(labels: LinearIssue["labels"]): Partial<SplitPattern> | null {
	const labelNames = labels.map((l) => l.name.toLowerCase());

	// Check for specific label patterns
	for (const [patternName, pattern] of Object.entries(LABEL_PATTERNS)) {
		if (labelNames.some((name) => name.includes(patternName))) {
			return pattern;
		}
	}

	return null;
}

/**
 * Adjust chunk sizes based on estimate
 */
function adjustForEstimate(chunks: SplitChunk[], estimate: number | null): SplitChunk[] {
	if (!estimate) return chunks;

	// Linear uses Fibonacci-like estimates: 1, 2, 3, 5, 8, etc.
	// Map to approximate hours: 1=1h, 2=2h, 3=4h, 5=1d, 8=2d
	const estimateToHours: Record<number, number> = {
		1: 1,
		2: 2,
		3: 4,
		5: 8,
		8: 16,
	};

	const totalHours = estimateToHours[estimate] ?? estimate * 2;
	const totalMinutes = totalHours * 60;

	// Scale chunks proportionally
	const currentTotal = chunks.reduce((sum, c) => sum + c.estimatedMinutes, 0);
	if (currentTotal === 0) return chunks;

	const scaleFactor = totalMinutes / currentTotal;

	return chunks.map((chunk) => ({
		...chunk,
		estimatedMinutes: Math.round(chunk.estimatedMinutes * scaleFactor),
	}));
}

/**
 * Adjust priority based on issue priority
 */
function adjustPriority(chunks: SplitChunk[], issuePriority: number | null): SplitChunk[] {
	if (issuePriority === null) return chunks;

	// Linear priority: 0=urgent, 1=high, 2=medium, 3=low, 4=no priority
	const priorityBoost = issuePriority <= 1;

	return chunks.map((chunk) => ({
		...chunk,
		priority: priorityBoost && chunk.priority === "medium" ? "high" : chunk.priority,
	}));
}

/**
 * Generate split result from Linear issue
 */
export function splitLinearIssue(issue: LinearIssue): SplitResult {
	const warnings: string[] = [];

	// Detect pattern from labels
	const labelPattern = detectPatternFromLabels(issue.labels);
	const basePattern: SplitPattern = labelPattern
		? { ...DEFAULT_PATTERN, ...labelPattern, dependencies: [] }
		: { ...DEFAULT_PATTERN };

	// Generate chunks from pattern
	let chunks: SplitChunk[] = basePattern.chunks.map((chunk) => ({
		...chunk,
		id: `${issue.identifier}-${chunk.id}`,
		title: `${chunk.title}: ${issue.title}`,
		description: `Part of ${issue.identifier}: ${issue.title}`,
		tags: [...chunk.tags, `linear:${issue.identifier}`],
	}));

	// Adjust for estimate
	chunks = adjustForEstimate(chunks, issue.estimate);
	if (!issue.estimate) {
		warnings.push("No estimate provided - using default chunk sizes");
	}

	// Adjust for priority
	chunks = adjustPriority(chunks, issue.priority);

	// Calculate totals
	const totalMinutes = chunks.reduce((sum, c) => sum + c.estimatedMinutes, 0);
	const recommendedSessions = Math.ceil(totalMinutes / 50); // ~50 min per session

	// Create template
	const template: SplitTemplate = {
		id: `split-${issue.identifier}`,
		name: `${issue.identifier} Split Template`,
		description: `Auto-generated split pattern for ${issue.title}`,
		pattern: basePattern,
		estimatedFocusMinutes: totalMinutes,
		recommendedBreakMinutes: Math.round(totalMinutes * 0.2), // 20% break time
	};

	return {
		originalIssue: issue,
		template,
		chunks,
		totalEstimatedMinutes: totalMinutes,
		recommendedSessions,
		warnings,
	};
}

/**
 * Get split pattern name from labels
 */
export function getPatternName(labels: LinearIssue["labels"]): string {
	const pattern = detectPatternFromLabels(labels);
	if (!pattern || !pattern.chunks) return "Default";

	const labelNames = labels.map((l) => l.name.toLowerCase());
	for (const name of Object.keys(LABEL_PATTERNS)) {
		if (labelNames.some((l) => l.includes(name))) {
			return name.charAt(0).toUpperCase() + name.slice(1);
		}
	}

	return "Default";
}

/**
 * Format chunks for display
 */
export function formatChunksDisplay(chunks: SplitChunk[]): string {
	return chunks
		.map((c, i) => `${i + 1}. ${c.title} (${c.estimatedMinutes}min) [${c.priority}]`)
		.join("\n");
}
