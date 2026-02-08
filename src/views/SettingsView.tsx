/**
 * SettingsView -- Standalone settings window.
 *
 * Reads/writes settings from shared localStorage.
 * Cross-window sync happens via the `storage` event in useLocalStorage.
 */
import { useCallback, useRef } from "react";
import {
	Moon,
	RotateCcw,
	Sun,
	Trash2,
	Upload,
} from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ElasticSlider } from "@/components/PomodoroElasticSlider";
import { playNotificationSound } from "@/utils/soundPlayer";
import TitleBar from "@/components/TitleBar";
import type { PomodoroSettings, PomodoroSession } from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { invoke } from "@tauri-apps/api/core";

const STICKY_NOTE_SIZE = 220;

const DEFAULT_SETTINGS: PomodoroSettings = {
	workDuration: 25,
	shortBreakDuration: 5,
	longBreakDuration: 30,
	sessionsUntilLongBreak: 4,
	notificationSound: true,
	notificationVolume: 50,
	vibration: true,
	theme: "dark",
	autoPlayOnFocusSession: true,
	pauseOnBreak: true,
	youtubeDefaultVolume: 50,
	stickyWidgetSize: STICKY_NOTE_SIZE,
	youtubeWidgetWidth: 400,
	youtubeLoop: true,
	highlightColor: DEFAULT_HIGHLIGHT_COLOR,
};

const ACCENT_COLORS = [
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
	"#f97316",
	"#10b981",
	"#06b6d4",
	"#f43f5e",
];

const TOTAL_SCHEDULE_DURATION = 250; // 15+30+45+60+75 + 5*4+30

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

	const theme = settings.theme;
	const highlightColor = settings.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;

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
		} catch {
			// ignore
		}
	}, []);

	return (
		<div
			className={`w-screen h-screen overflow-y-auto select-none ${
				theme === "dark"
					? "bg-gray-900 text-white"
					: "bg-white text-gray-900"
			}`}
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
					<h3
						className={`text-xs font-bold uppercase tracking-widest mb-4 ${
							theme === "dark" ? "text-gray-500" : "text-gray-400"
						}`}
					>
						Keyboard Shortcuts
					</h3>
					<div
						className={`space-y-2 text-sm ${
							theme === "dark" ? "text-gray-400" : "text-gray-600"
						}`}
					>
						{(
							[
								["Space", "Start / Pause"],
								["S", "Skip Session"],
								["R", "Reset"],
								["Esc", "Close Panels"],
							] as const
						).map(([key, label]) => (
							<div
								key={key}
								className="flex items-center justify-between"
							>
								<span>{label}</span>
								<kbd
									className={`px-2 py-0.5 rounded text-xs font-mono ${
										theme === "dark"
											? "bg-white/10 text-gray-300"
											: "bg-gray-100 text-gray-700 border border-gray-200"
									}`}
								>
									{key}
								</kbd>
							</div>
						))}
					</div>
				</section>

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
