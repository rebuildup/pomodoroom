import React from "react";
import type { Task } from "@/types/task";
import { getNextTaskCountdownMs, getNextTaskStartMs } from "@/utils/next-task-countdown";

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
	isTimerActive: boolean;
	activeTimerRemainingMs: number;
	activeTimerTotalMs?: number | null;
	className?: string;
}

export function GuidancePrimaryTimerPanel({
	nextTasks,
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

	const isInTaskMode = isTimerActive;
	const nextStartMs = React.useMemo(
		() => (isInTaskMode ? null : getNextTaskStartMs(nextTasks, nowMs)),
		[nextTasks, nowMs, isInTaskMode],
	);
	const remainingMs = React.useMemo(
		() => (isInTaskMode ? Math.max(0, activeTimerRemainingMs) : getNextTaskCountdownMs(nextTasks, nowMs)),
		[isInTaskMode, activeTimerRemainingMs, nextTasks, nowMs],
	);
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
			const total = Math.max(1, activeTimerTotalMs ?? 0);
			return Math.max(0, Math.min(1, 1 - remainingMs / total));
		}
		if (!countdownTargetMs) return 0;
		const ratio = 1 - remainingMs / Math.max(1, countdownBaseMs);
		return Math.max(0, Math.min(1, ratio));
	}, [isInTaskMode, activeTimerTotalMs, remainingMs, countdownTargetMs, countdownBaseMs]);

	const now = React.useMemo(() => new Date(nowMs), [nowMs]);
	const nowDate = React.useMemo(
		() => now.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }),
		[now],
	);
	const nowClock = React.useMemo(
		() => now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
		[now],
	);

	const circleRadius = 28;
	const circleCircumference = 2 * Math.PI * circleRadius;
	const circleOffset = circleCircumference * (1 - circleProgress);

	return (
		<div className={["h-full flex items-center pl-2", className].join(" ")}>
			<div className="flex w-full items-center justify-between gap-3">
				<div className="flex flex-col justify-center gap-1">
					<div className="flex items-baseline gap-0.5 text-[clamp(26px,3.4vw,36px)] font-bold tracking-[-0.04em] tabular-nums leading-none">
						<span aria-hidden>{time.hh}:{time.mm}</span>
						<span className="font-bold" aria-label="seconds">
							:{time.ss}
						</span>
					</div>
					<div
						className="text-[11px] text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap"
						aria-label={`${nowDate} ${nowClock}`}
					>
						<span className="font-semibold">{nowDate}</span>{" "}
						<span className="font-mono">{nowClock}</span>
					</div>
				</div>
				<div className="flex-shrink-0 flex items-center">
					<svg width="72" height="72" viewBox="0 0 72 72" aria-label="next task countdown progress">
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
