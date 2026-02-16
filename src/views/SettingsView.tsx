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
import { invoke } from "@tauri-apps/api/core";

// Tauri app API (static import instead of dynamic)
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { useUpdater } from "@/hooks/useUpdater";
import { Slider } from "@/components/m3/Slider";
import { playNotificationSoundMaybe } from "@/utils/soundPlayer";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { ShortcutEditor } from "@/components/ShortcutEditor";
import { DEFAULT_SHORTCUTS } from "@/constants/shortcuts";
import { ACCENT_COLORS, TOTAL_SCHEDULE_DURATION } from "@/constants/defaults";
import { Icon } from "@/components/m3/Icon";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { isTauriEnvironment } from "@/lib/tauriEnv";
import {
	getPressureThresholdCalibration,
	getPressureThresholdHistory,
	resetPressureThresholdCalibration,
} from "@/utils/pressure-threshold-calibration";
import {
	getNudgeMetrics,
	getNudgePolicyConfig,
	setNudgePolicyConfig,
} from "@/utils/nudge-window-policy";
import {
	getBreakActivityCatalog,
	setBreakActivityEnabled,
	togglePinBreakActivity,
	upsertBreakActivity,
	type BreakActivity,
} from "@/utils/break-activity-catalog";

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
	const [pressureCalibration, setPressureCalibration] = useState(getPressureThresholdCalibration);
	const [pressureHistoryCount, setPressureHistoryCount] = useState(() => getPressureThresholdHistory().length);
	const [nudgePolicy, setNudgePolicy] = useState(getNudgePolicyConfig);
	const [nudgeMetrics, setNudgeMetrics] = useState(getNudgeMetrics);
	const [breakActivityCatalog, setBreakActivityCatalog] = useState<BreakActivity[]>(getBreakActivityCatalog);
	const [activityDraft, setActivityDraft] = useState({
		id: "",
		title: "",
		description: "",
		durationBucket: 5,
		tags: "recovery",
	});
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

	useEffect(() => {
		setPressureCalibration(getPressureThresholdCalibration());
		setPressureHistoryCount(getPressureThresholdHistory().length);
		setNudgePolicy(getNudgePolicyConfig());
		setNudgeMetrics(getNudgeMetrics());
		setBreakActivityCatalog(getBreakActivityCatalog());
	}, []);

	const refreshBreakCatalog = useCallback(() => {
		setBreakActivityCatalog(getBreakActivityCatalog());
	}, []);

	const applyBreakDraft = useCallback(() => {
		const normalizedId = activityDraft.id.trim().toLowerCase();
		if (!normalizedId || !activityDraft.title.trim()) return;
		const tags = activityDraft.tags
			.split(",")
			.map((tag) => tag.trim().toLowerCase())
			.filter(Boolean);
		upsertBreakActivity({
			id: normalizedId,
			title: activityDraft.title.trim(),
			description: activityDraft.description.trim(),
			durationBucket: activityDraft.durationBucket,
			tags,
		});
		refreshBreakCatalog();
	}, [activityDraft, refreshBreakCatalog]);

	const content = (
		<div className="window-surface h-full overflow-y-auto text-[var(--md-ref-color-on-surface)] p-4">
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
									{/* Custom sound file selector */}
									<div className="flex items-center justify-between">
										<span className="text-sm text-[var(--md-ref-color-on-surface)]">
											{settings.customNotificationSound
												? `カスタム音: ${settings.customNotificationSound.split(/[/\\]/).pop()}`
												: "カスタム音: デフォルト"}
										</span>
										<div className="flex items-center gap-2">
											{settings.customNotificationSound && (
												<Button
													variant="tonal"
													size="small"
													onClick={() => updateSetting("customNotificationSound", undefined)}
												>
													クリア
												</Button>
											)}
											<Button
												variant="tonal"
												size="small"
												onClick={async () => {
													const selected = await open({
														multiple: false,
														filters: [
															{
																name: "Audio Files",
																extensions: ["mp3", "wav", "ogg", "m4a", "aac"],
															},
														],
													});
													if (selected && typeof selected === "string") {
														updateSetting("customNotificationSound", selected);
													}
												}}
											>
												ファイルを選択
											</Button>
										</div>
									</div>
									<Button
										variant="tonal"
										size="small"
										onClick={() => {
											void playNotificationSoundMaybe(
												settings.customNotificationSound,
												settings.notificationVolume / 100,
											);
										}}
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

					{/* ─── Pressure Calibration ───────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							プレッシャー閾値補正
						</h3>
						<div className="space-y-3">
							<div className="text-sm text-[var(--md-ref-color-on-surface)]">
								<div>Overload閾値: {pressureCalibration.overloadThreshold}</div>
								<div>Critical閾値: {pressureCalibration.criticalThreshold}</div>
								<div>履歴件数: {pressureHistoryCount}</div>
							</div>
							<Button
								variant="tonal"
								size="small"
								onClick={() => {
									const reset = resetPressureThresholdCalibration();
									setPressureCalibration(reset);
									setPressureHistoryCount(0);
								}}
							>
								デフォルトにリセット
							</Button>
						</div>
					</section>

					{/* ─── Nudge Policy ───────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							通知ナッジポリシー
						</h3>
						<div className="space-y-4">
							<ToggleRow
								label="集中中は非緊急ナッジを延期"
								value={nudgePolicy.suppressDuringRunningFocus}
								onChange={() => {
									const next = setNudgePolicyConfig({
										suppressDuringRunningFocus: !nudgePolicy.suppressDuringRunningFocus,
									});
									setNudgePolicy(next);
								}}
							/>
							<Slider
								min={1}
								max={30}
								step={1}
								value={nudgePolicy.deferMinutes}
								onChange={(v) => {
									const next = setNudgePolicyConfig({ deferMinutes: v });
									setNudgePolicy(next);
								}}
								label={<span>延期時間</span>}
								valueLabel={<span>{nudgePolicy.deferMinutes}分</span>}
							/>
							<div className="text-sm text-[var(--md-ref-color-on-surface)] space-y-1">
								<div>表示: {nudgeMetrics.shown}</div>
								<div>延期: {nudgeMetrics.deferred}</div>
								<div>再生: {nudgeMetrics.replayed}</div>
								<div>受諾率: {(nudgeMetrics.acceptanceRate * 100).toFixed(1)}%</div>
							</div>
							<Button
								variant="tonal"
								size="small"
								onClick={() => setNudgeMetrics(getNudgeMetrics())}
							>
								メトリクス更新
							</Button>
						</div>
					</section>

					{/* ─── Break Activity Catalog ───────────────── */}
					<section>
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							休憩アクティビティ
						</h3>
						<div className="space-y-3">
							<div className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-3 space-y-2">
								<div className="text-sm font-medium">アクティビティを追加 / 編集</div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
									<input
										className="rounded-md border border-[var(--md-ref-color-outline-variant)] bg-transparent px-2 py-1 text-sm"
										placeholder="ID (例: breathing-478)"
										value={activityDraft.id}
										onChange={(e) => setActivityDraft((prev) => ({ ...prev, id: e.target.value }))}
									/>
									<input
										className="rounded-md border border-[var(--md-ref-color-outline-variant)] bg-transparent px-2 py-1 text-sm"
										placeholder="タイトル"
										value={activityDraft.title}
										onChange={(e) => setActivityDraft((prev) => ({ ...prev, title: e.target.value }))}
									/>
									<input
										className="rounded-md border border-[var(--md-ref-color-outline-variant)] bg-transparent px-2 py-1 text-sm md:col-span-2"
										placeholder="説明"
										value={activityDraft.description}
										onChange={(e) =>
											setActivityDraft((prev) => ({ ...prev, description: e.target.value }))
										}
									/>
									<select
										className="rounded-md border border-[var(--md-ref-color-outline-variant)] bg-transparent px-2 py-1 text-sm"
										value={activityDraft.durationBucket}
										onChange={(e) =>
											setActivityDraft((prev) => ({
												...prev,
												durationBucket: Number.parseInt(e.target.value, 10) || 5,
											}))
										}
									>
										<option value={5}>5分向け</option>
										<option value={10}>10分向け</option>
										<option value={15}>15分向け</option>
										<option value={30}>30分向け</option>
									</select>
									<input
										className="rounded-md border border-[var(--md-ref-color-outline-variant)] bg-transparent px-2 py-1 text-sm"
										placeholder="タグ(カンマ区切り)"
										value={activityDraft.tags}
										onChange={(e) => setActivityDraft((prev) => ({ ...prev, tags: e.target.value }))}
									/>
								</div>
								<div className="flex items-center gap-2">
									<Button size="small" variant="filled" onClick={applyBreakDraft}>
										保存
									</Button>
									<Button size="small" variant="tonal" onClick={refreshBreakCatalog}>
										再読み込み
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								{breakActivityCatalog.map((activity) => (
									<div
										key={activity.id}
										className="rounded-lg border border-[var(--md-ref-color-outline-variant)] p-2 flex items-center justify-between gap-2"
									>
										<div className="min-w-0">
											<div className="text-sm font-medium truncate">{activity.title}</div>
											<div className="text-xs text-[var(--md-ref-color-on-surface-variant)] truncate">
												{activity.durationBucket}分 | {activity.tags.join(", ")}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Switch
												checked={activity.enabled}
												onChange={() => {
													setBreakActivityEnabled(activity.id, !activity.enabled);
													refreshBreakCatalog();
												}}
												ariaLabel={`${activity.title} enabled`}
											/>
											<Button
												size="small"
												variant={activity.pinned ? "filled" : "tonal"}
												onClick={() => {
													togglePinBreakActivity(activity.id, !activity.pinned);
													refreshBreakCatalog();
												}}
											>
												{activity.pinned ? "固定中" : "固定"}
											</Button>
											<Button
												size="small"
												variant="tonal"
												onClick={() =>
													setActivityDraft({
														id: activity.id,
														title: activity.title,
														description: activity.description,
														durationBucket: activity.durationBucket,
														tags: activity.tags.join(", "),
													})
												}
											>
												編集
											</Button>
										</div>
									</div>
								))}
							</div>
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

					{/* ─── Data Reset ───────────────────────────── */}
					<DataResetSection />

					{/* ─── About ────────────────────────────────── */}
					<section className="pb-6">
						<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
							このアプリについて
						</h3>
						<p className="text-xs leading-relaxed text-[var(--md-ref-color-on-surface-variant)]">
							Pomodoroomはフォーカス時間・休憩時間を設定可能です。既定設定では
							プログレッシブスケジュール（15分 → 30分 → 45分 → 60分 → 75分）を採用し、
							各フォーカス期間の間に短い休憩、最後に長い休憩が入ります。
							合計サイクル: {formatMinutes(TOTAL_SCHEDULE_DURATION)}
						</p>
					</section>
				</div>
			</div>
	);

	if (windowLabel) {
		return (
			<DetachedWindowShell title="Settings" showMinMax={false}>
				<div className="absolute inset-0 ">{content}</div>
			</DetachedWindowShell>
		);
	}

	return content;
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
							? "text-[var(--md-ref-color-on-primary-container)] bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)] hover:text-[var(--md-ref-color-on-primary)]"
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

