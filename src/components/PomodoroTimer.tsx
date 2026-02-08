import {
	BarChart2,
	Edit3,
	Image as ImageIcon,
	Moon,
	Music,
	Pin,
	PinOff,
	Maximize2,
	Minimize2,
	RotateCcw,
	Settings,
	StickyNote,
	Sun,
	Timer,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useNotifications } from "@/hooks/useNotifications";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import type {
	PomodoroSession,
	PomodoroSessionType,
	PomodoroSettings,
	PomodoroStats,
} from "@/types";
import { DEFAULT_HIGHLIGHT_COLOR } from "@/types";
import { playNotificationSound } from "@/utils/soundPlayer";
import { ElasticSlider } from "@/components/PomodoroElasticSlider";
import MiniTimer from "@/components/MiniTimer";
import StatsWidget from "@/components/StatsWidget";
import YouTubePlayer from "@/components/youtube/YouTubePlayer";

// ─── Constants ──────────────────────────────────────────────────────────────────

const STICKY_NOTE_COLORS = [
	"#fef9c3", // pale yellow
	"#fce7f3", // pale pink
	"#dbeafe", // pale blue
	"#dcfce7", // pale green
	"#f3e8ff", // pale purple
	"#ffedd5", // pale orange
	"#e0f2fe", // sky blue
	"#fef2f2", // rose
];

const STICKY_NOTE_SIZE = 220;

interface ScheduleStep {
	type: "focus" | "break";
	duration: number;
}

const SCHEDULE: ScheduleStep[] = (() => {
	const workDurations = [15, 30, 45, 60, 75];
	const breakDurations = [5, 5, 5, 5, 30];
	const steps: ScheduleStep[] = [];
	for (let i = 0; i < workDurations.length; i++) {
		steps.push({ type: "focus", duration: workDurations[i] });
		steps.push({ type: "break", duration: breakDurations[i] });
	}
	return steps;
})();

const TOTAL_SCHEDULE_DURATION = SCHEDULE.reduce(
	(sum, s) => sum + s.duration,
	0,
);

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

// ─── Types ──────────────────────────────────────────────────────────────────────

type WidgetType = "sticky-note" | "mini-timer" | "stats" | "youtube" | "image";

interface WidgetData {
	id: string;
	type: WidgetType;
	x: number;
	y: number;
	width: number;
	height: number;
	content?: string;
	color?: string;
	minimized?: boolean;
	zIndex?: number;
	imageUrl?: string;
	title?: string;
}

interface DragState {
	widgetId: string;
	offsetX: number;
	offsetY: number;
}

