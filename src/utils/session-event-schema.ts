/**
 * Session Event Schema v2 - Richer analytics metadata
 *
 * Upgraded session schema with additional fields for:
 * - Adaptation stage tracking
 * - Break debt accumulation
 * - Interruption source classification
 *
 * Version: 2
 */

// Schema version constant
export const SESSION_SCHEMA_VERSION = 2;

// Adaptation stages for focus optimization
export type AdaptationStage =
	| "initial" // First few sessions, still calibrating
	| "ramping_up" // Increasing focus duration
	| "stable" // Consistent performance
	| "plateaued" // No improvement, may need adjustment
	| "declining"; // Performance degradation detected

// Break debt types
export type BreakDebtType =
	| "none" // No debt
	| "minor" // 1-2 missed breaks
	| "moderate" // 3-4 missed breaks
	| "severe"; // 5+ missed breaks

// Interruption sources
export type InterruptionSource =
	| "none" // No interruption
	| "internal" // Self-initiated (distraction, restlessness)
	| "external_person" // Other person interrupted
	| "external_notification" // Phone, email, chat
	| "external_environment" // Noise, temperature, etc.
	| "system" // App crash, power outage, etc.
	| "unknown"; // Source unclear

// Session step types
export type SessionStepType = "focus" | "short_break" | "long_break";

// Session event v2 schema
export interface SessionEventV2 {
	// Schema version
	schemaVersion: 2;

	// Core fields (from v1)
	id: string;
	sessionId: string;
	stepType: SessionStepType;
	startedAt: number;
	completedAt: number;
	durationMin: number;
	taskId: string | null;
	taskTitle: string | null;

	// V2 additions
	adaptationStage: AdaptationStage;
	breakDebt: {
		type: BreakDebtType;
		accumulatedMinutes: number;
		sessionsSinceLastBreak: number;
	};
	interruption: {
		source: InterruptionSource;
		count: number;
		totalMinutesLost: number;
	};
	context: {
		timeOfDay: "morning" | "afternoon" | "evening" | "night";
		dayOfWeek: number; // 0-6
		isWeekend: boolean;
		deviceType: "desktop" | "mobile";
	};
	quality: {
		focusScore: number | null; // 0-100, user-rated or inferred
		wasCompleted: boolean;
		earlyTerminationReason?: string;
	};
}

// Legacy session event (v1)
export interface SessionEventV1 {
	id: string;
	sessionId: string;
	step_type: string;
	started_at: number;
	completed_at: number;
	duration_min: number;
	task_id: string | null;
	task_title: string | null;
}

// Migration result
export interface MigrationResult {
	success: boolean;
	migratedCount: number;
	failedCount: number;
	errors: string[];
}

/**
 * Get time of day from timestamp
 */
function getTimeOfDay(timestamp: number): SessionEventV2["context"]["timeOfDay"] {
	const hour = new Date(timestamp).getHours();

	if (hour >= 5 && hour < 12) return "morning";
	if (hour >= 12 && hour < 17) return "afternoon";
	if (hour >= 17 && hour < 21) return "evening";
	return "night";
}

/**
 * Get day of week info from timestamp
 */
function getDayInfo(timestamp: number): { dayOfWeek: number; isWeekend: boolean } {
	const date = new Date(timestamp);
	const dayOfWeek = date.getDay();
	const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

	return { dayOfWeek, isWeekend };
}

/**
 * Determine adaptation stage based on session history
 */
function determineAdaptationStage(sessionCount: number): AdaptationStage {
	if (sessionCount < 5) return "initial";
	if (sessionCount < 15) return "ramping_up";
	if (sessionCount < 50) return "stable";
	if (sessionCount < 100) return "plateaued";
	return "declining"; // May need recalibration
}

/**
 * Calculate break debt from consecutive sessions
 */
function calculateBreakDebt(
	sessionsSinceLastBreak: number,
	accumulatedMinutes: number,
): SessionEventV2["breakDebt"] {
	let type: BreakDebtType = "none";

	if (sessionsSinceLastBreak >= 5) {
		type = "severe";
	} else if (sessionsSinceLastBreak >= 3) {
		type = "moderate";
	} else if (sessionsSinceLastBreak >= 1) {
		type = "minor";
	}

	return {
		type,
		accumulatedMinutes,
		sessionsSinceLastBreak,
	};
}

/**
 * Migrate v1 session event to v2
 */
export function migrateV1ToV2(
	v1: SessionEventV1,
	options?: {
		sessionCount?: number;
		sessionsSinceLastBreak?: number;
		accumulatedBreakDebt?: number;
		deviceType?: "desktop" | "mobile";
	},
): SessionEventV2 {
	const { dayOfWeek, isWeekend } = getDayInfo(v1.completed_at);
	const sessionCount = options?.sessionCount ?? 10;

	return {
		schemaVersion: 2,

		// Core fields
		id: v1.id,
		sessionId: v1.sessionId,
		stepType: v1.step_type as SessionStepType,
		startedAt: v1.started_at,
		completedAt: v1.completed_at,
		durationMin: v1.duration_min,
		taskId: v1.task_id,
		taskTitle: v1.task_title,

		// V2 additions with defaults
		adaptationStage: determineAdaptationStage(sessionCount),
		breakDebt: calculateBreakDebt(
			options?.sessionsSinceLastBreak ?? 0,
			options?.accumulatedBreakDebt ?? 0,
		),
		interruption: {
			source: "none",
			count: 0,
			totalMinutesLost: 0,
		},
		context: {
			timeOfDay: getTimeOfDay(v1.completed_at),
			dayOfWeek,
			isWeekend,
			deviceType: options?.deviceType ?? "desktop",
		},
		quality: {
			focusScore: null,
			wasCompleted: true,
		},
	};
}

