/**
 * PR Review Focus Mode - Special timer mode for GitHub PR reviews
 *
 * Provides a dedicated focus mode optimized for code review:
 * - Shorter focus cycles (15 min instead of 25 min)
 * - More frequent breaks (every cycle, not every 4 cycles)
 * - Auto-pause on PR submission
 * - Integration with GitHub PR state
 */

import { useCallback, useMemo, useState } from "react";

// PR Review mode configuration
export interface PRReviewConfig {
	focusMinutes: number;
	breakMinutes: number;
	longBreakMinutes: number;
	cyclesBeforeLongBreak: number;
	autoPauseOnSubmit: boolean;
	showPRInfo: boolean;
}

const DEFAULT_PR_REVIEW_CONFIG: PRReviewConfig = {
	focusMinutes: 15, // Shorter than standard 25 min
	breakMinutes: 5,
	longBreakMinutes: 15,
	cyclesBeforeLongBreak: 3, // More frequent long breaks
	autoPauseOnSubmit: true,
	showPRInfo: true,
};

// PR state from GitHub
export interface PRInfo {
	number: number;
	title: string;
	author: string;
	repository: string;
	url: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "REVIEW_REQUIRED" | null;
}

// PR Review session state
export interface PRReviewSession {
	prInfo: PRInfo | null;
	isActive: boolean;
	cyclesCompleted: number;
	totalFocusMinutes: number;
	startedAt: number | null;
	pausedAt: number | null;
}

// Review metrics
export interface ReviewMetrics {
	totalReviewsCompleted: number;
	totalFocusMinutes: number;
	averageCyclesPerReview: number;
	mostReviewedRepositories: Array<{ repo: string; count: number }>;
}

/**
 * Hook for PR Review Focus Mode
 */
export function usePRReviewFocusMode(
	config: Partial<PRReviewConfig> = {},
): {
	session: PRReviewSession;
	metrics: ReviewMetrics;
	config: PRReviewConfig;
	startReview: (prInfo: PRInfo) => void;
	pauseReview: () => void;
	resumeReview: () => void;
	endReview: () => void;
	completeCycle: (focusMinutes: number) => void;
	isPRReviewMode: boolean;
} {
	const fullConfig = useMemo(
		() => ({ ...DEFAULT_PR_REVIEW_CONFIG, ...config }),
		[config],
	);

	const [session, setSession] = useState<PRReviewSession>({
		prInfo: null,
		isActive: false,
		cyclesCompleted: 0,
		totalFocusMinutes: 0,
		startedAt: null,
		pausedAt: null,
	});

	const [reviewHistory, setReviewHistory] = useState<
		Array<{
			prNumber: number;
			repository: string;
			cycles: number;
			focusMinutes: number;
			completedAt: number;
		}>
	>([]);

	// Calculate metrics from history
	const metrics = useMemo((): ReviewMetrics => {
		const totalReviews = reviewHistory.length;
		const totalFocus = reviewHistory.reduce((sum, r) => sum + r.focusMinutes, 0);
		const avgCycles =
			totalReviews > 0
				? reviewHistory.reduce((sum, r) => sum + r.cycles, 0) / totalReviews
				: 0;

		const repoCounts: Record<string, number> = {};
		for (const review of reviewHistory) {
			repoCounts[review.repository] = (repoCounts[review.repository] ?? 0) + 1;
		}

		const mostReviewed = Object.entries(repoCounts)
			.map(([repo, count]) => ({ repo, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

		return {
			totalReviewsCompleted: totalReviews,
			totalFocusMinutes: totalFocus,
			averageCyclesPerReview: Math.round(avgCycles * 10) / 10,
			mostReviewedRepositories: mostReviewed,
		};
	}, [reviewHistory]);

	// Start a new PR review session
	const startReview = useCallback((prInfo: PRInfo) => {
		setSession({
			prInfo,
			isActive: true,
			cyclesCompleted: 0,
			totalFocusMinutes: 0,
			startedAt: Date.now(),
			pausedAt: null,
		});
	}, []);

	// Pause the review session
	const pauseReview = useCallback(() => {
		setSession((prev) => ({
			...prev,
			isActive: false,
			pausedAt: Date.now(),
		}));
	}, []);

	// Resume the review session
	const resumeReview = useCallback(() => {
		setSession((prev) => ({
			...prev,
			isActive: true,
			pausedAt: null,
		}));
	}, []);

	// End the review session
	const endReview = useCallback(() => {
		setSession((prev) => {
			// Record to history if we had a PR
			if (prev.prInfo && prev.cyclesCompleted > 0) {
				setReviewHistory((history) => [
					...history,
					{
						prNumber: prev.prInfo!.number,
						repository: prev.prInfo!.repository,
						cycles: prev.cyclesCompleted,
						focusMinutes: prev.totalFocusMinutes,
						completedAt: Date.now(),
					},
				]);
			}

			return {
				prInfo: null,
				isActive: false,
				cyclesCompleted: 0,
				totalFocusMinutes: 0,
				startedAt: null,
				pausedAt: null,
			};
		});
	}, []);

	// Complete a focus cycle
	const completeCycle = useCallback((focusMinutes: number) => {
		setSession((prev) => ({
			...prev,
			cyclesCompleted: prev.cyclesCompleted + 1,
			totalFocusMinutes: prev.totalFocusMinutes + focusMinutes,
		}));
	}, []);

	// Check if we're in PR review mode
	const isPRReviewMode = session.prInfo !== null && session.isActive;

	return {
		session,
		metrics,
		config: fullConfig,
		startReview,
		pauseReview,
		resumeReview,
		endReview,
		completeCycle,
		isPRReviewMode,
	};
}

/**
 * Get recommended break type based on cycles completed
 */
export function getBreakType(
	cyclesCompleted: number,
	config: PRReviewConfig,
): "short" | "long" {
	const cycleInSet = cyclesCompleted % config.cyclesBeforeLongBreak;
	// Long break after completing the set
	if (cycleInSet === 0 && cyclesCompleted > 0) {
		return "long";
	}
	return "short";
}

/**
 * Get break duration for current cycle
 */
export function getBreakDuration(
	cyclesCompleted: number,
	config: PRReviewConfig,
): number {
	const breakType = getBreakType(cyclesCompleted, config);
	return breakType === "long" ? config.longBreakMinutes : config.breakMinutes;
}

/**
 * Format PR info for display
 */
export function formatPRDisplay(prInfo: PRInfo | null): string {
	if (!prInfo) return "PR Review Mode";
	return `${prInfo.repository}#${prInfo.number}`;
}

/**
 * Get review session summary
 */
export function getSessionSummary(session: PRReviewSession): string {
	if (!session.prInfo) return "No active review";

	const duration =
		session.startedAt && session.isActive
			? Math.round((Date.now() - session.startedAt) / 60000)
			: 0;

	return `${session.prInfo.title.slice(0, 30)}... - ${session.cyclesCompleted} cycles, ${session.totalFocusMinutes}min focus${duration > 0 ? `, ${duration}min elapsed` : ""}`;
}
