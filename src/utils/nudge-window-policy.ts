import type { NotificationButton } from "@/types/notification";

export interface NudgePolicyConfig {
	suppressDuringRunningFocus: boolean;
	deferMinutes: number;
	safeWindowStartHour: number;
	safeWindowEndHour: number;
}

export interface NudgePolicyContext {
	hasRunningFocus: boolean;
	now: Date;
}

export interface NudgeNotification {
	title: string;
	message: string;
	buttons: NotificationButton[];
}

interface DeferredNudge {
	notification: NudgeNotification;
	replayAfterIso: string;
	queuedAtIso: string;
}

interface NudgeMetrics {
	shown: number;
	deferred: number;
	replayed: number;
	accepted: number;
	dismissed: number;
}

// localStorage persistence removed - database-only architecture
const CONFIG_KEY = "nudge_policy_config";
const QUEUE_KEY = "nudge_deferred_queue";
const METRICS_KEY = "nudge_metrics";

const DEFAULT_CONFIG: NudgePolicyConfig = {
	suppressDuringRunningFocus: true,
	deferMinutes: 8,
	safeWindowStartHour: 8,
	safeWindowEndHour: 22,
};

const DEFAULT_METRICS: NudgeMetrics = {
	shown: 0,
	deferred: 0,
	replayed: 0,
	accepted: 0,
	dismissed: 0,
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function readJson<T>(_key: string, fallback: T): T {
	// Always return fallback - no persistence
	return fallback;
}

function writeJson(_key: string, _value: unknown): void {
	// No-op - database-only architecture
}

function isUrgentNotification(notification: NudgeNotification): boolean {
	const text = `${notification.title} ${notification.message}`.toLowerCase();
	if (text.includes("critical") || text.includes("緊急") || text.includes("overload")) return true;
	return notification.buttons.some((button) => {
		const keys = Object.keys(button.action);
		// User-initiated task operations are always urgent
		return keys.some((key) =>
			key === "complete" ||
			key === "pause" ||
			key === "interrupt_task" ||
			key === "complete_task" ||
			key === "extend_task" ||
			key === "delete_task" ||
			key === "defer_task_until" ||
			key === "start_task"
		);
	});
}

export function getNudgePolicyConfig(): NudgePolicyConfig {
	const raw = readJson<Partial<NudgePolicyConfig>>(CONFIG_KEY, DEFAULT_CONFIG);
	return {
		suppressDuringRunningFocus: raw.suppressDuringRunningFocus ?? DEFAULT_CONFIG.suppressDuringRunningFocus,
		deferMinutes: clamp(raw.deferMinutes ?? DEFAULT_CONFIG.deferMinutes, 1, 60),
		safeWindowStartHour: clamp(raw.safeWindowStartHour ?? DEFAULT_CONFIG.safeWindowStartHour, 0, 23),
		safeWindowEndHour: clamp(raw.safeWindowEndHour ?? DEFAULT_CONFIG.safeWindowEndHour, 0, 23),
	};
}

export function setNudgePolicyConfig(next: Partial<NudgePolicyConfig>): NudgePolicyConfig {
	const merged = { ...getNudgePolicyConfig(), ...next };
	writeJson(CONFIG_KEY, merged);
	return getNudgePolicyConfig();
}

function isWithinSafeWindow(now: Date, config: NudgePolicyConfig): boolean {
	const hour = now.getHours();
	if (config.safeWindowStartHour <= config.safeWindowEndHour) {
		return hour >= config.safeWindowStartHour && hour < config.safeWindowEndHour;
	}
	return hour >= config.safeWindowStartHour || hour < config.safeWindowEndHour;
}

export function evaluateNudgeWindow(
	notification: NudgeNotification,
	context: NudgePolicyContext,
	config: NudgePolicyConfig,
): "show" | "defer" {
	if (isUrgentNotification(notification)) return "show";
	if (config.suppressDuringRunningFocus && context.hasRunningFocus) return "defer";
	if (!isWithinSafeWindow(context.now, config)) return "defer";
	return "show";
}

function getQueue(): DeferredNudge[] {
	const queue = readJson<DeferredNudge[]>(QUEUE_KEY, []);
	return Array.isArray(queue) ? queue : [];
}

function setQueue(queue: DeferredNudge[]): void {
	writeJson(QUEUE_KEY, queue.slice(-100));
}

export function enqueueDeferredNudge(
	notification: NudgeNotification,
	now: Date,
	deferMinutes: number,
): void {
	const queue = getQueue();
	queue.push({
		notification,
		queuedAtIso: now.toISOString(),
		replayAfterIso: new Date(now.getTime() + deferMinutes * 60_000).toISOString(),
	});
	setQueue(queue);
	recordNudgeOutcome("deferred");
}

export function dequeueReplayableNudge(context: NudgePolicyContext): NudgeNotification | null {
	if (context.hasRunningFocus) return null;
	const queue = getQueue();
	if (queue.length === 0) return null;
	const nowMs = context.now.getTime();
	for (let i = 0; i < queue.length; i++) {
		const item = queue[i];
		if (!item) continue;
		const replayAt = Date.parse(item.replayAfterIso);
		if (!Number.isNaN(replayAt) && replayAt <= nowMs) {
			queue.splice(i, 1);
			setQueue(queue);
			recordNudgeOutcome("replayed");
			return item.notification;
		}
	}
	return null;
}

export function recordNudgeOutcome(
	type: keyof NudgeMetrics,
): void {
	const current = readJson<NudgeMetrics>(METRICS_KEY, DEFAULT_METRICS);
	const next: NudgeMetrics = {
		...DEFAULT_METRICS,
		...current,
		[type]: (current[type] ?? 0) + 1,
	};
	writeJson(METRICS_KEY, next);
}

export function getNudgeMetrics(): NudgeMetrics & { acceptanceRate: number } {
	const metrics = readJson<NudgeMetrics>(METRICS_KEY, DEFAULT_METRICS);
	const denominator = (metrics.accepted ?? 0) + (metrics.dismissed ?? 0);
	return {
		...DEFAULT_METRICS,
		...metrics,
		acceptanceRate: denominator === 0 ? 0 : (metrics.accepted ?? 0) / denominator,
	};
}

export function __resetNudgePolicyForTests(): void {
	// No-op - database-only architecture
}
