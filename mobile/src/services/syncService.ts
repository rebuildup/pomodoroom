import * as storage from "./storage";
import {
  getOrCreateCalendar,
  createCalendarTask,
  updateCalendarTask,
  listCalendarTasks,
  createCalendarProject,
  updateCalendarProject,
  listCalendarProjects,
} from "./googleCalendarService";
import { CALENDAR_NAMES } from "../config";
import type { Task, Project } from "../types";

// Calendar ID cache
let tasksCalendarId: string | null = null;
let projectsCalendarId: string | null = null;

async function getTasksCalId(): Promise<string> {
  if (!tasksCalendarId) {
    tasksCalendarId = await getOrCreateCalendar(CALENDAR_NAMES.tasks);
  }
  return tasksCalendarId;
}

async function getProjectsCalId(): Promise<string> {
  if (!projectsCalendarId) {
    projectsCalendarId = await getOrCreateCalendar(CALENDAR_NAMES.projects);
  }
  return projectsCalendarId;
}

// ─── Task sync ───────────────────────────────────────────

export async function pushTask(task: Task): Promise<Task> {
  const calId = await getTasksCalId();

  if (task.calendarEventId) {
    await updateCalendarTask(calId, task.calendarEventId, task);
    return task;
  } else {
    const eventId = await createCalendarTask(calId, task);
    const updated = await storage.updateTask(task.id, { calendarEventId: eventId });
    return updated ?? task;
  }
}

export async function pullTasks(): Promise<void> {
  const calId = await getTasksCalId();
  const remoteItems = await listCalendarTasks(calId);

  for (const remote of remoteItems) {
    if (!remote.id) continue;
    const local = await storage.getTaskById(remote.id);

    if (!local) {
      // Exists remotely but not locally — create local copy
      await storage.createTask({
        title: remote.title ?? "Untitled",
        state: remote.state ?? "READY",
        priority: remote.priority ?? 5,
        elapsedMinutes: remote.elapsedMinutes ?? 0,
        estimatedMinutes: remote.estimatedMinutes,
        calendarEventId: remote.calendarEventId,
      } as Omit<Task, "id" | "createdAt" | "updatedAt">);
    } else if (!local.calendarEventId) {
      // Local task missing calendar link — set it
      await storage.updateTask(local.id, { calendarEventId: remote.calendarEventId });
    }
  }

  await storage.kvSet("last_sync_tasks", new Date().toISOString());
}

// ─── Project sync ─────────────────────────────────────────

export async function pushProject(project: Project): Promise<Project> {
  const calId = await getProjectsCalId();

  if (project.calendarEventId) {
    await updateCalendarProject(calId, project.calendarEventId, project);
    return project;
  } else {
    const eventId = await createCalendarProject(calId, project);
    const updated = await storage.updateProject(project.id, { calendarEventId: eventId });
    return updated ?? project;
  }
}

export async function pullProjects(): Promise<void> {
  const calId = await getProjectsCalId();
  const remoteItems = await listCalendarProjects(calId);

  for (const remote of remoteItems) {
    const local = await storage.getProjectById(remote.id);
    if (!local) {
      await storage.createProject({
        name: remote.name,
        deadline: remote.deadline,
        calendarEventId: remote.calendarEventId,
      });
    } else if (!local.calendarEventId) {
      await storage.updateProject(local.id, { calendarEventId: remote.calendarEventId });
    }
  }

  await storage.kvSet("last_sync_projects", new Date().toISOString());
}

// ─── Full sync ────────────────────────────────────────────

export async function fullSync(): Promise<void> {
  // Pull remote → local first
  await pullProjects();
  await pullTasks();

  // Push local items that haven't been synced yet
  const tasks = await storage.getAllTasks();
  for (const task of tasks) {
    if (!task.calendarEventId && task.state !== "DONE") {
      await pushTask(task);
    }
  }

  const projects = await storage.getAllProjects();
  for (const project of projects) {
    if (!project.calendarEventId) {
      await pushProject(project);
    }
  }
}

export async function getLastSyncAt(): Promise<string | null> {
  return storage.kvGet("last_sync_tasks");
}
