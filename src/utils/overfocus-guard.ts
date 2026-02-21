// localStorage persistence removed - database-only architecture

export interface OverfocusOverrideLog {
	at: string;
	reason: string;
	streakLevel: number;
	breakMinutes: number;
	minCooldownMinutes: number;
}

export interface OverfocusCooldownInput {
	streakLevel: number;
	breakMinutes: number;
	availableGapMinutes?: number;
	threshold: number;
	minCooldownMinutes: number;
	overrideAcknowledged?: boolean;
	overrideReason?: string;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// Log function removed - database-only architecture

export function getOverfocusOverrideLogs(): OverfocusOverrideLog[] {
	// Always return empty - no persistence
	return [];
}

export function applyOverfocusCooldown(input: OverfocusCooldownInput): number {
	const availableMax = Math.max(1, input.availableGapMinutes ?? Number.MAX_SAFE_INTEGER);
	const baseBreak = clamp(input.breakMinutes, 1, availableMax);

	if (input.streakLevel <= input.threshold) {
		return baseBreak;
	}

	// No override logging - database-only architecture

	const enforced = Math.max(baseBreak, input.minCooldownMinutes);
	return clamp(enforced, 1, availableMax);
}
