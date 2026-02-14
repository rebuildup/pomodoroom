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
import type { TaskCardUpdatePayload } from "./TaskCard";
import { Icon, type MSIconName } from "./Icon";
import type { Task as V2Task } from "@/types/task";
import { getNextTaskCountdownMs, getNextTaskStartMs } from "@/utils/next-task-countdown";
import { getDisplayStartTime } from "@/utils/auto-schedule-time";

export interface GuidanceBoardProps {
	activeTimerRemainingMs?: number;
	activeTimerTotalMs?: number | null;
	isTimerActive?: boolean;
	runningTasks: Array<{
		id: string;
		title: string;
		requiredMinutes: number | null;
		elapsedMinutes: number;
	}>;
	ambientCandidates: Array<{
		id: string;
		title: string;
		state: 'READY' | 'PAUSED';
		requiredMinutes: number | null;
		elapsedMinutes: number;
		project: string | null;
		energy: 'low' | 'medium' | 'high';
		reason: string;
		autoScheduledStartAt?: string | null;
	}>;
	onAmbientClick?: (taskId: string) => void;
	onRequestStartNotification?: (taskId: string) => void;
	onRequestInterruptNotification?: (taskId: string) => void;
	onRequestPostponeNotification?: (taskId: string) => void;
	onSelectFocusTask?: (taskId: string) => void;
	onUpdateTask?: (taskId: string, updates: TaskCardUpdatePayload) => void | Promise<void>;
	onOperation?: (taskId: string, operation: import('./TaskOperations').TaskOperation) => void;
	/** Next tasks to show in NEXT section */
	nextTasks?: V2Task[];
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

function toV2TaskBase(id: string, title: string): Omit<V2Task, "state" | "elapsedMinutes" | "project" | "energy" | "updatedAt"> {
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
		estimatedStartAt: null,
		tags: [],
		priority: null,
		category: "active",
		createdAt: now,
		group: null,
		completedAt: null,
		pausedAt: null,
	};
}

function getStateIconMeta(state: V2Task["state"]): { icon: MSIconName; className: string } {
	switch (state) {
		case "RUNNING":
			return { icon: "radio_button_checked", className: "text-green-500" };
		case "PAUSED":
			return { icon: "pause", className: "text-amber-500" };
		case "DONE":
			return { icon: "check_circle", className: "text-[var(--md-ref-color-primary)]" };
		case "READY":
		default:
			return { icon: "circle", className: "text-[var(--md-ref-color-on-surface-variant)]" };
	}
}

