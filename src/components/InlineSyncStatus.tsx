/**
 * Inline Sync Status Component for SettingsView
 *
 * Simplified version of SyncStatus.tsx for inline display in settings.
 * Uses cmd_integration_get_status / cmd_integration_sync for google_calendar.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { Icon } from "@/components/m3/Icon";
import type { SyncStatus as SyncStatusType } from "@/types/sync";
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

export default function InlineSyncStatus() {
	const [status, setStatus] = useState<SyncStatusType | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);

	// Fetch current sync status via cmd_integration_get_status
	const fetchStatus = useCallback(async () => {
		if (!isTauriEnvironment()) {
			return;
		}

		try {
			const result = await invoke<IntegrationStatusResponse>("cmd_integration_get_status", {
				serviceName: "google_calendar",
			});
			setStatus({
				last_sync_at: result.last_sync,
				pending_count: 0,
				in_progress: false,
			});
		} catch (error) {
			console.error("[InlineSyncStatus] Failed to fetch sync status:", error);
		}
	}, []);

	// Manual sync trigger via cmd_integration_sync (bridge keyring path — correct)
	const handleManualSync = useCallback(async () => {
		if (!isTauriEnvironment() || isSyncing) return;

		setIsSyncing(true);

		try {
			const result = await invoke<IntegrationSyncResponse>("cmd_integration_sync", {
				serviceName: "google_calendar",
			});

			if (result.calendar_created) {
				await showActionNotification({
					title: "Pomodoroom Calendar Created",
					message:
						'A dedicated "Pomodoroom" calendar was created in your Google Calendar. Events will sync there.',
					buttons: [{ label: "Got it", action: { dismiss: null } }],
				});
			}

			await showActionNotification({
				title: "Sync Complete",
				message: `Synced ${result.items_fetched} events, ${result.items_created} tasks created.`,
				buttons: [],
				timeout_ms: 3000,
			});

			await fetchStatus();
		} catch (error) {
			console.error("[InlineSyncStatus] Manual sync failed:", error);
			const msg = error instanceof Error ? error.message : String(error);
			await showActionNotification({
				title: "Sync Failed",
				message: msg,
				buttons: [{ label: "Dismiss", action: { dismiss: null } }],
			});
		}
		setIsSyncing(false);
	}, [isSyncing, fetchStatus]);

	// Fetch status on mount and periodically
	useEffect(() => {
		fetchStatus();

		// Refresh every 30 seconds
		const interval = setInterval(fetchStatus, 30000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	// Format last sync time (Japanese)
	const formatLastSync = (dateStr: string | null): string | null => {
		if (!dateStr) return null;
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return "たった今";
		if (diffMins < 60) return `${diffMins}分前`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}時間前`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}日前`;
	};

	// Determine status color and icon
	const getStatusInfo = () => {
		if (isSyncing) {
			return {
				icon: "autorenew" as const,
				color: "var(--md-ref-color-primary)",
				message: "同期中...",
			};
		}
		if (status?.pending_count && status.pending_count > 0) {
			return {
				icon: "cloud_sync" as const,
				color: "var(--md-ref-color-tertiary)",
				message: `${status.pending_count}件保留中`,
			};
		}
		if (status?.last_sync_at) {
			return {
				icon: "cloud_done" as const,
				color: "var(--md-ref-color-tertiary)",
				message: `最終同期: ${formatLastSync(status.last_sync_at)}`,
			};
		}
		return {
			icon: "cloud_off" as const,
			color: "var(--md-ref-color-outline)",
			message: "未同期",
		};
	};

	const statusInfo = getStatusInfo();

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Icon
						name={statusInfo.icon}
						size={16}
						color={statusInfo.color}
						style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
					/>
					<span className="text-sm text-[var(--md-ref-color-on-surface)]">
						{statusInfo.message}
					</span>
				</div>
				<button
					type="button"
					disabled={isSyncing}
					className="px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-all duration-150"
					style={{
						backgroundColor: "var(--md-ref-color-surface-container-high)",
						color: "var(--md-ref-color-on-surface)",
						border: "1px solid var(--md-ref-color-outline-variant)",
						opacity: isSyncing ? 0.65 : 1,
					}}
					onClick={handleManualSync}
				>
					<Icon
						name="sync"
						size={13}
						color="var(--md-ref-color-on-surface)"
						style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
					/>
					{isSyncing ? "同期中..." : "今すぐ同期"}
				</button>
			</div>

			{status && (
				<div className="text-xs text-[var(--md-ref-color-on-surface-variant)] space-y-1">
					{status.last_sync_at && (
						<div>最終同期: {new Date(status.last_sync_at).toLocaleString("ja-JP")}</div>
					)}
					{status.pending_count > 0 && (
						<div>保留中の変更: {status.pending_count}件</div>
					)}
					{status.in_progress && (
						<div className="text-[var(--md-ref-color-primary)]">バックグラウンド同期中</div>
					)}
				</div>
			)}
		</div>
	);
}
