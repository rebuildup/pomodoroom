/**
 * Gatekeeper Protocol - Rust-backed notification escalation
 *
 * This module provides TypeScript wrappers for the Rust gatekeeper commands.
 * The actual escalation logic now runs in Rust (src-tauri/src/gatekeeper.rs)
 * to ensure reliable timing even when the app is in the background.
 *
 * Replaces: src/utils/notification-escalation.ts
 */

import { invoke } from "@tauri-apps/api/core";

// Re-export types for compatibility
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

/** Quiet hours policy */
export interface QuietHoursPolicy {
	enabled: boolean;
	startHour: number;
	endHour: number;
}

/** Gatekeeper state from Rust backend */
export interface GatekeeperStateJson {
	level: "nudge" | "alert" | "gravity";
	completedAt: string; // ISO timestamp
	breakDebtMs: number;
	promptKey: string;
}

// === Gatekeeper Commands (Rust-backed) ===

/**
 * Start gatekeeper tracking for a completed timer.
 *
 * @param promptKey - Unique prompt identifier
 * @param completedAtMs - Unix timestamp (milliseconds) when timer completed
 */
export async function gatekeeperStart(promptKey: string, completedAtMs: number): Promise<void> {
	await invoke("cmd_gatekeeper_start", {
		promptKey,
		completedAtMs,
	});
}

/**
 * Stop gatekeeper tracking.
 */
export async function gatekeeperStop(): Promise<void> {
	await invoke("cmd_gatekeeper_stop");
}

/**
 * Get current gatekeeper state.
 */
export async function gatekeeperGetState(): Promise<GatekeeperStateJson | null> {
	return await invoke("cmd_gatekeeper_get_state");
}

/**
 * Get notification channel for current gatekeeper state.
 *
 * @param isDnd - Is DND enabled?
 * @param isQuietHours - Is currently in quiet hours?
 */
export async function gatekeeperGetNotificationChannel(
	isDnd: boolean,
	isQuietHours: boolean,
): Promise<NotificationChannel> {
	return await invoke("cmd_gatekeeper_get_notification_channel", {
		isDnd,
		isQuietHours,
	});
}

/**
 * Update gatekeeper with current time and return escalation state.
 *
 * Should be called periodically (e.g., every second) to update
 * escalation level based on elapsed time.
 */
export async function gatekeeperTick(): Promise<GatekeeperStateJson | null> {
	return await invoke("cmd_gatekeeper_tick");
}

/**
 * Check if notification can be dismissed (Gravity level cannot be dismissed).
 */
export async function gatekeeperCanDismiss(): Promise<boolean> {
	return await invoke("cmd_gatekeeper_can_dismiss");
}

/**
 * Check if a given time is within quiet hours.
 *
 * @param timestampMs - Unix timestamp (milliseconds) to check
 * @param policy - Quiet hours policy
 */
export async function gatekeeperIsQuietHours(
	timestampMs: number,
	policy: QuietHoursPolicy,
): Promise<boolean> {
	return await invoke("cmd_gatekeeper_is_quiet_hours", {
		timestampMs,
		policy,
	});
}

/**
 * Generate prompt key for critical start notification.
 *
 * @param taskId - Task identifier
 */
export async function gatekeeperCriticalStartKey(taskId: string): Promise<string> {
	return await invoke("cmd_gatekeeper_critical_start_key", { taskId });
}

// === Compatibility Functions (Legacy API) ===

/**
 * Get escalation decision for a prompt.
 *
 * @param _promptKey - Unique prompt identifier (unused in new Rust implementation)
 * @param context - Escalation context
 * @returns Escalation decision
 */
export async function getEscalationDecision(
	_promptKey: string,
	context: EscalationContext,
): Promise<EscalationDecision> {
	const channel = await gatekeeperGetNotificationChannel(context.isDnd, context.isQuietHours);
	return { channel };
}

/**
 * Acknowledge a prompt, stopping gatekeeper tracking.
 *
 * @param _promptKey - Unique prompt identifier (unused in new Rust implementation)
 */
export async function acknowledgePrompt(_promptKey: string): Promise<void> {
	// Stop gatekeeper tracking
	await gatekeeperStop();
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
 * Read quiet hours policy.
 * Database-only architecture - returns defaults.
 *
 * @returns Quiet hours policy
 */
export function readQuietHoursPolicy(): QuietHoursPolicy {
	// No localStorage persistence - database-only architecture
	return {
		enabled: true,
		startHour: 22,
		endHour: 7,
	};
}

/**
 * Check if given date/time is within quiet hours.
 *
 * Uses Rust-backed implementation.
 *
 * @param date - Date to check
 * @param policy - Quiet hours policy
 * @returns True if within quiet hours
 */
export async function isQuietHours(date: Date, policy: QuietHoursPolicy): Promise<boolean> {
	const timestampMs = date.getTime();
	return await gatekeeperIsQuietHours(timestampMs, policy);
}

/**
 * Mark a prompt as ignored.
 *
 * Note: This is now handled by the Rust gatekeeper's escalation levels
 * (Nudge -> Alert -> Gravity) based on elapsed time, not by counting
 * individual ignored channels like the old TypeScript implementation.
 *
 * @param promptKey - Unique prompt identifier
 * @param channel - Channel that was ignored (unused, kept for compatibility)
 */
export async function markPromptIgnored(
	promptKey: string,
	_channel: NotificationChannel,
): Promise<void> {
	// No-op - escalation is now time-based in Rust
	// The gatekeeper automatically escalates based on elapsed time
	console.debug(
		`[gatekeeper] markPromptIgnored called for ${promptKey}, escalation is now time-based`,
	);
}

/**
 * Compute escalation channel based on state.
 *
 * @param context - Escalation context
 * @returns Escalation decision
 */
export async function computeEscalationChannel(
	context: EscalationContext,
): Promise<EscalationDecision> {
	const channel = await gatekeeperGetNotificationChannel(context.isDnd, context.isQuietHours);
	return { channel };
}