type DataResetOptions = {
	deleteTasks: boolean;
	deleteScheduleBlocks: boolean;
	deleteProjects: boolean;
	deleteGroups: boolean;
};

function DataResetSection() {
	const [options, setOptions] = useState<DataResetOptions>({
		deleteTasks: true,
		deleteScheduleBlocks: false,
		deleteProjects: false,
		deleteGroups: false,
	});
	const [isRunning, setIsRunning] = useState(false);
	const [resultText, setResultText] = useState<string | null>(null);
	const [errorText, setErrorText] = useState<string | null>(null);

	const hasSelection =
		options.deleteTasks ||
		options.deleteScheduleBlocks ||
		options.deleteProjects ||
		options.deleteGroups;

	const toggle = (key: keyof DataResetOptions) => {
		setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	const handleReset = async () => {
		if (!isTauriEnvironment()) {
			setErrorText("デスクトップ版(Tauri)でのみ実行できます。");
			return;
		}
		if (!hasSelection || isRunning) {
			return;
		}

		const selectedLabels = [
			options.deleteTasks ? "タスク" : null,
			options.deleteScheduleBlocks ? "スケジュールブロック" : null,
			options.deleteProjects ? "プロジェクト" : null,
			options.deleteGroups ? "グループ" : null,
		].filter(Boolean);
		const confirmed = window.confirm(
			`次のデータを削除します: ${selectedLabels.join(" / ")}\n\nこの操作は元に戻せません。実行しますか？`,
		);
		if (!confirmed) return;

		setIsRunning(true);
		setResultText(null);
		setErrorText(null);
		try {
			const result = await invoke<{
				deleted_tasks: number;
				deleted_schedule_blocks: number;
				deleted_projects: number;
				deleted_groups: number;
			}>("cmd_data_reset", options);

			window.dispatchEvent(new CustomEvent("tasks:refresh"));
			window.dispatchEvent(new CustomEvent("projects:refresh"));
			window.dispatchEvent(new CustomEvent("groups:refresh"));

			setResultText(
				`削除完了: タスク ${result.deleted_tasks}件 / スケジュール ${result.deleted_schedule_blocks}件 / プロジェクト ${result.deleted_projects}件 / グループ ${result.deleted_groups}件`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setErrorText(`削除に失敗しました: ${message}`);
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<section>
			<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
				データリセット
			</h3>
			<div className="space-y-3">
				<ToggleRow label="タスクを全削除" value={options.deleteTasks} onChange={() => toggle("deleteTasks")} />
				<ToggleRow
					label="スケジュールブロックを全削除"
					value={options.deleteScheduleBlocks}
					onChange={() => toggle("deleteScheduleBlocks")}
				/>
				<ToggleRow
					label="プロジェクトを全削除"
					value={options.deleteProjects}
					onChange={() => toggle("deleteProjects")}
				/>
				<ToggleRow label="グループを全削除" value={options.deleteGroups} onChange={() => toggle("deleteGroups")} />

				<p className="text-xs text-[var(--md-ref-color-on-surface-variant)]">
					実行前に必ず確認ダイアログが表示されます。元に戻せません。
				</p>

				<Button
					variant="tonal"
					size="small"
					onClick={handleReset}
					disabled={!hasSelection || isRunning}
					className="w-full"
				>
					{isRunning ? "削除中..." : "選択したデータを削除"}
				</Button>

				{resultText && (
					<p className="text-xs text-[var(--md-ref-color-primary)]">{resultText}</p>
				)}
				{errorText && (
					<p className="text-xs text-[var(--md-ref-color-error)]">{errorText}</p>
				)}
			</div>
		</section>
	);
}
