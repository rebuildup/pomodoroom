/**
 * CacheStamper — Visual indicator for cached data freshness.
 *
 * Shows when data was last updated and whether it's stale.
 * Useful for displaying alongside cached data like task lists or calendar events.
 */

import { Icon } from "@/components/m3/Icon";

// ─── Types ────────────────────────────────────────────────────────────────────────

interface CacheStamperProps {
	/** When the data was last updated */
	lastUpdated: Date | null;
	/** Whether the data is stale (past TTL) */
	isStale: boolean;
	/** Custom class name */
	className?: string;
	/** Show as compact version (icon only when fresh) */
	compact?: boolean;
}

// ─── Helper Functions ──────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
}

// ─── Component ─────────────────────────────────────────────────────────────────────

export default function CacheStamper({
	lastUpdated,
	isStale,
	className = "",
	compact = false,
}: CacheStamperProps) {
	if (!lastUpdated) {
		return null;
	}

	const timeAgo = formatTimeAgo(lastUpdated);

	if (compact) {
		return (
			<div
				className={`flex items-center gap-1 text-[9px] ${
					isStale ? "text-(--color-accent-primary)" : "text-(--color-text-muted)"
				} ${className}`}
				title={`Last updated: ${lastUpdated.toLocaleTimeString()}${isStale ? " (stale)" : ""}`}
			>
				{isStale ? <Icon name="warning" size={10} /> : <Icon name="schedule" size={10} />}
			</div>
		);
	}

	return (
		<div
			className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] ${
				isStale
					? "text-(--color-accent-primary) bg-(--color-accent-primary)/10"
					: "text-(--color-text-muted) bg-(--color-surface)"
			} ${className}`}
			title={`Last updated: ${lastUpdated.toLocaleString()}`}
		>
			{isStale ? <Icon name="warning" size={10} /> : <Icon name="schedule" size={10} />}
			<span className="font-mono tabular-nums">{timeAgo}</span>
			{isStale && <span className="opacity-70">(stale)</span>}
		</div>
	);
}

// ─── Stale Data Banner ──────────────────────────────────────────────────────────────

interface StaleDataBannerProps {
	/** Whether to show the banner */
	show: boolean;
	/** Callback to refresh data */
	onRefresh?: () => void;
	/** Whether refresh is in progress */
	isRefreshing?: boolean;
	/** Custom message */
	message?: string;
}

/**
 * Banner component shown when cached data is stale.
 *
 * @example
 * ```tsx
 * <StaleDataBanner
 *   show={isStale && !isOnline}
 *   onRefresh={refresh}
 *   isRefreshing={isLoading}
 * />
 * ```
 */
export function StaleDataBanner({
	show,
	onRefresh,
	isRefreshing = false,
	message = "Data may be outdated",
}: StaleDataBannerProps) {
	if (!show) {
		return null;
	}

	return (
		<div className="flex items-center justify-between gap-3 px-3 py-2 bg-(--color-accent-primary)/10 border-t border-(--color-accent-primary)/20">
			<div className="flex items-center gap-2">
				<Icon name="warning" size={12} className="text-(--color-accent-primary)" />
				<span className="text-[10px] text-(--color-accent-primary)">
					{message}. {onRefresh && "Connection restored. Tap to refresh."}
				</span>
			</div>
			{onRefresh && (
				<button
					type="button"
					onClick={onRefresh}
					disabled={isRefreshing}
					className="text-[9px] font-medium text-(--color-accent-primary) hover:text-(--color-accent-secondary) disabled:opacity-50 transition-colors"
				>
					{isRefreshing ? "Refreshing…" : "Refresh"}
				</button>
			)}
		</div>
	);
}
