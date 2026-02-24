/**
 * Google Calendar sync types for Pomodoroom.
 */

/**
 * Current sync status.
 */
export interface SyncStatus {
	/** Last successful sync timestamp (ISO 8601) */
	last_sync_at: string | null;
	/** Number of pending changes to sync */
	pending_count: number;
	/** Whether a sync is currently in progress */
	in_progress: boolean;
}

/**
 * Result of a sync operation.
 */
export interface SyncResult {
	/** Whether sync was successful */
	success: boolean;
	/** Number of events processed */
	events_processed: number;
	/** Timestamp of sync completion (ISO 8601) */
	synced_at: string;
	/** Error message if sync failed */
	error?: string;
}

/**
 * Syncable data type identifier.
 */
export type SyncEventType =
	| "Task"
	| "Project"
	| "ProjectReference"
	| "Group"
	| "DailyTemplate"
	| "FixedEvent"
	| "ScheduleBlock"
	| "Session"
	| "Stats"
	| "Config"
	| "Profile"
	| "ProfileBackup"
	| "ProfilePerformance"
	| "OpLog";

/**
 * A syncable event ready for calendar storage.
 */
export interface SyncEvent {
	/** Unique identifier (matches local entity ID) */
	id: string;
	/** Type of data being synced */
	event_type: SyncEventType;
	/** JSON serialized data */
	data: unknown;
	/** Last update timestamp (ISO 8601) */
	updated_at: string;
	/** Whether this represents a deletion */
	deleted: boolean;
}

/**
 * Tauri command signatures for sync operations.
 */
export interface SyncCommands {
	/**
	 * Execute startup sync - fetch remote changes since last sync.
	 * Should be called on app launch.
	 */
	cmd_sync_startup: () => Promise<SyncResult>;

	/**
	 * Execute manual sync - user-initiated full sync.
	 * Fetches remote changes and pushes local changes.
	 */
	cmd_sync_manual: () => Promise<SyncResult>;

	/**
	 * Get current sync status.
	 */
	cmd_sync_get_status: () => Promise<SyncStatus>;
}

declare global {
	interface Window {
		__TAURI_INVOKE__<K extends keyof SyncCommands>(
			cmd: K,
			args?: Parameters<SyncCommands[K]>
		): Promise<ReturnType<SyncCommands[K]>>;
	}
}

export {};
