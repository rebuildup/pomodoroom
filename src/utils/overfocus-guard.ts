const STORAGE_KEY = "pomodoroom-overfocus-override-logs";

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

function appendOverrideLog(entry: OverfocusOverrideLog): void {
	try {
		const current = getOverfocusOverrideLogs();
		current.push(entry);
		if (current.length > 200) current.splice(0, current.length - 200);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
	} catch {
		// Ignore storage failures.
	}
}

export function getOverfocusOverrideLogs(): OverfocusOverrideLog[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as OverfocusOverrideLog[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function applyOverfocusCooldown(input: OverfocusCooldownInput): number {
	const availableMax = Math.max(1, input.availableGapMinutes ?? Number.MAX_SAFE_INTEGER);
	const baseBreak = clamp(input.breakMinutes, 1, availableMax);

	if (input.streakLevel <= input.threshold) {
		return baseBreak;
	}

	if (input.overrideAcknowledged) {
		appendOverrideLog({
			at: new Date().toISOString(),
			reason: input.overrideReason ?? "user-override",
			streakLevel: input.streakLevel,
			breakMinutes: input.breakMinutes,
			minCooldownMinutes: input.minCooldownMinutes,
		});
		return baseBreak;
	}

	const enforced = Math.max(baseBreak, input.minCooldownMinutes);
	return clamp(enforced, 1, availableMax);
}
