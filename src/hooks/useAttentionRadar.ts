/**
 * Attention Radar - Focus loss prediction based on activity patterns
 *
 * Tracks user interaction patterns and predicts when focus is degrading.
 * Provides suggestions for breaks or task changes.
 *
 * This is a foundation/spike for the moonshot feature.
 */

import { useEffect, useRef, useState, useCallback } from "react";

// Activity metrics collected for analysis
export interface ActivityMetrics {
	timestamp: number;
	keyboardActivity: number; // keystrokes per minute
	mouseActivity: number; // mouse events per minute
	clickActivity: number; // clicks per minute
	scrollActivity: number; // scroll events per minute
	idleTime: number; // ms since last activity
}

// Focus state prediction
export type FocusState = "high" | "medium" | "low" | "idle";

// Focus prediction result
export interface FocusPrediction {
	state: FocusState;
	confidence: number; // 0-1
	indicators: string[];
	suggestion: string | null;
}

// Historical data point
interface ActivityDataPoint {
	timestamp: number;
	eventType: "keyboard" | "mouse" | "click" | "scroll";
}

// Configuration for attention detection
export interface AttentionRadarConfig {
	sampleWindowMs: number; // Time window for activity sampling
	idleThresholdMs: number; // Time without activity to consider idle
	lowActivityThreshold: number; // Events per minute for low activity
	highActivityThreshold: number; // Events per minute for high activity
	declineDetectionWindowMs: number; // Window to detect activity decline
	declineThreshold: number; // Percentage drop to trigger alert
}

const DEFAULT_CONFIG: AttentionRadarConfig = {
	sampleWindowMs: 60000, // 1 minute
	idleThresholdMs: 30000, // 30 seconds
	lowActivityThreshold: 10, // events per minute
	highActivityThreshold: 50, // events per minute
	declineDetectionWindowMs: 300000, // 5 minutes
	declineThreshold: 0.3, // 30% drop
};

/**
 * Hook for tracking attention patterns and predicting focus loss
 */
