import React from "react";
import type { Task } from "@/types/task";
import { getNextTaskStartMs } from "@/utils/next-task-countdown";

function formatHms(ms: number): { hh: string; mm: string; ss: string } {
	const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return {
		hh: String(hours).padStart(2, "0"),
		mm: String(minutes).padStart(2, "0"),
		ss: String(seconds).padStart(2, "0"),
	};
}

interface GuidancePrimaryTimerPanelProps {
	nextTasks: Task[];
	/** All tasks for countdown calculation (uses full projected list including breaks) */
	allTasksForCountdown?: Task[];
	runningTask?: Task | null;
	isTimerActive: boolean;
	activeTimerRemainingMs: number;
	activeTimerTotalMs?: number | null;
	className?: string;
}

export function GuidancePrimaryTimerPanel({
	nextTasks,
	allTasksForCountdown = [],
	runningTask = null,
	isTimerActive,
	activeTimerRemainingMs,
	activeTimerTotalMs = null,
	className = "",
}: GuidancePrimaryTimerPanelProps) {
	const [nowMs, setNowMs] = React.useState(() => Date.now());
	const [countdownBaseMs, setCountdownBaseMs] = React.useState(1);
	const [countdownTargetMs, setCountdownTargetMs] = React.useState<number | null>(null);

	React.useEffect(() => {
		const id = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);

	const fallbackTaskRemainingMs = React.useMemo(() => {
		if (!runningTask || runningTask.kind === "break") return 0;

		const parseMs = (value: string | null | undefined): number | null => {
			if (!value) return null;
			const parsed = Date.parse(value);
			return Number.isNaN(parsed) ? null : parsed;
		};

		const requiredMs = Math.max(1, runningTask.requiredMinutes ?? 25) * 60_000;
		const explicitEndMs = parseMs(runningTask.fixedEndAt);
		if (explicitEndMs !== null) {
			return Math.max(0, explicitEndMs - nowMs);
		}

		const startMs =
			parseMs(runningTask.startedAt) ??
			parseMs(runningTask.fixedStartAt) ??
			parseMs(runningTask.windowStartAt) ??
			parseMs(runningTask.estimatedStartAt);

		if (startMs !== null) {
			return Math.max(0, startMs + requiredMs - nowMs);
		}

		const elapsed = Math.max(0, runningTask.elapsedMinutes ?? 0);
		return Math.max(0, requiredMs - elapsed * 60_000);
	}, [runningTask, nowMs]);
	const fallbackTaskTotalMs = React.useMemo(() => {
		if (!runningTask || runningTask.kind === "break") return 0;
		return Math.max(1, runningTask.requiredMinutes ?? 25) * 60_000;
	}, [runningTask]);
	const isInTaskMode = isTimerActive || fallbackTaskRemainingMs > 0;
	// Use raw task start times for countdown (same as notification timer)
	// This ensures the countdown matches the scheduled notification time
	const nextStartMs = React.useMemo(() => {
		if (isInTaskMode) return null;
		// Use allTasksForCountdown if available, otherwise fall back to nextTasks
		const tasksToCheck = allTasksForCountdown.length > 0 ? allTasksForCountdown : nextTasks;
		return getNextTaskStartMs(tasksToCheck, nowMs);
	}, [allTasksForCountdown, nextTasks, nowMs, isInTaskMode]);
	const remainingMs = React.useMemo(() => {
		if (isTimerActive) return Math.max(0, activeTimerRemainingMs);
		if (fallbackTaskRemainingMs > 0) return fallbackTaskRemainingMs;
		if (nextStartMs !== null) {
			return Math.max(0, nextStartMs - nowMs);
		}
		return 0;
	}, [isInTaskMode, isTimerActive, activeTimerRemainingMs, fallbackTaskRemainingMs, nextStartMs, nowMs]);
	const time = React.useMemo(() => formatHms(remainingMs), [remainingMs]);

	React.useEffect(() => {
		if (!nextStartMs) {
			setCountdownTargetMs(null);
			setCountdownBaseMs(1);
			return;
		}
		if (countdownTargetMs !== nextStartMs) {
			setCountdownTargetMs(nextStartMs);
			setCountdownBaseMs(Math.max(1, nextStartMs - Date.now()));
		}
	}, [nextStartMs, countdownTargetMs]);

	const circleProgress = React.useMemo(() => {
		if (isInTaskMode) {
			const total = isTimerActive
				? Math.max(1, activeTimerTotalMs ?? 0)
				: Math.max(1, fallbackTaskTotalMs);
			return Math.max(0, Math.min(1, 1 - remainingMs / total));
		}
		if (!countdownTargetMs) return 0;
		const ratio = 1 - remainingMs / Math.max(1, countdownBaseMs);
		return Math.max(0, Math.min(1, ratio));
	}, [
		isInTaskMode,
		isTimerActive,
		activeTimerTotalMs,
		fallbackTaskTotalMs,
		remainingMs,
		countdownTargetMs,
		countdownBaseMs,
	]);

	const now = React.useMemo(() => new Date(nowMs), [nowMs]);
	const nowDate = React.useMemo(
		() =>
			now.toLocaleDateString("ja-JP", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				weekday: "short",
			}),
		[now],
	);
	const nowClock = React.useMemo(
		() =>
			now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
		[now],
	);

	const circleRadius = 28;
	const circleCircumference = 2 * Math.PI * circleRadius;
	const circleOffset = circleCircumference * (1 - circleProgress);

	return (
		<div className={["h-full flex items-center pl-2", className].join(" ")}>
			<div className="flex w-full items-center gap-2 sm:gap-3">
				<div className="flex flex-col justify-center gap-0.5 sm:gap-1 min-w-0">
					<div className="flex items-baseline gap-0.5 text-[clamp(22px,2.8vw,36px)] font-bold tracking-[-0.04em] tabular-nums leading-none">
						<span aria-hidden="true">
							{time.hh}:{time.mm}
						</span>
						<span className="font-bold" aria-hidden="true">
							:{time.ss}
						</span>
						<span className="sr-only">
							{time.hh}:{time.mm}:{time.ss}
						</span>
					</div>
					<div
						className="text-[10px] sm:text-[11px] text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap truncate"
						role="timer"
						aria-label={`Current time: ${nowDate} ${nowClock}`}
					>
						<span className="font-semibold">{nowDate}</span>{" "}
						<span className="font-mono">{nowClock}</span>
					</div>
				</div>
				<div className="flex-shrink-0 flex items-center ml-auto">
					<svg
						width="56"
						height="56"
						viewBox="0 0 72 72"
						className="sm:w-[64px] sm:h-[64px] md:w-[72px] md:h-[72px]"
						aria-label="next task countdown progress"
					>
						<circle
							cx="36"
							cy="36"
							r={circleRadius}
							fill="none"
							stroke="var(--md-ref-color-outline-variant)"
							strokeWidth="4"
							opacity="0.35"
						/>
						<circle
							cx="36"
							cy="36"
							r={circleRadius}
							fill="none"
							stroke="var(--md-ref-color-primary)"
							strokeWidth="4"
							strokeLinecap="round"
							strokeDasharray={circleCircumference}
							strokeDashoffset={circleOffset}
							transform="rotate(-90 36 36)"
						/>
					</svg>
				</div>
			</div>
		</div>
	);
}
