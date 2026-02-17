import { describe, expect, it } from "vitest";
import { getTasksForProject } from "@/utils/project-task-matching";
import type { Task } from "@/types/task";
import type { Project } from "@/types/schedule";

function makeTask(overrides: Partial<Task> = {}): Task {
	const now = "2026-02-15T00:00:00.000Z";
	return {
		id: overrides.id ?? "task-1",
		title: overrides.title ?? "Task",
		description: overrides.description,
		estimatedPomodoros: overrides.estimatedPomodoros ?? 1,
		completedPomodoros: overrides.completedPomodoros ?? 0,
		completed: overrides.completed ?? false,
		state: overrides.state ?? "READY",
		kind: overrides.kind ?? "duration_only",
		requiredMinutes: overrides.requiredMinutes ?? 25,
		fixedStartAt: overrides.fixedStartAt ?? null,
		fixedEndAt: overrides.fixedEndAt ?? null,
		windowStartAt: overrides.windowStartAt ?? null,
		windowEndAt: overrides.windowEndAt ?? null,
		estimatedStartAt: overrides.estimatedStartAt ?? null,
		elapsedMinutes: overrides.elapsedMinutes ?? 0,
		project: overrides.project ?? null,
		group: overrides.group ?? null,
		energy: overrides.energy ?? "medium",
		tags: overrides.tags ?? [],
		priority: overrides.priority ?? null,
		category: overrides.category ?? "active",
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
		completedAt: overrides.completedAt ?? null,
		pausedAt: overrides.pausedAt ?? null,
		projectIds: overrides.projectIds ?? [],
		groupIds: overrides.groupIds ?? [],
		estimatedMinutes: overrides.estimatedMinutes ?? null,
	};
}

function makeProject(overrides: Partial<Project> = {}): Project {
	return {
		id: overrides.id ?? "p-1",
		name: overrides.name ?? "Project A",
		deadline: overrides.deadline,
		tasks: overrides.tasks ?? [],
		createdAt: overrides.createdAt ?? "2026-02-15T00:00:00.000Z",
	};
}

describe("getTasksForProject", () => {
	it("matches tasks by project id and project name", () => {
		const project = makeProject({ id: "p-1", name: "Project A" });
		const tasks = [
			makeTask({ id: "a", project: "p-1" }),
			makeTask({ id: "b", project: "Project A" }),
			makeTask({ id: "c", project: "Other" }),
		];

		const result = getTasksForProject(tasks, project);
		expect(result.map((task) => task.id)).toEqual(["a", "b"]);
	});
});
