/**
 * Adaptive Segment Granularity - Adjust segment size based on uncertainty
 *
 * Dynamically chooses segment sizes based on task uncertainty:
 * - High uncertainty => finer segments (more checkpoints)
 * - Low uncertainty => coarser segments (fewer interruptions)
 *
 * Design goals:
 * - Configurable granularity policies
 * - Variance-based re-estimation
 * - Feedback loop for continuous improvement
 */

// Uncertainty levels
export type UncertaintyLevel = "low" | "medium" | "high" | "very_high";

// Granularity tiers
export type GranularityTier = "coarse" | "normal" | "fine" | "very_fine";

// Segment configuration
export interface SegmentConfig {
	minutes: number;
	checkpointInterval: number; // Minutes between checkpoints
	adjustmentFactor: number; // How much to adjust from base
}

// Granularity policy configuration
export interface GranularityPolicy {
	tier: GranularityTier;
	uncertaintyRange: {
		min: number;
		max: number;
	};
	segmentConfig: SegmentConfig;
	description: string;
}

// Task uncertainty metrics
export interface TaskUncertaintyMetrics {
	estimateVariance: number; // Historical variance in estimates
	deadlineFlexibility: number; // 0-1, how flexible is deadline
	complexityScore: number; // 0-1, perceived complexity
	domainFamiliarity: number; // 0-1, how familiar with task type
	interruptionHistory: number; // Average interruptions per similar task
}

// Granularity recommendation
export interface GranularityRecommendation {
	tier: GranularityTier;
	segmentMinutes: number;
	reason: string;
	confidence: number;
	adjustments: GranularityAdjustment[];
}

// Adjustment suggestion
export interface GranularityAdjustment {
	type: "increase" | "decrease" | "maintain";
	reason: string;
	magnitude: number; // Minutes to adjust
}

// Feedback data for re-estimation
export interface GranularityFeedback {
	taskId: string;
	originalEstimate: number;
	actualDuration: number;
	segmentCount: number;
	completedSegments: number;
	interruptionCount: number;
	uncertaintyLevel: UncertaintyLevel;
	timestamp: number;
}

// Default granularity policies
const DEFAULT_POLICIES: GranularityPolicy[] = [
	{
		tier: "coarse",
		uncertaintyRange: { min: 0, max: 0.25 },
		segmentConfig: {
			minutes: 60,
			checkpointInterval: 30,
			adjustmentFactor: 1.0,
		},
		description: "安定したタスク用の大きなセグメント",
	},
	{
		tier: "normal",
		uncertaintyRange: { min: 0.25, max: 0.5 },
		segmentConfig: {
			minutes: 45,
			checkpointInterval: 22,
			adjustmentFactor: 0.9,
		},
		description: "通常の不確実性レベル",
	},
	{
		tier: "fine",
		uncertaintyRange: { min: 0.5, max: 0.75 },
		segmentConfig: {
			minutes: 30,
			checkpointInterval: 15,
			adjustmentFactor: 0.75,
		},
		description: "不確実性が高い場合の細かいセグメント",
	},
	{
		tier: "very_fine",
		uncertaintyRange: { min: 0.75, max: 1.0 },
		segmentConfig: {
			minutes: 15,
			checkpointInterval: 7,
			adjustmentFactor: 0.5,
		},
		description: "非常に不確実なタスク用の最細セグメント",
	},
];

// Feedback history for learning
export interface FeedbackHistory {
	taskType: string;
	feedbacks: GranularityFeedback[];
	averageVariance: number;
}

/**
 * Calculate uncertainty score from metrics
 */
export function calculateUncertaintyScore(metrics: TaskUncertaintyMetrics): number {
	const weights = {
		estimateVariance: 0.3,
		deadlineFlexibility: 0.15,
		complexityScore: 0.25,
		domainFamiliarity: -0.2, // Higher familiarity = lower uncertainty
		interruptionHistory: 0.2,
	};

	let score = 0;
	score += metrics.estimateVariance * weights.estimateVariance;
	score += (1 - metrics.deadlineFlexibility) * weights.deadlineFlexibility;
	score += metrics.complexityScore * weights.complexityScore;
	score += (1 - metrics.domainFamiliarity) * Math.abs(weights.domainFamiliarity);
	score += Math.min(metrics.interruptionHistory / 5, 1) * weights.interruptionHistory;

	// Clamp to 0-1
	return Math.max(0, Math.min(1, score));
}

/**
 * Get uncertainty level from score
 */
export function getUncertaintyLevel(score: number): UncertaintyLevel {
	if (score < 0.25) return "low";
	if (score < 0.5) return "medium";
	if (score < 0.75) return "high";
	return "very_high";
}

/**
 * Get granularity tier from uncertainty score
 */
export function getGranularityTier(score: number, policies: GranularityPolicy[] = DEFAULT_POLICIES): GranularityPolicy {
	for (const policy of policies) {
		if (score >= policy.uncertaintyRange.min && score < policy.uncertaintyRange.max) {
			return policy;
		}
	}
	// Default to fine if uncertain
	return policies.find((p) => p.tier === "fine") ?? policies[2];
}

/**
 * Generate granularity recommendation
 */
