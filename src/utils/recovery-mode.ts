import { getOverfocusOverrideLogs } from "@/utils/overfocus-guard";

export interface RecoveryModeOptions {
	enabled?: boolean;
	skipThreshold?: number;
	recoveryFocusMinutes?: number;
}

export function getBreakSkipStreak(): number {
	const logs = getOverfocusOverrideLogs();
	let streak = 0;
	for (let i = logs.length - 1; i >= 0; i--) {
		const log = logs[i];
		if (!log) break;
		if ((log.reason ?? "").trim().length === 0) break;
		streak += 1;
	}
	return streak;
}

export function shouldEnterRecoveryMode(skipStreak: number, skipThreshold: number): boolean {
	return skipStreak >= skipThreshold;
}