function formatCardDateTime(isoString: string | null): string {
	if (!isoString) return "日時未定";
	const date = new Date(isoString);
	if (Number.isNaN(date.getTime())) return "日時未定";
	const dateStr = date.toLocaleDateString("ja-JP", {
		month: "2-digit",
		day: "2-digit",
	});
	const timeStr = date.toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${dateStr} ${timeStr}`;
}

interface GuidanceSimpleTaskCardProps {
	task: V2Task;
	allTasks?: V2Task[];
	className?: string;
	showProgress?: boolean;
}

const GuidanceSimpleTaskCard: React.FC<GuidanceSimpleTaskCardProps> = ({
	task,
	allTasks = [],
	className = "",
	showProgress = false,
}) => {
	const startAt = getDisplayStartTime(task, allTasks);
	const iconMeta = getStateIconMeta(task.state);
	const progress = React.useMemo(() => {
		if (!showProgress) return null;
		const required = Math.max(1, task.requiredMinutes ?? 0);
		const elapsed = Math.max(0, task.elapsedMinutes ?? 0);
		return Math.max(0, Math.min(1, elapsed / required));
	}, [showProgress, task.requiredMinutes, task.elapsedMinutes]);
	const progressRadius = 8;
	const progressCircumference = 2 * Math.PI * progressRadius;
	const progressOffset = progress === null ? progressCircumference : progressCircumference * (1 - progress);
	return (
		<div
			className={[
				"h-full min-h-0 rounded-md border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_50%,transparent)]",
				"bg-[var(--md-ref-color-surface)] px-3 py-2",
				"flex items-center gap-2",
				className,
			].join(" ")}
			aria-label={`Task card: ${task.title}`}
		>
			<Icon name={iconMeta.icon} size={16} className={iconMeta.className} />
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-semibold text-[var(--md-ref-color-on-surface)] truncate">
					{task.title}
				</div>
				<div className="text-[11px] text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap">
					{formatCardDateTime(startAt)}
				</div>
			</div>
			{showProgress && progress !== null ? (
				<div className="flex-shrink-0" aria-label={`progress ${Math.round(progress * 100)}%`}>
					<svg width="22" height="22" viewBox="0 0 22 22" className="block">
						<circle
							cx="11"
							cy="11"
							r={progressRadius}
							fill="none"
							stroke="var(--md-ref-color-outline-variant)"
							strokeWidth="2.5"
							opacity="0.45"
						/>
						<circle
							cx="11"
							cy="11"
							r={progressRadius}
							fill="none"
							stroke="var(--md-ref-color-primary)"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeDasharray={progressCircumference}
							strokeDashoffset={progressOffset}
							transform="rotate(-90 11 11)"
						/>
					</svg>
				</div>
			) : null}
		</div>
	);
};

export const GuidanceBoard: React.FC<GuidanceBoardProps> = ({
	activeTimerRemainingMs = 0,
	activeTimerTotalMs = null,
	isTimerActive = false,
	runningTasks,
	ambientCandidates,
	onAmbientClick,
	onRequestStartNotification,
	onRequestInterruptNotification,
	onRequestPostponeNotification,
	onSelectFocusTask,
	onOperation,
	nextTasks = [],
}) => {
	const [isNextControlMode, setIsNextControlMode] = React.useState(false);
	const [selectedNextTaskId, setSelectedNextTaskId] = React.useState<string | null>(null);
	const [nowMs, setNowMs] = React.useState(() => Date.now());
	const [countdownBaseMs, setCountdownBaseMs] = React.useState(1);
	const [countdownTargetMs, setCountdownTargetMs] = React.useState<number | null>(null);
	// Panel widths as percentages (left, center, right)
	const [leftWidth, setLeftWidth] = React.useState(16);
	const [rightWidth, setRightWidth] = React.useState(25); // 3/12 = 25%
	const containerRef = React.useRef<HTMLDivElement>(null);
	const isDraggingRef = React.useRef<'left' | 'right' | null>(null);

	React.useEffect(() => {
		const id = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);

	const isInTaskMode = isTimerActive && runningTasks.length > 0;
	const nextStartMs = useMemo(
		() => (isInTaskMode ? null : getNextTaskStartMs(nextTasks, nowMs)),
		[nextTasks, nowMs, isInTaskMode]
	);
	const remainingMs = useMemo(
		() => (isInTaskMode ? Math.max(0, activeTimerRemainingMs) : getNextTaskCountdownMs(nextTasks, nowMs)),
		[isInTaskMode, activeTimerRemainingMs, nextTasks, nowMs]
	);
	const time = useMemo(() => formatHms(remainingMs), [remainingMs]);
	const now = useMemo(() => new Date(nowMs), [nowMs]);
	const nowDate = useMemo(
		() => now.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }),
		[now]
	);
	const nowClock = useMemo(
		() => now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
		[now]
	);
	const showTasks = runningTasks;
	const extraCount = 0;
	const focusTasks = useMemo<V2Task[]>(() => {
		const createdAt = new Date().toISOString();
		return showTasks.map((t) => ({
			...toV2TaskBase(t.id, t.title),
			state: "RUNNING",
			requiredMinutes: t.requiredMinutes,
			elapsedMinutes: t.elapsedMinutes,
			project: null,
			energy: "medium",
			updatedAt: createdAt,
		}));
	}, [showTasks]);
	const selectedNextTask = useMemo(
		() => nextTasks.find((t) => t.id === selectedNextTaskId) ?? nextTasks[0] ?? null,
		[nextTasks, selectedNextTaskId]
	);
	const primaryFocusTask = useMemo(() => focusTasks[0] ?? null, [focusTasks]);
	const secondaryFocusTasks = useMemo(() => focusTasks.slice(1), [focusTasks]);

	React.useEffect(() => {
		if (nextTasks.length === 0) {
			setSelectedNextTaskId(null);
			setIsNextControlMode(false);
			return;
		}
		if (!selectedNextTaskId || !nextTasks.some((t) => t.id === selectedNextTaskId)) {
			setSelectedNextTaskId(nextTasks[0]?.id ?? null);
		}
	}, [nextTasks, selectedNextTaskId]);

	React.useEffect(() => {
		if (!nextStartMs) {
			setCountdownTargetMs(null);
			setCountdownBaseMs(1);
			return;
		}
		if (countdownTargetMs !== nextStartMs) {
			setCountdownTargetMs(nextStartMs);
			setCountdownBaseMs(Math.max(1, nextStartMs - nowMs));
		}
	}, [nextStartMs, nowMs, countdownTargetMs]);

	const circleProgress = useMemo(() => {
		if (isInTaskMode) {
			const total = Math.max(1, activeTimerTotalMs ?? 0);
			return Math.max(0, Math.min(1, 1 - remainingMs / total));
		}
		if (!countdownTargetMs) return 0;
		const ratio = 1 - remainingMs / Math.max(1, countdownBaseMs);
		return Math.max(0, Math.min(1, ratio));
	}, [isInTaskMode, activeTimerTotalMs, remainingMs, countdownTargetMs, countdownBaseMs]);

	const circleRadius = 24;
	const circleCircumference = 2 * Math.PI * circleRadius;
	const circleOffset = circleCircumference * (1 - circleProgress);

	const handleMouseDown = (divider: 'left' | 'right') => (e: React.MouseEvent) => {
		e.preventDefault();
		isDraggingRef.current = divider;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	};

	React.useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDraggingRef.current || !containerRef.current) return;

			const container = containerRef.current;
			const rect = container.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const percentage = (mouseX / rect.width) * 100;

			if (isDraggingRef.current === 'left') {
				// Left divider: adjust left panel width (min 15%, max 40%)
				const newLeftWidth = Math.max(15, Math.min(40, percentage));
				setLeftWidth(newLeftWidth);
			} else {
				// Right divider: adjust right panel width (min 15%, max 40%)
				const newRightWidth = Math.max(15, Math.min(40, 100 - percentage));
				setRightWidth(newRightWidth);
			}
		};

		const handleMouseUp = () => {
			isDraggingRef.current = null;
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}, []);

	const centerWidth = 100 - leftWidth - rightWidth;

	return (
		<section
			className="w-full h-[140px]"
			aria-label="Guidance board"
		>
			<div
				ref={containerRef}
				className={[
					"bg-[var(--md-ref-color-surface)] text-[var(--md-ref-color-on-surface)]",
					"overflow-hidden h-full",
				].join(" ")}
			>
				<div className="flex gap-0 relative h-full">
					{/* Left: timer + pressure (top-left) */}
					<div 
						className="p-4 md:p-5 border-b md:border-b-0 md:border-r border-current/10 h-full overflow-y-auto"
						style={{ width: `${leftWidth}%`, minWidth: '200px' }}
					>
						<div className="min-w-0 h-full flex items-center">
							{/* Timer display */}
							<div className="flex w-full items-center justify-between gap-3">
								<div className="min-w-0 flex flex-col justify-center gap-2">
									<div
										className="tabular-nums leading-none whitespace-nowrap overflow-hidden text-ellipsis"
										aria-label={
											isInTaskMode
												? `Current task remaining ${time.hh} hours ${time.mm} minutes ${time.ss} seconds`
												: `Next task starts in ${time.hh} hours ${time.mm} minutes ${time.ss} seconds`
										}
									>
										<span className="font-bold tracking-[-0.06em] text-[clamp(30px,4.6vw,50px)]">
											{time.hh}:{time.mm}:{time.ss}
										</span>
									</div>
									<div className="text-xs text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
										{nowDate} {nowClock}
									</div>
								</div>
								<div className="flex-shrink-0" aria-label="Next task countdown progress">
									<svg width="56" height="56" viewBox="0 0 56 56" className="block">
										<circle
											cx="28"
											cy="28"
											r={circleRadius}
											fill="none"
											stroke="var(--md-ref-color-outline-variant)"
											strokeWidth="4"
											opacity="0.45"
										/>
										<circle
											cx="28"
											cy="28"
											r={circleRadius}
											fill="none"
											stroke="var(--md-ref-color-primary)"
											strokeWidth="4"
											strokeLinecap="round"
											strokeDasharray={circleCircumference}
											strokeDashoffset={circleOffset}
											transform="rotate(-90 28 28)"
										/>
									</svg>
								</div>
							</div>
						</div>
					</div>

					{/* Left resize handle */}
					<div
						onMouseDown={handleMouseDown('left')}
						className="hidden md:block absolute top-0 bottom-0 w-1 hover:w-2 cursor-col-resize bg-transparent hover:bg-current/10 transition-all z-10"
						style={{ left: `${leftWidth}%` }}
					/>

					{/* Center: current focus */}
					<div
						className="flex flex-col border-b md:border-b-0 md:border-r border-current/10 h-full overflow-y-auto"
						style={{ width: `${centerWidth}%`, minWidth: '300px' }}
					>
						<div className="p-4 md:p-5 h-full flex flex-col min-h-0">
							<div className="flex-1 min-h-0 flex flex-col">
								<div className="flex-1 min-h-0">
									<div className="flex h-full items-stretch gap-2 min-h-0">
										{runningTasks.length > 0 ? (
											<>
												{primaryFocusTask ? (
													<div className="w-64 flex-shrink-0 h-full rounded-md border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_50%,transparent)] bg-[var(--md-ref-color-surface)] px-3 py-2 flex flex-col">
														<div className="flex items-start justify-between gap-2">
															<div className="min-w-0">
																<div className="text-[14px] font-semibold text-[var(--md-ref-color-on-surface)] truncate">
																	{primaryFocusTask.title}
																</div>
																<div className="text-[11px] text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap">
																	{formatCardDateTime(getDisplayStartTime(primaryFocusTask, focusTasks))}
																</div>
															</div>
															<div className="flex items-center gap-1 text-[11px] text-[var(--md-ref-color-on-surface-variant)] whitespace-nowrap">
																<Icon
																	name={getStateIconMeta(primaryFocusTask.state).icon}
																	size={14}
																	className={getStateIconMeta(primaryFocusTask.state).className}
																/>
																<span>{primaryFocusTask.state}</span>
															</div>
														</div>
														<div className="mt-auto pt-2 flex items-center gap-2">
															<button
																type="button"
																onClick={() => onOperation?.(primaryFocusTask.id, "complete")}
																className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)]"
															>
																完了
															</button>
															<button
																type="button"
																onClick={() => onRequestInterruptNotification?.(primaryFocusTask.id)}
																className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)]"
															>
																中断
															</button>
															<button
																type="button"
																onClick={() => onOperation?.(primaryFocusTask.id, "extend")}
																className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
															>
																+延長
															</button>
														</div>
													</div>
												) : null}
												<div className="flex-1 min-w-0 h-full overflow-x-auto pb-1">
													<div className="flex h-full items-stretch gap-2">
														{secondaryFocusTasks.map((task) => (
															<div key={task.id} onClick={() => onSelectFocusTask?.(task.id)} className="flex-shrink-0 w-56 h-full">
																<GuidanceSimpleTaskCard task={task} allTasks={focusTasks} className="h-full" showProgress />
															</div>
														))}
														{secondaryFocusTasks.length === 0 ? (
															<div className="h-full flex items-center text-xs text-[var(--md-ref-color-on-surface-variant)]">
																他に実行中のタスクはありません
															</div>
														) : null}
													</div>
												</div>
												{extraCount > 0 ? (
													<div className="flex-shrink-0 w-8 flex items-center justify-center text-xs opacity-60">
														+{extraCount}
													</div>
												) : null}
											</>
										) : ambientCandidates.length > 0 ? (
											ambientCandidates.map((t) => {
												const now = new Date().toISOString();
												const task: V2Task = {
													...toV2TaskBase(t.id, t.title),
													state: t.state,
													requiredMinutes: t.requiredMinutes,
													elapsedMinutes: t.elapsedMinutes,
													project: t.project,
													energy: t.energy,
													updatedAt: now,
													description: t.reason,
													estimatedStartAt: t.autoScheduledStartAt || null,
												};
												return (
													<div key={t.id} onClick={() => onAmbientClick?.(t.id)} className="flex-shrink-0 w-64 h-full">
														<GuidanceSimpleTaskCard task={task} allTasks={[task, ...nextTasks]} className="h-full" />
													</div>
												);
											})
										) : (
											<div className="text-sm opacity-70">
												No running tasks. Add tasks to build your focus queue.
											</div>
										)}
									</div>
								</div>

								{runningTasks.length === 0 && (
									<div className="pt-2 mt-auto text-xs text-[var(--md-ref-color-on-surface-variant)]">
										実行中タスクがありません
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Right resize handle */}
					<div
						onMouseDown={handleMouseDown('right')}
						className="hidden md:block absolute top-0 bottom-0 w-1 hover:w-2 cursor-col-resize bg-transparent hover:bg-current/10 transition-all z-10"
						style={{ left: `${100 - rightWidth}%` }}
					/>

					{/* Right: next task to start */}
					<div 
						className="p-4 md:p-5 h-full overflow-y-auto"
						style={{ width: `${rightWidth}%`, minWidth: '200px' }}
					>
						<div className="min-w-0 h-full flex flex-col">
							{!isNextControlMode ? (
								nextTasks.length > 0 ? (
									<div className="h-full min-h-0 cursor-pointer" onClick={() => setIsNextControlMode(true)}>
										<div className="flex h-full items-stretch gap-2 overflow-x-auto pb-1">
											{nextTasks.slice(0, 3).map((task) => (
												<div
													key={task.id}
													className="flex-shrink-0 w-56 h-full"
													onClick={() => {
														setSelectedNextTaskId(task.id);
														setIsNextControlMode(true);
													}}
												>
													<GuidanceSimpleTaskCard task={task} allTasks={nextTasks} className="h-full" />
												</div>
											))}
										</div>
									</div>
								) : (
									<div className="text-sm opacity-70">
										No next task.
									</div>
								)
							) : (
								<div className="h-full min-h-0 flex flex-col">
									<div className="space-y-1 text-sm">
										<div className="flex items-center justify-between gap-2">
											<div className="font-semibold text-[var(--md-ref-color-on-surface)] truncate">
												{selectedNextTask?.title ?? "次のタスク"}
											</div>
											<div className="text-[var(--md-ref-color-on-surface-variant)] text-right whitespace-nowrap tabular-nums">
												{selectedNextTask?.fixedStartAt
													? `${new Date(selectedNextTask.fixedStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
													: selectedNextTask?.windowStartAt
														? `${new Date(selectedNextTask.windowStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}-${selectedNextTask.windowEndAt ? new Date(selectedNextTask.windowEndAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "--:--"}`
														: selectedNextTask?.estimatedStartAt
															? `${new Date(selectedNextTask.estimatedStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
															: "--:--"}
												{" "}({selectedNextTask?.requiredMinutes ?? 25}分)
											</div>
										</div>
										<div className="flex items-center justify-between gap-2 text-xs text-[var(--md-ref-color-on-surface-variant)]">
											<div className="truncate">状態: {selectedNextTask?.state ?? "READY"}</div>
											<div className="text-right whitespace-nowrap tabular-nums">優先度: {selectedNextTask?.priority ?? "-"}</div>
										</div>
									</div>
									<div className="mt-auto pt-2 flex items-center gap-2">
										<button
											type="button"
											onClick={() => selectedNextTask && (onRequestStartNotification?.(selectedNextTask.id) ?? onAmbientClick?.(selectedNextTask.id))}
											disabled={!selectedNextTask}
											className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)] disabled:opacity-40"
										>
											開始
										</button>
										<button
											type="button"
											onClick={() => selectedNextTask && onRequestPostponeNotification?.(selectedNextTask.id)}
											disabled={!selectedNextTask}
											className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)] disabled:opacity-40"
										>
											先送り
										</button>
										<button
											type="button"
											onClick={() => setIsNextControlMode(false)}
											className="px-3 py-1.5 rounded-full text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
										>
											戻る
										</button>
									</div>
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
