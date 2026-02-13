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
import { formatRelativeCountdown, formatStartTimeHHmm } from "@/utils/nextSchedule";
import { TaskCard } from "./TaskCard";
import type { TaskCardUpdatePayload } from "./TaskCard";
import type { Task as V2Task } from "@/types/task";

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
	onUpdateTask?: (taskId: string, updates: TaskCardUpdatePayload) => void | Promise<void>;
	pressureState?: PressureState | null;
	/** Next task to start (when no running tasks) */
	nextTaskToStart?: { id: string; title: string; state: 'READY' | 'PAUSED' } | null;
	/** Next schedule group with start time metadata */
	nextSchedule?: {
		startTimeIso: string;
		primaryTitle: string;
		parallelCount: number;
		isOverdue: boolean;
		diffMs: number;
	} | null;
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

function toV2TaskBase(id: string, title: string): Omit<V2Task, "state" | "estimatedMinutes" | "elapsedMinutes" | "project" | "energy" | "updatedAt"> {
	const now = new Date().toISOString();
	return {
		id,
		title,
		description: undefined,
		estimatedPomodoros: 1,
		completedPomodoros: 0,
		completed: false,
		kind: "duration_only",
		requiredMinutes: 25,
		fixedStartAt: null,
		fixedEndAt: null,
		windowStartAt: null,
		windowEndAt: null,
		tags: [],
		priority: null,
		category: "active",
		createdAt: now,
		group: null,
		completedAt: null,
		pausedAt: null,
	};
}

export const GuidanceBoard: React.FC<GuidanceBoardProps> = ({
	remainingMs,
	runningTasks,
	ambientCandidates,
	onAmbientClick,
	onUpdateTask,
	pressureState,
	nextTaskToStart,
	nextSchedule,
}) => {
	const [expandedTaskId, setExpandedTaskId] = React.useState<string | null>(null);
	const time = useMemo(() => formatHms(remainingMs), [remainingMs]);
	const showTasks = runningTasks.slice(0, 3);
	const extraCount = Math.max(0, runningTasks.length - showTasks.length);
	const nextScheduleDiffMs = nextSchedule?.diffMs ?? 0;
	const nextScheduleCountdown = nextSchedule ? formatRelativeCountdown(nextScheduleDiffMs) : null;
	const nextScheduleStartLabel = nextSchedule ? formatStartTimeHHmm(nextSchedule.startTimeIso) : null;
	const handleExpandedChange = (taskId: string, nextExpanded: boolean) => {
		setExpandedTaskId(nextExpanded ? taskId : null);
	};

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

					{/* Center: current focus */}
					<div className="col-span-12 md:col-span-6 flex flex-col border-b md:border-b-0 md:border-r border-current/10">
						{/* CURRENT FOCUS section */}
						<div className="p-4 md:p-5">
							<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60">
								CURRENT FOCUS
							</div>

							<div className="mt-3">
								<div className="flex gap-2 overflow-x-auto pb-1">
									{runningTasks.length > 0 ? (
										<>
											{showTasks.map((t) => {
												const now = new Date().toISOString();
												const task: V2Task = {
													...toV2TaskBase(t.id, t.title),
													state: "RUNNING",
													estimatedMinutes: t.estimatedMinutes,
													elapsedMinutes: t.elapsedMinutes,
													project: null,
													energy: "medium",
													updatedAt: now,
												};

												return (
													<TaskCard
														key={t.id}
														task={task}
														draggable={false}
														density="compact"
														operationsPreset="none"
														expandOnClick={true}
														expanded={expandedTaskId === t.id}
														onExpandedChange={handleExpandedChange}
														onUpdateTask={onUpdateTask}
														sections={{ description: false, tags: false, progress: true, time: true, operations: false, priority: false }}
														className="flex-shrink-0 w-56"
													/>
												);
											})}
											{extraCount > 0 && (
												<div className="flex-shrink-0 w-8 flex items-center justify-center text-xs opacity-60">
													+{extraCount}
												</div>
											)}
										</>
									) : ambientCandidates.length > 0 ? (
										ambientCandidates.map((t) => {
											const now = new Date().toISOString();
											const task: V2Task = {
												...toV2TaskBase(t.id, t.title),
												state: t.state,
												estimatedMinutes: t.estimatedMinutes,
												elapsedMinutes: t.elapsedMinutes,
												project: t.project,
												energy: t.energy,
												updatedAt: now,
												description: t.reason,
											};
											return (
											<TaskCard
												key={t.id}
												task={task}
												draggable={false}
												density="compact"
												operationsPreset="minimal"
												expandOnClick={true}
												expanded={expandedTaskId === t.id}
												onExpandedChange={handleExpandedChange}
												onUpdateTask={onUpdateTask}
												sections={{ description: true, tags: false, progress: false, time: false, operations: true, priority: true }}
												onClick={() => onAmbientClick?.(t.id)}
												onOperation={(taskId, operation) => {
													if ((operation === "start" || operation === "resume") && onAmbientClick) {
														onAmbientClick(taskId);
													}
												}}
												className="flex-shrink-0 w-64"
											/>
											);
										})
									) : (
										<div className="text-sm opacity-70">
											No running tasks. Add tasks to build your focus queue.
										</div>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Right: next task to start */}
					<div className="col-span-12 md:col-span-3 p-4 md:p-5">
						<div className="min-w-0">
							<div className="text-[11px] font-semibold tracking-[0.25em] opacity-60">
								NEXT
							</div>
							{nextSchedule ? (
								<div className="mt-3 w-full text-left px-2 py-2 rounded bg-[var(--md-ref-color-surface-container-low)] border border-current/10">
									<div className="flex items-center justify-between gap-2">
										<span className="text-xs font-semibold tabular-nums">{nextScheduleStartLabel}</span>
										{nextSchedule.parallelCount > 1 ? (
											<span className="text-[10px] opacity-70">{nextSchedule.parallelCount} parallel</span>
										) : null}
									</div>
									<div className="mt-1 text-xs font-medium truncate">{nextSchedule.primaryTitle}</div>
									<div className="mt-1 text-[10px] opacity-70 tabular-nums">{nextScheduleCountdown}</div>
								</div>
							) : nextTaskToStart ? (
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
