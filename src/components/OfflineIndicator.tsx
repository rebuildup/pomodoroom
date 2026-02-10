/**
 * OfflineIndicator — Visual indicator for online/offline status.
 *
 * Displays a small badge showing current connectivity status.
 * Can be shown in header, toolbar, or as a standalone component.
 */

import { useState, useEffect } from "react";
import { Icon } from "@/components/m3/Icon";

// ─── Types ────────────────────────────────────────────────────────────────────────

interface OfflineIndicatorProps {
	/** Custom class name */
	className?: string;
	/** Show as compact icon (default: false) */
	compact?: boolean;
	/** Show text label (default: true) */
	showLabel?: boolean;
	/** Callback when online status changes */
	onStatusChange?: (isOnline: boolean) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────────

export default function OfflineIndicator({
	className = "",
	compact = false,
	showLabel = true,
	onStatusChange,
}: OfflineIndicatorProps) {
	const [isOnline, setIsOnline] = useState(() => navigator.onLine);
	const [wasOffline, setWasOffline] = useState(false);

	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			setWasOffline(true);
			onStatusChange?.(true);

			// Clear "was offline" state after 3 seconds
			setTimeout(() => setWasOffline(false), 3000);
		};

		const handleOffline = () => {
			setIsOnline(false);
			onStatusChange?.(false);
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [onStatusChange]);

	if (compact) {
		return (
			<div
				className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
					isOnline
						? "text-(--color-text-muted) bg-(--color-surface)"
						: "text-(--color-text-primary) bg-(--color-accent-primary) animate-pulse"
				} ${className}`}
				title={isOnline ? "Online" : "Offline - working with cached data"}
			>
				{isOnline ? (
					<Icon name="wifi" size={12} />
				) : (
					<Icon name="wifi_off" size={12} />
				)}
			</div>
		);
	}

	return (
		<div
			className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
				isOnline
					? "text-(--color-text-muted) bg-(--color-surface)"
					: "text-(--color-text-primary) bg-(--color-accent-primary)"
			} ${className}`}
		>
			{wasOffline && isOnline ? (
				<>
					<Icon name="refresh" size={12} className="text-(--color-accent-secondary)" />
					{showLabel && <span>Back online</span>}
				</>
			) : isOnline ? (
				<>
					<Icon name="wifi" size={12} />
					{showLabel && <span>Online</span>}
				</>
			) : (
				<>
					<Icon name="wifi_off" size={12} />
					{showLabel && <span>Offline</span>}
				</>
			)}
		</div>
	);
}

// ─── Hook version ───────────────────────────────────────────────────────────────────

/**
 * Hook that provides online/offline status.
 *
 * @returns Object with isOnline status and wasRecentlyOffline flag
 */
export function useOnlineStatus() {
	const [isOnline, setIsOnline] = useState(() => navigator.onLine);
	const [wasOffline, setWasOffline] = useState(false);

	useEffect(() => {
		const handleOnline = () => {
			setIsOnline(true);
			setWasOffline(true);

			// Clear "was offline" state after 3 seconds
			const timeout = setTimeout(() => setWasOffline(false), 3000);
			return () => clearTimeout(timeout);
		};

		const handleOffline = () => {
			setIsOnline(false);
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	return { isOnline, wasOffline };
}
