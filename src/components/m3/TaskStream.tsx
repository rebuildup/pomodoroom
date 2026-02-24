/**
 * Material 3 TaskStream Component
 *
 * Timeline-style task feed with chronological log.
 * Features:
 * - Sectioning by status (Plan, Routine, Log, Defer)
 * - Collapsible sections
 * - Task actions (start, complete, pause, resume, defer)
 * - Quick entry for new tasks
 * - Statistics summary
 *
 * Reference: https://m3.material.io/components/lists/overview
 */

import type React from "react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "./Icon";
import { StreamSection } from "./StreamSection";
import { TaskStreamItem as TaskStreamItemComponent } from "./TaskStreamItem";
import type { TaskStreamItem as TaskStreamItemType, StreamAction } from "@/types/taskstream";

export interface TaskStreamProps {
	/**
	 * All task items
	 */
	items: TaskStreamItemType[];

	/**
	 * Action callback for task operations
	 */
	onAction: (taskId: string, action: StreamAction) => void;

	/**
	 * Add task callback
	 */
	onAddTask?: (title: string) => void;

	/**
	 * Compact mode (hides log, limits plan items)
	 */
	compact?: boolean;

	/**
	 * Pop out button callback
	 */
	onPopOut?: () => void;

	/**
	 * Task click callback (for opening details)
	 */
	onTaskClick?: (item: TaskStreamItemType) => void;

	/**
	 * Additional CSS class
	 */
	className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
}

// ─── Quick Entry Component ─────────────────────────────────────────────────

interface QuickEntryProps {
	onAdd?: (title: string) => void;
}

function QuickEntry({ onAdd }: QuickEntryProps) {
	const [isActive, setIsActive] = useState(false);
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isActive) {
			inputRef.current?.focus();
		}
	}, [isActive]);

	const handleSubmit = useCallback(() => {
		const title = value.trim();
		if (title) {
			onAdd?.(title);
		}
		setValue("");
		setIsActive(false);
	}, [value, onAdd]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSubmit();
			}
			if (e.key === "Escape") {
				setValue("");
				setIsActive(false);
			}
		},
		[handleSubmit],
	);

	if (!isActive) {
		return (
			<button
				type="button"
				onClick={() => setIsActive(true)}
				className={`
					flex items-center gap-2 w-full
					px-4 py-3
					text-sm font-medium
					text-[var(--md-ref-color-on-surface-variant)]
					hover:text-[var(--md-ref-color-on-surface)]
					hover:bg-[var(--md-ref-color-surface-container-high)]
					transition-colors duration-150 ease-in-out
				`.trim()}
				style={{ font: "var(--md-sys-typescale-label-large)" }}
			>
				<Icon name="add" size={20} />
				<span>Add task…</span>
			</button>
		);
	}

	return (
		<div
			className={`
				flex items-center gap-2
				px-4 py-3
				bg-[var(--md-ref-color-surface-container-high)]
			`.trim()}
		>
			<Icon
				name="add"
				size={20}
				className="shrink-0 text-[var(--md-ref-color-on-surface-variant)]"
			/>
			<input
				ref={inputRef}
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleSubmit}
				placeholder="Task name ~25m @project #tag"
				className={`
					flex-1 bg-transparent
					text-base text-[var(--md-ref-color-on-surface)]
					outline-none
					placeholder:text-[var(--md-ref-color-on-surface-variant)]
				`.trim()}
				style={{ font: "var(--md-sys-typescale-body-large)" }}
			/>
			<span
				className={`
					shrink-0 text-xs font-mono
					text-[var(--md-ref-color-on-surface-variant)]
				`.trim()}
			>
				⏎
			</span>
		</div>
	);
}

// ─── Main Component ────────────────────────────────────────────────────────

