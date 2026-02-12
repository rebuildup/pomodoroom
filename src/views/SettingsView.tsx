/**
 * SettingsView -- Standalone settings window.
 *
 * Reads/writes settings from shared localStorage.
 * Cross-window sync happens via the `storage` event in useLocalStorage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Switch, Button, TextField } from "@/components/m3";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { useGoogleTasks } from "@/hooks/useGoogleTasks";
import { GoogleTasksSettingsModal } from "@/components/GoogleTasksSettingsModal";
import { FixedEventEditor } from "@/components/FixedEventEditor";
import { ProjectPanel } from "@/components/m3/ProjectPanel";
import { useConfig } from "@/hooks/useConfig";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useRightClickDrag } from "@/hooks/useRightClickDrag";
import { useUpdater } from "@/hooks/useUpdater";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ElasticSlider } from "@/components/PomodoroElasticSlider";
import { playNotificationSound } from "@/utils/soundPlayer";
import TitleBar from "@/components/TitleBar";
import { ShortcutEditor } from "@/components/ShortcutEditor";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { DEFAULT_SHORTCUTS } from "@/constants/shortcuts";
import type { PomodoroSession, PomodoroSettings } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { ACCENT_COLORS, TOTAL_SCHEDULE_DURATION } from "@/constants/defaults";
import { invoke } from "@tauri-apps/api/core";
import type { DailyTemplate, FixedEvent } from "@/types/schedule";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";

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
	// Use useConfig hook for TOML-based configuration
	const [settings, setSettings, _configLoading] = useConfig();
	const [, setSessions] = useLocalStorage<PomodoroSession[]>(
		"pomodoroom-sessions",
		[],
	);
	const [, setCustomBackground] = useLocalStorage<string>(
		"pomodoroom-custom-bg",
		"",
	);
	const customBackground = useLocalStorage<string>(
		"pomodoroom-custom-bg",
		"",
	)[0];

	const bgFileInputRef = useRef<HTMLInputElement>(null);

	// Use shared right-click drag hook
	const { handleRightDown } = useRightClickDrag();

	// Keyboard shortcuts
	const { bindings, updateBinding, resetBindings } = useKeyboardShortcuts();
	const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

	// Google Tasks
	const googleTasks = useGoogleTasks();
	const [isTasksSettingsOpen, setIsTasksSettingsOpen] = useState(false);

	const theme = settings.theme;
	const highlightColor = settings.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;

	// Daily Template state
	const [dailyTemplate, setDailyTemplate] = useState<DailyTemplate>(
		DEFAULT_DAILY_TEMPLATE,
	);
	const [templateError, setTemplateError] = useState<string | null>(null);

	const updateSetting = useCallback(
		<K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) => {
			setSettings((prev: PomodoroSettings) => ({ ...prev, [key]: value }));
		},
		[setSettings],
	);

	const toggleTheme = useCallback(() => {
		setSettings((prev: PomodoroSettings) => ({
			...prev,
			theme: prev.theme === "dark" ? "light" : "dark",
		}));
	}, [setSettings]);

	const handleBackgroundUpload = useCallback(
		(file: File) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				setCustomBackground(e.target?.result as string);
			};
			reader.readAsDataURL(file);
		},
		[setCustomBackground],
	);

	const handleReset = useCallback(async () => {
		try {
			await invoke("cmd_timer_reset");
		} catch (error) {
			console.error("Failed to reset timer:", error);
		}
	}, []);

	// ─── Load Daily Template on mount ─────────────────────────────────────────────
	useEffect(() => {
		const loadDailyTemplate = async () => {
			let rawTemplate: Partial<DailyTemplate> | null = null;

			try {
				rawTemplate = await invoke<DailyTemplate>("cmd_template_get");
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				console.error("[SettingsView] Failed to load daily template from backend:", err.message);
			}

			// If backend fails, just use defaults (no localStorage fallback)
			// Merge with defaults outside of try/catch to satisfy React Compiler
			setDailyTemplate({
				wakeUp: rawTemplate?.wakeUp ?? DEFAULT_DAILY_TEMPLATE.wakeUp,
				sleep: rawTemplate?.sleep ?? DEFAULT_DAILY_TEMPLATE.sleep,
				maxParallelLanes: rawTemplate?.maxParallelLanes ?? DEFAULT_DAILY_TEMPLATE.maxParallelLanes,
				fixedEvents: rawTemplate?.fixedEvents ?? DEFAULT_DAILY_TEMPLATE.fixedEvents,
			});
		};
		loadDailyTemplate();
	}, []);

	// ─── Save Daily Template ───────────────────────────────────────────────────────
	const saveDailyTemplate = async (template: DailyTemplate) => {
		// Validate wake_up < sleep_time
		const [wakeH = 7, wakeM = 0] = template.wakeUp.split(":").map(Number);
		const [sleepH = 23, sleepM = 0] = template.sleep.split(":").map(Number);
		const wakeMinutes = wakeH * 60 + wakeM;
		const sleepMinutes = sleepH * 60 + sleepM;

		if (wakeMinutes >= sleepMinutes) {
			setTemplateError("Wake up time must be before sleep time");
			return false;
		}

		setTemplateError(null);

		try {
			await invoke("cmd_template_set", { templateJson: template });
			// Also save to localStorage as fallback
			localStorage.setItem(
				"pomodoroom-daily-template",
				JSON.stringify(template),
			);
			return true;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error("[SettingsView] Failed to save daily template to backend:", err.message);
			// Fallback to localStorage only
			localStorage.setItem(
				"pomodoroom-daily-template",
				JSON.stringify(template),
			);
			return false;
		}
	};

	const updateDailyTemplate = (updates: Partial<DailyTemplate>) => {
		const newTemplate = { ...dailyTemplate, ...updates };
		setDailyTemplate(newTemplate);
		saveDailyTemplate(newTemplate);
	};

	const addFixedEvent = () => {
		const newEvent: FixedEvent = {
			id: `fixed-${Date.now()}`,
			name: "New Event",
			startTime: "09:00",
			durationMinutes: 60,
			days: [1, 2, 3, 4, 5], // Mon-Fri
			enabled: true,
		};
		updateDailyTemplate({
			fixedEvents: [...dailyTemplate.fixedEvents, newEvent],
		});
	};

	const updateFixedEvent = (index: number, event: FixedEvent) => {
		const newEvents = [...dailyTemplate.fixedEvents];
		newEvents[index] = event;
		updateDailyTemplate({ fixedEvents: newEvents });
	};

	const deleteFixedEvent = (index: number) => {
		const newEvents = dailyTemplate.fixedEvents.filter((_, i) => i !== index);
		updateDailyTemplate({ fixedEvents: newEvents });
	};

	return (
		<div
			className={`${
				windowLabel
					? `w-screen h-screen overflow-y-auto select-none bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]`
					: "h-full overflow-y-auto bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]"
			}`}
			{...(!windowLabel ? {} : {
				onMouseDown: handleRightDown,
				onContextMenu: (e) => e.preventDefault()
			})}
		>
			{/* TitleBar only for standalone window */}
			{windowLabel && <TitleBar theme={theme} title="Settings" showMinMax={false} />}

			{/* Content with top padding for title bar */}
			<div className={`${windowLabel ? 'pt-8' : 'pt-4'} p-5 space-y-8`}>
				{/* ─── Appearance ───────────────────────────── */}
				<section>
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						Appearance
					</h3>

					{/* Theme toggle */}
					<div className="flex items-center justify-between mb-4">
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">Theme</span>
						<Button
							variant="tonal"
							size="small"
							onClick={toggleTheme}
							icon={theme === "dark" ? "dark_mode" : "light_mode"}
						>
							{theme === "dark" ? "Dark" : "Light"}
						</Button>
					</div>

					{/* Accent color */}
					<div className="flex items-center justify-between mb-4">
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">Accent Color</span>
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
									onClick={() =>
										updateSetting("highlightColor", color)
									}
								/>
							))}
						</div>
					</div>

					{/* Custom background */}
					<div className="flex items-center justify-between">
						<span className="text-sm text-[var(--md-ref-color-on-surface)]">Background</span>
						<div className="flex items-center gap-2">
							{customBackground && (
								<Button
									variant="text"
									size="small"
									onClick={() => setCustomBackground("")}
									className="text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)]"
									icon="delete"
								>
									Remove
								</Button>
							)}
							<label className="cursor-pointer">
								<Button
									variant="tonal"
									size="small"
									icon="upload"
									onClick={() => bgFileInputRef.current?.click()}
								>
									Upload
								</Button>
								<input
									ref={bgFileInputRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (file) handleBackgroundUpload(file);
									}}
								/>
							</label>
						</div>
					</div>
				</section>

				{/* ─── Timer Settings ──────────────────────── */}
				<section>
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						Timer
					</h3>
					<div className="space-y-5">
						<ElasticSlider
							min={5}
							max={120}
							step={5}
							value={settings.workDuration}
							onChange={(v) => updateSetting("workDuration", v)}
							label={<span>Work Duration</span>}
							valueLabel={<span>{settings.workDuration}m</span>}
						/>
						<ElasticSlider
							min={1}
							max={30}
							step={1}
							value={settings.shortBreakDuration}
							onChange={(v) =>
								updateSetting("shortBreakDuration", v)
							}
							label={<span>Short Break</span>}
							valueLabel={
								<span>{settings.shortBreakDuration}m</span>
							}
						/>
						<ElasticSlider
							min={5}
							max={60}
							step={5}
							value={settings.longBreakDuration}
							onChange={(v) =>
								updateSetting("longBreakDuration", v)
							}
							label={<span>Long Break</span>}
							valueLabel={
								<span>{settings.longBreakDuration}m</span>
							}
						/>
						<ElasticSlider
							min={2}
							max={8}
							step={1}
							value={settings.sessionsUntilLongBreak}
							onChange={(v) =>
								updateSetting("sessionsUntilLongBreak", v)
							}
							label={<span>Sessions Until Long Break</span>}
							valueLabel={
								<span>{settings.sessionsUntilLongBreak}</span>
							}
						/>
					</div>
				</section>

				{/* ─── Daily Schedule ─────────────────────── */}
				<section>
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						Daily Schedule
					</h3>
					<div className="space-y-5">
						{/* Wake Up Time */}
						<TextField
							label="Wake Up Time"
							type="time"
							value={dailyTemplate.wakeUp}
							onChange={(v) => updateDailyTemplate({ wakeUp: v })}
							placeholder="07:00"
						/>

						{/* Sleep Time */}
						<TextField
							label="Sleep Time"
							type="time"
							value={dailyTemplate.sleep}
							onChange={(v) => updateDailyTemplate({ sleep: v })}
							placeholder="23:00"
						/>

						{/* Validation Error */}
						{templateError && (
							<p className="text-[var(--md-ref-color-error)] text-xs">
								{templateError}
							</p>
						)}

						{/* Max Parallel Lanes */}
						<ElasticSlider
							min={1}
							max={5}
							step={1}
							value={dailyTemplate.maxParallelLanes ?? 1}
							onChange={(v) =>
								updateDailyTemplate({ maxParallelLanes: v })
							}
							label={<span>Max Parallel Lanes</span>}
							valueLabel={
								<span>{dailyTemplate.maxParallelLanes ?? 1}</span>
							}
						/>

						{/* Fixed Events */}
						<div>
							<div className="flex items-center justify-between mb-3">
								<label className="text-sm text-[var(--md-ref-color-on-surface)]">
									Fixed Events
								</label>
								<Button
									variant="tonal"
									size="small"
									onClick={addFixedEvent}
									icon="add"
								>
									Add
								</Button>
							</div>

							<div className="space-y-3">
								{dailyTemplate.fixedEvents?.map((event, index) => (
									<FixedEventEditor
										key={event.id}
										event={event}
										onChange={(updatedEvent) =>
											updateFixedEvent(index, updatedEvent)
										}
										onDelete={() => deleteFixedEvent(index)}
										theme={theme}
									/>
								))}

								{!dailyTemplate.fixedEvents || dailyTemplate.fixedEvents.length === 0 && (
									<p className="text-center py-4 text-sm text-[var(--md-ref-color-on-surface-variant)]">
										No fixed events yet. Add one above.
									</p>
								)}
							</div>
						</div>
					</div>
				</section>

				{/* ─── Projects ──────────────────────────────── */}
				<ProjectPanel theme={theme} />

				{/* ─── Sound & Notifications ───────────────── */}
				<section>
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						Sound & Notifications
					</h3>
					<div className="space-y-4">
						<ToggleRow
							label="Notification Sound"
							value={settings.notificationSound}
							onChange={() =>
								updateSetting(
									"notificationSound",
									!settings.notificationSound,
								)
							}
						/>
						{settings.notificationSound && (
							<ElasticSlider
								min={0}
								max={100}
								step={5}
								value={settings.notificationVolume}
								onChange={(v) =>
									updateSetting("notificationVolume", v)
								}
								label={<span>Volume</span>}
								valueLabel={
									<span>{settings.notificationVolume}%</span>
								}
							/>
						)}
						{settings.notificationSound && (
							<Button
								variant="tonal"
								size="small"
								fullWidth
								onClick={() =>
									playNotificationSound(
										settings.notificationVolume / 100,
									)
								}
							>
								Test Sound
							</Button>
						)}
						<ToggleRow
							label="Vibration"
							value={settings.vibration}
							onChange={() =>
								updateSetting("vibration", !settings.vibration)
							}
							theme={theme}
						/>
					</div>
				</section>

				{/* ─── YouTube Settings ─────────────────────── */}
				<section>
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						YouTube
					</h3>
					<div className="space-y-4">
						<ToggleRow
							label="Auto-play on Focus"
							value={settings.autoPlayOnFocusSession ?? true}
							onChange={() =>
								updateSetting(
									"autoPlayOnFocusSession",
									!settings.autoPlayOnFocusSession,
								)
							}
							theme={theme}
						/>
						<ToggleRow
							label="Pause on Break"
							value={settings.pauseOnBreak ?? true}
							onChange={() =>
								updateSetting(
									"pauseOnBreak",
									!settings.pauseOnBreak,
								)
							}
							theme={theme}
						/>
						<ToggleRow
							label="Loop Playback"
							value={settings.youtubeLoop ?? true}
							onChange={() =>
								updateSetting(
									"youtubeLoop",
									!settings.youtubeLoop,
								)
							}
							theme={theme}
						/>
						<ElasticSlider
							min={0}
							max={100}
							step={5}
							value={settings.youtubeDefaultVolume ?? 50}
							onChange={(v) =>
								updateSetting("youtubeDefaultVolume", v)
							}
							label={<span>Default Volume</span>}
							valueLabel={
								<span>
									{settings.youtubeDefaultVolume ?? 50}%
								</span>
							}
						/>
					</div>
				</section>

				{/* ─── Data Management ──────────────────────── */}
				<section>
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						Data
					</h3>
					<div className="space-y-3">
						<Button
							variant="text"
							size="small"
							onClick={() => setSessions([])}
							className="text-[var(--md-ref-color-error)] hover:bg-[var(--md-ref-color-error-container)]"
							icon="delete"
							fullWidth
						>
							Clear Session History
						</Button>
						<Button
							variant="tonal"
							size="small"
							onClick={handleReset}
							fullWidth
							icon="replay"
						>
							Reset Timer
						</Button>
					</div>
				</section>

				{/* ─── Shortcuts ────────────────────────────── */}
				<section>
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-xs font-bold uppercase tracking-widest text-[var(--md-ref-color-on-surface-variant)]">
							Keyboard Shortcuts
						</h3>
						<Button
							variant="tonal"
							size="small"
							onClick={() => setShowShortcutsHelp(true)}
						>
							View All
						</Button>
					</div>

					<div className="space-y-3">
						{DEFAULT_SHORTCUTS.map((shortcut) => (
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
						fullWidth
						className="mt-3"
					>
						Reset to Defaults
					</Button>
				</section>

				{/* Help Modal */}
				<ShortcutsHelp
					isOpen={showShortcutsHelp}
					onClose={() => setShowShortcutsHelp(false)}
					theme={theme}
				/>

				{/* ─── Integrations ─────────────────────────── */}
				<IntegrationsPanel theme={theme} />

				{/* ─── Google Tasks ────────────────────────── */}
				{googleTasks.state.isConnected && (
					<section>
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-xs font-bold uppercase tracking-widest text-[var(--md-ref-color-on-surface-variant)]">
								Google Tasks
							</h3>
							<Button
								variant="tonal"
								size="small"
								onClick={() => setIsTasksSettingsOpen(true)}
								icon="settings"
							>
								Select Lists
							</Button>
						</div>

						{googleTasks.state.error && (
							<div className="mb-4 p-3 rounded-lg bg-[var(--md-ref-color-error-container)] text-[var(--md-ref-color-error)]">
								<p className="text-sm">{googleTasks.state.error}</p>
							</div>
						)}

						{googleTasks.tasks.length === 0 ? (
							<div className="text-center py-8 text-[var(--md-ref-color-on-surface-variant)]">
								<p className="text-sm">No tasks found</p>
								<p className="text-xs mt-1">
									{googleTasks.state.tasklistIds.length > 0
										? `Fetched from ${googleTasks.state.tasklistIds.length} list${googleTasks.state.tasklistIds.length > 1 ? "s" : ""}`
										: "Select a task list to view tasks"}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{googleTasks.tasks.map((task) => (
									<div
										key={task.id}
										className={`p-3 rounded-lg border transition-colors ${
											task.status === "completed"
												? "bg-[var(--md-ref-color-surface-container-low)] border-[var(--md-ref-color-outline)] opacity-60"
												: "bg-[var(--md-ref-color-surface-container-low)] border-[var(--md-ref-color-outline)]"
										}`}
									>
										<div className="flex items-start gap-3">
											<div
												className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
													task.status === "completed"
														? "bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary-container)]"
														: "bg-[var(--md-ref-color-surface-variant)] border border-[var(--md-ref-color-outline)]"
												}`}
												onClick={() => {
													if (task.status !== "completed") {
														googleTasks.completeTask(task.id).catch(console.error);
													}
												}}
												style={{
													cursor: task.status !== "completed" ? "pointer" : "default",
												}}
											>
												{task.status === "completed" && <Icon name="check" size={14} />}
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-start justify-between">
													<span className="text-sm font-medium">{task.title}</span>
													<span className={`text-xs ml-2 ${task.status === "completed" ? "text-[var(--md-ref-color-on-surface-variant)] line-through" : "text-[var(--md-ref-color-primary)]"}`}>
														{task.status === "completed" ? "Completed" : "Active"}
													</span>
												</div>
												{task.notes && (
													<p className="text-xs mt-1 text-[var(--md-ref-color-on-surface-variant)]">
														{task.notes}
													</p>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						)}

						{/* Tasks Settings Modal */}
						<GoogleTasksSettingsModal
							theme={theme}
							isOpen={isTasksSettingsOpen}
							onClose={() => setIsTasksSettingsOpen(false)}
							onSave={() => {
								// Refresh tasks after saving settings
								googleTasks.fetchTasks();
							}}
						/>
					</section>
				)}

				{/* ─── Updates ──────────────────────────────── */}
				<UpdateSection />

				{/* ─── About ────────────────────────────────── */}
				<section className="pb-6">
					<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
						About
					</h3>
					<p className="text-xs leading-relaxed text-[var(--md-ref-color-on-surface-variant)]">
						Pomodoroom uses a progressive schedule: 15m &rarr; 30m
						&rarr; 45m &rarr; 60m &rarr; 75m, with short breaks
						between each focus period and a long break at the end.
						Total cycle: {formatMinutes(TOTAL_SCHEDULE_DURATION)}.
					</p>
				</section>
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
			<Switch
				checked={value}
				onChange={onChange}
				ariaLabel={label}
			/>
		</div>
	);
}

// ── Update section ──────────────────────────────────────────────────────────

function UpdateSection(): React.ReactElement {
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
				// Browser/dev fallback
				setAppVersion("dev");
			}
		})();
	}, []);

	const getStatusText = () => {
		switch (status) {
			case "idle":
				return "Click to check for updates";
			case "checking":
				return "Checking for updates...";
			case "available":
				return `Version ${updateInfo?.version} available`;
			case "downloading":
				return `Downloading... ${downloadProgress}%`;
			case "ready":
				return "Update ready! Restart to apply";
			case "up-to-date":
				return "✨ You're on the latest version!";
			case "error":
				return error ?? "Update check failed";
			default:
				return "";
		}
	};

	const getButtonContent = () => {
		switch (status) {
			case "idle":
			case "up-to-date":
			case "error":
				return (
					<>
						<Icon name="refresh" size={14} />
						Check for Updates
					</>
				);
			case "checking":
				return (
					<>
						<Icon name="refresh" size={14} className="animate-spin" />
						Checking...
					</>
				);
			case "available":
				return (
					<>
						<Icon name="download" size={14} />
						Download Update
					</>
				);
			case "downloading":
				return (
					<>
						<Icon name="download" size={14} />
						Downloading... {downloadProgress}%
					</>
				);
			case "ready":
				return (
					<>
						<Icon name="refresh" size={14} />
						Restart Now
					</>
				);
			default:
				return "Check for Updates";
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

	// Determine button variant based on status
	const getButtonVariant = (): "filled" | "tonal" | "outlined" => {
		if (status === "available") return "filled";
		if (status === "ready") return "filled";
		return "tonal";
	};

	// Determine button color based on status
	const getButtonColor = () => {
		if (status === "available") return "text-[var(--md-ref-color-on-primary-container)] bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)]";
		if (status === "ready") return "text-[var(--md-ref-color-on-primary-container)] bg-[var(--md-ref-color-primary-container)] hover:bg-[var(--md-ref-color-primary)]";
		return "";
	};

	return (
		<section>
			<h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-[var(--md-ref-color-on-surface-variant)]">
				Updates
			</h3>
			<div className="space-y-3">
				<p className="text-xs font-mono text-[var(--md-ref-color-on-surface-variant)]">
					Current version: v{appVersion}
				</p>
				<p
					className={`text-sm ${
						status === "error"
							? "text-[var(--md-ref-color-error)]"
							: status === "available" || status === "ready"
								? "text-[var(--md-ref-color-primary)]"
								: "text-[var(--md-ref-color-on-surface-variant)]"
					}`}
				>
					{getStatusText()}
				</p>

				{status === "downloading" && (
					<div className="w-full h-2 rounded-full bg-[var(--md-ref-color-surface-container-highest)] overflow-hidden">
						<div
							className="h-full bg-[var(--md-ref-color-primary)] transition-all duration-300"
							style={{ width: `${downloadProgress}%` }}
						/>
					</div>
				)}

				{updateInfo && status === "available" && updateInfo.body && (
					<div className="p-3 rounded-lg text-xs bg-[var(--md-ref-color-surface-container)]">
						<p className="font-medium mb-1">What's new:</p>
						<p className="text-[var(--md-ref-color-on-surface-variant)]">
							{updateInfo.body.slice(0, 200)}
							{updateInfo.body.length > 200 ? "..." : ""}
						</p>
					</div>
				)}

				<button
					type="button"
					onClick={handleClick}
					disabled={isDisabled}
					className={`
						w-full py-2.5 rounded-lg text-sm font-medium
						transition-all duration-150 ease-in-out
						inline-flex items-center justify-center gap-2
						focus:outline-none focus:ring-2 focus:ring-[var(--md-ref-color-primary)] focus:ring-offset-2
						disabled:opacity-40 disabled:cursor-not-allowed
						${isDisabled ? "" : getButtonColor()}
						${isDisabled ? "" : "hover:opacity-90"}
					`.trim()}
				>
					{getButtonContent()}
				</button>
			</div>
		</section>
	);
}
