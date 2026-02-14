/**
 * SettingsView -- Standalone settings window.
 *
 * Simplified settings with only actively used features:
 * - Appearance (theme, accent color)
 * - Timer settings
 * - Notifications
 * - Account integrations
 * - Keyboard shortcuts
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Switch } from "@/components/m3";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { useConfig } from "@/hooks/useConfig";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useUpdater } from "@/hooks/useUpdater";
import { Slider } from "@/components/m3/Slider";
import { playNotificationSound } from "@/utils/soundPlayer";
import TitleBar from "@/components/TitleBar";
import { ShortcutEditor } from "@/components/ShortcutEditor";
import { DEFAULT_SHORTCUTS } from "@/constants/shortcuts";
import { ACCENT_COLORS, TOTAL_SCHEDULE_DURATION } from "@/constants/defaults";
import { Icon } from "@/components/m3/Icon";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";

export interface SettingsViewProps {
	/** Window label - if provided, render as standalone window with TitleBar */
	windowLabel?: string;
}

function formatMinutes(minutes: number): string {
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${minutes}m`;
}

export default function SettingsView({ windowLabel }: SettingsViewProps = {}) {
	const [settings, setSettings] = useConfig();
	const theme = settings.theme;
	const highlightColor = settings.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;

	// Keyboard shortcuts
	const { bindings, updateBinding, resetBindings } = useKeyboardShortcuts();

	const updateSetting = useCallback(
		<K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
			setSettings((prev) => ({ ...prev, [key]: value }));
		},
		[setSettings],
	);

	const toggleTheme = useCallback(() => {
		setSettings((prev) => ({
			...prev,
			theme: prev.theme === "dark" ? "light" : "dark",
		}));
	}, [setSettings]);

	return (
		<div
			className={`${
				windowLabel
					? `w-screen h-screen overflow-y-auto select-none bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]`
					: "h-full overflow-y-auto bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
			}`}
		>
			{/* TitleBar only for standalone window */}
			{windowLabel && <TitleBar theme={theme} title="Settings" showMinMax={false} />}

			{/* Content */}
			<div className={`${windowLabel ? 'pt-8' : ''} p-4`}>
				<div className="max-w-7xl mx-auto space-y-6">
					{/* ─── Appearance ───────────────────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							外観
						</h3>

						<div className="space-y-4">
							{/* Theme toggle */}
							<div className="flex items-center justify-between">
								<span className="text-sm text-[var(--md-ref-color-on-surface)]">テーマ</span>
								<Button
									variant="tonal"
									size="small"
									onClick={toggleTheme}
									icon={theme === "dark" ? "dark_mode" : "light_mode"}
								>
									{theme === "dark" ? "ダーク" : "ライト"}
								</Button>
							</div>

							{/* Accent color */}
							<div className="flex items-center justify-between">
								<span className="text-sm text-[var(--md-ref-color-on-surface)]">アクセントカラー</span>
								<div className="flex items-center gap-2">
									{ACCENT_COLORS.map((color) => (
										<button
											key={color}
											type="button"
											aria-label={`Select accent color: ${color}`}
											className={`w-6 h-6 rounded-full border-2 transition-transform ${
												highlightColor === color
													? "border-[var(--md-ref-color-on-surface)] scale-110 ring-2 ring-offset-1 ring-[var(--md-ref-color-primary)]"
													: "border-transparent hover:scale-105"
											}`}
											style={{ backgroundColor: color }}
											onClick={() => updateSetting("highlightColor", color)}
										/>
									))}
								</div>
							</div>
						</div>
					</section>

					{/* ─── Timer Settings ──────────────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							タイマー
						</h3>
						<div className="space-y-5">
							<Slider
								min={5}
								max={120}
								step={5}
								value={settings.workDuration}
								onChange={(v) => updateSetting("workDuration", v)}
								label={<span>フォーカス時間</span>}
								valueLabel={<span>{settings.workDuration}分</span>}
							/>
							<Slider
								min={1}
								max={30}
								step={1}
								value={settings.shortBreakDuration}
								onChange={(v) => updateSetting("shortBreakDuration", v)}
								label={<span>短い休憩</span>}
								valueLabel={<span>{settings.shortBreakDuration}分</span>}
							/>
							<Slider
								min={5}
								max={60}
								step={5}
								value={settings.longBreakDuration}
								onChange={(v) => updateSetting("longBreakDuration", v)}
								label={<span>長い休憩</span>}
								valueLabel={<span>{settings.longBreakDuration}分</span>}
							/>
							<Slider
								min={2}
								max={8}
								step={1}
								value={settings.sessionsUntilLongBreak}
								onChange={(v) => updateSetting("sessionsUntilLongBreak", v)}
								label={<span>長休憩までのセッション数</span>}
								valueLabel={<span>{settings.sessionsUntilLongBreak}回</span>}
							/>
						</div>
					</section>

					{/* ─── Sound & Notifications ───────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							通知
						</h3>
						<div className="space-y-4">
							<ToggleRow
								label="通知音"
								value={settings.notificationSound}
								onChange={() => updateSetting("notificationSound", !settings.notificationSound)}
							/>
							{settings.notificationSound && (
								<>
									<Slider
										min={0}
										max={100}
										step={5}
										value={settings.notificationVolume}
										onChange={(v) => updateSetting("notificationVolume", v)}
										label={<span>音量</span>}
										valueLabel={<span>{settings.notificationVolume}%</span>}
									/>
									<Button
										variant="tonal"
										size="small"
										onClick={() => playNotificationSound(settings.notificationVolume / 100)}
									>
										テスト再生
									</Button>
								</>
							)}
							<ToggleRow
								label="バイブレーション"
								value={settings.vibration}
								onChange={() => updateSetting("vibration", !settings.vibration)}
							/>
						</div>
					</section>

					{/* ─── Account Integrations ─────────────────── */}
					<IntegrationsPanel theme={theme} />

					{/* ─── Shortcuts ────────────────────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							キーボードショートカット
						</h3>
						<div className="space-y-3">
							{DEFAULT_SHORTCUTS.slice(0, 5).map((shortcut) => (
								<ShortcutEditor
									key={shortcut.id}
									command={shortcut.id}
									label={shortcut.description}
									binding={bindings[shortcut.id]}
									onUpdate={(binding) => updateBinding(shortcut.id, binding)}
								/>
							))}
						</div>
						<Button
							variant="tonal"
							size="small"
							onClick={resetBindings}
							className="mt-3"
						>
							デフォルトに戻す
						</Button>
					</section>

					{/* ─── Updates ──────────────────────────────── */}
					<UpdateSection />

					{/* ─── About ────────────────────────────────── */}
					<section className="pb-6">
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							このアプリについて
						</h3>
						<p className="text-xs leading-relaxed text-[var(--md-ref-color-on-surface-variant)]">
							Pomodoroomはプログレッシブスケジュールを採用: 15分 → 30分 → 45分 → 60分 → 75分
							各フォーカス期間の間に短い休憩、最後に長い休憩。
							合計サイクル: {formatMinutes(TOTAL_SCHEDULE_DURATION)}
						</p>
					</section>
				</div>
			</div>
		</div>
	);
}

// ── Reusable toggle row ─────────────────────────────────────────────────────

function ToggleRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: boolean;
	onChange: () => void;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm text-[var(--md-ref-color-on-surface)]">{label}</span>
			<Switch checked={value} onChange={onChange} ariaLabel={label} />
		</div>
	);
}

// ── Update section ──────────────────────────────────────────────────────────

function UpdateSection() {
	const [appVersion, setAppVersion] = useState("unknown");

	const {
		status,
		updateInfo,
		downloadProgress,
		error,
		checkForUpdates,
		downloadAndInstall,
		restartApp,
	} = useUpdater({ autoCheckOnMount: false });

	useEffect(() => {
		void (async () => {
			try {
				const { getVersion } = await import("@tauri-apps/api/app");
				const version = await getVersion();
				setAppVersion(version);
			} catch {
				setAppVersion("dev");
			}
		})();
	}, []);

	const getStatusText = () => {
		switch (status) {
			case "idle":
				return "クリックしてアップデートを確認";
			case "checking":
				return "確認中...";
			case "available":
				return `バージョン ${updateInfo?.version} が利用可能`;
			case "downloading":
				return `ダウンロード中... ${downloadProgress}%`;
			case "ready":
				return "アップデート準備完了! 再起動してください";
			case "up-to-date":
				return "最新バージョンです";
			case "error":
				return error ?? "アップデート確認に失敗";
			default:
				return "";
		}
	};

	const handleClick = () => {
		switch (status) {
			case "idle":
			case "up-to-date":
			case "error":
				checkForUpdates();
				break;
			case "available":
				downloadAndInstall();
				break;
			case "ready":
				restartApp();
				break;
		}
	};

	const isDisabled = status === "checking" || status === "downloading";

	return (
		<section>
			<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
				アップデート
			</h3>
			<div className="space-y-3">
				<p className="text-xs font-mono text-[var(--md-ref-color-on-surface-variant)]">
					現在のバージョン: v{appVersion}
				</p>
				<p
					className={[
						"text-sm",
						status === "error"
							? "text-[var(--md-ref-color-error)]"
							: status === "available" || status === "ready"
								? "text-[var(--md-ref-color-primary)]"
								: "text-[var(--md-ref-color-on-surface-variant)]"
					].join(" ")}
				>
					{getStatusText()}
				</p>

				{status === "downloading" && (
					<div className="w-full h-2 rounded-full bg-[var(--md-ref-color-surface-container-highest)] overflow-hidden">
						<div
							className="h-full bg-[var(--md-ref-color-primary)] transition-all duration-300"
							style={{ width: downloadProgress + "%" }}
						/>
					</div>
				)}

				<button
					type="button"
					onClick={handleClick}
					disabled={isDisabled}
					className={[
						"w-full py-2.5 rounded-lg text-sm font-medium",
						"transition-all duration-150 ease-in-out",
						"inline-flex items-center justify-center gap-2",
						"focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)] focus:ring-offset-2",
						"disabled:opacity-40 disabled:cursor-not-allowed",
						status === "available" || status === "ready"
							? "text-[var(--md-ref-color-on-primary-container)] bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)]"
							: "bg-[var(--md-ref-color-surface-container-high)] text-[var(--md-ref-color-on-surface)] hover:bg-[var(--md-ref-color-surface-container-highest)]"
					].join(" ")}
				>
					<Icon name={status === "downloading" ? "download" : "refresh"} size={14} />
					{status === "checking" && "確認中..."}
					{status === "downloading" && "ダウンロード中 " + downloadProgress + "%"}
					{status === "available" && "ダウンロード"}
					{status === "ready" && "再起動"}
					{(status === "idle" || status === "up-to-date" || status === "error") && "アップデートを確認"}
				</button>
			</div>
		</section>
	);
}
