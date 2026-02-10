/**
 * SettingsView -- Standalone settings window.
 *
 * Reads/writes settings from shared localStorage.
 * Cross-window sync happens via the `storage` event in useLocalStorage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Download,
	Moon,
	Plus,
	RefreshCw,
	RotateCcw,
	Sun,
	Trash2,
	Upload,
} from "lucide-react";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { FixedEventEditor } from "@/components/FixedEventEditor";
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
import type { PomodoroSettings, PomodoroSession } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { DEFAULT_SETTINGS, ACCENT_COLORS, TOTAL_SCHEDULE_DURATION } from "@/constants/defaults";
import { invoke } from "@tauri-apps/api/core";
import type { DailyTemplate, FixedEvent } from "@/types/schedule";
import { DEFAULT_DAILY_TEMPLATE } from "@/types/schedule";

function formatMinutes(minutes: number): string {
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${minutes}m`;
}

export default function SettingsView() {
	const [settings, setSettings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);
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
			try {
				const template = await invoke<DailyTemplate>("cmd_template_get");
				setDailyTemplate(template);
			} catch (error) {
				// Fallback to localStorage
				const stored = localStorage.getItem("pomodoroom-daily-template");
				if (stored) {
					try {
						setDailyTemplate(JSON.parse(stored));
					} catch {
						setDailyTemplate(DEFAULT_DAILY_TEMPLATE);
					}
				} else {
					setDailyTemplate(DEFAULT_DAILY_TEMPLATE);
				}
			}
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
			console.error("Failed to save daily template:", error);
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
			className={`w-screen h-screen overflow-y-auto select-none ${
				theme === "dark"
					? "bg-gray-900 text-white"
					: "bg-white text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
		>
			<TitleBar theme={theme} title="Settings" showMinMax={false} />

			{/* Content with top padding for title bar */}
			<div className="pt-8 p-5 space-y-8">
				{/* ─── Appearance ───────────────────────────── */}
				<section>
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
						Appearance
					</h3>

					{/* Theme toggle */}
					<div className="flex items-center justify-between mb-4">
						<span className="text-sm">Theme</span>
						<button
							type="button"
							onClick={toggleTheme}
							className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
								theme === "dark"
									? "bg-white/10 hover:bg-white/15"
									: "bg-black/5 hover:bg-black/10"
							}`}
						>
							{theme === "dark" ? (
								<>
									<Moon size={14} /> Dark
								</>
							) : (
								<>
									<Sun size={14} /> Light
								</>
							)}
						</button>
					</div>

					{/* Accent color */}
					<div className="flex items-center justify-between mb-4">
						<span className="text-sm">Accent Color</span>
						<div className="flex items-center gap-2">
							{ACCENT_COLORS.map((color) => (
								<button
									key={color}
									type="button"
									aria-label={`Select accent color: ${color}`}
									className={`w-6 h-6 rounded-full border-2 transition-transform ${
										highlightColor === color
											? "border-white scale-110 ring-2 ring-offset-1 ring-offset-transparent"
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
						<span className="text-sm">Background</span>
						<div className="flex items-center gap-2">
							{customBackground && (
								<button
									type="button"
									onClick={() => setCustomBackground("")}
									className={`px-2 py-1 text-xs rounded transition-colors ${
										theme === "dark"
											? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
											: "bg-red-50 text-red-600 hover:bg-red-100"
									}`}
								>
									Remove
								</button>
							)}
							<label
								className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
									theme === "dark"
										? "bg-white/10 hover:bg-white/15"
										: "bg-black/5 hover:bg-black/10"
								}`}
							>
								<Upload size={14} className="inline mr-1" />
								Upload
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
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
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
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
						Daily Schedule
					</h3>
					<div className="space-y-5">
						{/* Wake Up Time */}
						<div>
							<label
								className={`block text-sm mb-2 ${
									theme === "dark"
										? "text-gray-300"
										: "text-gray-700"
								}`}
							>
								Wake Up Time
							</label>
							<input
								type="time"
								value={dailyTemplate.wakeUp}
								onChange={(e) =>
									updateDailyTemplate({ wakeUp: e.target.value })
								}
								className={`w-full px-3 py-2 rounded-lg text-sm ${
									theme === "dark"
										? "bg-white/10 border-white/10 focus:border-blue-500"
										: "bg-white border-gray-300 focus:border-blue-500"
								} border focus:outline-none transition-colors`}
							/>
						</div>

						{/* Sleep Time */}
						<div>
							<label
								className={`block text-sm mb-2 ${
									theme === "dark"
										? "text-gray-300"
										: "text-gray-700"
								}`}
							>
								Sleep Time
							</label>
							<input
								type="time"
								value={dailyTemplate.sleep}
								onChange={(e) =>
									updateDailyTemplate({ sleep: e.target.value })
								}
								className={`w-full px-3 py-2 rounded-lg text-sm ${
									theme === "dark"
										? "bg-white/10 border-white/10 focus:border-blue-500"
										: "bg-white border-gray-300 focus:border-blue-500"
								} border focus:outline-none transition-colors`}
							/>
						</div>

						{/* Validation Error */}
						{templateError && (
							<p className="text-red-400 text-xs">
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
								<label
									className={`text-sm ${
										theme === "dark"
											? "text-gray-300"
											: "text-gray-700"
									}`}
								>
									Fixed Events
								</label>
								<button
									type="button"
									onClick={addFixedEvent}
									className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
										theme === "dark"
											? "bg-white/10 hover:bg-white/15"
											: "bg-black/5 hover:bg-black/10"
									}`}
								>
									<Plus size={14} />
									Add
								</button>
							</div>

							<div className="space-y-3">
								{dailyTemplate.fixedEvents.map((event, index) => (
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

								{dailyTemplate.fixedEvents.length === 0 && (
									<p
										className={`text-center py-4 text-sm ${
											theme === "dark"
												? "text-gray-500"
												: "text-gray-400"
										}`}
									>
										No fixed events yet. Add one above.
									</p>
								)}
							</div>
						</div>
					</div>
				</section>

				{/* ─── Sound & Notifications ───────────────── */}
				<section>
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
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
							theme={theme}
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
							<button
								type="button"
								onClick={() =>
									playNotificationSound(
										settings.notificationVolume / 100,
									)
								}
								className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
									theme === "dark"
										? "bg-white/5 hover:bg-white/10"
										: "bg-black/5 hover:bg-black/10"
								}`}
							>
								Test Sound
							</button>
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
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
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
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
						Data
					</h3>
					<div className="space-y-3">
						<button
							type="button"
							onClick={() => setSessions([])}
							className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
								theme === "dark"
									? "bg-red-500/10 hover:bg-red-500/20 text-red-400"
									: "bg-red-50 hover:bg-red-100 text-red-600"
							}`}
						>
							<Trash2 size={14} />
							Clear Session History
						</button>
						<button
							type="button"
							onClick={handleReset}
							className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
								theme === "dark"
									? "bg-white/5 hover:bg-white/10 text-gray-400"
									: "bg-black/5 hover:bg-black/10 text-gray-600"
							}`}
						>
							<RotateCcw size={14} />
							Reset Timer
						</button>
					</div>
				</section>

				{/* ─── Shortcuts ────────────────────────────── */}
				<section>
					<div className="flex items-center justify-between mb-4">
						<h3
							className={`text-xs font-bold uppercase tracking-widest ${
								theme === "dark" ? "text-gray-500" : "text-gray-400"
							}`}
						>
							Keyboard Shortcuts
						</h3>
						<button
							type="button"
							onClick={() => setShowShortcutsHelp(true)}
							className={`text-xs px-2 py-1 rounded transition-colors ${
								theme === "dark"
									? "bg-white/5 hover:bg-white/10 text-gray-400"
									: "bg-black/5 hover:bg-black/10 text-gray-600"
							}`}
						>
							View All
						</button>
					</div>

					<div className="space-y-3">
						{DEFAULT_SHORTCUTS.map((shortcut) => (
							<ShortcutEditor
								key={shortcut.id}
								command={shortcut.id}
								label={shortcut.description}
								binding={bindings[shortcut.id]}
								onUpdate={(binding) => updateBinding(shortcut.id, binding)}
								theme={theme}
							/>
						))}
					</div>

					<button
						type="button"
						onClick={resetBindings}
						className={`w-full mt-3 py-2 rounded-lg text-xs font-medium transition-colors ${
							theme === "dark"
								? "bg-white/5 hover:bg-white/10 text-gray-400"
								: "bg-black/5 hover:bg-black/10 text-gray-600"
						}`}
					>
						Reset to Defaults
					</button>
				</section>

				{/* Help Modal */}
				<ShortcutsHelp
					isOpen={showShortcutsHelp}
					onClose={() => setShowShortcutsHelp(false)}
					theme={theme}
				/>

				{/* ─── Integrations ─────────────────────────── */}
				<IntegrationsPanel theme={theme} />

				{/* ─── Updates ──────────────────────────────── */}
				<UpdateSection theme={theme} />

				{/* ─── About ────────────────────────────────── */}
				<section className="pb-6">
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
						About
					</h3>
					<p
						className={`text-xs leading-relaxed ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
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
	theme,
}: {
	label: string;
	value: boolean;
	onChange: () => void;
	theme: string;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm">{label}</span>
			<button
				type="button"
				onClick={onChange}
				className={`relative w-10 h-6 rounded-full transition-colors ${
					value
						? "bg-blue-500"
						: theme === "dark"
							? "bg-gray-700"
							: "bg-gray-300"
				}`}
			>
				<div
					className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
						value ? "translate-x-5" : "translate-x-1"
					}`}
				/>
			</button>
		</div>
	);
}

// ── Update section ──────────────────────────────────────────────────────────

const APP_VERSION = "1.0.6";

function UpdateSection({ theme }: { theme: string }) {
	const {
		status,
		updateInfo,
		downloadProgress,
		error,
		checkForUpdates,
		downloadAndInstall,
		restartApp,
	} = useUpdater();

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
						<RefreshCw size={14} />
						Check for Updates
					</>
				);
			case "checking":
				return (
					<>
						<RefreshCw size={14} className="animate-spin" />
						Checking...
					</>
				);
			case "available":
				return (
					<>
						<Download size={14} />
						Download Update
					</>
				);
			case "downloading":
				return (
					<>
						<Download size={14} />
						Downloading... {downloadProgress}%
					</>
				);
			case "ready":
				return (
					<>
						<RefreshCw size={14} />
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

	return (
		<section>
			<h3
				className={`text-xs font-bold uppercase tracking-widest mb-4 ${
					theme === "dark" ? "text-gray-500" : "text-gray-400"
				}`}
			>
				Updates
			</h3>
			<div className="space-y-3">
				<p
					className={`text-xs font-mono ${
						theme === "dark" ? "text-gray-500" : "text-gray-400"
					}`}
				>
					Current version: v{APP_VERSION}
				</p>
				<p
					className={`text-sm ${
						status === "error"
							? "text-red-400"
							: status === "available" || status === "ready"
								? "text-green-400"
								: theme === "dark"
									? "text-gray-400"
									: "text-gray-600"
					}`}
				>
					{getStatusText()}
				</p>

				{status === "downloading" && (
					<div className="w-full h-2 rounded-full bg-gray-700 overflow-hidden">
						<div
							className="h-full bg-blue-500 transition-all duration-300"
							style={{ width: `${downloadProgress}%` }}
						/>
					</div>
				)}

				{updateInfo && status === "available" && updateInfo.body && (
					<div
						className={`p-3 rounded-lg text-xs ${
							theme === "dark" ? "bg-white/5" : "bg-black/5"
						}`}
					>
						<p className="font-medium mb-1">What's new:</p>
						<p className={theme === "dark" ? "text-gray-400" : "text-gray-600"}>
							{updateInfo.body.slice(0, 200)}
							{updateInfo.body.length > 200 ? "..." : ""}
						</p>
					</div>
				)}

				<button
					type="button"
					onClick={handleClick}
					disabled={isDisabled}
					className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
						isDisabled
							? "opacity-50 cursor-not-allowed"
							: status === "available"
								? theme === "dark"
									? "bg-green-500/20 hover:bg-green-500/30 text-green-400"
									: "bg-green-50 hover:bg-green-100 text-green-600"
								: status === "ready"
									? theme === "dark"
										? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
										: "bg-blue-50 hover:bg-blue-100 text-blue-600"
									: theme === "dark"
										? "bg-white/5 hover:bg-white/10 text-gray-400"
										: "bg-black/5 hover:bg-black/10 text-gray-600"
					}`}
				>
					{getButtonContent()}
				</button>
			</div>
		</section>
	);
}
