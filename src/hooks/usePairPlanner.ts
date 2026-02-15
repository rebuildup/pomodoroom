/**
 * AI Pair Planner - Conversational next-day planning assistant
 *
 * Analyzes past session data and provides conversational assistance
 * for planning the next day's tasks. This is a foundation/spike
 * for the moonshot feature.
 *
 * Design goals:
 * - Learn from past session patterns (focus time, break effectiveness, etc.)
 * - Suggest optimal task scheduling based on historical data
 * - Provide conversational interface for plan refinement
 */

import { useCallback, useMemo, useState } from "react";
import type { SessionData, StatsData } from "./useStats";

// Planner conversation message
export interface PlannerMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

// Planning suggestion generated from analysis
export interface PlanningSuggestion {
	id: string;
	type: "task" | "break" | "focus_time" | "warning";
	title: string;
	description: string;
	confidence: number; // 0-1
	reason: string;
	suggestedStart?: string; // ISO time
	suggestedDuration?: number; // minutes
}

// Day pattern analysis result
export interface DayPatternAnalysis {
	peakFocusHours: number[]; // Hours of day with highest productivity
	averageFocusSessionLength: number; // minutes
	breakEffectiveness: number; // 0-1
	taskCompletionRate: number; // 0-1
	commonInterruptionTimes: number[]; // Hours
	recommendedFocusWindows: Array<{
		start: string; // HH:MM
		end: string; // HH:MM
		reason: string;
	}>;
}

// Planner state
export interface PlannerState {
	messages: PlannerMessage[];
	suggestions: PlanningSuggestion[];
	analysis: DayPatternAnalysis | null;
	isGenerating: boolean;
}

/**
 * Analyze session data to extract patterns
 */
function analyzePatterns(sessions: SessionData[]): DayPatternAnalysis {
	if (sessions.length === 0) {
		return {
			peakFocusHours: [],
			averageFocusSessionLength: 25,
			breakEffectiveness: 0.5,
			taskCompletionRate: 0.5,
			commonInterruptionTimes: [],
			recommendedFocusWindows: [],
		};
	}

	// Filter focus sessions
	const focusSessions = sessions.filter((s) => s.step_type === "focus");
	const breakSessions = sessions.filter((s) => s.step_type === "break");

	// Analyze hourly distribution
	const hourlyFocus: Record<number, number> = {};
	for (const session of focusSessions) {
		const hour = new Date(session.completed_at).getHours();
		hourlyFocus[hour] = (hourlyFocus[hour] || 0) + session.duration_min;
	}

	// Find peak hours (top 3)
	const sortedHours = Object.entries(hourlyFocus)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([hour]) => Number(hour));

	// Calculate average session length
	const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + s.duration_min, 0);
	const avgSessionLength = focusSessions.length > 0 ? totalFocusMinutes / focusSessions.length : 25;

	// Calculate break effectiveness (ratio of breaks to focus)
	const breakRatio = breakSessions.length / Math.max(focusSessions.length, 1);
	const breakEffectiveness = Math.min(1, breakRatio / 0.25); // Ideal is ~25% break time

	// Generate recommended focus windows
	const recommendedWindows: DayPatternAnalysis["recommendedFocusWindows"] = [];
	if (sortedHours.length > 0) {
		const firstPeak = sortedHours[0];
		recommendedWindows.push({
			start: `${String(firstPeak).padStart(2, "0")}:00`,
			end: `${String((firstPeak + 2) % 24).padStart(2, "0")}:00`,
			reason: "過去のデータから、この時間帯が最も集中力が高い傾向にあります",
		});

		// Add afternoon window if different
		const afternoonPeak = sortedHours.find((h) => h >= 13 && h !== firstPeak);
		if (afternoonPeak) {
			recommendedWindows.push({
				start: `${String(afternoonPeak).padStart(2, "0")}:00`,
				end: `${String((afternoonPeak + 2) % 24).padStart(2, "0")}:00`,
				reason: "午後の生産的な時間帯",
			});
		}
	}

	return {
		peakFocusHours: sortedHours,
		averageFocusSessionLength: Math.round(avgSessionLength),
		breakEffectiveness,
		taskCompletionRate: 0.5, // Placeholder - would need more data
		commonInterruptionTimes: [],
		recommendedFocusWindows: recommendedWindows,
	};
}

/**
 * Generate planning suggestions based on analysis
 */