export const TaskStream: React.FC<TaskStreamProps> = ({
	items,
	onAction,
	onAddTask,
	compact = false,
	onPopOut,
	onTaskClick,
	className = "",
}) => {
	// Filter and group items by status
	const plan = useMemo(
		() => items.filter((i) => i.status === "plan").sort((a, b) => a.order - b.order),
		[items],
	);

	const routine = useMemo(
		() => items.filter((i) => i.status === "routine").sort((a, b) => a.order - b.order),
		[items],
	);

	const log = useMemo(
		() => items.filter((i) => i.status === "log").sort((a, b) => b.order - a.order),
		[items],
	);

	const deferred = useMemo(() => items.filter((i) => i.status === "defer"), [items]);

	// Calculate statistics (include doing for accurate totals)
	const doing = useMemo(() => items.filter((i) => i.status === "doing"), [items]);

	const totalEstimate = useMemo(
		() => [...plan, ...routine, ...doing].reduce((sum, i) => sum + i.estimatedMinutes, 0),
		[plan, routine, doing],
	);

	const totalActual = useMemo(
		() => [...log, ...doing].reduce((sum, i) => sum + i.actualMinutes, 0),
		[log, doing],
	);

	// Compact mode limits
	const visiblePlan = compact ? plan.slice(0, 3) : plan;
	const hiddenPlanCount = compact ? Math.max(0, plan.length - 3) : 0;

	// Storage keys for section persistence
	const planStorageKey = "taskstream-m3-plan";
	const routineStorageKey = "taskstream-m3-routine";
	const logStorageKey = "taskstream-m3-log";
	const deferStorageKey = "taskstream-m3-defer";

	return (
		<div
			className={`
				flex flex-col overflow-hidden
				bg-[var(--md-ref-color-surface)]
				rounded-[var(--md-sys-shape-corner-medium)]
				${className}
			`.trim()}
		>
			{/* Header */}
			<div
				className={`
					flex items-center shrink-0
					px-4 py-3
					border-b border-[var(--md-ref-color-outline-variant)]
				`.trim()}
			>
				<span
					className={`
						text-sm font-bold tracking-widest uppercase
						text-[var(--md-ref-color-on-surface-variant)]
					`.trim()}
					style={{ font: "var(--md-sys-typescale-label-large)" }}
				>
					TaskStream
				</span>

				{/* Statistics */}
				<div className="flex-1" />
				<div
					className={`
						flex items-center gap-3
						text-sm font-mono tabular-nums
						text-[var(--md-ref-color-on-surface-variant)]
					`.trim()}
				>
					<span className="flex items-center gap-1" title="Estimated total">
						<Icon name="timer" size={16} />
						{formatMinutes(totalEstimate)}
					</span>
					<span className="flex items-center gap-1" title="Actual total">
						<Icon name="schedule" size={16} />
						{formatMinutes(totalActual)}
					</span>
					<span title="In progress">{doing.length}⚡</span>
					<span title="Completed">{log.length}✓</span>
				</div>

				{/* Pop out button */}
				{onPopOut && (
					<button
						type="button"
						onClick={onPopOut}
						className={`
							ml-2 p-1.5 rounded-full
							text-[var(--md-ref-color-on-surface-variant)]
							hover:bg-[var(--md-ref-color-surface-container-high)]
							hover:text-[var(--md-ref-color-on-surface)]
							transition-colors duration-150 ease-in-out
						`.trim()}
						title="Open in new window"
					>
						<Icon name="open_in_new" size={18} />
					</button>
				)}
			</div>

			{/* Quick entry */}
			<div className="border-b border-[var(--md-ref-color-outline-variant)]">
				<QuickEntry onAdd={onAddTask} />
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto">
				{/* Plan Section */}
				{plan.length > 0 && (
					<StreamSection
						label="Plan"
						count={plan.length}
						storageKey={planStorageKey}
						defaultOpen={true}
						extra={
							<span
								className={`
									text-sm font-mono tabular-nums
									text-[var(--md-ref-color-on-surface-variant)]
								`.trim()}
							>
								~{formatMinutes(plan.reduce((sum, i) => sum + i.estimatedMinutes, 0))}
							</span>
						}
					>
						{visiblePlan.map((item) => (
							<TaskStreamItemComponent
								key={item.id}
								item={item}
								onAction={onAction}
								onClick={onTaskClick ? () => onTaskClick(item) : undefined}
								compact={compact}
							/>
						))}
						{hiddenPlanCount > 0 && (
							<div
								className={`
									px-4 py-2
									text-sm
									text-[var(--md-ref-color-on-surface-variant)]
								`.trim()}
								style={{ font: "var(--md-sys-typescale-body-medium)" }}
							>
								+{hiddenPlanCount} more…
							</div>
						)}
					</StreamSection>
				)}

				{/* Routine Section */}
				{routine.length > 0 && !compact && (
					<StreamSection
						label="Routine"
						count={routine.length}
						storageKey={routineStorageKey}
						defaultOpen={true}
					>
						{routine.map((item) => (
							<TaskStreamItemComponent
								key={item.id}
								item={item}
								onAction={onAction}
								onClick={onTaskClick ? () => onTaskClick(item) : undefined}
								compact={compact}
							/>
						))}
					</StreamSection>
				)}

				{/* Log Section */}
				{log.length > 0 && !compact && (
					<StreamSection
						label="Log"
						count={log.length}
						storageKey={logStorageKey}
						defaultOpen={!compact}
					>
						{log.map((item) => (
							<TaskStreamItemComponent
								key={item.id}
								item={item}
								onAction={onAction}
								compact={compact}
							/>
						))}
					</StreamSection>
				)}

				{/* Defer Section */}
				{deferred.length > 0 && !compact && (
					<StreamSection
						label="Defer"
						count={deferred.length}
						storageKey={deferStorageKey}
						defaultOpen={false}
					>
						{deferred.map((item) => (
							<TaskStreamItemComponent
								key={item.id}
								item={item}
								onAction={onAction}
								onClick={onTaskClick ? () => onTaskClick(item) : undefined}
								compact={compact}
							/>
						))}
					</StreamSection>
				)}

				{/* Empty state */}
				{plan.length === 0 && routine.length === 0 && log.length === 0 && deferred.length === 0 && (
					<div
						className={`
							flex flex-col items-center justify-center
							px-4 py-12
							text-center
						`.trim()}
					>
						<Icon
							name="check_circle"
							size={48}
							className="text-[var(--md-ref-color-on-surface-variant)] opacity-40 mb-4"
						/>
						<p
							className={`
								text-base
								text-[var(--md-ref-color-on-surface-variant)]
							`.trim()}
							style={{ font: "var(--md-sys-typescale-body-large)" }}
						>
							No tasks yet. Add your first task to get started.
						</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default TaskStream;
