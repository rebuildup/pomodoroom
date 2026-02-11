/**
 * GuidanceBoard
 *
 * Structure-focused "guidance board" that stays visible above the app shell.
 * Requirements (from user):
 * - Timer: top-left, show H:M:S where seconds are smaller.
 * - Center: current focus tasks (multiple parallel).
 * - Right: next task.
 * - Use only background/text colors (no accents).
 */

import React, { useMemo } from "react";

export interface GuidanceBoardProps {
	remainingMs: number;
	runningTasks: Array<{ id: string; title: string }>;
	nextTask?: { id: string; title: string } | null;
}

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

function getStatusLabel(isActive: boolean, isPaused: boolean, isIdle: boolean): string {
	if (isActive) return "RUNNING";
	if (isPaused) return "PAUSED";
	if (isIdle) return "IDLE";
	return "READY";
}

export const GuidanceBoard: React.FC<GuidanceBoardProps> = ({
	remainingMs,
	runningTasks,
	nextTask,
}) => {
	const time = useMemo(() => formatHms(remainingMs), [remainingMs]);
	const showTasks = runningTasks.slice(0, 3);
	const extraCount = Math.max(0, runningTasks.length - showTasks.length);

	return (
		<section
			className="w-full"
			aria-label="Guidance board"
		>
			<div
				className={[
					"bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]",
					"overflow-hidden",
				].join(" ")}
			>
				<div className="grid grid-cols-12 gap-0">
					{/* Left: timer (top-left) */}
					<div className="col-span-12 md:col-span-3 p-4 md:p-5 border-b md:border-b-0 md:border-r border-current/10">
						<div className="min-w-0">
							<div
								className="tabular-nums leading-none whitespace-nowrap overflow-hidden text-ellipsis"
								aria-label={`Time remaining ${time.hh} hours ${time.mm} minutes ${time.ss} seconds`}
							>
								<span className="font-bold tracking-[-0.06em] text-[clamp(30px,4.6vw,50px)]">
									{time.hh}:{time.mm}:{time.ss}
								</span>
							</div>
						</div>
					</div>

					{/* Center: current focus tasks (parallel) */}
					<div className="col-span-12 md:col-span-6 p-4 md:p-5 border-b md:border-b-0 md:border-r border-current/10">
						<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60">
							CURRENT FOCUS
						</div>

						<div className="mt-3">
							{runningTasks.length === 0 ? (
								<div className="text-sm opacity-70">
									No running tasks.
								</div>
							) : (
								<ul className="space-y-2">
									{showTasks.map((t) => (
										<li key={t.id} className="min-w-0">
											<div className="text-base font-medium truncate">
												{t.title}
											</div>
										</li>
									))}
									{extraCount > 0 && (
										<li className="text-sm opacity-60">
											+{extraCount} more
										</li>
									)}
								</ul>
							)}
						</div>
					</div>

					{/* Right: next task */}
					<div className="col-span-12 md:col-span-3 p-4 md:p-5">
						<div className="min-w-0">
							<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60">
								NEXT
							</div>
							<div className="mt-3 text-base font-medium truncate">
								{nextTask?.title ?? "No next task."}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default GuidanceBoard;
