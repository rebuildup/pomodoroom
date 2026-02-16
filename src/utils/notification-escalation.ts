/**
 * Notification escalation utilities.
 *
 * Implements an escalation ladder: badge -> toast -> modal
 * Respects DND and quiet hours settings.
 */

/** Available notification channels */
export type NotificationChannel = "badge" | "toast" | "modal";

/** Context for escalation decision */
export interface EscalationContext {
	isDnd: boolean;
	isQuietHours: boolean;
}

/** Escalation decision result */
export interface EscalationDecision {
	channel: NotificationChannel;
}

/** Options for computing escalation channel */
export interface EscalationOptions {
	ignoredCount: number;
	isQuietHours: boolean;
	isDnd: boolean;
}

/** Quiet hours policy */
export interface QuietHoursPolicy {
	enabled: boolean;
	startHour: number;
	endHour: number;
}

const STORAGE_KEY_PREFIX = "notification_escalation:";
const QUIET_HOURS_KEY = "notification_quiet_hours";

/**
 * Get escalation decision for a prompt.
 *
 * @param promptKey - Unique prompt identifier
 * @param context - Escalation context
 * @returns Escalation decision
 */
export function getEscalationDecision(
	promptKey: string,
	context: EscalationContext
): EscalationDecision {
	const ignoredCount = getIgnoredCount(promptKey);
	const channel = computeEscalationChannel({
		ignoredCount,
		isQuietHours: context.isQuietHours,
		isDnd: context.isDnd,
	}).channel;
	return { channel };
}

/**
 * Mark a prompt as ignored for a specific channel.
 *
 * @param promptKey - Unique prompt identifier
 * @param channel - Channel that was ignored
 */
export function markPromptIgnored(
	promptKey: string,
	channel: NotificationChannel
): void {
	const key = `${STORAGE_KEY_PREFIX}${promptKey}`;
	const data = JSON.parse(localStorage.getItem(key) || "{}") as {
		ignoredChannels?: NotificationChannel[];
	};
	const ignoredChannels = data.ignoredChannels || [];
	if (!ignoredChannels.includes(channel)) {
		ignoredChannels.push(channel);
	}
	localStorage.setItem(key, JSON.stringify({ ignoredChannels }));
}

/**
 * Acknowledge a prompt, resetting the escalation ladder.
 *
 * @param promptKey - Unique prompt identifier
 */
export function acknowledgePrompt(promptKey: string): void {
	const key = `${STORAGE_KEY_PREFIX}${promptKey}`;
	localStorage.removeItem(key);
}

/**
 * Compute escalation channel based on state.
 *
 * @param options - Escalation options
 * @returns Escalation decision
 */
export function computeEscalationChannel(
	options: EscalationOptions
): EscalationDecision {
	// DND always wins - only badge allowed
	if (options.isDnd) {
		return { channel: "badge" };
	}

	// Quiet hours always wins - only badge allowed
	if (options.isQuietHours) {
		return { channel: "badge" };
	}

	// Escalation ladder based on ignore count
	if (options.ignoredCount >= 2) {
		return { channel: "modal" };
	} else if (options.ignoredCount >= 1) {
		return { channel: "toast" };
	}
	return { channel: "badge" };
}

/**
 * Read quiet hours policy from storage with fallback defaults.
 *
 * @returns Quiet hours policy
 */
export function readQuietHoursPolicy(): QuietHoursPolicy {
	const stored = localStorage.getItem(QUIET_HOURS_KEY);
	if (stored) {
		try {
			return JSON.parse(stored) as QuietHoursPolicy;
		} catch {
			// Fall through to defaults
		}
	}
	return {
		enabled: true,
		startHour: 22,
		endHour: 7,
	};
}

/**
 * Check if given date/time is within quiet hours.
 *
 * @param date - Date to check
 * @param policy - Quiet hours policy
 * @returns True if within quiet hours
 */
export function isQuietHours(
	date: Date,
	policy: QuietHoursPolicy
): boolean {
	if (!policy.enabled) {
		return false;
	}

	const hour = date.getHours();

	// Overnight window (e.g., 22:00 - 07:00)
	if (policy.startHour > policy.endHour) {
		return hour >= policy.startHour || hour < policy.endHour;
	}

	// Daytime window (e.g., 12:00 - 17:00)
	return hour >= policy.startHour && hour < policy.endHour;
}

/**
 * Generate prompt key for critical start notification.
 *
 * @param taskId - Task identifier
 * @returns Prompt key string
 */
export function toCriticalStartPromptKey(taskId: string): string {
	return `critical-start:${taskId}`;
}

/**
 * Get ignored count for a prompt.
 *
 * @param promptKey - Unique prompt identifier
 * @returns Number of times prompt was ignored
 */
function getIgnoredCount(promptKey: string): number {
	const key = `${STORAGE_KEY_PREFIX}${promptKey}`;
	const data = JSON.parse(localStorage.getItem(key) || "{}") as {
		ignoredChannels?: NotificationChannel[];
	};
	return (data.ignoredChannels || []).length;
}