function generateSuggestions(
	analysis: DayPatternAnalysis,
	stats: StatsData,
): PlanningSuggestion[] {
	const suggestions: PlanningSuggestion[] = [];

	// Peak time suggestion
	if (analysis.peakFocusHours.length > 0) {
		const peakHour = analysis.peakFocusHours[0];
		suggestions.push({
			id: "peak-focus",
			type: "focus_time",
			title: "最適な集中タイム",
			description: `${peakHour}時台は最も生産的な時間帯です。重要なタスクをこの時間に配置することをお勧めします。`,
			confidence: 0.8,
			reason: `${analysis.peakFocusHours.length}個のピーク時間を検出`,
			suggestedStart: `${String(peakHour).padStart(2, "0")}:00`,
			suggestedDuration: 120,
		});
	}

	// Break pattern suggestion
	if (analysis.breakEffectiveness < 0.5) {
		suggestions.push({
			id: "more-breaks",
			type: "break",
			title: "休憩頻度の改善",
			description: "休憩の頻度が低い傾向にあります。25分作業ごとに5分の休憩を推奨します。",
			confidence: 0.7,
			reason: `現在の休憩効率スコア: ${Math.round(analysis.breakEffectiveness * 100)}%`,
		});
	}

	// Session length suggestion
	if (analysis.averageFocusSessionLength > 45) {
		suggestions.push({
			id: "session-length",
			type: "warning",
			title: "セッション長の見直し",
			description: "平均セッション時間が長めです。25-45分程度に分割することで集中力を維持できます。",
			confidence: 0.6,
			reason: `平均${Math.round(analysis.averageFocusSessionLength)}分`,
		});
	}

	// General planning suggestion
	suggestions.push({
		id: "daily-plan",
		type: "task",
		title: "翌日の計画",
		description: `${stats.sessionCount}回のセッション実績を基に、明日の計画を立てましょう。`,
		confidence: 0.5,
		reason: "過去の実績データに基づく提案",
	});

	return suggestions;
}

/**
 * Generate assistant response based on user input
 */
function generateAssistantResponse(
	userMessage: string,
	analysis: DayPatternAnalysis,
	suggestions: PlanningSuggestion[],
): string {
	const lowerMessage = userMessage.toLowerCase();

	// Check for time-related questions
	if (lowerMessage.includes("時間") || lowerMessage.includes("when")) {
		if (analysis.peakFocusHours.length > 0) {
			return `${analysis.peakFocusHours[0]}時台が最も集中できる時間帯のようです。この時間に重要なタスクを配置するのはいかがでしょうか？`;
		}
		return "データから最適な時間を分析中です。もう少しデータが溜まれば、より正確な提案ができます。";
	}

	// Check for task planning questions
	if (lowerMessage.includes("タスク") || lowerMessage.includes("task")) {
		return `明日の計画についてですね。${suggestions.length}つの提案があります。まず、${analysis.peakFocusHours[0] || 9}時台から重要なタスクを始めてみてはいかがでしょうか？`;
	}

	// Check for break-related questions
	if (lowerMessage.includes("休憩") || lowerMessage.includes("break")) {
		if (analysis.breakEffectiveness < 0.5) {
			return "休憩の頻度を増やすことをお勧めします。ポモドーロテクニックでは25分作業+5分休憩が基本です。";
		}
		return "現在の休憩バランスは良好です。このペースを維持しましょう。";
	}

	// Default response
	return "明日の計画を立てましょう。どの時間帯に集中したいですか？または、どのようなタスクを予定していますか？";
}

/**
 * Hook for AI pair-planning assistance
 */
export function usePairPlanner(
	sessions: SessionData[],
	stats: StatsData,
): {
	state: PlannerState;
	sendMessage: (content: string) => void;
	clearHistory: () => void;
} {
	const [messages, setMessages] = useState<PlannerMessage[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);

	// Analyze patterns from session data
	const analysis = useMemo(() => analyzePatterns(sessions), [sessions]);

	// Generate suggestions from analysis
	const suggestions = useMemo(
		() => generateSuggestions(analysis, stats),
		[analysis, stats],
	);

	// Send a message to the planner
	const sendMessage = useCallback(
		(content: string) => {
			// Add user message
			const userMessage: PlannerMessage = {
				id: `msg-${Date.now()}-user`,
				role: "user",
				content,
				timestamp: Date.now(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setIsGenerating(true);

			// Generate assistant response (simulated delay)
			setTimeout(() => {
				const response = generateAssistantResponse(content, analysis, suggestions);
				const assistantMessage: PlannerMessage = {
					id: `msg-${Date.now()}-assistant`,
					role: "assistant",
					content: response,
					timestamp: Date.now(),
				};
				setMessages((prev) => [...prev, assistantMessage]);
				setIsGenerating(false);
			}, 500);
		},
		[analysis, suggestions],
	);

	// Clear conversation history
	const clearHistory = useCallback(() => {
		setMessages([]);
	}, []);

	return {
		state: {
			messages,
			suggestions,
			analysis,
			isGenerating,
		},
		sendMessage,
		clearHistory,
	};
}

/**
 * Format time for display (HH:MM)
 */
export function formatPlannerTime(time: string | undefined): string {
	if (!time) return "未定";
	return time;
}

/**
 * Get suggestion type icon
 */
export function getSuggestionTypeIcon(type: PlanningSuggestion["type"]): string {
	switch (type) {
		case "task":
			return "assignment";
		case "break":
			return "coffee";
		case "focus_time":
			return "timer";
		case "warning":
			return "warning";
		default:
			return "info";
	}
}
