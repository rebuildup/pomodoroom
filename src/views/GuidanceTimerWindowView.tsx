import DetachedWindowShell from "@/components/DetachedWindowShell";
import { GuidancePrimaryTimerPanel } from "@/components/m3/GuidancePrimaryTimerPanel";
import { useTaskStore } from "@/hooks/useTaskStore";
import { useTauriTimer } from "@/hooks/useTauriTimer";
import { selectNextBoardTasks } from "@/utils/next-board-tasks";

export default function GuidanceTimerWindowView() {
	const taskStore = useTaskStore();
	const timer = useTauriTimer();

	const runningTasks = taskStore.getTasksByState("RUNNING");
	const nextTasks = selectNextBoardTasks(taskStore.tasks, 3);

	return (
		<DetachedWindowShell title="Guidance Timer">
			<div className="absolute inset-0 px-3 pb-2">
				<GuidancePrimaryTimerPanel
					nextTasks={nextTasks}
					isTimerActive={timer.isActive && runningTasks.length > 0}
					activeTimerRemainingMs={timer.remainingMs}
					activeTimerTotalMs={timer.totalSeconds * 1000}
				/>
			</div>
		</DetachedWindowShell>
	);
}
