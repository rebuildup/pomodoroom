/**
 * Material 3 Ambient Task List Component
 *
 * Displays PAUSED tasks as "Ambient" list below the main timer.
 * These are background awareness tasks that the user has interrupted
 * but may want to resume later.
 *
 * Features:
 * - Compact list display with task title
 * - Shows pause time for each Ambient task
 * - Resume button to promote Ambient task to Anchor
 * - Visual distinction: muted colors, smaller text
 * - Material 3 styling with M3 color tokens
 *
 * Anchor/Ambient Model:
 * - Anchor: Single RUNNING task (prominent, highlighted)
 * - Ambient: Multiple PAUSED tasks (visible but muted)
 *
 * @example
 * ```tsx
 * <AmbientTaskList
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

export interface AmbientTask {
	/** Unique task identifier */
	id: string;
	/** Task title */
	title: string;
	/** Time when task was paused (formatted string) */
	pausedAt?: string;
	/** Optional project ID for color coding */
	projectId?: string;
}

export interface AmbientTaskListProps {
	/** Array of paused tasks to display */
	tasks: AmbientTask[];
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
 * Material 3 Ambient Task List
 *
 * Displays paused tasks in a compact, muted list below the main timer.
 * Each task has a resume button to promote it to Anchor (RUNNING).
 */
export const AmbientTaskList: React.FC<AmbientTaskListProps> = ({
	tasks,
	onResume,
	className = "",
}) => {
	if (tasks.length === 0) {
		return null;
	}

	return (
		<div className={`w-full max-w-md mx-auto ${className}`}>
			{/* Section Header */}
			<div className="flex items-center gap-2 mb-3 px-2">
				<Icon name="layers" size={16} className="text-white/30" />
				<span className="text-xs uppercase tracking-wider font-bold text-white/30">
					Ambient
				</span>
				<span className="text-xs text-white/20">({tasks.length})</span>
			</div>

			{/* Ambient Task List */}
			<div className="flex flex-col gap-2">
				{tasks.map((task) => (
					<div
						key={task.id}
						className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition-all duration-200"
					>
						{/* Task Icon - Muted */}
						<div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
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
				))}
			</div>

			{/* Hint Text */}
			<p className="text-xs text-white/20 mt-3 px-2 text-center">
				Tap Resume to promote task to Anchor
			</p>
		</div>
	);
};

export default AmbientTaskList;
