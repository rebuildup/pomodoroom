/**
 * Recommendation Explainability API - Explain why recommendations are made
 *
 * Provides transparency into recommendation decisions:
 * - Contributing factors and weights
 * - Rejected alternatives summary
 * - Machine-readable explanations for UI rendering
 *
 * Design goals:
 * - Stable API for consistent UI rendering
 * - Transparent decision reasoning
 * - Testable explanation consistency
 */

// Recommendation types
export type RecommendationType =
	| "task_priority"
	| "task_scheduling"
	| "break_timing"
	| "task_split"
	| "session_duration";

// Factor categories
export type FactorCategory =
	| "temporal" // Time-based factors (time of day, deadline proximity)
	| "historical" // Past performance patterns
	| "contextual" // Current context (energy level, interruptions)
	| "constraint" // Hard constraints (fixed meetings, deadlines)
	| "preference" // User preferences
	| "system"; // System-level factors (queue size, load balancing)

// Individual factor contributing to recommendation
export interface RecommendationFactor {
	id: string;
	category: FactorCategory;
	name: string;
	description: string;
	weight: number; // 0-1, relative importance
	value: number; // Actual value used
	impact: "positive" | "negative" | "neutral";
	confidence: number; // 0-1, how confident in this factor
}

// Alternative that was considered but not chosen
export interface RejectedAlternative {
	id: string;
	type: RecommendationType;
	summary: string;
	rejectionReasons: string[];
	score: number; // How close it was to being chosen
}

// Full recommendation explanation
export interface RecommendationExplanation {
	id: string;
	type: RecommendationType;
	createdAt: number;
	// The recommendation
	summary: string;
	confidence: number; // Overall confidence 0-1
	// Contributing factors
	factors: RecommendationFactor[];
	topFactor: RecommendationFactor | null;
	// Alternatives considered
	alternatives: RejectedAlternative[];
	// Traceability
	modelVersion: string;
	inputHash: string; // Hash of inputs for reproducibility
}

// API response for recommendation explanation
export interface ExplainabilityResponse {
	explanation: RecommendationExplanation;
	renderHints: RenderHints;
}

// Hints for UI rendering
export interface RenderHints {
	primaryColor: string;
	icon: string;
	priority: "high" | "medium" | "low";
	ttl: number; // Time-to-live in seconds
}

// Factor weights configuration
interface FactorWeights {
	[category: string]: {
		[factor: string]: number;
	};
}

// Default factor weights
const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
	temporal: {
		deadline_proximity: 0.8,
		time_of_day_fit: 0.6,
		day_of_week: 0.3,
	},
	historical: {
		completion_rate: 0.7,
		average_duration: 0.5,
		past_performance: 0.6,
	},
	contextual: {
		energy_level: 0.7,
		interruption_risk: 0.5,
		focus_history: 0.4,
	},
	constraint: {
		fixed_events: 1.0,
		deadline_hard: 0.9,
		dependency: 0.8,
	},
	preference: {
		user_priority: 0.7,
		tag_preference: 0.4,
		time_preference: 0.5,
	},
	system: {
		queue_balance: 0.3,
		load_distribution: 0.2,
	},
};

/**
 * Create a recommendation factor
 */
export function createFactor(
	category: FactorCategory,
	name: string,
	value: number,
	options?: {
		description?: string;
		impact?: "positive" | "negative" | "neutral";
		confidence?: number;
	},
): RecommendationFactor {
	const weights = DEFAULT_FACTOR_WEIGHTS[category]?.[name] ?? 0.5;

	return {
		id: `factor-${category}-${name}`,
		category,
		name,
		description: options?.description ?? name,
		weight: weights,
		value,
		impact: options?.impact ?? "neutral",
		confidence: options?.confidence ?? 0.8,
	};
}

/**
 * Calculate overall recommendation confidence
 */
export function calculateConfidence(factors: RecommendationFactor[]): number {
	if (factors.length === 0) return 0.5;

	const weightedConfidence = factors.reduce((sum, f) => sum + f.confidence * f.weight, 0);
	const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);

	return Math.round((weightedConfidence / totalWeight) * 100) / 100;
}

/**
 * Get the top contributing factor
 */
export function getTopFactor(factors: RecommendationFactor[]): RecommendationFactor | null {
	if (factors.length === 0) return null;

	return factors.reduce((top, f) => {
		const topScore = top.weight * top.confidence * (top.impact === "positive" ? 1 : 0.5);
		const fScore = f.weight * f.confidence * (f.impact === "positive" ? 1 : 0.5);
		return fScore > topScore ? f : top;
	});
}

/**
 * Generate explanation summary from factors
 */
