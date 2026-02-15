export type EscalationChannel = "badge" | "toast" | "modal";

export interface QuietHoursPolicy {
	enabled: boolean;
	startHour: number;
	endHour: number;
}

interface PromptEscalationState {
	ignoredCount: number;
	path: EscalationChannel[];
	updatedAt: string;
}

interface EscalationStore {
	prompts: Record<string, PromptEscalationState>;
}

interface AuditEntry {
	promptKey: string;
	event: "ignored" | "acknowledged";
	channel: EscalationChannel | null;
	path: EscalationChannel[];
	timestamp: string;
}

export interface EscalationDecisionInput {
	ignoredCount: number;
	isQuietHours: boolean;
	isDnd: boolean;
}

const ESCALATION_STATE_KEY = "notification_escalation_state_v1";
const ESCALATION_AUDIT_KEY = "notification_escalation_audit_v1";
const QUIET_HOURS_KEY = "notification_quiet_hours";

const DEFAULT_QUIET_HOURS: QuietHoursPolicy = {
	enabled: true,
	startHour: 22,
	endHour: 7,
};

function readState(): EscalationStore {
	try {
		const raw = localStorage.getItem(ESCALATION_STATE_KEY);
		if (!raw) {
			return { prompts: {} };
		}
		const parsed = JSON.parse(raw) as EscalationStore;
		if (!parsed || typeof parsed !== "object" || !parsed.prompts) {
			return { prompts: {} };
		}
		return parsed;
	} catch {
		return { prompts: {} };
	}
}

function writeState(state: EscalationStore): void {
	localStorage.setItem(ESCALATION_STATE_KEY, JSON.stringify(state));
}

function appendAudit(entry: AuditEntry): void {
	try {
		const raw = localStorage.getItem(ESCALATION_AUDIT_KEY);
		const history = raw ? (JSON.parse(raw) as AuditEntry[]) : [];
		history.push(entry);
		const tail = history.slice(-200);
		localStorage.setItem(ESCALATION_AUDIT_KEY, JSON.stringify(tail));
	} catch {
		// Ignore audit persistence errors.
	}
}

function getPromptState(promptKey: string): PromptEscalationState {
	const state = readState();
	return (
		state.prompts[promptKey] ?? {
			ignoredCount: 0,
			path: [],
			updatedAt: new Date().toISOString(),
		}
	);
}

export function computeEscalationChannel(input: EscalationDecisionInput): {
	channel: EscalationChannel;
	reason: "quiet-hours" | "dnd" | "ladder";
} {
	if (input.isQuietHours) {
		return { channel: "badge", reason: "quiet-hours" };
	}
	if (input.isDnd) {
		return { channel: "badge", reason: "dnd" };
	}
	if (input.ignoredCount >= 2) {
		return { channel: "modal", reason: "ladder" };
	}
	if (input.ignoredCount >= 1) {
		return { channel: "toast", reason: "ladder" };
	}
	return { channel: "badge", reason: "ladder" };
}

export function toCriticalStartPromptKey(taskId: string): string {
	return `critical-start:${taskId}`;
}

export function getEscalationDecision(
	promptKey: string,
	policy: { isQuietHours: boolean; isDnd: boolean }
): { channel: EscalationChannel; path: EscalationChannel[] } {
	const prompt = getPromptState(promptKey);
	const channel = computeEscalationChannel({
		ignoredCount: prompt.ignoredCount,
		isQuietHours: policy.isQuietHours,
		isDnd: policy.isDnd,
	}).channel;
	return { channel, path: [...prompt.path] };
}

export function markPromptIgnored(promptKey: string, channel: EscalationChannel): void {
	const state = readState();
	const current =
		state.prompts[promptKey] ?? {
			ignoredCount: 0,
			path: [],
			updatedAt: new Date().toISOString(),
		};
	const nextPath = [...current.path, channel].slice(-10);
	const next: PromptEscalationState = {
		ignoredCount: current.ignoredCount + 1,
		path: nextPath,
		updatedAt: new Date().toISOString(),
	};
	state.prompts[promptKey] = next;
	writeState(state);
	appendAudit({
		promptKey,
		event: "ignored",
		channel,
		path: nextPath,
		timestamp: next.updatedAt,
	});
}

export function acknowledgePrompt(promptKey: string): void {
	const state = readState();
	const current = state.prompts[promptKey];
	const now = new Date().toISOString();
	if (!current) {
		return;
	}
	appendAudit({
		promptKey,
		event: "acknowledged",
		channel: null,
		path: [...current.path],
		timestamp: now,
	});
	state.prompts[promptKey] = {
		ignoredCount: 0,
		path: [],
		updatedAt: now,
	};
	writeState(state);
}

export function readQuietHoursPolicy(): QuietHoursPolicy {
	try {
		const raw = localStorage.getItem(QUIET_HOURS_KEY);
		if (!raw) return DEFAULT_QUIET_HOURS;
		const parsed = JSON.parse(raw) as Partial<QuietHoursPolicy>;
		const start = Number(parsed.startHour);
		const end = Number(parsed.endHour);
		const enabled = parsed.enabled !== false;
		if (
			Number.isNaN(start) ||
			Number.isNaN(end) ||
			start < 0 ||
			start > 23 ||
			end < 0 ||
			end > 23
		) {
			return DEFAULT_QUIET_HOURS;
		}
		return { enabled, startHour: start, endHour: end };
	} catch {
		return DEFAULT_QUIET_HOURS;
	}
}

export function isQuietHours(date: Date, policy: QuietHoursPolicy): boolean {
	if (!policy.enabled) return false;
	const hour = date.getHours();
	if (policy.startHour === policy.endHour) {
		return true;
	}
	// Overnight window (e.g. 22-7)
	if (policy.startHour > policy.endHour) {
		return hour >= policy.startHour || hour < policy.endHour;
	}
	// Same-day window (e.g. 12-17)
	return hour >= policy.startHour && hour < policy.endHour;
}
