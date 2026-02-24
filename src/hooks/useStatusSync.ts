/**
 * Status Sync - Bidirectional status synchronization with Slack/Discord
 *
 * Enables two-way sync between Pomodoroom focus state and
 * external service status (Slack DND, Discord status).
 *
 * Outbound: Update external status when focus session starts/ends
 * Inbound: Reflect external DND/status changes in Pomodoroom
 */

import { useCallback, useEffect, useState } from "react";

// Supported sync services
export type SyncService = "slack" | "discord";

// Sync direction
export type SyncDirection = "outbound" | "inbound" | "bidirectional";

// External status state
export interface ExternalStatus {
	service: SyncService;
	isDndEnabled: boolean;
	statusText: string | null;
	statusEmoji: string | null;
	lastSynced: number | null;
	isConnected: boolean;
}

// Sync configuration
export interface SyncConfig {
	direction: SyncDirection;
	autoSyncOnFocus: boolean;
	autoSyncOnBreak: boolean;
	respectExternalDnd: boolean; // Pause notifications when external DND is on
}

// Focus state for outbound sync
export interface FocusState {
	isActive: boolean;
	taskTitle: string | null;
	remainingMinutes: number;
}

// Sync event for callbacks
export interface SyncEvent {
	type: "status_changed" | "dnd_changed" | "sync_error" | "connected" | "disconnected";
	service: SyncService;
	data?: unknown;
	timestamp: number;
}

const DEFAULT_CONFIG: Record<SyncService, SyncConfig> = {
	slack: {
		direction: "bidirectional",
		autoSyncOnFocus: true,
		autoSyncOnBreak: true,
		respectExternalDnd: true,
	},
	discord: {
		direction: "bidirectional",
		autoSyncOnFocus: true,
		autoSyncOnBreak: true,
		respectExternalDnd: true,
	},
};

// Status templates for focus sessions
const FOCUS_STATUS_TEMPLATES = {
	slack: {
		text: "集中作業中",
		emoji: ":tomato:",
	},
	discord: {
		text: "Focus Session",
		emoji: "🍅",
	},
};

const BREAK_STATUS_TEMPLATES = {
	slack: {
		text: "休憩中",
		emoji: ":coffee:",
	},
	discord: {
		text: "On Break",
		emoji: "☕",
	},
};

/**
 * Hook for bidirectional status sync with Slack/Discord
 */
