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
import { GuidancePrimaryTimerPanel } from "./GuidancePrimaryTimerPanel";
import type { Task } from "@/types/task";
import type { TaskState } from "@/types/task-state";
import { getDisplayStartTime } from "@/utils/auto-schedule-time";

export interface GuidanceBoardProps {
	activeTimerRemainingMs?: number;
	activeTimerTotalMs?: number | null;
	isTimerActive?: boolean;
	/** Running tasks (full Task objects) */
	runningTasks: Task[];
	/** Ambient candidates with additional metadata */
	ambientCandidates: Array<Task & {
		reason: string;
		state: TaskState;
		autoScheduledStartAt?: string;
	}>;
	onAmbientClick?: (taskId: string) => void;
	onRequestStartNotification?: (taskId: string) => void;
	onRequestInterruptNotification?: (taskId: string) => void;
	onRequestPostponeNotification?: (taskId: string) => void;
	onSelectFocusTask?: (taskId: string) => void;
	onUpdateTask?: (taskId: string, updates: TaskCardUpdatePayload) => void | Promise<void>;
	onOperation?: (taskId: string, operation: import('./TaskOperations').TaskOperation) => void;
	/** Next tasks to show in NEXT section */
	nextTasks?: Task[];
	/** Show panel background (used in main panel). */
	showPanelBackground?: boolean;
}

function toTaskBase(id: string, title: string): Omit<Task, "state" | "project" | "updatedAt"> {
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
		elapsedMinutes: 0,
		energy: "medium",
		group: null,
		completedAt: null,
		pausedAt: null,
	};
}

