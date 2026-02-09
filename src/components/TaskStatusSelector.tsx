/**
 * TaskStatusSelector -- Status selector with visual color indicators.
 *
 * Displays each status option with its corresponding color badge.
 * Works in both dark and light themes.
 */
import type { TaskStreamStatus } from "@/types/taskstream";
import { TASK_STATUS_COLORS } from "@/types/taskstream";

interface TaskStatusSelectorProps {
	value: TaskStreamStatus;
	onChange: (status: TaskStreamStatus) => void;
	disabled?: boolean;
	className?: string;
}

const STATUS_LABELS: Record<TaskStreamStatus, string> = {
	plan: "Plan",
	doing: "Doing",
	log: "Log",
	interrupted: "Interrupted",
	routine: "Routine",
	defer: "Defer",
};

export function TaskStatusSelector({
	value,
	onChange,
	disabled = false,
	className = "",
}: TaskStatusSelectorProps) {
	return (
		<div className={`flex flex-col gap-1.5 ${className}`}>
			{(
				Object.entries(STATUS_LABELS) as [TaskStreamStatus, string][]
			).map(([status, label]) => {
				const colors = TASK_STATUS_COLORS[status as TaskStreamStatus];
				const isSelected = value === status;

				return (
					<button
						key={status}
						type="button"
						disabled={disabled}
						onClick={() => onChange(status as TaskStreamStatus)}
						className={`
							flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
							transition-all duration-150
							${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-(--color-surface)"}
							${isSelected ? "ring-1 ring-(--color-text-primary)" : ""}
						`}
					>
						{/* Color indicator */}
						<div
							className={`w-3 h-3 rounded-full shrink-0 ${colors.bg} ${colors.text} ${colors.border} border`}
						/>
						<span className="text-(--color-text-secondary)">{label}</span>
						{isSelected && (
							<span className="ml-auto text-xs text-(--color-text-muted)">
								Active
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
