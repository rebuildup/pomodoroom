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
import { PressureIndicator } from "./PressureIndicator";
import type { PressureState } from "@/types/pressure";

export interface GuidanceBoardProps {
	remainingMs: number;
	runningTasks: Array<{
		id: string;
		title: string;
		estimatedMinutes: number | null;
		elapsedMinutes: number;
	}>;
	ambientCandidates: Array<{
		id: string;
		title: string;
		state: 'READY' | 'PAUSED';
		estimatedMinutes: number | null;
		elapsedMinutes: number;
		project: string | null;
		energy: 'low' | 'medium' | 'high';
		reason: string;
	}>;
	onAmbientClick?: (taskId: string) => void;
	pressureState?: PressureState | null;
	/** Next task to start (when no running tasks) */
	nextTaskToStart?: { id: string; title: string; state: 'READY' | 'PAUSED' } | null;
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

/**
 * Calculate remaining time for a single task in milliseconds.
 */
function getTaskRemainingMs(estimatedMinutes: number | null, elapsedMinutes: number): number {
	if (estimatedMinutes === null) return 0;
	const remainingMinutes = Math.max(0, estimatedMinutes - elapsedMinutes);
	return remainingMinutes * 60 * 1000;
}

/**
 * Calculate progress percentage (0-100) for time bar.
 */
function getProgressPercent(estimatedMinutes: number | null, elapsedMinutes: number): number {
	if (estimatedMinutes === null || estimatedMinutes <= 0) return 0;
	return Math.min(100, Math.max(0, (elapsedMinutes / estimatedMinutes) * 100));
}

export const GuidanceBoard: React.FC<GuidanceBoardProps> = ({
	remainingMs,
	runningTasks,
	ambientCandidates,
	onAmbientClick,
	pressureState,
	nextTaskToStart,
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
					{/* Left: timer + pressure (top-left) */}
					<div className="col-span-12 md:col-span-3 p-4 md:p-5 border-b md:border-b-0 md:border-r border-current/10">
						<div className="min-w-0 space-y-3">
							{/* Timer display */}
							<div
								className="tabular-nums leading-none whitespace-nowrap overflow-hidden text-ellipsis"
								aria-label={`Time remaining ${time.hh} hours ${time.mm} minutes ${time.ss} seconds`}
							>
								<span className="font-bold tracking-[-0.06em] text-[clamp(30px,4.6vw,50px)]">
									{time.hh}:{time.mm}:{time.ss}
								</span>
							</div>

							{/* Pressure indicator (compact) */}
							{pressureState && (
								<PressureIndicator
									mode={pressureState.mode}
									value={pressureState.value}
									remainingWork={pressureState.remainingWork}
									remainingCapacity={pressureState.remainingCapacity}
									showDetails={false}
									compact={true}
								/>
							)}
						</div>
					</div>

					{/* Center: current focus + ambient candidates */}
					<div className="col-span-12 md:col-span-6 flex flex-col border-b md:border-b-0 md:border-r border-current/10">
						{/* CURRENT FOCUS section */}
						<div className="p-4 md:p-5">
							<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60">
								CURRENT FOCUS
							</div>

							<div className="mt-3">
								{runningTasks.length === 0 ? (
									<div className="text-sm opacity-70">
										No running tasks.
									</div>
								) : (
									<div className="flex gap-2 overflow-x-auto pb-1">
										{/* Task tiles (horizontal layout) */}
										{showTasks.map((t) => {
											const remainingMs = getTaskRemainingMs(t.estimatedMinutes, t.elapsedMinutes);
											const time = formatHms(remainingMs);
											const progressPercent = getProgressPercent(t.estimatedMinutes, t.elapsedMinutes);

											return (
												<div
													key={t.id}
													className="flex-shrink-0 w-32 bg-[var(--md-ref-color-surface-container-low)] rounded-lg p-2 border border-current/10"
												>
													{/* Task title (truncated) */}
													<div className="text-xs font-medium truncate mb-2" title={t.title}>
														{t.title}
													</div>

													{/* Progress bar */}
													<div className="h-1.5 bg-[var(--md-ref-color-surface-container-highest)] rounded-full overflow-hidden mb-1">
														<div
															className="h-full bg-current"
															style={{ width: `${progressPercent}%` }}
														/>
													</div>

													{/* Time remaining */}
													<div
														className="text-xs tabular-nums"
														aria-label={`Time remaining ${time.hh} hours ${time.mm} minutes`}
													>
														{time.hh === "00" ? `${time.mm}:${time.ss}` : `${time.hh}:${time.mm}:${time.ss}`}
													</div>
												</div>
											);
										})}

										{/* Extra count indicator */}
										{extraCount > 0 && (
											<div className="flex-shrink-0 w-8 flex items-center justify-center text-xs opacity-60">
												+{extraCount}
											</div>
										)}
									</div>
								)}
							</div>
						</div>

						{/* AMBIENT CANDIDATES section */}
						<div className="px-4 md:px-5 pb-4 md:pb-5 border-t border-current/10">
							<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60 mb-2">
								AMBIENT
							</div>

							{ambientCandidates.length === 0 ? (
								<div className="text-sm opacity-70">
									No ambient tasks.
								</div>
							) : (
								<ul className="space-y-1">
									{ambientCandidates.map((t) => (
										<li key={t.id}>
											<button
												type="button"
												onClick={() => onAmbientClick?.(t.id)}
												className="w-full text-left px-2 py-1.5 rounded bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors duration-150 border border-current/10"
											>
												<div className="flex items-center justify-between gap-2">
													{/* Task info */}
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2">
															{/* State indicator */}
															<div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
																t.state === 'PAUSED' ? 'bg-orange-400' : 'bg-blue-400'
															}`} />

															{/* Title */}
															<span className="text-xs font-medium truncate">
																{t.title}
															</span>

															{/* Project badge */}
															{t.project && (
																<span className="flex-shrink-0 px-1 py-0.5 text-[10px] rounded bg-current/10 opacity-70">
																	{t.project}
																</span>
															)}
														</div>

														{/* Reason */}
														<div className="text-[10px] opacity-60 truncate mt-0.5">
															{t.reason}
														</div>
													</div>

													{/* Energy indicator (dot) */}
													<div
														className={`w-2 h-2 rounded-full flex-shrink-0 ${
															t.energy === 'high' ? 'bg-green-400' :
															t.energy === 'medium' ? 'bg-yellow-400' :
															'bg-red-400'
														}`}
														title={`Energy: ${t.energy}`}
													/>
												</div>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>

					{/* Right: next task to start */}
					<div className="col-span-12 md:col-span-3 p-4 md:p-5">
						<div className="min-w-0">
							<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60">
								NEXT
							</div>
							{nextTaskToStart ? (
								<button
									type="button"
									onClick={() => onAmbientClick?.(nextTaskToStart.id)}
									className="mt-3 w-full text-left px-2 py-1.5 rounded bg-[var(--md-ref-color-surface-container-low)] hover:bg-[var(--md-ref-color-surface-container)] transition-colors duration-150 border border-current/10"
								>
									<div className="flex items-center gap-2">
										{/* State indicator */}
										<div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
											nextTaskToStart.state === 'PAUSED' ? 'bg-orange-400' : 'bg-blue-400'
										}`} />

										{/* Title */}
										<span className="text-xs font-medium truncate">
											{nextTaskToStart.title}
										</span>
									</div>
								</button>
							) : (
								<div className="mt-3 text-sm opacity-70">
									No next task.
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};

export default GuidanceBoard;
