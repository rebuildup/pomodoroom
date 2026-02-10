/**
 * QuickBar — 画面上部のクイック設定バー.
 *
 * コンパクトモード切替、通知ON/OFF、サウンドON/OFF、現在時刻.
 * Sociomedia HIG: Fitts's law（画面端に配置）、modelessness（設定をモーダルにしない）.
 */
import { useCallback } from "react";
import { Icon } from "@/components/m3/Icon";
import type { QuickSettings } from "@/types/taskstream";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuickBarProps {
	settings: QuickSettings;
	onUpdateSettings: (patch: Partial<QuickSettings>) => void;
	/** Current time display (HH:MM) */
	currentTime: string;
	/** Sidebar visible toggle */
	sidebarVisible: boolean;
	onToggleSidebar: () => void;
	className?: string;
}

// ─── Toggle Button ──────────────────────────────────────────────────────────

function ToggleBtn({
	active,
	onClick,
	iconOn,
	iconOff,
	label,
}: {
	active: boolean;
	onClick: () => void;
	iconOn: React.ReactNode;
	iconOff: React.ReactNode;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
				active
					? "text-(--color-text-primary) bg-(--color-surface)"
					: "text-(--color-text-muted) hover:text-(--color-text-secondary)"
			}`}
			title={label}
		>
			{active ? iconOn : iconOff}
		</button>
	);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function QuickBar({
	settings,
	onUpdateSettings,
	currentTime,
	sidebarVisible,
	onToggleSidebar,
	className = "",
}: QuickBarProps) {
	const toggleCompact = useCallback(
		() => onUpdateSettings({ compactMode: !settings.compactMode }),
		[settings.compactMode, onUpdateSettings],
	);
	const toggleNotifications = useCallback(
		() => onUpdateSettings({ notificationsEnabled: !settings.notificationsEnabled }),
		[settings.notificationsEnabled, onUpdateSettings],
	);
	const toggleSound = useCallback(
		() => onUpdateSettings({ soundEnabled: !settings.soundEnabled }),
		[settings.soundEnabled, onUpdateSettings],
	);

	return (
		<div className={`flex items-center h-8 px-4 border-b border-(--color-border) bg-(--color-bg) ${className}`}>
			{/* Left: toggles */}
			<div className="flex items-center gap-0.5">
				<ToggleBtn
					active={settings.compactMode}
					onClick={toggleCompact}
					iconOn={<Icon name="fullscreen_exit" size={12} />}
					iconOff={<Icon name="fullscreen" size={12} />}
					label={settings.compactMode ? "通常モード" : "コンパクトモード"}
				/>
				<ToggleBtn
					active={settings.notificationsEnabled}
					onClick={toggleNotifications}
					iconOn={<Icon name="notifications" size={12} />}
					iconOff={<Icon name="notifications_off" size={12} />}
					label={settings.notificationsEnabled ? "通知 ON" : "通知 OFF"}
				/>
				<ToggleBtn
					active={settings.soundEnabled}
					onClick={toggleSound}
					iconOn={<Icon name="volume_up" size={12} />}
					iconOff={<Icon name="volume_off" size={12} />}
					label={settings.soundEnabled ? "サウンド ON" : "サウンド OFF"}
				/>

				<div className="w-px h-3 bg-(--color-border) mx-1" />

				{/* Sidebar toggle */}
				<ToggleBtn
					active={sidebarVisible}
					onClick={onToggleSidebar}
					iconOn={<Icon name="view_column" size={12} />}
					iconOff={<Icon name="menu_open" size={12} />}
					label={sidebarVisible ? "サイドバー非表示" : "サイドバー表示"}
				/>
			</div>

			<div className="flex-1" />

			{/* Right: clock */}
			<div className="font-mono text-sm tabular-nums text-(--color-text-muted)">
				{currentTime}
			</div>
		</div>
	);
}
