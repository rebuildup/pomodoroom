/**
 * Integration Health Score - Track reliability of external integrations
 *
 * Monitors and scores external service integrations based on:
 * - Failure rate (recent API errors)
 * - Latency (response time)
 * - Auth status (token expiration)
 *
 * Provides a health score (0-100) and status indicators for each service.
 */

import { useCallback, useMemo, useState } from "react";

// Supported integration services
export type IntegrationService = "google" | "notion" | "linear" | "github" | "discord" | "slack";

// Health status levels
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

// Individual health metric
export interface HealthMetric {
	value: number;
	threshold: number;
	status: HealthStatus;
	lastUpdated: number;
}

// Integration health data
export interface IntegrationHealth {
	service: IntegrationService;
	overallScore: number; // 0-100
	status: HealthStatus;
	failureRate: HealthMetric; // 0-1 (lower is better)
	latencyMs: HealthMetric; // milliseconds (lower is better)
	authStatus: "valid" | "expiring_soon" | "expired" | "unknown";
	authExpiresAt: number | null; // timestamp
	lastSuccess: number | null; // timestamp
	lastFailure: number | null; // timestamp
	consecutiveFailures: number;
	totalRequests: number;
	totalFailures: number;
}

// Health score configuration
interface HealthConfig {
	failureRateThreshold: number; // Above this is unhealthy
	latencyThresholdMs: number; // Above this is degraded
	authExpiryWarningMs: number; // Warn if expiring within this time
}

const DEFAULT_CONFIG: HealthConfig = {
	failureRateThreshold: 0.1, // 10% failure rate
	latencyThresholdMs: 2000, // 2 seconds
	authExpiryWarningMs: 24 * 60 * 60 * 1000, // 24 hours
};

// Internal metric tracking
interface MetricRecord {
	timestamp: number;
	success: boolean;
	latencyMs: number;
}

// Service tracking state
interface ServiceTracker {
	records: MetricRecord[];
	authExpiresAt: number | null;
}

/**
 * Calculate health score from metrics
 */
function calculateScore(
	failureRate: number,
	latencyMs: number,
	authStatus: IntegrationHealth["authStatus"],
	config: HealthConfig,
): number {
	let score = 100;

	// Deduct for failure rate (up to 40 points)
	const failureDeduction = Math.min(40, failureRate * 400);
	score -= failureDeduction;

	// Deduct for latency (up to 30 points)
	if (latencyMs > config.latencyThresholdMs) {
		const latencyRatio = latencyMs / config.latencyThresholdMs;
		const latencyDeduction = Math.min(30, (latencyRatio - 1) * 30);
		score -= latencyDeduction;
	}

	// Deduct for auth status (up to 30 points)
	if (authStatus === "expired") {
		score -= 30;
	} else if (authStatus === "expiring_soon") {
		score -= 10;
	}

	return Math.max(0, Math.round(score));
}

/**
 * Determine health status from score
 */
function getHealthStatus(score: number): HealthStatus {
	if (score >= 80) return "healthy";
	if (score >= 50) return "degraded";
	if (score >= 0) return "unhealthy";
	return "unknown";
}

/**
 * Determine auth status
 */
function getAuthStatus(
	expiresAt: number | null,
	config: HealthConfig,
): IntegrationHealth["authStatus"] {
	if (expiresAt === null) return "unknown";
	const now = Date.now();
	if (expiresAt <= now) return "expired";
	if (expiresAt <= now + config.authExpiryWarningMs) return "expiring_soon";
	return "valid";
}

/**
 * Hook for tracking integration health scores
 */
