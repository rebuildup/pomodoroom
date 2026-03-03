import { getValidToken, getStoredToken, refreshAccessToken } from "./googleAuth";
import type { Task, Project, CalendarInfo } from "../types";

const BASE = "https://www.googleapis.com/calendar/v3";

// ─── Auth helper ──────────────────────────────────────────

async function authFetch(url: string, options: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getValidToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && !retried) {
    const existing = await getStoredToken();
    if (existing?.refreshToken) {
      await refreshAccessToken(existing.refreshToken);
      return authFetch(url, options, true);
    }
  }
  if (res.status === 401) throw new Error("AUTH_EXPIRED");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GCal API error ${res.status}: ${body}`);
  }
  return res;
}

// ─── Calendar management ─────────────────────────────────

export async function listCalendars(): Promise<CalendarInfo[]> {
  const res = await authFetch(`${BASE}/users/me/calendarList`);
  const data = await res.json();
  return ((data.items ?? []) as { id: string; summary: string }[]).map((c) => ({
    id: c.id,
    summary: c.summary,
  }));
}

export async function getOrCreateCalendar(name: string): Promise<string> {
  const calendars = await listCalendars();
  const existing = calendars.find((c) => c.summary === name);
  if (existing) return existing.id;

  const res = await authFetch(`${BASE}/calendars`, {
    method: "POST",
    body: JSON.stringify({ summary: name }),
  });
  const data = await res.json();
  return data.id as string;
}

// ─── Task → Calendar event conversion ────────────────────

function taskToEvent(task: Task) {
  const start = task.dueDate
    ? new Date(task.dueDate)
    : new Date(task.createdAt);
  const end = new Date(start.getTime() + (task.estimatedMinutes ?? 25) * 60 * 1000);

  const metadata = {
    version: 1,
    task_id: task.id,
    state: task.state.toLowerCase(),
    priority: task.priority,
    estimated_minutes: task.estimatedMinutes,
    elapsed_minutes: task.elapsedMinutes,
  };

  const metaBlock = `───────── pomodoroom-metadata ─────────\n${JSON.stringify(metadata, null, 2)}`;
  const description = task.description ? `${task.description}\n\n${metaBlock}` : metaBlock;

  return {
    summary: task.title,
    description,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    status: task.state === "DONE" ? "cancelled" : "confirmed",
    extendedProperties: {
      private: {
        pomodoroom_version: "1",
        pomodoroom_id: task.id,
        pomodoroom_type: "task",
        pomodoroom_state: task.state.toLowerCase(),
        pomodoroom_priority: String(task.priority),
        pomodoroom_updated: new Date().toISOString(),
      },
    },
  };
}

function eventToTask(
  event: Record<string, unknown>,
): Partial<Task> & { calendarEventId: string } {
  const ext =
    (event.extendedProperties as Record<string, Record<string, string>>)?.private ?? {};
  const state = (ext.pomodoroom_state?.toUpperCase() ?? "READY") as Task["state"];

  let meta: Record<string, unknown> = {};
  let userDescription: string | undefined;
  try {
    const desc = (event.description as string) ?? "";
    const markerIdx = desc.indexOf("─────────");
    if (markerIdx > 0) {
      userDescription = desc.slice(0, markerIdx).trim() || undefined;
    }
    const metaMarker = desc.indexOf("pomodoroom-metadata");
    if (metaMarker !== -1) {
      const jsonStart = desc.indexOf("{", metaMarker);
      meta = JSON.parse(desc.slice(jsonStart)) as Record<string, unknown>;
    }
  } catch {
    // ignore parse errors
  }

  return {
    id: ext.pomodoroom_id ?? String(event.id),
    calendarEventId: String(event.id),
    title: String(event.summary ?? ""),
    description: userDescription,
    state,
    priority: Number(ext.pomodoroom_priority ?? meta.priority ?? 5),
    estimatedMinutes: Number(meta.estimated_minutes ?? 25) || undefined,
    elapsedMinutes: Number(meta.elapsed_minutes ?? 0),
    createdAt: String(event.created ?? new Date().toISOString()),
    updatedAt: String(event.updated ?? new Date().toISOString()),
  };
}

// ─── Task CRUD ───────────────────────────────────────────

export async function createCalendarTask(
  calendarId: string,
  task: Task,
): Promise<string> {
  const res = await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(taskToEvent(task)) },
  );
  const data = await res.json();
  return data.id as string;
}

export async function updateCalendarTask(
  calendarId: string,
  eventId: string,
  task: Task,
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(taskToEvent(task)) },
  );
}

export async function deleteCalendarTask(
  calendarId: string,
  eventId: string,
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

export async function listCalendarTasks(
  calendarId: string,
): Promise<Array<Partial<Task> & { calendarEventId: string }>> {
  const params = new URLSearchParams({
    privateExtendedProperty: "pomodoroom_type=task",
    showDeleted: "false",
    maxResults: "250",
  });
  const res = await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  );
  const data = await res.json();
  return ((data.items ?? []) as Record<string, unknown>[]).map(eventToTask);
}

// ─── Project → Calendar all-day event conversion ─────────

function projectToEvent(project: Project) {
  const startDate = project.createdAt.slice(0, 10);
  const endDate = project.deadline
    ? project.deadline.slice(0, 10)
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    summary: `[PROJECT] ${project.name}`,
    start: { date: startDate },
    end: { date: endDate },
    extendedProperties: {
      private: {
        pomodoroom_version: "1",
        pomodoroom_id: project.id,
        pomodoroom_type: "project",
        pomodoroom_updated: new Date().toISOString(),
      },
    },
  };
}

// ─── Project CRUD ────────────────────────────────────────

export async function createCalendarProject(
  calendarId: string,
  project: Project,
): Promise<string> {
  const res = await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(projectToEvent(project)) },
  );
  const data = await res.json();
  return data.id as string;
}

export async function updateCalendarProject(
  calendarId: string,
  eventId: string,
  project: Project,
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(projectToEvent(project)) },
  );
}

export async function deleteCalendarProject(
  calendarId: string,
  eventId: string,
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

export async function listCalendarProjects(calendarId: string): Promise<
  Array<{
    id: string;
    calendarEventId: string;
    name: string;
    deadline?: string;
    createdAt: string;
  }>
> {
  const params = new URLSearchParams({
    privateExtendedProperty: "pomodoroom_type=project",
    showDeleted: "false",
    maxResults: "100",
  });
  const res = await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  );
  const data = await res.json();
  return ((data.items ?? []) as Record<string, unknown>[]).map((event) => {
    const ext =
      (event.extendedProperties as Record<string, Record<string, string>>)?.private ?? {};
    const summary = String(event.summary ?? "");
    const name = summary.replace(/^\[PROJECT\]\s*/, "");
    const endDate = (event.end as Record<string, string>)?.date;
    return {
      id: ext.pomodoroom_id ?? String(event.id),
      calendarEventId: String(event.id),
      name,
      deadline: endDate,
      createdAt: String(event.created ?? new Date().toISOString()),
    };
  });
}
