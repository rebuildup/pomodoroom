import type { Project } from "@/types/schedule";
import { isV2Task, type Task } from "@/types/task";

/**
 * Return tasks associated with a project.
 * Tasks may keep project reference either as project id or project name.
 */
export function getTasksForProject(tasks: Task[], project: Project): Task[] {
	const fromStore = tasks.filter((task) => {
		if (!task.project) return false;
		return task.project === project.id || task.project === project.name;
	});

	if (!project.tasks || project.tasks.length === 0) {
		return fromStore;
	}

	const known = new Set(fromStore.map((task) => task.id));
	const fromProject = project.tasks
		.filter((task): task is Task => isV2Task(task))
		.filter((task) => !known.has(task.id));

	return [...fromStore, ...fromProject];
}