export function useStatusSync(
	focusState: FocusState,
	config: Partial<Record<SyncService, Partial<SyncConfig>>> = {},
): {
	statuses: Map<SyncService, ExternalStatus>;
	updateExternalStatus: (service: SyncService, isFocus: boolean) => Promise<void>;
	syncFromExternal: (service: SyncService) => Promise<void>;
	setSyncEnabled: (service: SyncService, enabled: boolean) => void;
	shouldSuppressNotifications: () => boolean;
} {
	const [configs] = useState(() => {
		const result = { ...DEFAULT_CONFIG };
		for (const [service, partial] of Object.entries(config)) {
			result[service as SyncService] = {
				...result[service as SyncService],
				...partial,
			};
		}
		return result;
	});

	const [statuses, setStatuses] = useState<Map<SyncService, ExternalStatus>>(() => {
		const map = new Map<SyncService, ExternalStatus>();
		map.set("slack", {
			service: "slack",
			isDndEnabled: false,
			statusText: null,
			statusEmoji: null,
			lastSynced: null,
			isConnected: false,
		});
		map.set("discord", {
			service: "discord",
			isDndEnabled: false,
			statusText: null,
			statusEmoji: null,
			lastSynced: null,
			isConnected: false,
		});
		return map;
	});

	const [syncEnabled, setSyncEnabledState] = useState<Map<SyncService, boolean>>(() => {
		const map = new Map<SyncService, boolean>();
		map.set("slack", true);
		map.set("discord", true);
		return map;
	});

	// Update external status (outbound sync)
	const updateExternalStatus = useCallback(
		async (service: SyncService, isFocus: boolean) => {
			const serviceConfig = configs[service];
			const enabled = syncEnabled.get(service);

			if (!enabled || serviceConfig.direction === "inbound") {
				return;
			}

			const template = isFocus ? FOCUS_STATUS_TEMPLATES[service] : BREAK_STATUS_TEMPLATES[service];

			// In a real implementation, this would call the service API
			// For now, we simulate the update
			setStatuses((prev) => {
				const newMap = new Map(prev);
				const current = newMap.get(service);
				if (current) {
					newMap.set(service, {
						...current,
						statusText: template.text,
						statusEmoji: template.emoji,
						lastSynced: Date.now(),
					});
				}
				return newMap;
			});

			console.log(`[StatusSync] Updated ${service} status: ${template.text}`);
		},
		[configs, syncEnabled],
	);

	// Sync from external service (inbound sync)
	const syncFromExternal = useCallback(
		async (service: SyncService) => {
			const serviceConfig = configs[service];
			const enabled = syncEnabled.get(service);

			if (!enabled || serviceConfig.direction === "outbound") {
				return;
			}

			// In a real implementation, this would fetch status from the service API
			// For now, we simulate the sync
			console.log(`[StatusSync] Syncing from ${service}`);

			setStatuses((prev) => {
				const newMap = new Map(prev);
				const current = newMap.get(service);
				if (current) {
					newMap.set(service, {
						...current,
						lastSynced: Date.now(),
						isConnected: true,
					});
				}
				return newMap;
			});
		},
		[configs, syncEnabled],
	);

	// Enable/disable sync for a service
	const setSyncEnabled = useCallback((service: SyncService, enabled: boolean) => {
		setSyncEnabledState((prev) => {
			const newMap = new Map(prev);
			newMap.set(service, enabled);
			return newMap;
		});
	}, []);

	// Check if notifications should be suppressed based on external DND
	const shouldSuppressNotifications = useCallback((): boolean => {
		for (const [service, status] of statuses) {
			const config = configs[service];
			if (config.respectExternalDnd && status.isDndEnabled) {
				return true;
			}
		}
		return false;
	}, [statuses, configs]);

	// Auto-sync when focus state changes
	useEffect(() => {
		if (focusState.isActive) {
			// Update external status when focus starts
			for (const [service, config] of Object.entries(configs)) {
				if (config.autoSyncOnFocus && syncEnabled.get(service as SyncService)) {
					updateExternalStatus(service as SyncService, true);
				}
			}
		} else if (focusState.remainingMinutes === 0) {
			// Update external status when focus ends (break time)
			for (const [service, config] of Object.entries(configs)) {
				if (config.autoSyncOnBreak && syncEnabled.get(service as SyncService)) {
					updateExternalStatus(service as SyncService, false);
				}
			}
		}
	}, [
		focusState.isActive,
		focusState.remainingMinutes,
		configs,
		syncEnabled,
		updateExternalStatus,
	]);

	// Periodic sync from external services
	useEffect(() => {
		const syncInterval = setInterval(() => {
			for (const [service, config] of Object.entries(configs)) {
				if (config.direction === "inbound" || config.direction === "bidirectional") {
					syncFromExternal(service as SyncService);
				}
			}
		}, 60000); // Sync every minute

		return () => clearInterval(syncInterval);
	}, [configs, syncFromExternal]);

	return {
		statuses,
		updateExternalStatus,
		syncFromExternal,
		setSyncEnabled,
		shouldSuppressNotifications,
	};
}

/**
 * Get status text for display
 */
export function getStatusDisplayText(status: ExternalStatus): string {
	if (!status.isConnected) {
		return "未接続";
	}
	if (status.isDndEnabled) {
		return "DND中";
	}
	return status.statusText ?? "オンライン";
}

/**
 * Get status indicator color
 */
export function getStatusColor(status: ExternalStatus): string {
	if (!status.isConnected) {
		return "var(--md-ref-color-outline)";
	}
	if (status.isDndEnabled) {
		return "var(--md-ref-color-error)";
	}
	return "var(--md-ref-color-primary)";
}