function getStateIconMeta(state: Task["state"]): { icon: MSIconName; className: string } {
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
	task: Task;
	allTasks?: Task[];
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
				"bg-[var(--md-ref-color-surface)] px-2.5 py-1.5",
				"flex items-center gap-2",
				className,
			].join(" ")}
			aria-label={`Task card: ${task.title}`}
		>
			<Icon name={iconMeta.icon} size={14} className={iconMeta.className} />
			<div className="min-w-0 flex-1">
				<div className="text-[12px] font-semibold text-[var(--md-ref-color-on-surface)] truncate">
					{task.title}
				</div>
				<div className="text-[10px] text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap">
					{formatCardDateTime(startAt)}
				</div>
			</div>
			{showProgress && progress !== null ? (
				<div className="flex-shrink-0" aria-label={`progress ${Math.round(progress * 100)}%`}>
					<svg width="18" height="18" viewBox="0 0 22 22" className="block">
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
	ambientCandidates: _ambientCandidates,
	onAmbientClick: _onAmbientClick,
	onRequestStartNotification,
	onRequestInterruptNotification,
	onRequestPostponeNotification,
	onSelectFocusTask,
	onOperation,
	nextTasks = [],
	showPanelBackground = false,
}) => {
	const [isNextControlMode, setIsNextControlMode] = React.useState(false);
	const [selectedNextTaskId, setSelectedNextTaskId] = React.useState<string | null>(null);
	// Panel widths as percentages (left, center, right)
	const [leftWidth, setLeftWidth] = React.useState(20);
	const [rightWidth, setRightWidth] = React.useState(22);
	const containerRef = React.useRef<HTMLDivElement>(null);
	const isDraggingRef = React.useRef<'left' | 'right' | null>(null);

	const showTasks = runningTasks;
	const extraCount = 0;
	const focusTasks = useMemo<Task[]>(() => {
		const createdAt = new Date().toISOString();
		return showTasks.map((t) => ({
			...toTaskBase(t.id, t.title),
			state: "RUNNING" as Task["state"],
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
	const primaryStartDisplay = useMemo(() => {
		if (!primaryFocusTask) return null;
		return formatCardDateTime(getDisplayStartTime(primaryFocusTask, focusTasks));
	}, [primaryFocusTask, focusTasks]);
	const primaryProgress = useMemo(() => {
		if (!primaryFocusTask) return 0;
		const required = Math.max(1, primaryFocusTask.requiredMinutes ?? 0);
		const elapsed = Math.max(0, primaryFocusTask.elapsedMinutes ?? 0);
		return Math.min(1, elapsed / required);
	}, [primaryFocusTask]);

	React.useEffect(() => {
		if (nextTasks.length === 0) {
			setSelectedNextTaskId(null);
			setIsNextControlMode(false);
			return;
		}
		if (!selectedNextTaskId || !nextTasks.some((t) => t.id === selectedNextTaskId)) {
			setSelectedNextTaskId(nextTasks[0]?.id ?? null);
			setIsNextControlMode(false);
		}
	}, [nextTasks, selectedNextTaskId]);

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
			className="w-full h-full min-h-0"
			aria-label="Guidance board"
		>
			<div
				ref={containerRef}
				className={[
					showPanelBackground ? "bg-[var(--md-ref-color-surface)]" : "bg-transparent",
					"text-[var(--md-ref-color-on-surface)]",
					"overflow-hidden h-full",
				].join(" ")}
			>
				<div className="flex gap-0 relative h-full">
					{/* Left: timer + pressure (top-left) */}
					<div
						className="p-2 border-b md:border-b-0 md:border-r border-current/10 h-full overflow-hidden"
						style={{ width: `${leftWidth}%`, minWidth: "200px" }}
					>
						<GuidancePrimaryTimerPanel
							nextTasks={nextTasks}
							isTimerActive={isTimerActive && runningTasks.length > 0}
							activeTimerRemainingMs={activeTimerRemainingMs}
							activeTimerTotalMs={activeTimerTotalMs}
						/>
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
						<div className="p-2 h-full flex flex-col min-h-0">
							<div className="flex-1 min-h-0 flex flex-col">
								<div className="flex-1 min-h-0">
									<div className="flex h-full items-stretch gap-2 min-h-0">
										{runningTasks.length > 0 ? (
											<div className="flex h-full min-h-0 items-stretch gap-2">
												{primaryFocusTask ? (
													<div className="w-64 flex-shrink-0 h-full rounded-md border border-[color:color-mix(in_srgb,var(--md-ref-color-outline-variant)_50%,transparent)] bg-[var(--md-ref-color-surface)] px-3 py-2 flex flex-col overflow-hidden">
														<div className="flex items-start justify-between gap-2">
															<div className="min-w-0 flex-1">
																<div className="text-[14px] font-semibold text-[var(--md-ref-color-on-surface)] truncate">
																	{primaryFocusTask.title}
																</div>
																<div className="text-[11px] text-[var(--md-ref-color-on-surface-variant)] tabular-nums whitespace-nowrap">
																	{primaryStartDisplay ?? "日時未定"}
																</div>
															</div>
															<div className="flex-shrink-0">
																<svg width="32" height="32" viewBox="0 0 40 40">
																	<circle
																		cx="20"
																		cy="20"
																		r="18"
																		fill="none"
																		stroke="var(--md-ref-color-outline-variant)"
																		strokeWidth="3"
																		opacity="0.35"
																	/>
																	<circle
																		cx="20"
																		cy="20"
																		r="18"
																		fill="none"
																		stroke="var(--md-ref-color-primary)"
																		strokeWidth="3"
																		strokeLinecap="round"
																		strokeDasharray={2 * Math.PI * 18}
																		strokeDashoffset={2 * Math.PI * 18 * (1 - primaryProgress)}
																		transform="rotate(-90 20 20)"
																	/>
																</svg>
															</div>
														</div>
														<div className="mt-auto flex flex-wrap gap-1.5 pt-2">
															<button
																type="button"
																onClick={() => onOperation?.(primaryFocusTask.id, "complete")}
																className="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--md-ref-color-primary)] text-[var(--md-ref-color-on-primary)]"
															>
																完了
															</button>
															<button
																type="button"
																onClick={() => onRequestInterruptNotification?.(primaryFocusTask.id)}
																className="px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--md-ref-color-outline)] text-[var(--md-ref-color-on-surface)]"
															>
																中断
															</button>
															<button
																type="button"
																onClick={() => onOperation?.(primaryFocusTask.id, "extend")}
																className="px-2.5 py-1 rounded-full text-xs font-medium text-[var(--md-ref-color-on-surface-variant)]"
															>
																+延長
															</button>
														</div>
													</div>
												) : null}
												<div className="flex-1 min-w-0 h-full overflow-x-auto">
													<div className="flex h-full items-stretch gap-2">
														{secondaryFocusTasks.map((task) => (
															<div key={task.id} onClick={() => onSelectFocusTask?.(task.id)} className="flex-shrink-0 w-56 h-full">
																<GuidanceSimpleTaskCard task={task} allTasks={focusTasks} className="h-full" showProgress />
															</div>
														))}
													</div>
												</div>
												{extraCount > 0 ? (
													<div className="flex-shrink-0 w-8 flex items-center justify-center text-xs opacity-60">
														+{extraCount}
													</div>
												) : null}
											</div>
										) : null}
									</div>
								</div>
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
						className="p-2 h-full overflow-y-auto group"
						style={{ width: `${rightWidth}%`, minWidth: '200px' }}
					>
						<div className="min-w-0 h-full flex flex-col">
							{!isNextControlMode ? (
								nextTasks.length > 0 ? (
									<div className="h-full min-h-0 cursor-pointer" onClick={() => setIsNextControlMode(true)}>
										<div
											className="flex h-full items-stretch gap-2 overflow-x-auto"
											style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
											onMouseEnter={(e) => {
												e.currentTarget.style.scrollbarWidth = 'thin';
												e.currentTarget.style.scrollbarColor = 'var(--md-ref-color-outline-variant) transparent';
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.scrollbarWidth = 'none';
											}}
										>
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
										次のタスクはありません。
									</div>
								)
							) : (
								<div className="h-full min-h-0 flex flex-col">
									<div className="flex h-full flex-col gap-2 text-sm">
										<div className="flex items-center justify-between gap-2">
											<div className="font-semibold text-[var(--md-ref-color-on-surface)] truncate">
												{selectedNextTask?.title ?? "次のタスク"}
											</div>
											<div className="text-[var(--md-ref-color-on-surface-variant)] text-right whitespace-nowrap tabular-nums text-xs">
												{selectedNextTask?.fixedStartAt
													? formatCardDateTime(selectedNextTask.fixedStartAt)
													: selectedNextTask?.windowStartAt
														? `${new Date(selectedNextTask.windowStartAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}-${selectedNextTask.windowEndAt ? new Date(selectedNextTask.windowEndAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "--:--"}`
														: selectedNextTask?.estimatedStartAt
															? formatCardDateTime(selectedNextTask.estimatedStartAt)
															: "--:--"}
												{" "}({selectedNextTask?.requiredMinutes ?? 25}分)
											</div>
										</div>
										<div className="mt-auto flex flex-wrap gap-2">
											<button
												type="button"
												onClick={() => selectedNextTask && onRequestStartNotification?.(selectedNextTask.id)}
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
