/**
 * Google Calendar Sync Status Component
 *
 * Provides a manual sync button for Google Calendar.
 * Sync results are surfaced via the notification dialog system.
 * Only visible when Google Calendar is connected.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { Icon } from "@/components/m3/Icon";
import { showActionNotification } from "@/hooks/useActionNotification";

interface IntegrationStatusResponse {
	service: string;
	connected: boolean;
	last_sync: string | null;
	features: string[];
}

interface IntegrationSyncResponse {
	service: string;
	synced_at: string;
	status: string;
	items_fetched: number;
	items_created: number;
	items_updated: number;
	items_unchanged: number;
	calendar_created: boolean;
}

export default function SyncStatus() {
	const [connected, setConnected] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);

	const fetchStatus = useCallback(async () => {
		if (!isTauriEnvironment()) return;
		try {
			const result = await invoke<IntegrationStatusResponse>(
				"cmd_integration_get_status",
				{ serviceName: "google_calendar" },
			);
			setConnected(result.connected);
		} catch (error) {
			console.error("[SyncStatus] Failed to fetch integration status:", error);
		}
	}, []);

	const handleManualSync = useCallback(async () => {
		if (!isTauriEnvironment() || isSyncing) return;

		setIsSyncing(true);
		try {
			const result = await invoke<IntegrationSyncResponse>(
				"cmd_integration_sync",
				{ serviceName: "google_calendar" },
			);

			// Show calendar creation notification first (persistent — user must dismiss)
			if (result.calendar_created) {
				await showActionNotification({
					title: "Pomodoroom Calendar Created",
					message:
						'A dedicated "Pomodoroom" calendar was created in your Google Calendar. Events will sync there.',
					buttons: [{ label: "Got it", action: { dismiss: null } }],
				});
			}

			// Show sync complete (auto-closes after 3s)
			await showActionNotification({
				title: "Sync Complete",
				message: `Synced ${result.items_fetched} events, ${result.items_created} tasks created.`,
				buttons: [],
				timeout_ms: 3000,
			});

			await fetchStatus();
		} catch (error) {
			console.error("[SyncStatus] Manual sync failed:", error);
			const msg = error instanceof Error ? error.message : String(error);
			await showActionNotification({
				title: "Sync Failed",
				message: msg,
				buttons: [{ label: "Dismiss", action: { dismiss: null } }],
			});
		}
		setIsSyncing(false);
	}, [isSyncing, fetchStatus]);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 30000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	if (!connected) return null;

	return (
		<button
			type="button"
			disabled={isSyncing}
			onClick={handleManualSync}
			className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium"
			style={{
				backgroundColor: "var(--md-ref-color-surface-container-high)",
				color: "var(--md-ref-color-on-surface)",
				border: "1px solid var(--md-ref-color-outline-variant)",
				opacity: isSyncing ? 0.65 : 1,
			}}
		>
			<Icon
				name="sync"
				size={13}
				color="var(--md-ref-color-on-surface)"
				style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
			/>
			{isSyncing ? "Syncing..." : "Sync"}
		</button>
	);
}