const WIDGET_DEFAULTS: Record<WidgetType, { width: number; height: number }> = {
	"sticky-note": { width: STICKY_NOTE_SIZE, height: STICKY_NOTE_SIZE },
	"mini-timer": { width: 280, height: 260 },
	stats: { width: 300, height: 280 },
	youtube: { width: 400, height: 340 },
	image: { width: 300, height: 300 },
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

// ─── Utility Functions ──────────────────────────────────────────────────────────

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function formatTimeStr(totalSeconds: number): string {
	const absSecs = Math.abs(totalSeconds);
	const minutes = Math.floor(absSecs / 60);
	const seconds = absSecs % 60;
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
	if (minutes >= 60) {
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	return `${minutes}m`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

// ─── MarkdownViewer ─────────────────────────────────────────────────────────────

function MarkdownViewer({
	content,
	className,
}: {
	content: string;
	className?: string;
}) {
	const html = useMemo(() => {
		const result = content
			// Escape HTML
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			// Headers
			.replace(
				/^### (.+)$/gm,
				"<h3 class='text-sm font-bold mt-2 mb-1'>$1</h3>",
			)
			.replace(
				/^## (.+)$/gm,
				"<h2 class='text-base font-bold mt-2 mb-1'>$1</h2>",
			)
			.replace(
				/^# (.+)$/gm,
				"<h1 class='text-lg font-bold mt-2 mb-1'>$1</h1>",
			)
			// Bold + Italic
			.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
			// Bold
			.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
			// Italic
			.replace(/\*(.+?)\*/g, "<em>$1</em>")
			// Strikethrough
			.replace(/~~(.+?)~~/g, "<del class='opacity-60'>$1</del>")
			// Inline code
			.replace(
				/`(.+?)`/g,
				"<code class='px-1 py-0.5 rounded bg-black/10 text-sm font-mono'>$1</code>",
			)
			// Links
			.replace(
				/\[(.+?)\]\((.+?)\)/g,
				"<a href='$2' target='_blank' rel='noopener noreferrer' class='underline text-blue-600 hover:text-blue-800'>$1</a>",
			)
			// Checkboxes
			.replace(
				/- \[x\] (.+)/gi,
				"<div class='flex items-center gap-1.5'><span class='text-green-600'>&#x2713;</span><span class='line-through opacity-60'>$1</span></div>",
			)
			.replace(
				/- \[ \] (.+)/g,
				"<div class='flex items-center gap-1.5'><span class='opacity-40'>&#x25A2;</span><span>$1</span></div>",
			)
			// Unordered lists
			.replace(/^[\-\*] (.+)$/gm, "<li class='ml-4 list-disc'>$1</li>")
			// Ordered lists
			.replace(
				/^\d+\. (.+)$/gm,
				"<li class='ml-4 list-decimal'>$1</li>",
			)
			// Horizontal rule
			.replace(/^---$/gm, "<hr class='my-2 border-black/10' />")
			// Line breaks
			.replace(/\n/g, "<br />");

		return result;
	}, [content]);

	return (
		<div
			className={`prose prose-sm max-w-none wrap-break-word leading-relaxed ${className ?? ""}`}
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

// ─── Custom Title Bar ────────────────────────────────────────────────────────────

function TitleBar({
	theme,
	floatMode,
	alwaysOnTop,
	onMinimize,
	onToggleMaximize,
	onClose,
	onDrag,
	onToggleFloat,
	onTogglePin,
}: {
	theme: string;
	floatMode: boolean;
	alwaysOnTop: boolean;
	onMinimize: () => void;
	onToggleMaximize: () => void;
	onClose: () => void;
	onDrag: () => void;
	onToggleFloat: () => void;
	onTogglePin: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const isDark = floatMode || theme === "dark";

	const btnBase = `h-8 flex items-center justify-center transition-colors ${
		isDark
			? "hover:bg-white/10 text-gray-400 hover:text-white"
			: "hover:bg-black/5 text-gray-500 hover:text-gray-900"
	}`;

	return (
		<div
			className="fixed top-0 left-0 right-0 z-[200] select-none"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<div
				className={`h-8 flex items-center transition-all duration-300 ${
					hovered
						? isDark
							? "bg-black/60 backdrop-blur-sm"
							: "bg-white/80 backdrop-blur-sm"
						: "bg-transparent"
				}`}
				onMouseDown={(e) => {
					if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
						onDrag();
					}
				}}
			>
				{/* Left: mode toggles */}
				<div
					className={`flex items-center gap-0 ml-1 transition-opacity duration-300 ${
						hovered ? "opacity-100" : "opacity-0 pointer-events-none"
					}`}
				>
					{/* Pin toggle */}
					<button
						type="button"
						onClick={onTogglePin}
						className={`${btnBase} w-8 ${alwaysOnTop ? "!text-blue-400" : ""}`}
						title={alwaysOnTop ? "Unpin" : "Pin on Top"}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill={alwaysOnTop ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
						</svg>
					</button>
					{/* Float toggle */}
					<button
						type="button"
						onClick={onToggleFloat}
						className={`${btnBase} w-8 ${floatMode ? "!text-blue-400" : ""}`}
						title={floatMode ? "Exit Compact" : "Compact Mode"}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							{floatMode ? (
								<>{/* Maximize2 */}<polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
							) : (
								<>{/* Minimize2 */}<polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
							)}
						</svg>
					</button>
				</div>

				<div className="flex-1" />

				{/* Right: window controls */}
				<div
					className={`flex items-center gap-0 transition-opacity duration-300 ${
						hovered ? "opacity-100" : "opacity-0 pointer-events-none"
					}`}
				>
					{!floatMode && (
						<>
							<button type="button" onClick={onMinimize} className={`${btnBase} w-11`}>
								<svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
									<rect width="10" height="1" />
								</svg>
							</button>
							<button type="button" onClick={onToggleMaximize} className={`${btnBase} w-11`}>
								<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
									<rect x="0.5" y="0.5" width="9" height="9" />
								</svg>
							</button>
						</>
					)}
					<button
						type="button"
						onClick={onClose}
						className={`w-11 h-8 flex items-center justify-center transition-colors ${
							isDark
								? "hover:bg-red-500/80 text-gray-400 hover:text-white"
								: "hover:bg-red-500/80 text-gray-500 hover:text-white"
						}`}
					>
						<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
							<line x1="0" y1="0" x2="10" y2="10" />
							<line x1="10" y1="0" x2="0" y2="10" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Dock Components ────────────────────────────────────────────────────────────

function DockButton({
	icon: Icon,
	label,
	onClick,
	active,
	theme,
	badge,
}: {
	icon: React.ComponentType<{ size: number; className?: string }>;
	label: string;
	onClick: () => void;
	active?: boolean;
	theme: "light" | "dark";
	badge?: string | number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			className={`relative p-2.5 rounded-xl transition-all duration-200 ${
				active
					? theme === "dark"
						? "bg-white/20 text-white"
						: "bg-black/15 text-gray-900"
					: theme === "dark"
						? "text-gray-400 hover:text-white hover:bg-white/10"
						: "text-gray-500 hover:text-gray-900 hover:bg-black/5"
			}`}
		>
			<Icon size={20} />
			{badge !== undefined && (
				<span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1">
					{badge}
				</span>
			)}
		</button>
	);
}

function DockItem({
	children,
	mouseX,
}: {
	children: React.ReactNode;
	mouseX: number | null;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		if (mouseX === null || !ref.current) {
			setScale(1);
			return;
		}
		const rect = ref.current.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const distance = Math.abs(mouseX - center);
		const maxDistance = 120;
		const newScale = 1 + Math.max(0, 1 - distance / maxDistance) * 0.35;
		setScale(newScale);
	}, [mouseX]);

	return (
		<div
			ref={ref}
			className="transition-transform duration-150 origin-bottom"
			style={{ transform: `scale(${scale})` }}
		>
			{children}
		</div>
	);
}

function Dock({
	children,
	theme,
	className = "",
}: {
	children: React.ReactNode;
	theme: "light" | "dark";
	className?: string;
}) {
	const [mouseX, setMouseX] = useState<number | null>(null);
	const childArray = React.Children.toArray(children);

	return (
		<div
			className={`fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-end gap-1 px-3 py-2 rounded-2xl backdrop-blur-xl border transition-colors duration-300 ${
				theme === "dark"
					? "bg-gray-900/70 border-white/10"
					: "bg-white/70 border-black/10 shadow-lg"
			} ${className}`}
			onMouseMove={(e) => setMouseX(e.clientX)}
			onMouseLeave={() => setMouseX(null)}
		>
			{childArray.map((child, i) => (
				<DockItem key={i} mouseX={mouseX}>
					{child}
				</DockItem>
			))}
		</div>
	);
}

// ─── Widget Component ───────────────────────────────────────────────────────────

function Widget({
	widget,
	onDragStart,
	onRemove,
	onBringToFront,
	children,
	theme,
}: {
	widget: WidgetData;
	onDragStart: (e: React.MouseEvent, id: string) => void;
	onRemove: (id: string) => void;
	onBringToFront: (id: string) => void;
	children: React.ReactNode;
	theme: "light" | "dark";
}) {
	const isStickyNote = widget.type === "sticky-note";

	return (
		<div
			className="absolute group select-none"
			style={{
				left: widget.x,
				top: widget.y,
				width: widget.width,
				height: widget.height,
				zIndex: widget.zIndex || 1,
			}}
			onMouseDown={() => onBringToFront(widget.id)}
		>
			{/* Tape handle – CSS-only tape effect */}
			<div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
				<div
					className="h-8 w-44"
					style={{
						background:
							"linear-gradient(90deg, transparent 2%, rgba(200,180,140,0.45) 5%, rgba(220,200,160,0.55) 50%, rgba(200,180,140,0.45) 95%, transparent 98%)",
						borderRadius: "2px",
					}}
				/>
			</div>

			{/* Drag area (covers tape + top of widget) */}
			<div
				className="absolute -top-3 inset-x-0 h-10 cursor-grab active:cursor-grabbing z-20"
				onMouseDown={(e) => {
					e.preventDefault();
					onDragStart(e, widget.id);
				}}
			/>

			{/* Delete button */}
			<button
				type="button"
				className="absolute -top-2 -right-2 z-30 p-1 rounded-full bg-red-500/80 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm"
				onClick={(e) => {
					e.stopPropagation();
					onRemove(widget.id);
				}}
			>
				<X size={12} />
			</button>

			{/* Widget body */}
			<div
				className={`w-full h-full rounded-lg overflow-hidden shadow-xl ring-1 transition-shadow duration-200 ${
					isStickyNote
						? "ring-black/5"
						: theme === "dark"
							? "ring-white/10 bg-gray-900/90 backdrop-blur-sm"
							: "ring-black/5 bg-white/95 backdrop-blur-sm"
				}`}
				style={
					isStickyNote
						? {
								backgroundColor:
									widget.color || STICKY_NOTE_COLORS[0],
							}
						: undefined
				}
			>
				{children}
			</div>
		</div>
	);
}

// ─── Main PomodoroTimer Component ───────────────────────────────────────────────

export default function PomodoroTimer() {
	// ─── Notifications ──────────────────────────────────────────────────────────
	const { requestPermission, showNotification } = useNotifications();

	// ─── Rust Engine (via Tauri IPC) ────────────────────────────────────────────
	const timer = useTauriTimer();

	// ─── Persisted State (localStorage -- UI-only state) ────────────────────────
	const [settings, setSettings] = useLocalStorage<PomodoroSettings>(
		"pomodoroom-settings",
		DEFAULT_SETTINGS,
	);

	const [sessions, setSessions] = useLocalStorage<PomodoroSession[]>(
		"pomodoroom-sessions",
		[],
	);

	const [widgets, setWidgets] = useLocalStorage<WidgetData[]>(
		"pomodoroom-widgets",
		[],
	);

	const [youtubeUrl, setYoutubeUrl] = useLocalStorage<string>(
		"pomodoroom-youtube-url",
		"",
	);

	const [customBackground, setCustomBackground] = useLocalStorage<string>(
		"pomodoroom-custom-bg",
		"",
	);

	const [completedCycles, setCompletedCycles] = useLocalStorage<number>(
		"pomodoroom-completed-cycles",
		0,
	);

	// ─── Local UI State ─────────────────────────────────────────────────────────
	const [showSettings, setShowSettings] = useState(false);
	const [showStopDialog, setShowStopDialog] = useState(false);
	const [nextZIndex, setNextZIndex] = useState(10);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [editingWidget, setEditingWidget] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");

	// ─── Refs ───────────────────────────────────────────────────────────────────
	const containerRef = useRef<HTMLDivElement>(null);
	const bgFileInputRef = useRef<HTMLInputElement>(null);
	const prevStepRef = useRef<number>(timer.stepIndex);
	const rightDragRef = useRef<{
		startX: number;
		startY: number;
		winX: number;
		winY: number;
		scale: number;
	} | null>(null);

	// ─── Derived State (from Rust engine) ───────────────────────────────────────
	const theme = settings.theme;
	const currentStepIndex = timer.stepIndex;
	const currentStep = SCHEDULE[currentStepIndex] || SCHEDULE[0];
	const timeRemaining = timer.remainingSeconds;
	const progress = timer.progress;
	const isActive = timer.isActive;
	const highlightColor = settings.highlightColor || DEFAULT_HIGHLIGHT_COLOR;

	const pomodoroState = useMemo(
		() => ({
			isActive,
			sessionType:
				currentStep.type === "focus"
					? ("work" as const)
					: currentStepIndex === SCHEDULE.length - 1
						? ("longBreak" as const)
						: ("shortBreak" as const),
		}),
		[isActive, currentStep.type, currentStepIndex],
	);

	// ─── Stats ──────────────────────────────────────────────────────────────────
	const stats = useMemo<PomodoroStats>(() => {
		const completedSessions = sessions.filter((s) => s.completed);
		const focusSessions = completedSessions.filter(
			(s) => s.type === "focus",
		);
		const breakSessions = completedSessions.filter(
			(s) => s.type !== "focus",
		);

		const now = new Date();
		const todayStr = now.toISOString().slice(0, 10);
		const todaysSessions = completedSessions.filter(
			(s) => s.endTime && s.endTime.startsWith(todayStr),
		).length;

		let currentStreak = 0;
		let longestStreak = 0;

		if (focusSessions.length > 0) {
			const uniqueDays = new Set(
				focusSessions
					.filter((s) => s.endTime)
					.map((s) => (s.endTime as string).slice(0, 10)),
			);
			const sortedDays = Array.from(uniqueDays).sort().reverse();
			const today = now.toISOString().slice(0, 10);
			const checkDate = new Date(today);
			for (const day of sortedDays) {
				const dayStr = checkDate.toISOString().slice(0, 10);
				if (day === dayStr) {
					currentStreak++;
					checkDate.setDate(checkDate.getDate() - 1);
				} else if (day < dayStr) {
					break;
				}
			}
			const allDays = Array.from(uniqueDays).sort();
			let streak = 1;
			for (let i = 1; i < allDays.length; i++) {
				const prev = new Date(allDays[i - 1]);
				const curr = new Date(allDays[i]);
				const diff =
					(curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
				if (Math.abs(diff - 1) < 0.01) {
					streak++;
				} else {
					longestStreak = Math.max(longestStreak, streak);
					streak = 1;
				}
			}
			longestStreak = Math.max(longestStreak, streak);
		}

		return {
			totalSessions: completedSessions.length,
			totalWorkTime: focusSessions.reduce((acc, s) => acc + s.duration, 0),
			totalBreakTime: breakSessions.reduce((acc, s) => acc + s.duration, 0),
			completedPomodoros: focusSessions.length,
			currentStreak,
			longestStreak,
			todaysSessions,
		};
	}, [sessions]);

	// ─── Effects ────────────────────────────────────────────────────────────────

	useEffect(() => {
		requestPermission();
	}, [requestPermission]);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
		document.documentElement.style.colorScheme = theme;
	}, [theme]);

	useEffect(() => {
		if (isActive) {
			document.title = `${formatTimeStr(timeRemaining)} \u2013 ${
				timer.stepType === "focus" ? "Focus" : "Break"
			} | Pomodoroom`;
		} else {
			document.title = "Pomodoroom";
		}
		return () => {
			document.title = "Pomodoroom";
		};
	}, [isActive, timeRemaining, timer.stepType]);

	useEffect(() => {
		if (widgets.length > 0) {
			const maxZ = Math.max(...widgets.map((w) => w.zIndex || 0));
			if (maxZ >= nextZIndex) setNextZIndex(maxZ + 1);
		}
	}, []);

	// ─── Detect step completion from Rust engine ────────────────────────────────
	useEffect(() => {
		if (!timer.snapshot?.completed) return;
		const { step_type } = timer.snapshot.completed;

		// Play notification sound
		if (settings.notificationSound) {
			playNotificationSound(settings.notificationVolume / 100);
		}
		if (settings.vibration && navigator.vibrate) {
			navigator.vibrate([200, 100, 200, 100, 200]);
		}

		// Record session locally for widget stats
		const endTime = new Date().toISOString();
		const sessionType: PomodoroSessionType =
			step_type === "focus" ? "focus" : "break";
		const newSession: PomodoroSession = {
			id: generateId(),
			type: sessionType,
			duration: currentStep.duration,
			completedAt: endTime,
			startTime: endTime,
			endTime,
			completed: true,
		};
		setSessions((prev: PomodoroSession[]) => [...prev, newSession]);

		showNotification({
			title: step_type === "focus" ? "Focus Complete!" : "Break Over!",
			body:
				step_type === "focus"
					? `Great work! Focus session done.`
					: "Break's over. Ready for the next focus session?",
		});

		// Auto-advance via Rust engine (start next step)
		timer.start();
	}, [timer.snapshot?.completed]);

	// Track step index changes for cycle counting
	useEffect(() => {
		if (timer.stepIndex === 0 && prevStepRef.current > 0) {
			setCompletedCycles((prev: number) => prev + 1);
		}
		prevStepRef.current = timer.stepIndex;
	}, [timer.stepIndex, setCompletedCycles]);

	// ─── Widget Dragging ────────────────────────────────────────────────────────
	useEffect(() => {
		if (!dragState) return;

		const handleMouseMove = (e: MouseEvent) => {
			setWidgets((prev: WidgetData[]) =>
				prev.map((w) => {
					if (w.id !== dragState.widgetId) return w;
					return {
						...w,
						x: clamp(
							e.clientX - dragState.offsetX,
							0,
							window.innerWidth - w.width,
						),
						y: clamp(
							e.clientY - dragState.offsetY,
							0,
							window.innerHeight - w.height,
						),
					};
				}),
			);
		};

		const handleMouseUp = () => {
			setDragState(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [dragState, setWidgets]);

	// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger shortcuts when typing in inputs
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			if (e.key === " " || e.code === "Space") {
				e.preventDefault();
				if (isActive) {
					handlePause();
				} else {
					handleStart();
				}
			} else if (
				e.key === "s" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleSkip();
			} else if (
				e.key === "r" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleReset();
			} else if (e.key === "Escape") {
				if (showStopDialog) {
					setShowStopDialog(false);
				} else if (showSettings) {
					setShowSettings(false);
				} else if (editingWidget) {
					cancelNoteEdit();
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
		// Note: handler functions are stable due to useCallback and captured via closure
	}, [isActive, showSettings, showStopDialog, editingWidget]);

	// ─── Timer Control Functions (delegate to Rust engine) ──────────────────────

	const handleStart = useCallback(() => {
		if (timer.isPaused) {
			timer.resume();
		} else {
			timer.start();
		}
	}, [timer]);

	const handlePause = useCallback(() => {
		timer.pause();
	}, [timer]);

	const handleStop = useCallback(() => {
		setShowStopDialog(false);
		timer.reset();
	}, [timer]);

	const handleSkip = useCallback(() => {
		setShowStopDialog(false);
		timer.skip();
	}, [timer]);

	const handleReset = useCallback(() => {
		timer.reset();
	}, [timer]);

	const handleTimerClick = useCallback(() => {
		if (timer.isCompleted) {
			timer.start();
		} else if (isActive) {
			setShowStopDialog(true);
		} else {
			handleStart();
		}
	}, [timer, isActive, handleStart]);

	// ─── Widget Functions ───────────────────────────────────────────────────────

	const addWidget = useCallback(
		(type: WidgetType) => {
			const defaults = WIDGET_DEFAULTS[type];
			const stickySize = settings.stickyWidgetSize || STICKY_NOTE_SIZE;
			const ytWidth = settings.youtubeWidgetWidth || 400;

			let width = defaults.width;
			let height = defaults.height;

			if (type === "sticky-note") {
				width = stickySize;
				height = stickySize;
			} else if (type === "youtube") {
				width = ytWidth;
				height = Math.round(ytWidth * 0.85);
			}

			// Offset so widgets don't stack exactly
			const existing = widgets.filter((w) => w.type === type).length;
			const baseX = 80 + existing * 30;
			const baseY = 80 + existing * 30;

			const newWidget: WidgetData = {
				id: generateId(),
				type,
				x: clamp(baseX, 0, Math.max(0, window.innerWidth - width - 40)),
				y: clamp(
					baseY,
					0,
					Math.max(0, window.innerHeight - height - 100),
				),
				width,
				height,
				content: type === "sticky-note" ? "" : undefined,
				color:
					type === "sticky-note"
						? STICKY_NOTE_COLORS[
								widgets.filter((w) => w.type === "sticky-note")
									.length % STICKY_NOTE_COLORS.length
							]
						: undefined,
				zIndex: nextZIndex,
				title:
					type === "sticky-note"
						? "Note"
						: type === "mini-timer"
							? "Timer"
							: type === "stats"
								? "Stats"
								: type === "youtube"
									? "Music"
									: "Image",
			};

			setWidgets((prev: WidgetData[]) => [...prev, newWidget]);
			setNextZIndex((prev) => prev + 1);
		},
		[
			widgets,
			settings.stickyWidgetSize,
			settings.youtubeWidgetWidth,
			nextZIndex,
			setWidgets,
		],
	);

	const removeWidget = useCallback(
		(id: string) => {
			setWidgets((prev: WidgetData[]) => prev.filter((w) => w.id !== id));
			if (editingWidget === id) {
				setEditingWidget(null);
				setEditContent("");
			}
		},
		[editingWidget, setWidgets],
	);

	const updateWidgetContent = useCallback(
		(id: string, content: string) => {
			setWidgets((prev: WidgetData[]) =>
				prev.map((w) => (w.id === id ? { ...w, content } : w)),
			);
		},
		[setWidgets],
	);

	const updateWidgetColor = useCallback(
		(id: string, color: string) => {
			setWidgets((prev: WidgetData[]) =>
				prev.map((w) => (w.id === id ? { ...w, color } : w)),
			);
		},
		[setWidgets],
	);

	const handleWidgetDragStart = useCallback(
		(e: React.MouseEvent, widgetId: string) => {
			const widget = widgets.find((w) => w.id === widgetId);
			if (!widget) return;

			setDragState({
				widgetId,
				offsetX: e.clientX - widget.x,
				offsetY: e.clientY - widget.y,
			});

			// Bring to front
			setWidgets((prev: WidgetData[]) =>
				prev.map((w) =>
					w.id === widgetId ? { ...w, zIndex: nextZIndex } : w,
				),
			);
			setNextZIndex((prev) => prev + 1);
		},
		[widgets, nextZIndex, setWidgets],
	);

	const bringToFront = useCallback(
		(widgetId: string) => {
			setWidgets((prev: WidgetData[]) =>
				prev.map((w) =>
					w.id === widgetId ? { ...w, zIndex: nextZIndex } : w,
				),
			);
			setNextZIndex((prev) => prev + 1);
		},
		[nextZIndex, setWidgets],
	);

	// ─── Settings Functions ─────────────────────────────────────────────────────

	const updateSetting = useCallback(
		<K extends keyof PomodoroSettings>(
			key: K,
			value: PomodoroSettings[K],
		) => {
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

	const clearAllSessions = useCallback(() => {
		setSessions([]);
	}, [setSessions]);

	const clearAllWidgets = useCallback(() => {
		setWidgets([]);
		setEditingWidget(null);
		setEditContent("");
	}, [setWidgets]);

	// ─── Image Upload Functions ─────────────────────────────────────────────────

	const handleImageUpload = useCallback(
		(widgetId: string, file: File) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const dataUrl = e.target?.result as string;
				setWidgets((prev: WidgetData[]) =>
					prev.map((w) =>
						w.id === widgetId ? { ...w, imageUrl: dataUrl } : w,
					),
				);
			};
			reader.readAsDataURL(file);
		},
		[setWidgets],
	);

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

	// ─── Note Editing ───────────────────────────────────────────────────────────

	const startEditingNote = useCallback((widget: WidgetData) => {
		setEditingWidget(widget.id);
		setEditContent(widget.content || "");
	}, []);

	const saveNoteEdit = useCallback(() => {
		if (editingWidget) {
			updateWidgetContent(editingWidget, editContent);
			setEditingWidget(null);
			setEditContent("");
		}
	}, [editingWidget, editContent, updateWidgetContent]);

	const cancelNoteEdit = useCallback(() => {
		setEditingWidget(null);
		setEditContent("");
	}, []);

	// ─── Right-Click Window Drag (PureRef-style) ────────────────────────────────

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = rightDragRef.current;
			if (!d) return;
			const dx = (e.screenX - d.startX) * d.scale;
			const dy = (e.screenY - d.startY) * d.scale;
			getCurrentWindow().setPosition(
				new PhysicalPosition(d.winX + dx, d.winY + dy),
			);
		};
		const onUp = () => {
			rightDragRef.current = null;
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	const handleRightDown = useCallback(async (e: React.MouseEvent) => {
		if (e.button !== 2) return;
		e.preventDefault();
		try {
			const win = getCurrentWindow();
			const [pos, scale] = await Promise.all([
				win.outerPosition(),
				win.scaleFactor(),
			]);
			rightDragRef.current = {
				startX: e.screenX,
				startY: e.screenY,
				winX: pos.x,
				winY: pos.y,
				scale,
			};
		} catch {
			// Not in Tauri context
		}
	}, []);

	// ─── Render ─────────────────────────────────────────────────────────────────

	return (
		<div
			ref={containerRef}
			className={`relative w-screen h-screen overflow-hidden select-none transition-colors duration-500 ${
				timer.windowState.float_mode
					? "bg-transparent text-white"
					: theme === "dark"
						? "bg-gray-950 text-white"
						: "bg-stone-100 text-gray-900"
			}`}
			onMouseDown={handleRightDown}
			onContextMenu={(e) => e.preventDefault()}
			style={
				!timer.windowState.float_mode && customBackground
					? {
							backgroundImage: `url(${customBackground})`,
							backgroundSize: "cover",
							backgroundPosition: "center",
						}
					: undefined
			}
		>
			{/* Background overlay when custom bg is set (not in float mode) */}
			{!timer.windowState.float_mode && customBackground && (
				<div
					className={`absolute inset-0 ${
						theme === "dark" ? "bg-black/40" : "bg-white/30"
					}`}
				/>
			)}

			{/* ─── Custom Title Bar ──────────────────────────────────────────── */}
			<TitleBar
				theme={theme}
				floatMode={timer.windowState.float_mode}
				alwaysOnTop={timer.windowState.always_on_top}
				onMinimize={timer.minimizeWindow}
				onToggleMaximize={timer.toggleMaximizeWindow}
				onClose={timer.closeWindow}
				onDrag={timer.startDrag}
				onToggleFloat={() => timer.setFloatMode(!timer.windowState.float_mode)}
				onTogglePin={() => timer.setAlwaysOnTop(!timer.windowState.always_on_top)}
			/>

			{/* ─── Workflow Progress Bar (hidden in float mode) ────────────────── */}
			<div className={`relative z-10 px-6 pt-4 pb-2 ${timer.windowState.float_mode ? "hidden" : ""}`}>
				<div className="flex items-center gap-1 w-full">
					{SCHEDULE.map((step, index) => {
						const isCurrentStep = index === currentStepIndex;
						const isCompleted = index < currentStepIndex;
						const isFocus = step.type === "focus";

						return (
							<div
								key={index}
								className="flex flex-col items-center transition-all duration-300"
								style={{ flex: step.duration }}
							>
								<div
									className={`w-full rounded-full transition-all duration-500 overflow-hidden ${
										isCurrentStep
											? "h-2.5 shadow-sm"
											: isCompleted
												? "h-1.5 opacity-50"
												: "h-1.5 opacity-20"
									}`}
									style={{
										backgroundColor: isCurrentStep
											? "transparent"
											: isCompleted
												? theme === "dark"
													? "#6b7280"
													: "#9ca3af"
												: theme === "dark"
													? "#374151"
													: "#d1d5db",
									}}
								>
									{isCurrentStep ? (
										<>
											{/* Track background */}
											<div
												className="absolute inset-0 rounded-full"
												style={{
													backgroundColor: isFocus
														? `${highlightColor}30`
														: "#10b98130",
												}}
											/>
											{/* Fill */}
											<div
												className="h-full rounded-full transition-all duration-1000 ease-linear relative"
												style={{
													width: `${progress * 100}%`,
													backgroundColor: isFocus
														? highlightColor
														: "#10b981",
												}}
											/>
										</>
									) : isCompleted ? (
										<div
											className="h-full w-full rounded-full"
											style={{
												backgroundColor:
													theme === "dark"
														? "#6b7280"
														: "#9ca3af",
											}}
										/>
									) : null}
								</div>
								<span
									className={`text-[9px] mt-1 font-medium transition-opacity ${
										isCurrentStep
											? "opacity-80"
											: isCompleted
												? "opacity-30"
												: "opacity-15"
									}`}
								>
									{isFocus ? "F" : "B"}
									{step.duration}
								</span>
							</div>
						);
					})}
				</div>

				{/* Cycle counter */}
				{completedCycles > 0 && (
					<div className="text-center mt-1">
						<span
							className={`text-[10px] font-medium ${
								theme === "dark"
									? "text-gray-500"
									: "text-gray-400"
							}`}
						>
							Cycle {completedCycles + 1} &bull;{" "}
							{formatMinutes(TOTAL_SCHEDULE_DURATION)} total
						</span>
					</div>
				)}
			</div>

			{/* ─── Step Label (hidden in float mode) ─────────────────────────── */}
			{!timer.windowState.float_mode && (
				<div
					className={`fixed top-16 left-1/2 -translate-x-1/2 z-30 text-sm tracking-[0.4em] uppercase font-bold opacity-30 pointer-events-none ${
						theme === "dark" ? "text-white" : "text-black"
					}`}
				>
					{currentStep.type === "focus" ? "Focus" : "Break"}
				</div>
			)}

			{/* ─── Main Timer (click to interact) ─────────────────────────────── */}
			<div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none">
				<div
					className="relative flex items-center justify-center"
					style={{
						width: "min(70vmin, 420px)",
						height: "min(70vmin, 420px)",
					}}
				>
					<svg
						className="absolute inset-0 w-full h-full"
						viewBox="0 0 100 100"
						aria-hidden="true"
						style={{ transform: "rotate(90deg) scaleX(-1)" }}
					>
						<circle
							cx="50"
							cy="50"
							r="45"
							stroke={
								timer.windowState.float_mode
									? "rgba(255, 255, 255, 0.15)"
									: theme === "dark"
										? "#555"
										: "#ddd"
							}
							strokeWidth="3"
							fill="none"
						/>
						<circle
							cx="50"
							cy="50"
							r="45"
							stroke={
								currentStep.type === "focus"
									? timer.windowState.float_mode
										? "rgba(255, 255, 255, 0.6)"
										: theme === "dark"
											? "rgba(255, 255, 255, 0.5)"
											: "rgba(0, 0, 0, 0.5)"
									: timer.windowState.float_mode
										? "rgba(14, 165, 233, 0.7)"
										: theme === "dark"
											? "rgba(14, 165, 233, 0.5)"
											: "rgba(59, 130, 246, 0.5)"
							}
							strokeWidth="3"
							fill="none"
							strokeDasharray={Math.PI * 2 * 45}
							strokeDashoffset={Math.PI * 2 * 45 * progress}
							strokeLinecap="butt"
						/>
					</svg>

					<button
						type="button"
						onClick={handleTimerClick}
						className="relative pointer-events-auto focus:outline-none"
						style={{ zIndex: 50 }}
					>
						{(() => {
							const ms = timer.remainingMs;
							const totalSecs = Math.floor(ms / 1000);
							const mins = Math.floor(totalSecs / 60);
							const secs = totalSecs % 60;
							const cs = Math.floor((ms % 1000) / 10);
							return (
								<div
									className={`flex items-baseline justify-center tabular-nums tracking-[-0.15em] select-none cursor-pointer font-mono font-bold transition-opacity duration-300 ${
										timer.windowState.float_mode
											? "text-white"
											: theme === "dark"
												? "text-neutral-100"
												: "text-slate-900"
									} ${isActive ? "opacity-100" : "opacity-60 hover:opacity-80"}`}
								>
									<span className="leading-none" style={{ fontSize: "min(12vmin, 72px)" }}>
										{String(mins).padStart(2, "0")}
									</span>
									<span
										className={`leading-none -mx-[0.5vmin] ${isActive ? "animate-pulse" : "opacity-50"}`}
										style={{ fontSize: "min(12vmin, 72px)" }}
									>
										:
									</span>
									<span className="leading-none" style={{ fontSize: "min(12vmin, 72px)" }}>
										{String(secs).padStart(2, "0")}
									</span>
									<span
										className="leading-none ml-1 opacity-40 font-medium self-end mb-1"
										style={{ fontSize: "min(4vmin, 24px)" }}
									>
										.{String(cs).padStart(2, "0")}
									</span>
								</div>
							);
						})()}
					</button>
				</div>
			</div>

			{/* ─── Widgets Layer (hidden in float mode) ──────────────────────── */}
			<div className={`absolute inset-0 z-20 pointer-events-none ${timer.windowState.float_mode ? "hidden" : ""}`}>
				{widgets.map((widget) => (
					<div key={widget.id} className="pointer-events-auto">
						<Widget
							widget={widget}
							onDragStart={handleWidgetDragStart}
							onRemove={removeWidget}
							onBringToFront={bringToFront}
							theme={theme}
						>
							{/* ── Sticky Note ── */}
							{widget.type === "sticky-note" && (
								<div className="flex flex-col w-full h-full p-3">
									{editingWidget === widget.id ? (
										<>
											{/* Color picker row */}
											<div className="flex items-center gap-1 mb-2 shrink-0 no-drag">
												{STICKY_NOTE_COLORS.map(
													(color) => (
														<button
															key={color}
															type="button"
															className={`w-5 h-5 rounded-full border-2 transition-transform ${
																widget.color ===
																color
																	? "border-gray-800 scale-110"
																	: "border-transparent hover:scale-105"
															}`}
															style={{
																backgroundColor:
																	color,
															}}
															onClick={() =>
																updateWidgetColor(
																	widget.id,
																	color,
																)
															}
														/>
													),
												)}
											</div>

											{/* Text area */}
											<textarea
												className="flex-1 w-full bg-transparent resize-none outline-none text-sm text-gray-800 placeholder-gray-500/50 no-drag"
												value={editContent}
												onChange={(e) =>
													setEditContent(
														e.target.value,
													)
												}
												placeholder="Write your note... (Markdown supported)"
												autoFocus
											/>

											{/* Save / Cancel */}
											<div className="flex items-center justify-end gap-2 mt-2 shrink-0 no-drag">
												<button
													type="button"
													className="px-3 py-1 text-xs rounded bg-black/10 hover:bg-black/20 text-gray-700 transition-colors"
													onClick={cancelNoteEdit}
												>
													Cancel
												</button>
												<button
													type="button"
													className="px-3 py-1 text-xs rounded bg-gray-800 hover:bg-gray-900 text-white transition-colors"
													onClick={saveNoteEdit}
												>
													Save
												</button>
											</div>
										</>
									) : (
										<>
											{/* Header row */}
											<div className="flex items-center justify-between mb-1 shrink-0">
												<span className="text-[10px] font-bold uppercase tracking-wider text-gray-700/60">
													{widget.title || "Note"}
												</span>
												<button
													type="button"
													className="p-1 rounded hover:bg-black/10 text-gray-600 transition-colors no-drag"
													onClick={() =>
														startEditingNote(widget)
													}
												>
													<Edit3 size={12} />
												</button>
											</div>

											{/* Content */}
											<div className="flex-1 overflow-y-auto text-sm text-gray-800 no-drag">
												{widget.content ? (
													<MarkdownViewer
														content={
															widget.content
														}
														className="text-gray-800"
													/>
												) : (
													<p className="text-gray-500/50 italic text-xs">
														Click edit to add a
														note...
													</p>
												)}
											</div>
										</>
									)}
								</div>
							)}

							{/* ── Mini Timer ── */}
							{widget.type === "mini-timer" && (
								<div className="w-full h-full no-drag">
									<MiniTimer
										id={
											Number.parseInt(
												widget.id.split("-")[0],
											) || 0
										}
										theme={theme}
									/>
								</div>
							)}

							{/* ── Stats ── */}
							{widget.type === "stats" && (
								<div className="w-full h-full no-drag">
									<StatsWidget
										stats={stats}
										sessions={sessions}
									/>
								</div>
							)}

							{/* ── YouTube Player ── */}
							{widget.type === "youtube" && (
								<div className="w-full h-full no-drag">
									<YouTubePlayer
										pomodoroState={pomodoroState}
										theme={theme}
										url={youtubeUrl}
										onUrlChange={setYoutubeUrl}
										autoPlayOnFocusSession={
											settings.autoPlayOnFocusSession ??
											true
										}
										pauseOnBreak={
											settings.pauseOnBreak ?? true
										}
										defaultVolume={
											settings.youtubeDefaultVolume ?? 50
										}
										loopEnabled={
											settings.youtubeLoop ?? true
										}
									/>
								</div>
							)}

							{/* ── Image Widget ── */}
							{widget.type === "image" && (
								<div className="relative w-full h-full flex items-center justify-center no-drag">
									{widget.imageUrl ? (
										<>
											<img
												src={widget.imageUrl}
												alt="Widget"
												className="w-full h-full object-cover rounded-lg"
											/>
											<button
												type="button"
												className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
												onClick={() => {
													setWidgets(
														(
															prev: WidgetData[],
														) =>
															prev.map((w) =>
																w.id ===
																widget.id
																	? {
																			...w,
																			imageUrl:
																				undefined,
																		}
																	: w,
															),
													);
												}}
											>
												<Trash2 size={14} />
											</button>
										</>
									) : (
										<label className="flex flex-col items-center gap-2 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
											<Upload size={32} />
											<span className="text-xs">
												Upload Image
											</span>
											<input
												type="file"
												accept="image/*"
												className="hidden"
												onChange={(e) => {
													const file =
														e.target.files?.[0];
													if (file)
														handleImageUpload(
															widget.id,
															file,
														);
												}}
											/>
										</label>
									)}
								</div>
							)}
						</Widget>
					</div>
				))}
			</div>

			{/* ─── Dock (hidden in float mode) ─────────────────────────────── */}
			<Dock theme={theme} className={timer.windowState.float_mode ? "hidden" : ""}>
				<DockButton
					icon={StickyNote}
					label="Add Sticky Note"
					onClick={() => addWidget("sticky-note")}
					theme={theme}
					badge={
						widgets.filter((w) => w.type === "sticky-note")
							.length || undefined
					}
				/>
				<DockButton
					icon={Timer}
					label="Add Mini Timer"
					onClick={() => addWidget("mini-timer")}
					theme={theme}
					badge={
						widgets.filter((w) => w.type === "mini-timer")
							.length || undefined
					}
				/>
				<DockButton
					icon={BarChart2}
					label="Add Stats Widget"
					onClick={() => addWidget("stats")}
					theme={theme}
					badge={
						widgets.filter((w) => w.type === "stats").length ||
						undefined
					}
				/>
				<DockButton
					icon={Music}
					label="Add YouTube Player"
					onClick={() => addWidget("youtube")}
					theme={theme}
					badge={
						widgets.filter((w) => w.type === "youtube").length ||
						undefined
					}
				/>
				<DockButton
					icon={ImageIcon}
					label="Add Image"
					onClick={() => addWidget("image")}
					theme={theme}
					badge={
						widgets.filter((w) => w.type === "image").length ||
						undefined
					}
				/>

				{/* Separator */}
				<div
					className={`w-px h-8 mx-1 ${
						theme === "dark" ? "bg-white/10" : "bg-black/10"
					}`}
				/>

				{/* Separator */}
				<div
					className={`w-px h-8 mx-1 ${
						theme === "dark" ? "bg-white/10" : "bg-black/10"
					}`}
				/>

				<DockButton
					icon={timer.windowState.always_on_top ? PinOff : Pin}
					label={timer.windowState.always_on_top ? "Unpin" : "Pin on Top"}
					onClick={() => timer.setAlwaysOnTop(!timer.windowState.always_on_top)}
					active={timer.windowState.always_on_top}
					theme={theme}
				/>
				<DockButton
					icon={timer.windowState.float_mode ? Maximize2 : Minimize2}
					label={timer.windowState.float_mode ? "Exit Float" : "Float Timer"}
					onClick={() => timer.setFloatMode(!timer.windowState.float_mode)}
					active={timer.windowState.float_mode}
					theme={theme}
				/>
				<DockButton
					icon={Settings}
					label="Settings"
					onClick={() => setShowSettings(!showSettings)}
					active={showSettings}
					theme={theme}
				/>
				<DockButton
					icon={theme === "dark" ? Sun : Moon}
					label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
					onClick={toggleTheme}
					theme={theme}
				/>
			</Dock>

			{/* ─── Settings Panel ────────────────────────────────────────────── */}
			{showSettings && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
						onClick={() => setShowSettings(false)}
					/>

					{/* Panel */}
					<div
						className={`fixed right-0 top-0 bottom-0 z-50 w-96 max-w-[90vw] overflow-y-auto shadow-2xl transition-transform duration-300 ${
							theme === "dark"
								? "bg-gray-900 border-l border-white/10"
								: "bg-white border-l border-gray-200"
						}`}
					>
						{/* Header */}
						<div
							className="sticky top-0 z-10 flex items-center justify-between p-5 border-b backdrop-blur-xl"
							style={{
								borderColor:
									theme === "dark"
										? "rgba(255,255,255,0.1)"
										: "rgba(0,0,0,0.1)",
								backgroundColor:
									theme === "dark"
										? "rgba(17,24,39,0.9)"
										: "rgba(255,255,255,0.9)",
							}}
						>
							<h2 className="text-lg font-bold tracking-tight">
								Settings
							</h2>
							<button
								type="button"
								onClick={() => setShowSettings(false)}
								className={`p-2 rounded-lg transition-colors ${
									theme === "dark"
										? "hover:bg-white/10 text-gray-400"
										: "hover:bg-black/5 text-gray-500"
								}`}
							>
								<X size={18} />
							</button>
						</div>

						<div className="p-5 space-y-8">
							{/* ─── Appearance ───────────────────────────── */}
							<section>
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
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

								{/* Highlight / accent color */}
								<div className="flex items-center justify-between mb-4">
									<span className="text-sm">
										Accent Color
									</span>
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
												style={{
													backgroundColor: color,
												}}
												onClick={() =>
													updateSetting(
														"highlightColor",
														color,
													)
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
												onClick={() =>
													setCustomBackground("")
												}
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
											<Upload
												size={14}
												className="inline mr-1"
											/>
											Upload
											<input
												ref={bgFileInputRef}
												type="file"
												accept="image/*"
												className="hidden"
												onChange={(e) => {
													const file =
														e.target.files?.[0];
													if (file)
														handleBackgroundUpload(
															file,
														);
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
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
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
										onChange={(v) =>
											updateSetting("workDuration", v)
										}
										label={<span>Work Duration</span>}
										valueLabel={
											<span>
												{settings.workDuration}m
											</span>
										}
									/>

									<ElasticSlider
										min={1}
										max={30}
										step={1}
										value={settings.shortBreakDuration}
										onChange={(v) =>
											updateSetting(
												"shortBreakDuration",
												v,
											)
										}
										label={<span>Short Break</span>}
										valueLabel={
											<span>
												{settings.shortBreakDuration}m
											</span>
										}
									/>

									<ElasticSlider
										min={5}
										max={60}
										step={5}
										value={settings.longBreakDuration}
										onChange={(v) =>
											updateSetting(
												"longBreakDuration",
												v,
											)
										}
										label={<span>Long Break</span>}
										valueLabel={
											<span>
												{settings.longBreakDuration}m
											</span>
										}
									/>

									<ElasticSlider
										min={2}
										max={8}
										step={1}
										value={settings.sessionsUntilLongBreak}
										onChange={(v) =>
											updateSetting(
												"sessionsUntilLongBreak",
												v,
											)
										}
										label={
											<span>
												Sessions Until Long Break
											</span>
										}
										valueLabel={
											<span>
												{
													settings.sessionsUntilLongBreak
												}
											</span>
										}
									/>
								</div>
							</section>

							{/* ─── Sound & Notifications ───────────────── */}
							<section>
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									Sound & Notifications
								</h3>

								<div className="space-y-4">
									{/* Notification sound toggle */}
									<div className="flex items-center justify-between">
										<span className="text-sm">
											Notification Sound
										</span>
										<button
											type="button"
											onClick={() =>
												updateSetting(
													"notificationSound",
													!settings.notificationSound,
												)
											}
											className={`relative w-10 h-6 rounded-full transition-colors ${
												settings.notificationSound
													? "bg-blue-500"
													: theme === "dark"
														? "bg-gray-700"
														: "bg-gray-300"
											}`}
										>
											<div
												className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
													settings.notificationSound
														? "translate-x-5"
														: "translate-x-1"
												}`}
											/>
										</button>
									</div>

									{/* Volume */}
									{settings.notificationSound && (
										<ElasticSlider
											min={0}
											max={100}
											step={5}
											value={
												settings.notificationVolume
											}
											onChange={(v) =>
												updateSetting(
													"notificationVolume",
													v,
												)
											}
											label={<span>Volume</span>}
											valueLabel={
												<span>
													{
														settings.notificationVolume
													}
													%
												</span>
											}
										/>
									)}

									{/* Test sound */}
									{settings.notificationSound && (
										<button
											type="button"
											onClick={() =>
												playNotificationSound(
													settings.notificationVolume /
														100,
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

									{/* Vibration toggle */}
									<div className="flex items-center justify-between">
										<span className="text-sm">
											Vibration
										</span>
										<button
											type="button"
											onClick={() =>
												updateSetting(
													"vibration",
													!settings.vibration,
												)
											}
											className={`relative w-10 h-6 rounded-full transition-colors ${
												settings.vibration
													? "bg-blue-500"
													: theme === "dark"
														? "bg-gray-700"
														: "bg-gray-300"
											}`}
										>
											<div
												className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
													settings.vibration
														? "translate-x-5"
														: "translate-x-1"
												}`}
											/>
										</button>
									</div>
								</div>
							</section>

							{/* ─── YouTube Settings ─────────────────────── */}
							<section>
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									YouTube
								</h3>

								<div className="space-y-4">
									{/* Auto-play on focus */}
									<div className="flex items-center justify-between">
										<span className="text-sm">
											Auto-play on Focus
										</span>
										<button
											type="button"
											onClick={() =>
												updateSetting(
													"autoPlayOnFocusSession",
													!settings.autoPlayOnFocusSession,
												)
											}
											className={`relative w-10 h-6 rounded-full transition-colors ${
												settings.autoPlayOnFocusSession
													? "bg-blue-500"
													: theme === "dark"
														? "bg-gray-700"
														: "bg-gray-300"
											}`}
										>
											<div
												className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
													settings.autoPlayOnFocusSession
														? "translate-x-5"
														: "translate-x-1"
												}`}
											/>
										</button>
									</div>

									{/* Pause on break */}
									<div className="flex items-center justify-between">
										<span className="text-sm">
											Pause on Break
										</span>
										<button
											type="button"
											onClick={() =>
												updateSetting(
													"pauseOnBreak",
													!settings.pauseOnBreak,
												)
											}
											className={`relative w-10 h-6 rounded-full transition-colors ${
												settings.pauseOnBreak
													? "bg-blue-500"
													: theme === "dark"
														? "bg-gray-700"
														: "bg-gray-300"
											}`}
										>
											<div
												className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
													settings.pauseOnBreak
														? "translate-x-5"
														: "translate-x-1"
												}`}
											/>
										</button>
									</div>

									{/* Loop playback */}
									<div className="flex items-center justify-between">
										<span className="text-sm">
											Loop Playback
										</span>
										<button
											type="button"
											onClick={() =>
												updateSetting(
													"youtubeLoop",
													!settings.youtubeLoop,
												)
											}
											className={`relative w-10 h-6 rounded-full transition-colors ${
												settings.youtubeLoop
													? "bg-blue-500"
													: theme === "dark"
														? "bg-gray-700"
														: "bg-gray-300"
											}`}
										>
											<div
												className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
													settings.youtubeLoop
														? "translate-x-5"
														: "translate-x-1"
												}`}
											/>
										</button>
									</div>

									{/* Default volume */}
									<ElasticSlider
										min={0}
										max={100}
										step={5}
										value={
											settings.youtubeDefaultVolume ?? 50
										}
										onChange={(v) =>
											updateSetting(
												"youtubeDefaultVolume",
												v,
											)
										}
										label={<span>Default Volume</span>}
										valueLabel={
											<span>
												{settings.youtubeDefaultVolume ??
													50}
												%
											</span>
										}
									/>
								</div>
							</section>

							{/* ─── Widget Settings ──────────────────────── */}
							<section>
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									Widgets
								</h3>

								<div className="space-y-5">
									<ElasticSlider
										min={150}
										max={400}
										step={10}
										value={
											settings.stickyWidgetSize ??
											STICKY_NOTE_SIZE
										}
										onChange={(v) =>
											updateSetting(
												"stickyWidgetSize",
												v,
											)
										}
										label={<span>Sticky Note Size</span>}
										valueLabel={
											<span>
												{settings.stickyWidgetSize ??
													STICKY_NOTE_SIZE}
												px
											</span>
										}
									/>

									<ElasticSlider
										min={280}
										max={700}
										step={20}
										value={
											settings.youtubeWidgetWidth ?? 400
										}
										onChange={(v) =>
											updateSetting(
												"youtubeWidgetWidth",
												v,
											)
										}
										label={
											<span>YouTube Player Width</span>
										}
										valueLabel={
											<span>
												{settings.youtubeWidgetWidth ??
													400}
												px
											</span>
										}
									/>
								</div>
							</section>

							{/* ─── Data Management ──────────────────────── */}
							<section>
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									Data
								</h3>

								<div className="space-y-3">
									<button
										type="button"
										onClick={clearAllWidgets}
										className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
											theme === "dark"
												? "bg-white/5 hover:bg-white/10 text-gray-400"
												: "bg-black/5 hover:bg-black/10 text-gray-600"
										}`}
									>
										<Trash2 size={14} />
										Clear All Widgets
									</button>

									<button
										type="button"
										onClick={clearAllSessions}
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

							{/* ─── Keyboard Shortcuts ────────────────────── */}
							<section>
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									Keyboard Shortcuts
								</h3>

								<div
									className={`space-y-2 text-sm ${
										theme === "dark"
											? "text-gray-400"
											: "text-gray-600"
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
							<section className="pb-4">
								<h3
									className={`text-xs font-bold uppercase tracking-widest mb-4 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									About
								</h3>
								<p
									className={`text-xs leading-relaxed ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									Pomodoroom uses a progressive schedule that
									increases focus duration across sessions:
									15m &rarr; 30m &rarr; 45m &rarr; 60m
									&rarr; 75m, with short breaks between each
									focus period and a long break at the end.
								</p>
								<p
									className={`text-xs leading-relaxed mt-2 ${
										theme === "dark"
											? "text-gray-500"
											: "text-gray-400"
									}`}
								>
									Total cycle duration:{" "}
									{formatMinutes(TOTAL_SCHEDULE_DURATION)}.
									Drag widgets anywhere on the canvas. Your
									progress is saved automatically.
								</p>
							</section>
						</div>
					</div>
				</>
			)}

			{/* ─── Stop Dialog ────────────────────────────────────────────────── */}
			{showStopDialog && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 z-60 bg-black/40 backdrop-blur-sm"
						onClick={() => setShowStopDialog(false)}
					/>

					{/* Dialog */}
					<div className="fixed inset-0 z-70 flex items-center justify-center p-4">
						<div
							className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl ${
								theme === "dark"
									? "bg-gray-900 border border-white/10"
									: "bg-white border border-gray-200"
							}`}
						>
							<h3 className="text-lg font-bold mb-2">
								Stop Session?
							</h3>
							<p
								className={`text-sm mb-6 ${
									theme === "dark"
										? "text-gray-400"
										: "text-gray-500"
								}`}
							>
								You have{" "}
								<span className="font-mono font-semibold">
									{formatTimeStr(timeRemaining)}
								</span>{" "}
								remaining in this{" "}
								{currentStep.type === "focus"
									? "focus"
									: "break"}{" "}
								session.
							</p>

							<div className="flex flex-col gap-2">
								{/* Stop & Reset */}
								<button
									type="button"
									onClick={handleStop}
									className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
										theme === "dark"
											? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
											: "bg-red-50 text-red-600 hover:bg-red-100"
									}`}
								>
									Stop &amp; Reset
								</button>

								{/* Skip to Next */}
								<button
									type="button"
									onClick={handleSkip}
									className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
										theme === "dark"
											? "bg-white/5 text-gray-300 hover:bg-white/10"
											: "bg-gray-50 text-gray-700 hover:bg-gray-100"
									}`}
								>
									Skip to Next
								</button>

								{/* Continue */}
								<button
									type="button"
									onClick={() => setShowStopDialog(false)}
									className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
										theme === "dark"
											? "text-gray-500 hover:text-gray-300"
											: "text-gray-400 hover:text-gray-600"
									}`}
								>
									Continue Session
								</button>
							</div>
						</div>
					</div>
				</>
			)}

			{/* Hidden file inputs */}
			<input
				ref={bgFileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				aria-hidden="true"
			/>
		</div>
	);
}
