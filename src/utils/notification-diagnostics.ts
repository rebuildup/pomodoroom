export interface NotificationDiagnosticEntry {
	id: string;
	at: string;
	stage: string;
	message: string;
	context?: Record<string, unknown>;
}

const STORAGE_KEY = "notification_diagnostics_v1";
const UPDATE_EVENT = "notification-diagnostics:updated";
const MAX_ENTRIES = 200;

let inMemoryEntries: NotificationDiagnosticEntry[] | null = null;
let sequence = 0;

function canUseStorage(): boolean {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readFromStorage(): NotificationDiagnosticEntry[] {
	if (!canUseStorage()) return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((row) => row && typeof row === "object") as NotificationDiagnosticEntry[];
	} catch {
		return [];
	}
}

function writeToStorage(entries: NotificationDiagnosticEntry[]): void {
	if (!canUseStorage()) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// Ignore quota/storage errors.
	}
}

function emitUpdated(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function ensureLoaded(): NotificationDiagnosticEntry[] {
	if (!inMemoryEntries) {
		inMemoryEntries = readFromStorage();
	}
	return inMemoryEntries;
}

export function pushNotificationDiagnostic(
	stage: string,
	message: string,
	context?: Record<string, unknown>,
): void {
	const entries = ensureLoaded();
	sequence += 1;
	const row: NotificationDiagnosticEntry = {
		id: `${Date.now()}-${sequence}`,
		at: new Date().toISOString(),
		stage,
		message,
		context,
	};
	const next = [...entries, row].slice(-MAX_ENTRIES);
	inMemoryEntries = next;
	writeToStorage(next);
	emitUpdated();
}

export function getNotificationDiagnostics(): NotificationDiagnosticEntry[] {
	return [...ensureLoaded()];
}

export function clearNotificationDiagnostics(): void {
	inMemoryEntries = [];
	writeToStorage([]);
	emitUpdated();
}

export function notificationDiagnosticsUpdateEventName(): string {
	return UPDATE_EVENT;
}