export function useAttentionRadar(config: Partial<AttentionRadarConfig> = {}): {
	metrics: ActivityMetrics | null;
	prediction: FocusPrediction | null;
	isTracking: boolean;
	startTracking: () => void;
	stopTracking: () => void;
	resetHistory: () => void;
} {
	const fullConfig = { ...DEFAULT_CONFIG, ...config };
	const [isTracking, setIsTracking] = useState(false);
	const [metrics, setMetrics] = useState<ActivityMetrics | null>(null);
	const [prediction, setPrediction] = useState<FocusPrediction | null>(null);

	// Refs for tracking events
	const activityHistory = useRef<ActivityDataPoint[]>([]);
	const lastActivityTime = useRef<number>(Date.now());
	const keyboardCount = useRef(0);
	const mouseCount = useRef(0);
	const clickCount = useRef(0);
	const scrollCount = useRef(0);

	// Record activity event
	const recordEvent = useCallback(
		(eventType: ActivityDataPoint["eventType"]) => {
			lastActivityTime.current = Date.now();

			switch (eventType) {
				case "keyboard":
					keyboardCount.current++;
					break;
				case "mouse":
					mouseCount.current++;
					break;
				case "click":
					clickCount.current++;
					break;
				case "scroll":
					scrollCount.current++;
					break;
			}

			activityHistory.current.push({
				timestamp: Date.now(),
				eventType,
			});

			// Keep history limited
			const cutoff = Date.now() - fullConfig.declineDetectionWindowMs * 2;
			activityHistory.current = activityHistory.current.filter((p) => p.timestamp > cutoff);
		},
		[fullConfig.declineDetectionWindowMs],
	);

	// Calculate current metrics
	const calculateMetrics = useCallback((): ActivityMetrics => {
		const now = Date.now();

		const minuteFraction = fullConfig.sampleWindowMs / 60000;

		return {
			timestamp: now,
			keyboardActivity: Math.round(keyboardCount.current / minuteFraction),
			mouseActivity: Math.round(mouseCount.current / minuteFraction),
			clickActivity: Math.round(clickCount.current / minuteFraction),
			scrollActivity: Math.round(scrollCount.current / minuteFraction),
			idleTime: now - lastActivityTime.current,
		};
	}, [fullConfig.sampleWindowMs]);

	// Predict focus state based on metrics
	const predictFocus = useCallback(
		(currentMetrics: ActivityMetrics): FocusPrediction => {
			const indicators: string[] = [];
			let suggestion: string | null = null;

			// Check for idle state
			if (currentMetrics.idleTime > fullConfig.idleThresholdMs) {
				return {
					state: "idle",
					confidence: 0.9,
					indicators: ["長時間の無操作"],
					suggestion: "休憩を取りますか？",
				};
			}

			// Calculate total activity
			const totalActivity =
				currentMetrics.keyboardActivity +
				currentMetrics.mouseActivity * 0.5 +
				currentMetrics.clickActivity +
				currentMetrics.scrollActivity * 0.3;

			// Check for activity decline
			const now = Date.now();
			const declineWindow = now - fullConfig.declineDetectionWindowMs;
			const recentHistory = activityHistory.current.filter((p) => p.timestamp > declineWindow);

			// Split into two halves for comparison
			const midpoint = declineWindow + fullConfig.declineDetectionWindowMs / 2;
			const firstHalf = recentHistory.filter((p) => p.timestamp < midpoint);
			const secondHalf = recentHistory.filter((p) => p.timestamp >= midpoint);

			let declineRate = 0;
			if (firstHalf.length > 10) {
				declineRate = 1 - secondHalf.length / firstHalf.length;
			}

			// Determine focus state
			let state: FocusState;
			let confidence: number;

			if (totalActivity >= fullConfig.highActivityThreshold) {
				state = "high";
				confidence = 0.8;
				indicators.push("高い活動レベル");
			} else if (totalActivity >= fullConfig.lowActivityThreshold) {
				state = "medium";
				confidence = 0.6;
				indicators.push("通常の活動レベル");
			} else {
				state = "low";
				confidence = 0.7;
				indicators.push("低い活動レベル");
			}

			// Check for decline
			if (declineRate > fullConfig.declineThreshold) {
				indicators.push(`活動低下: ${Math.round(declineRate * 100)}%`);
				confidence = Math.min(confidence + 0.1, 1);

				if (state !== "low") {
					state = "low";
				}

				suggestion = "集中力が低下しているようです。短い休憩を取りますか？";
			}

			// Check for mouse-only activity (possible distraction)
			if (
				currentMetrics.mouseActivity > currentMetrics.keyboardActivity * 3 &&
				currentMetrics.keyboardActivity < 5
			) {
				indicators.push("マウス操作が中心");
				confidence = Math.min(confidence + 0.1, 1);
				suggestion = "タスクに集中できていないかもしれません。タスクを変更しますか？";
			}

			return {
				state,
				confidence,
				indicators,
				suggestion,
			};
		},
		[fullConfig],
	);

	// Event handlers
	useEffect(() => {
		if (!isTracking) return;

		const handleKeyDown = () => recordEvent("keyboard");
		const handleMouseMove = () => recordEvent("mouse");
		const handleClick = () => recordEvent("click");
		const handleScroll = () => recordEvent("scroll");

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("click", handleClick);
		window.addEventListener("scroll", handleScroll);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("click", handleClick);
			window.removeEventListener("scroll", handleScroll);
		};
	}, [isTracking, recordEvent]);

	// Metrics calculation interval
	useEffect(() => {
		if (!isTracking) return;

		const interval = setInterval(() => {
			const newMetrics = calculateMetrics();
			setMetrics(newMetrics);
			setPrediction(predictFocus(newMetrics));

			// Reset counters
			keyboardCount.current = 0;
			mouseCount.current = 0;
			clickCount.current = 0;
			scrollCount.current = 0;
		}, 5000); // Update every 5 seconds

		return () => clearInterval(interval);
	}, [isTracking, calculateMetrics, predictFocus]);

	const startTracking = useCallback(() => {
		setIsTracking(true);
	}, []);

	const stopTracking = useCallback(() => {
		setIsTracking(false);
		setMetrics(null);
		setPrediction(null);
	}, []);

	const resetHistory = useCallback(() => {
		activityHistory.current = [];
		keyboardCount.current = 0;
		mouseCount.current = 0;
		clickCount.current = 0;
		scrollCount.current = 0;
		lastActivityTime.current = Date.now();
	}, []);

	return {
		metrics,
		prediction,
		isTracking,
		startTracking,
		stopTracking,
		resetHistory,
	};
}

/**
 * Get state label for display
 */
export function getFocusStateLabel(state: FocusState): string {
	switch (state) {
		case "high":
			return "高い集中";
		case "medium":
			return "通常";
		case "low":
			return "低下";
		case "idle":
			return "アイドル";
	}
}

/**
 * Get state color for display
 */
export function getFocusStateColor(state: FocusState): string {
	switch (state) {
		case "high":
			return "var(--md-ref-color-primary)";
		case "medium":
			return "var(--md-ref-color-secondary)";
		case "low":
			return "var(--md-ref-color-error)";
		case "idle":
			return "var(--md-ref-color-outline)";
	}
}
