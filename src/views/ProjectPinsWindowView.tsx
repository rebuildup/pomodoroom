import { useCallback } from "react";
import DetachedWindowShell from "@/components/DetachedWindowShell";
import { OverviewPinnedProjects } from "@/components/m3/OverviewPinnedProjects";
import type { TaskOperation } from "@/components/m3/TaskOperations";
import { useProjects } from "@/hooks/useProjects";
import { useTaskStore } from "@/hooks/useTaskStore";
import { runWindowTaskOperation } from "@/utils/window-task-operations";

export default function ProjectPinsWindowView() {
	const taskStore = useTaskStore();
	const projectsStore = useProjects();

	const handleTaskOperation = useCallback(
		(taskId: string, operation: TaskOperation) => {
			const task = taskStore.getTask(taskId);
			void runWindowTaskOperation(task, operation);
		},
		[taskStore],
	);

	return (
		<DetachedWindowShell title="Pinned Projects">
			<div className="absolute inset-0  overflow-y-auto scrollbar-hover p-3">
				<OverviewPinnedProjects
					projects={projectsStore.projects}
					tasks={taskStore.tasks}
					onTaskOperation={handleTaskOperation}
					onUpdateProject={projectsStore.updateProject}
				/>
			</div>
		</DetachedWindowShell>
	);
}
