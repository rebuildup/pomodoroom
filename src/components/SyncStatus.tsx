/**
 * Google Calendar Sync Status Component
 *
 * Displays current sync status and provides manual sync button.
 * Similar to StartupUpdateChecker in pattern and style.
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import { Icon } from "@/components/m3/Icon";
import type { SyncStatus as SyncStatusType, SyncResult } from "@/types/sync";

export default function SyncStatus() {
	const [status, setStatus] = useState<SyncStatusType | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [lastResult, setLastResult] = useState<SyncResult | null>(null);
	const [dismissed, setDismissed] = useState(false);

	// Fetch current sync status
	const fetchStatus = useCallback(async () => {
		if (!isTauriEnvironment()) {
			return;
		}

		try {
			const result = await invoke<SyncStatusType>("cmd_sync_get_status");
			setStatus(result);
		} catch (error) {
			console.error("[SyncStatus] Failed to fetch sync status:", error);
		}
	}, []);

	// Manual sync trigger
	const handleManualSync = useCallback(async () => {
		if (!isTauriEnvironment() || isSyncing) {
			return;
		}

		setIsSyncing(true);
		setLastResult(null);

		try {
			const result = await invoke<SyncResult>("cmd_sync_manual");
			setLastResult(result);

			// Refresh status after sync
			await fetchStatus();

			// Auto-dismiss after 3 seconds on success
			if (result.success) {
				setTimeout(() => setDismissed(true), 3000);
			}
		} catch (error) {
			console.error("[SyncStatus] Manual sync failed:", error);
			setLastResult({
				success: false,
				events_processed: 0,
				synced_at: new Date().toISOString(),
				error: String(error),
			});
		} finally {
			setIsSyncing(false);
		}
	}, [isSyncing, fetchStatus]);

	// Fetch status on mount and periodically
	useEffect(() => {
		fetchStatus();

		// Refresh every 30 seconds
		const interval = setInterval(fetchStatus, 30000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	// Don't show if dismissed
	if (dismissed) {
		return null;
	}

	// Format last sync time
	const formatLastSync = (dateStr: string | null): string | null => {
		if (!dateStr) return null;
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return "just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	};

	// Determine status color and icon
	const getStatusInfo = () => {
		if (lastResult?.error) {
			return {
				icon: "cloud_off",
				color: "var(--md-ref-color-error)",
				message: "Sync failed",
			};
		}
		if (isSyncing) {
			return {
				icon: "autorenew",
				color: "var(--md-ref-color-primary)",
				message: "Syncing...",
			};
		}
		if (status?.pending_count && status.pending_count > 0) {
			return {
				icon: "cloud_sync",
				color: "var(--md-ref-color-tertiary)",
				message: `${status.pending_count} pending`,
			};
		}
		if (status?.last_sync_at) {
			return {
				icon: "cloud_done",
				color: "var(--md-ref-color-tertiary)",
				message: formatLastSync(status.last_sync_at),
			};
		}
		return {
			icon: "cloud_off",
			color: "var(--md-ref-color-outline)",
			message: "Not synced",
		};
	};

	const statusInfo = getStatusInfo();

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
				style={{ backgroundColor: statusInfo.color }}
			/>
			<div className="flex items-start gap-2 pl-1">
				<Icon
					name={statusInfo.icon as any}
					size={16}
					className="mt-0.5"
					color={statusInfo.color}
					style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
				/>
				<div className="flex-1">
					<div className="text-sm font-semibold leading-5">Google Calendar Sync</div>
					<div
						className="text-xs leading-4 mt-0.5"
						style={{ color: "var(--md-ref-color-on-surface-variant)" }}
					>
						{statusInfo.message}
						{lastResult?.success && lastResult.events_processed > 0 && (
							<span className="ml-1">({lastResult.events_processed} events)</span>
						)}
					</div>
					{lastResult?.error && (
						<div
							className="text-[11px] mt-1 leading-tight"
							style={{ color: "var(--md-ref-color-error)" }}
						>
							{lastResult.error}
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