export function generateSummary(
	type: RecommendationType,
	topFactor: RecommendationFactor | null,
	_factors: RecommendationFactor[],
): string {
	const typeDescriptions: Record<RecommendationType, string> = {
		task_priority: "タスク優先度",
		task_scheduling: "タスクスケジュール",
		break_timing: "休憩タイミング",
		task_split: "タスク分割",
		session_duration: "セッション時間",
	};

	if (!topFactor) {
		return `${typeDescriptions[type]}の推奨`;
	}

	const impactDescriptions: Record<string, string> = {
		positive: `${topFactor.description}が有利`,
		negative: `${topFactor.description}の影響を考慮`,
		neutral: `${topFactor.description}を考慮`,
	};

	return `${typeDescriptions[type]}: ${impactDescriptions[topFactor.impact]}`;
}

/**
 * Create a rejected alternative
 */
export function createRejectedAlternative(
	type: RecommendationType,
	summary: string,
	score: number,
	reasons: string[],
): RejectedAlternative {
	return {
		id: `alt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		type,
		summary,
		score,
		rejectionReasons: reasons,
	};
}

/**
 * Generate render hints for UI
 */
export function generateRenderHints(
	confidence: number,
	type: RecommendationType,
): RenderHints {
	const iconMap: Record<RecommendationType, string> = {
		task_priority: "priority_high",
		task_scheduling: "schedule",
		break_timing: "coffee",
		task_split: "call_split",
		session_duration: "timer",
	};

	const colorMap: Record<string, string> = {
		high: "var(--md-ref-color-primary)",
		medium: "#f59e0b",
		low: "var(--md-ref-color-outline)",
	};

	const priority = confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";

	return {
		primaryColor: colorMap[priority],
		icon: iconMap[type],
		priority,
		ttl: 300, // 5 minutes
	};
}

/**
 * Build a complete recommendation explanation
 */
export function buildExplanation(
	type: RecommendationType,
	factors: RecommendationFactor[],
	alternatives: RejectedAlternative[] = [],
	options?: {
		modelVersion?: string;
		inputHash?: string;
	},
): ExplainabilityResponse {
	const confidence = calculateConfidence(factors);
	const topFactor = getTopFactor(factors);
	const summary = generateSummary(type, topFactor, factors);

	const explanation: RecommendationExplanation = {
		id: `explanation-${Date.now()}`,
		type,
		createdAt: Date.now(),
		summary,
		confidence,
		factors,
		topFactor,
		alternatives,
		modelVersion: options?.modelVersion ?? "1.0.0",
		inputHash: options?.inputHash ?? "",
	};

	const renderHints = generateRenderHints(confidence, type);

	return {
		explanation,
		renderHints,
	};
}

/**
 * Format explanation for display
 */
export function formatExplanationDisplay(explanation: RecommendationExplanation): string {
	const lines: string[] = [explanation.summary, ""];

	// Top factors
	const topFactors = explanation.factors
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 3);

	if (topFactors.length > 0) {
		lines.push("主な要因:");
		for (const factor of topFactors) {
			const impactIcon = factor.impact === "positive" ? "↑" : factor.impact === "negative" ? "↓" : "→";
			lines.push(`  ${impactIcon} ${factor.description} (${Math.round(factor.weight * 100)}%)`);
		}
	}

	// Alternatives
	if (explanation.alternatives.length > 0) {
		lines.push("");
		lines.push("検討された代替案:");
		for (const alt of explanation.alternatives.slice(0, 2)) {
			lines.push(`  • ${alt.summary}`);
		}
	}

	lines.push("");
	lines.push(`信頼度: ${Math.round(explanation.confidence * 100)}%`);

	return lines.join("\n");
}

/**
 * Format factor for display
 */
export function formatFactorDisplay(factor: RecommendationFactor): string {
	const impactLabel = {
		positive: "プラス",
		negative: "マイナス",
		neutral: "中立",
	}[factor.impact];

	return `${factor.description} [${impactLabel}] 重み:${Math.round(factor.weight * 100)}%`;
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: FactorCategory): string {
	const names: Record<FactorCategory, string> = {
		temporal: "時間的要因",
		historical: "履歴ベース",
		contextual: "コンテキスト",
		constraint: "制約条件",
		preference: "ユーザー設定",
		system: "システム要因",
	};

	return names[category];
}

/**
 * Get recommendation type display name
 */
export function getRecommendationTypeDisplayName(type: RecommendationType): string {
	const names: Record<RecommendationType, string> = {
		task_priority: "タスク優先度",
		task_scheduling: "タスクスケジュール",
		break_timing: "休憩タイミング",
		task_split: "タスク分割",
		session_duration: "セッション時間",
	};

	return names[type];
}

/**
 * Serialize explanation for storage/transmission
 */
export function serializeExplanation(explanation: RecommendationExplanation): string {
	return JSON.stringify(explanation);
}

/**
 * Deserialize explanation from storage/transmission
 */
export function deserializeExplanation(data: string): RecommendationExplanation | null {
	try {
		const parsed = JSON.parse(data);

		// Validate required fields
		if (typeof parsed.id !== "string") return null;
		if (typeof parsed.type !== "string") return null;
		if (!Array.isArray(parsed.factors)) return null;

		return parsed as RecommendationExplanation;
	} catch {
		return null;
	}
}