export function useIntegrationHealth(
	config: Partial<HealthConfig> = {},
): {
	health: Map<IntegrationService, IntegrationHealth>;
	recordRequest: (service: IntegrationService, success: boolean, latencyMs: number) => void;
	setAuthExpiry: (service: IntegrationService, expiresAt: number | null) => void;
	resetService: (service: IntegrationService) => void;
	resetAll: () => void;
	getServiceHealth: (service: IntegrationService) => IntegrationHealth | undefined;
	getOverallHealth: () => { score: number; status: HealthStatus };
} {
	const fullConfig = { ...DEFAULT_CONFIG, ...config };
	const [trackers, setTrackers] = useState<Map<IntegrationService, ServiceTracker>>(new Map());

	// Calculate health for all services
	const health = useMemo(() => {
		const result = new Map<IntegrationService, IntegrationHealth>();

		for (const [service, tracker] of trackers) {
			const recentRecords = tracker.records.filter(
				(r) => r.timestamp > Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
			);

			const totalRequests = recentRecords.length;
			const failures = recentRecords.filter((r) => !r.success);
			const totalFailures = failures.length;
			const failureRate = totalRequests > 0 ? totalFailures / totalRequests : 0;

			const avgLatency =
				recentRecords.length > 0
					? recentRecords.reduce((sum, r) => sum + r.latencyMs, 0) / recentRecords.length
					: 0;

			const lastSuccess = recentRecords.filter((r) => r.success)[0]?.timestamp ?? null;
			const lastFailure = failures[0]?.timestamp ?? null;
			const consecutiveFailures = countConsecutiveFailures(recentRecords);

			const authStatus = getAuthStatus(tracker.authExpiresAt, fullConfig);
			const overallScore = calculateScore(failureRate, avgLatency, authStatus, fullConfig);
			const status = getHealthStatus(overallScore);

			result.set(service, {
				service,
				overallScore,
				status,
				failureRate: {
					value: failureRate,
					threshold: fullConfig.failureRateThreshold,
					status: failureRate <= fullConfig.failureRateThreshold ? "healthy" : "unhealthy",
					lastUpdated: Date.now(),
				},
				latencyMs: {
					value: avgLatency,
					threshold: fullConfig.latencyThresholdMs,
					status: avgLatency <= fullConfig.latencyThresholdMs ? "healthy" : "degraded",
					lastUpdated: Date.now(),
				},
				authStatus,
				authExpiresAt: tracker.authExpiresAt,
				lastSuccess,
				lastFailure,
				consecutiveFailures,
				totalRequests,
				totalFailures,
			});
		}

		return result;
	}, [trackers, fullConfig]);

	// Record a request result
	const recordRequest = useCallback(
		(service: IntegrationService, success: boolean, latencyMs: number) => {
			setTrackers((prev) => {
				const newMap = new Map(prev);
				const tracker = newMap.get(service) ?? {
					records: [],
					authExpiresAt: null,
				};

				// Keep only last 100 records per service
				const records = [
					{ timestamp: Date.now(), success, latencyMs },
					...tracker.records,
				].slice(0, 100);

				newMap.set(service, { ...tracker, records });
				return newMap;
			});
		},
		[],
	);

	// Set auth expiry time
	const setAuthExpiry = useCallback((service: IntegrationService, expiresAt: number | null) => {
		setTrackers((prev) => {
			const newMap = new Map(prev);
			const tracker = newMap.get(service) ?? {
				records: [],
				authExpiresAt: null,
			};
			newMap.set(service, { ...tracker, authExpiresAt: expiresAt });
			return newMap;
		});
	}, []);

	// Reset a service's tracking data
	const resetService = useCallback((service: IntegrationService) => {
		setTrackers((prev) => {
			const newMap = new Map(prev);
			newMap.delete(service);
			return newMap;
		});
	}, []);

	// Reset all tracking data
	const resetAll = useCallback(() => {
		setTrackers(new Map());
	}, []);

	// Get health for a specific service
	const getServiceHealth = useCallback(
		(service: IntegrationService): IntegrationHealth | undefined => {
			return health.get(service);
		},
		[health],
	);

	// Get overall health across all services
	const getOverallHealth = useCallback((): { score: number; status: HealthStatus } => {
		if (health.size === 0) {
			return { score: 100, status: "unknown" };
		}

		const scores = Array.from(health.values()).map((h) => h.overallScore);
		const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

		return {
			score: Math.round(avgScore),
			status: getHealthStatus(avgScore),
		};
	}, [health]);

	return {
		health,
		recordRequest,
		setAuthExpiry,
		resetService,
		resetAll,
		getServiceHealth,
		getOverallHealth,
	};
}

/**
 * Count consecutive failures from the end of records
 */
function countConsecutiveFailures(records: MetricRecord[]): number {
	let count = 0;
	for (const record of records) {
		if (!record.success) {
			count++;
		} else {
			break;
		}
	}
	return count;
}

/**
 * Get health status color for display
 */
export function getHealthStatusColor(status: HealthStatus): string {
	switch (status) {
		case "healthy":
			return "var(--md-ref-color-primary)";
		case "degraded":
			return "#f59e0b"; // amber
		case "unhealthy":
			return "var(--md-ref-color-error)";
		case "unknown":
		default:
			return "var(--md-ref-color-outline)";
	}
}

/**
 * Get health status label for display
 */
export function getHealthStatusLabel(status: HealthStatus): string {
	switch (status) {
		case "healthy":
			return "正常";
		case "degraded":
			return "低下";
		case "unhealthy":
			return "異常";
		case "unknown":
		default:
			return "不明";
	}
}

/**
 * Get auth status label for display
 */
export function getAuthStatusLabel(status: IntegrationHealth["authStatus"]): string {
	switch (status) {
		case "valid":
			return "有効";
		case "expiring_soon":
			return "期限切れ間近";
		case "expired":
			return "期限切れ";
		case "unknown":
		default:
			return "不明";
	}
}