export function recommendGranularity(
	metrics: TaskUncertaintyMetrics,
	options?: {
		overridePolicy?: GranularityPolicy[];
		baseMinutes?: number;
	},
): GranularityRecommendation {
	const policies = options?.overridePolicy ?? DEFAULT_POLICIES;
	const baseMinutes = options?.baseMinutes ?? 45;

	const uncertaintyScore = calculateUncertaintyScore(metrics);
	const policy = getGranularityTier(uncertaintyScore, policies);

	// Adjust segment size based on base and policy
	const segmentMinutes = Math.round(baseMinutes * policy.segmentConfig.adjustmentFactor);

	// Generate adjustments
	const adjustments: GranularityAdjustment[] = [];

	if (metrics.estimateVariance > 0.5) {
		adjustments.push({
			type: "decrease",
			reason: "過去の見積もりにばらつきあり",
			magnitude: 10,
		});
	}

	if (metrics.domainFamiliarity > 0.8) {
		adjustments.push({
			type: "increase",
			reason: "慣れた作業領域",
			magnitude: 5,
		});
	}

	if (metrics.interruptionHistory > 3) {
		adjustments.push({
			type: "decrease",
			reason: "頻繁な中断履歴",
			magnitude: 15,
		});
	}

	// Calculate final segment minutes
	let finalMinutes = segmentMinutes;
	for (const adj of adjustments) {
		if (adj.type === "decrease") {
			finalMinutes = Math.max(15, finalMinutes - adj.magnitude);
		} else if (adj.type === "increase") {
			finalMinutes = Math.min(90, finalMinutes + adj.magnitude);
		}
	}

	return {
		tier: policy.tier,
		segmentMinutes: finalMinutes,
		reason: policy.description,
		confidence: 1 - uncertaintyScore * 0.3, // Higher uncertainty = lower confidence
		adjustments,
	};
}

/**
 * Calculate variance from feedback history
 */
export function calculateVarianceFromFeedback(feedbacks: GranularityFeedback[]): number {
	if (feedbacks.length < 2) return 0.5; // Default uncertainty

	const ratios = feedbacks.map((f) => f.actualDuration / f.originalEstimate);
	const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;

	const variance = ratios.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratios.length;

	// Normalize variance to 0-1 scale
	return Math.min(1, Math.sqrt(variance));
}

/**
 * Update policy based on feedback
 */
export function updatePolicyFromFeedback(
	policy: GranularityPolicy,
	feedbacks: GranularityFeedback[],
): GranularityPolicy {
	if (feedbacks.length < 3) return policy; // Need minimum data points

	const avgCompletionRate =
		feedbacks.reduce((sum, f) => sum + f.completedSegments / f.segmentCount, 0) /
		feedbacks.length;

	const avgInterruptions =
		feedbacks.reduce((sum, f) => sum + f.interruptionCount, 0) / feedbacks.length;

	// Adjust based on feedback
	let adjustmentFactor = policy.segmentConfig.adjustmentFactor;

	if (avgCompletionRate < 0.7) {
		// Too many incomplete segments - make them smaller
		adjustmentFactor *= 0.9;
	} else if (avgCompletionRate > 0.95 && avgInterruptions < 1) {
		// Very successful - can try larger segments
		adjustmentFactor *= 1.1;
	}

	return {
		...policy,
		segmentConfig: {
			...policy.segmentConfig,
			adjustmentFactor: Math.max(0.5, Math.min(1.2, adjustmentFactor)),
		},
	};
}

/**
 * Generate segments for a task
 */
export function generateSegments(
	taskDurationMinutes: number,
	recommendation: GranularityRecommendation,
): Array<{ index: number; startMinute: number; endMinute: number; isCheckpoint: boolean }> {
	const segments: Array<{ index: number; startMinute: number; endMinute: number; isCheckpoint: boolean }> = [];

	const segmentMinutes = recommendation.segmentMinutes;
	const policy = DEFAULT_POLICIES.find((p) => p.tier === recommendation.tier);
	const checkpointInterval = policy?.segmentConfig.checkpointInterval ?? segmentMinutes;

	let currentMinute = 0;
	let index = 0;

	while (currentMinute < taskDurationMinutes) {
		const endMinute = Math.min(currentMinute + segmentMinutes, taskDurationMinutes);

		segments.push({
			index,
			startMinute: currentMinute,
			endMinute,
			isCheckpoint: index % Math.ceil(checkpointInterval / (segmentMinutes / 2)) === 0,
		});

		currentMinute = endMinute;
		index++;
	}

	return segments;
}

/**
 * Get granularity tier display name
 */
export function getGranularityTierDisplayName(tier: GranularityTier): string {
	const names: Record<GranularityTier, string> = {
		coarse: "粗粒度",
		normal: "通常",
		fine: "細粒度",
		very_fine: "極細粒度",
	};

	return names[tier];
}

/**
 * Get uncertainty level display name
 */
export function getUncertaintyLevelDisplayName(level: UncertaintyLevel): string {
	const names: Record<UncertaintyLevel, string> = {
		low: "低い",
		medium: "中程度",
		high: "高い",
		very_high: "非常に高い",
	};

	return names[level];
}

/**
 * Format recommendation for display
 */
export function formatRecommendationDisplay(recommendation: GranularityRecommendation): string {
	const lines: string[] = [
		`推奨粒度: ${getGranularityTierDisplayName(recommendation.tier)}`,
		`セグメント時間: ${recommendation.segmentMinutes}分`,
		`信頼度: ${Math.round(recommendation.confidence * 100)}%`,
		`理由: ${recommendation.reason}`,
	];

	if (recommendation.adjustments.length > 0) {
		lines.push("", "調整:");
		for (const adj of recommendation.adjustments) {
			const icon = adj.type === "decrease" ? "↓" : adj.type === "increase" ? "↑" : "→";
			lines.push(`  ${icon} ${adj.reason} (${adj.magnitude}分)`);
		}
	}

	return lines.join("\n");
}
