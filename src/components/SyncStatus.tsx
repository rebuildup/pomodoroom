/**
 * Google Calendar Sync Status Component
 *
 * Displays current sync status and provides manual sync button.
 * Only visible when Google Calendar is connected.
 * Uses cmd_integration_sync / cmd_integration_get_status (bridge keyring path).
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { Icon } from "@/components/m3/Icon";

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
}

interface SyncError {
	message: string;
}

export default function SyncStatus() {
	const [connected, setConnected] = useState(false);
	const [lastSync, setLastSync] = useState<string | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncError, setSyncError] = useState<SyncError | null>(null);
	const [dismissed, setDismissed] = useState(false);

	// Fetch integration status
	const fetchStatus = useCallback(async () => {
		if (!isTauriEnvironment()) {
			return;
		}

		try {
			const result = await invoke<IntegrationStatusResponse>("cmd_integration_get_status", {
				serviceName: "google_calendar",
			});
			setConnected(result.connected);
			setLastSync(result.last_sync);
		} catch (error) {
			console.error("[SyncStatus] Failed to fetch integration status:", error);
		}
	}, []);

	// Manual sync trigger
	const handleManualSync = useCallback(async () => {
		if (!isTauriEnvironment() || isSyncing) {
			return;
		}

		setIsSyncing(true);
		setSyncError(null);

		try {
			const result = await invoke<IntegrationSyncResponse>("cmd_integration_sync", {
				serviceName: "google_calendar",
			});
			if (result.status !== "success") {
				setSyncError({ message: "Sync returned non-success status" });
			} else {
				setSyncError(null);
				// Auto-dismiss after 3 seconds on success
				setTimeout(() => setDismissed(true), 3000);
			}
			await fetchStatus();
		} catch (error) {
			console.error("[SyncStatus] Manual sync failed:", error);
			setSyncError({ message: String(error) });
		}
		setIsSyncing(false);
	}, [isSyncing, fetchStatus]);

	// Fetch status on mount and periodically
	useEffect(() => {
		fetchStatus();

		const interval = setInterval(fetchStatus, 30000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	// Don't show if dismissed or not connected
	if (dismissed || !connected) {
		return null;
	}

	// Format last sync time
	const formatLastSync = (dateStr: string | null): string | null => {
		if (!dateStr) return null;
		const date = new Date(dateStr);
		const now = new Date();
		const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);

		if (diffMins < 1) return "just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${Math.floor(diffHours / 24)}d ago`;
	};

	const statusIcon = syncError ? "cloud_off" : isSyncing ? "autorenew" : lastSync ? "cloud_done" : "cloud_off";
	const statusColor = syncError
		? "var(--md-ref-color-error)"
		: isSyncing
			? "var(--md-ref-color-primary)"
			: lastSync
				? "var(--md-ref-color-tertiary)"
				: "var(--md-ref-color-outline)";
	const statusMessage = syncError
		? "Sync failed"
		: isSyncing
			? "Syncing..."
			: lastSync
				? formatLastSync(lastSync) ?? "Synced"
				: "Not synced";

	return (
		<div
			className="fixed top-3 right-3 z-[1050] w-[320px] max-w-[calc(100vw-1.5rem)] rounded-xl border px-3 py-2 shadow-lg backdrop-blur"
			style={{
				backgroundColor: "var(--md-ref-color-surface-container-highest)",
				borderColor: "var(--md-ref-color-outline-variant)",
				color: "var(--md-ref-color-on-surface)",
			}}
		>
			<div
				className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
				style={{ backgroundColor: statusColor }}
			/>
			<div className="flex items-start gap-2 pl-1">
				<Icon
					name={statusIcon as any}
					size={16}
					className="mt-0.5"
					color={statusColor}
					style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
				/>
				<div className="flex-1">
					<div className="text-sm font-semibold leading-5">Google Calendar Sync</div>
					<div
						className="text-xs leading-4 mt-0.5"
						style={{ color: "var(--md-ref-color-on-surface-variant)" }}
					>
						{statusMessage}
					</div>
					{syncError && (
						<div
							className="text-[11px] mt-1 leading-tight"
							style={{ color: "var(--md-ref-color-error)" }}
						>
							{syncError.message}
						</div>
					)}
				</div>
			</div>
			<div className="mt-2 ml-6 flex gap-2">
				<button
					type="button"
					className="px-2.5 py-1.5 rounded-md text-xs font-medium"
					style={{
						backgroundColor: "var(--md-ref-color-surface)",
						color: "var(--md-ref-color-on-surface-variant)",
						border: "1px solid var(--md-ref-color-outline-variant)",
					}}
					onClick={() => setDismissed(true)}
				>
					Dismiss
				</button>
				<button
					type="button"
					disabled={isSyncing}
					className="px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5"
					style={{
						backgroundColor: "var(--md-ref-color-primary)",
						color: "var(--md-ref-color-on-primary)",
						opacity: isSyncing ? 0.65 : 1,
					}}
					onClick={handleManualSync}
				>
					<Icon
						name="sync"
						size={13}
						color="var(--md-ref-color-on-primary)"
						style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
					/>
					{isSyncing ? "Syncing..." : "Sync Now"}
				</button>
			</div>
		</div>
	);
}
