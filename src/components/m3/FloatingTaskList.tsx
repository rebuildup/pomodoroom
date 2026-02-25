/**
 * Material 3 Floating Task List Component
 *
 * Displays PAUSED tasks as "Floating" list below the main timer.
 * These are background awareness tasks that the user has interrupted
 * but may want to resume later.
 *
 * Features:
 * - Compact list display with task title
 * - Shows pause time for each Floating task
 * - Resume button to promote Floating task to Active
 * - Visual distinction: muted colors, smaller text
 * - Material 3 styling with M3 color tokens
 *
 * Active/Floating Model:
 * - Active: Single RUNNING task (prominent, highlighted)
 * - Floating: Multiple PAUSED tasks (visible but muted)
 *
 * @example
 * ```tsx
 * <FloatingTaskList
 *   tasks={[
 *     { id: '1', title: 'DB Migration', pausedAt: '10:30' },
 *     { id: '2', title: 'API Design', pausedAt: '11:15' },
 *   ]}
 *   onResume={(taskId) => console.log('Resume:', taskId)}
 * />
 * ```
 */

import React from "react";
import { Icon } from "./Icon";

export interface FloatingTask {
	/** Unique task identifier */
	id: string;
	/** Task title */
	title: string;
	/** Time when task was paused (formatted string) */
	pausedAt?: string;
	/** Optional project ID for color coding */
	projectId?: string;
}

export interface FloatingTaskListProps {
	/** Array of paused tasks to display */
	tasks: FloatingTask[];
	/** Resume button click handler */
	onResume: (taskId: string) => void;
	/** Custom className for styling */
	className?: string;
}

/**
 * Format pause time for display
 */
function formatPauseTime(isoString?: string): string {
	if (!isoString) return "";
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Material 3 Floating Task List
 *
 * Displays paused tasks in a compact, muted list below the main timer.
 * Each task has a resume button to promote it to Active (RUNNING).
 */
export const FloatingTaskList: React.FC<FloatingTaskListProps> = React.memo(
	({ tasks, onResume, className = "" }) => {
		if (tasks.length === 0) {
			return null;
		}

		return (
			<section
				className={`w-full max-w-md mx-auto ${className}`}
				aria-label={`Floating tasks: ${tasks.length} paused tasks`}
			>
				{/* Section Header */}
				<header className="flex items-center gap-2 mb-3 px-2">
					<Icon name="layers" size={16} className="text-white/30" aria-hidden="true" />
					<span
						className="text-xs uppercase tracking-wider font-bold text-white/30"
						aria-hidden="true"
					>
						Floating
					</span>
					<span className="text-xs text-white/20" title={`${tasks.length} floating tasks`}>
						({tasks.length})
					</span>
				</header>

				{/* Floating Task List */}
				<ul className="flex flex-col gap-2">
					{tasks.map((task) => (
						<li key={task.id}>
							<div className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition-all duration-200">
								{/* Task Icon - Muted */}
								<div
									className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"
									aria-hidden="true"
								>
									<Icon name="pause" size={14} filled className="text-white/40" />
								</div>

								{/* Task Info */}
								<div className="flex-1 min-w-0">
									<p className="text-sm text-white/60 font-medium truncate group-hover:text-white/70 transition-colors">
										{task.title}
									</p>
									{task.pausedAt && (
										<p className="text-xs text-white/30 mt-0.5">
											Paused {formatPauseTime(task.pausedAt)}
										</p>
									)}
								</div>

								{/* Resume Button */}
								<button
									type="button"
									onClick={() => onResume(task.id)}
									aria-label={`Resume ${task.title}`}
									className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full bg-white/10 text-white/50 hover:bg-white/15 hover:text-white/70 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-white/20"
								>
									Resume
								</button>
							</div>
						</li>
					))}
				</ul>

				{/* Hint Text */}
				<p className="text-xs text-white/20 mt-3 px-2 text-center" role="note">
					Tap Resume to promote task to Active
				</p>
			</section>
		);
	},
	(prevProps, nextProps) => {
		// Only re-render if tasks array length changes or className changes
		return (
			prevProps.tasks.length === nextProps.tasks.length &&
			prevProps.className === nextProps.className &&
			prevProps.tasks.every((task, i) => {
				const nextTask = nextProps.tasks[i];
				if (!nextTask) return false;
				return (
					task.id === nextTask.id &&
					task.title === nextTask.title &&
					task.pausedAt === nextTask.pausedAt &&
					task.projectId === nextTask.projectId
				);
			})
		);
	},
);

FloatingTaskList.displayName = "FloatingTaskList";

// Backward compatibility alias
export const AmbientTaskList = FloatingTaskList;
export type AmbientTask = FloatingTask;
export type AmbientTaskListProps = FloatingTaskListProps;

export default FloatingTaskList;