/**
 * Batch migrate v1 events to v2
 */
export function batchMigrateV1ToV2(
	v1Events: SessionEventV1[],
	options?: {
		deviceType?: "desktop" | "mobile";
	},
): MigrationResult {
	const result: MigrationResult = {
		success: true,
		migratedCount: 0,
		failedCount: 0,
		errors: [],
	};

	let sessionsSinceLastBreak = 0;
	let accumulatedBreakDebt = 0;

	for (const v1 of v1Events) {
		try {
			// Track break debt
			if (v1.step_type === "focus") {
				sessionsSinceLastBreak++;
				accumulatedBreakDebt += v1.duration_min;
			} else {
				// Reset on break
				sessionsSinceLastBreak = 0;
				accumulatedBreakDebt = 0;
			}

			migrateV1ToV2(v1, {
				sessionCount: result.migratedCount + 1,
				sessionsSinceLastBreak,
				accumulatedBreakDebt,
				deviceType: options?.deviceType,
			});

			result.migratedCount++;
		} catch (error) {
			result.failedCount++;
			result.errors.push(
				`Failed to migrate event ${v1.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	result.success = result.failedCount === 0;
	return result;
}

/**
 * Create a new v2 session event
 */
export function createSessionEventV2(
	params: {
		id: string;
		sessionId: string;
		stepType: SessionStepType;
		taskId?: string;
		taskTitle?: string;
	},
	context?: {
		sessionCount?: number;
		sessionsSinceLastBreak?: number;
		accumulatedBreakDebt?: number;
		deviceType?: "desktop" | "mobile";
	},
): SessionEventV2 {
	const now = Date.now();
	const { dayOfWeek, isWeekend } = getDayInfo(now);

	return {
		schemaVersion: 2,
		id: params.id,
		sessionId: params.sessionId,
		stepType: params.stepType,
		startedAt: 0, // To be set when started
		completedAt: 0, // To be set when completed
		durationMin: 0, // To be calculated
		taskId: params.taskId ?? null,
		taskTitle: params.taskTitle ?? null,
		adaptationStage: determineAdaptationStage(context?.sessionCount ?? 0),
		breakDebt: calculateBreakDebt(
			context?.sessionsSinceLastBreak ?? 0,
			context?.accumulatedBreakDebt ?? 0,
		),
		interruption: {
			source: "none",
			count: 0,
			totalMinutesLost: 0,
		},
		context: {
			timeOfDay: getTimeOfDay(now),
			dayOfWeek,
			isWeekend,
			deviceType: context?.deviceType ?? "desktop",
		},
		quality: {
			focusScore: null,
			wasCompleted: false,
		},
	};
}

/**
 * Get adaptation stage display name
 */
export function getAdaptationStageDisplayName(stage: AdaptationStage): string {
	const names: Record<AdaptationStage, string> = {
		initial: "初期段階",
		ramping_up: "上昇中",
		stable: "安定",
		plateaued: "横ばい",
		declining: "低下",
	};

	return names[stage];
}

/**
 * Get break debt display name
 */
export function getBreakDebtDisplayName(debt: BreakDebtType): string {
	const names: Record<BreakDebtType, string> = {
		none: "なし",
		minor: "軽微",
		moderate: "中程度",
		severe: "深刻",
	};

	return names[debt];
}

/**
 * Get interruption source display name
 */
export function getInterruptionSourceDisplayName(source: InterruptionSource): string {
	const names: Record<InterruptionSource, string> = {
		none: "なし",
		internal: "内部要因",
		external_person: "他者による",
		external_notification: "通知",
		external_environment: "環境要因",
		system: "システム",
		unknown: "不明",
	};

	return names[source];
}

/**
 * Validate session event v2
 */
export function validateSessionEventV2(event: unknown): event is SessionEventV2 {
	if (typeof event !== "object" || event === null) return false;

	const e = event as Partial<SessionEventV2>;

	// Check required fields
	if (e.schemaVersion !== 2) return false;
	if (typeof e.id !== "string") return false;
	if (typeof e.sessionId !== "string") return false;
	if (!["focus", "short_break", "long_break"].includes(e.stepType ?? "")) return false;
	if (typeof e.startedAt !== "number") return false;
	if (typeof e.completedAt !== "number") return false;
	if (typeof e.durationMin !== "number") return false;

	// Check nested objects
	if (!e.breakDebt || typeof e.breakDebt !== "object") return false;
	if (!e.interruption || typeof e.interruption !== "object") return false;
	if (!e.context || typeof e.context !== "object") return false;
	if (!e.quality || typeof e.quality !== "object") return false;

	return true;
}
