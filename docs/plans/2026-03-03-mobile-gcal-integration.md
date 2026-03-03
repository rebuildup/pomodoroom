# Mobile Google Calendar Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Google Calendar をリモートDBとして使い、タスクとプロジェクトの CRUD をモバイルアプリからリモートベースで行えるようにする。

**Architecture:** expo-auth-session (PKCE) で Google OAuth2 認証を行い、アクセストークンを expo-secure-store に保管する。タスク操作は Google Calendar REST API への直接 fetch 呼び出しで即時反映し、ローカル SQLite はキャッシュとして使用する。同期はアプリ起動時と手動トリガーで行う。

**Tech Stack:** expo-auth-session, expo-web-browser, expo-secure-store, Google Calendar REST API v3, expo-sqlite (cache)

---

## 前提：Google Cloud 設定（手動作業）

実装前にユーザーが以下を完了している必要がある：

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Calendar API を有効化
3. OAuth 同意画面を設定（テスト用）
4. 認証情報 → OAuth 2.0 クライアント ID を作成（**Webアプリケーション**タイプ）
   - 承認済みリダイレクト URI に `com.pomodoroom.mobile:/oauth2redirect` を追加
5. 取得した **クライアントID** を `mobile/src/config.ts` に設定（後述）

---

## Task 1: パッケージ追加 & app.json の OAuth スキーム設定

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`
- Create: `mobile/src/config.ts`

**Step 1: 依存パッケージを追加**

```bash
cd mobile
npx expo install expo-auth-session expo-web-browser expo-secure-store expo-crypto
```

**Step 2: app.json にカスタムスキームを追加**

```json
// mobile/app.json の "expo" オブジェクト内に追加
{
  "expo": {
    "scheme": "com.pomodoroom.mobile",
    "android": {
      "package": "com.pomodoroom.mobile",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "com.pomodoroom.mobile"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

**Step 3: config.ts を作成**

```typescript
// mobile/src/config.ts
export const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const GCAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
];

export const CALENDAR_NAMES = {
  tasks: "pomodoroom-tasks",
  projects: "pomodoroom-projects",
} as const;
```

**Step 4: .env.example を作成してドキュメント化**

```
# mobile/.env.example
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

**Step 5: コミット**

```bash
git add mobile/ && git commit -m "feat(mobile): add OAuth dependencies and config"
```

---

## Task 2: 型定義を拡張

**Files:**
- Modify: `mobile/src/types/index.ts`

**Step 1: Project 型・GoogleToken 型・CalendarEvent 型を追加**

```typescript
// 既存の export の下に追加

export interface Project {
  id: string;
  name: string;
  deadline?: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  calendarEventId?: string; // Google Calendar event ID
}

export interface GoogleToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp (ms)
  tokenType: string;
  scope: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  isSyncing: boolean;
  error: string | null;
}
```

**Step 2: Task 型に calendarEventId を追加**

```typescript
export interface Task {
  // ... 既存フィールド ...
  calendarEventId?: string; // Google Calendar event ID
}
```

**Step 3: コミット**

```bash
git add mobile/src/types/ && git commit -m "feat(mobile): extend types for GCal integration"
```

---

## Task 3: ローカルストレージに projects テーブルと kv テーブルを追加

**Files:**
- Modify: `mobile/src/services/storage.ts`

**Step 1: initDatabase() に projects テーブルと kv テーブルを追加**

```typescript
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    deadline TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    calendar_event_id TEXT
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- tasksテーブルにcalendar_event_idカラムを追加（既存DBの場合はignore）
  ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT;
`);
// ALTERは既存カラムがあるとエラーになるのでtry-catchで囲む
```

正しい実装：

```typescript
export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync("pomodoroom.db");

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      state TEXT NOT NULL DEFAULT 'READY',
      priority INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER,
      elapsed_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      due_date TEXT,
      project_id TEXT,
      calendar_event_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      deadline TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      calendar_event_id TEXT
    );

    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 既存DBへのマイグレーション（calendar_event_idが存在しない場合に追加）
  try {
    await db.execAsync("ALTER TABLE tasks ADD COLUMN calendar_event_id TEXT;");
  } catch {
    // カラム既存の場合は無視
  }
}
```

**Step 2: projects CRUD を追加**

```typescript
// storage.ts に追加

interface ProjectRow {
  id: string;
  name: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
  calendar_event_id: string | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    deadline: row.deadline ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    calendarEventId: row.calendar_event_id ?? undefined,
  };
}

export async function getAllProjects(): Promise<Project[]> {
  if (!db) throw new Error("Database not initialized");
  const rows = await db.getAllAsync<ProjectRow>(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
  return rows.map(rowToProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
  if (!db) throw new Error("Database not initialized");
  const row = await db.getFirstAsync<ProjectRow>(
    "SELECT * FROM projects WHERE id = ?", id
  );
  return row ? rowToProject(row) : null;
}

export async function createProject(
  project: Omit<Project, "id" | "createdAt" | "updatedAt">
): Promise<Project> {
  if (!db) throw new Error("Database not initialized");
  const now = new Date().toISOString();
  const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newProject: Project = { ...project, id, createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO projects (id, name, deadline, created_at, updated_at, calendar_event_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newProject.id, newProject.name, newProject.deadline ?? null,
    newProject.createdAt, newProject.updatedAt, newProject.calendarEventId ?? null
  );
  return newProject;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
  if (!db) throw new Error("Database not initialized");
  const existing = await getProjectById(id);
  if (!existing) return null;
  const updated: Project = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
  await db.runAsync(
    `UPDATE projects SET name=?, deadline=?, updated_at=?, calendar_event_id=? WHERE id=?`,
    updated.name, updated.deadline ?? null, updated.updatedAt,
    updated.calendarEventId ?? null, id
  );
  return updated;
}

export async function deleteProject(id: string): Promise<boolean> {
  if (!db) throw new Error("Database not initialized");
  const result = await db.runAsync("DELETE FROM projects WHERE id = ?", id);
  return result.changes > 0;
}

// KV store
export async function kvGet(key: string): Promise<string | null> {
  if (!db) throw new Error("Database not initialized");
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?", key
  );
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  await db.runAsync(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", key, value
  );
}
```

**Step 3: コミット**

```bash
git add mobile/src/services/storage.ts && git commit -m "feat(mobile): add projects table and kv store"
```

---

## Task 4: Google OAuth2 サービスを実装

**Files:**
- Create: `mobile/src/services/googleAuth.ts`

**Step 1: googleAuth.ts を作成**

```typescript
// mobile/src/services/googleAuth.ts
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { GOOGLE_CLIENT_ID, GCAL_SCOPES } from "../config";
import type { GoogleToken } from "../types";

WebBrowser.maybeCompleteAuthSession();

const SECURE_STORE_KEY = "pomodoroom_google_token";
const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  revocationEndpoint: "https://oauth2.googleapis.com/revoke",
};

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "com.pomodoroom.mobile" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: GCAL_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    DISCOVERY
  );

  return { request, response, promptAsync, redirectUri };
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<GoogleToken> {
  const res = await fetch(DISCOVERY.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();
  const token: GoogleToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };

  await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(token));
  return token;
}

export async function getStoredToken(): Promise<GoogleToken | null> {
  const raw = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as GoogleToken;
}

export async function getValidToken(): Promise<GoogleToken | null> {
  const token = await getStoredToken();
  if (!token) return null;

  // 有効期限まで5分以上あれば再利用
  if (token.expiresAt - Date.now() > 5 * 60 * 1000) return token;

  // リフレッシュ
  if (!token.refreshToken) return null;
  return refreshToken(token.refreshToken);
}

export async function refreshToken(refreshToken: string): Promise<GoogleToken | null> {
  const res = await fetch(DISCOVERY.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
    return null;
  }

  const data = await res.json();
  const newToken: GoogleToken = {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope,
  };

  await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(newToken));
  return newToken;
}

export async function revokeAuth(): Promise<void> {
  const token = await getStoredToken();
  if (token) {
    await fetch(`${DISCOVERY.revocationEndpoint}?token=${token.accessToken}`);
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getValidToken();
  return token !== null;
}
```

**Step 2: コミット**

```bash
git add mobile/src/services/googleAuth.ts && git commit -m "feat(mobile): implement Google OAuth2 service"
```

---

## Task 5: Google Calendar API サービスを実装

**Files:**
- Create: `mobile/src/services/googleCalendarService.ts`

**Step 1: googleCalendarService.ts を作成**

```typescript
// mobile/src/services/googleCalendarService.ts
import { getValidToken } from "./googleAuth";
import { CALENDAR_NAMES } from "../config";
import type { Task, Project, CalendarInfo } from "../types";

const BASE = "https://www.googleapis.com/calendar/v3";

// ─── ヘルパー ───────────────────────────────────────────

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) throw new Error("AUTH_EXPIRED");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GCal API error ${res.status}: ${body}`);
  }
  return res;
}

// ─── カレンダー管理 ─────────────────────────────────────

export async function listCalendars(): Promise<CalendarInfo[]> {
  const res = await authFetch(`${BASE}/users/me/calendarList`);
  const data = await res.json();
  return (data.items ?? []).map((c: { id: string; summary: string }) => ({
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
  return data.id;
}

// ─── タスク → Calendar イベント変換 ─────────────────────

function taskToEvent(task: Task) {
  const start = task.dueDate
    ? new Date(task.dueDate)
    : new Date();
  const end = new Date(start.getTime() + (task.estimatedMinutes ?? 25) * 60 * 1000);

  const metadata = {
    version: 1,
    task_id: task.id,
    state: task.state.toLowerCase(),
    priority: task.priority,
    estimated_minutes: task.estimatedMinutes,
    elapsed_minutes: task.elapsedMinutes,
  };

  return {
    summary: task.title,
    description: task.description
      ? `${task.description}\n\n───────── pomodoroom-metadata ─────────\n${JSON.stringify(metadata, null, 2)}`
      : `───────── pomodoroom-metadata ─────────\n${JSON.stringify(metadata, null, 2)}`,
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

function eventToTask(event: Record<string, unknown>): Partial<Task> & { calendarEventId: string } {
  const ext = (event.extendedProperties as Record<string, Record<string, string>>)?.private ?? {};
  const state = (ext.pomodoroom_state?.toUpperCase() ?? "READY") as Task["state"];

  // descriptionからmetadataをパース
  let meta: Record<string, unknown> = {};
  try {
    const desc = (event.description as string) ?? "";
    const markerIdx = desc.indexOf("pomodoroom-metadata");
    if (markerIdx !== -1) {
      const jsonStart = desc.indexOf("{", markerIdx);
      meta = JSON.parse(desc.slice(jsonStart));
    }
  } catch { /* ignore */ }

  return {
    id: ext.pomodoroom_id ?? String(event.id),
    calendarEventId: String(event.id),
    title: String(event.summary ?? ""),
    state,
    priority: Number(ext.pomodoroom_priority ?? meta.priority ?? 5),
    estimatedMinutes: Number(meta.estimated_minutes ?? 25) || undefined,
    elapsedMinutes: Number(meta.elapsed_minutes ?? 0),
    createdAt: String(event.created ?? new Date().toISOString()),
    updatedAt: String(event.updated ?? new Date().toISOString()),
  };
}

// ─── タスク CRUD ─────────────────────────────────────────

export async function createCalendarTask(
  calendarId: string,
  task: Task
): Promise<string> {
  const res = await authFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(taskToEvent(task)),
  });
  const data = await res.json();
  return data.id as string;
}

export async function updateCalendarTask(
  calendarId: string,
  eventId: string,
  task: Task
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(taskToEvent(task)) }
  );
}

export async function deleteCalendarTask(
  calendarId: string,
  eventId: string
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
}

export async function listCalendarTasks(
  calendarId: string
): Promise<Array<Partial<Task> & { calendarEventId: string }>> {
  const res = await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      privateExtendedProperty: "pomodoroom_type=task",
      showDeleted: "false",
      maxResults: "250",
    })
  );
  const data = await res.json();
  return ((data.items ?? []) as Record<string, unknown>[]).map(eventToTask);
}

// ─── プロジェクト → Calendar 終日イベント変換 ───────────

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

// ─── プロジェクト CRUD ───────────────────────────────────

export async function createCalendarProject(
  calendarId: string,
  project: Project
): Promise<string> {
  const res = await authFetch(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(projectToEvent(project)),
  });
  const data = await res.json();
  return data.id as string;
}

export async function updateCalendarProject(
  calendarId: string,
  eventId: string,
  project: Project
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(projectToEvent(project)) }
  );
}

export async function deleteCalendarProject(
  calendarId: string,
  eventId: string
): Promise<void> {
  await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
}

export async function listCalendarProjects(
  calendarId: string
): Promise<Array<{ id: string; calendarEventId: string; name: string; deadline?: string; createdAt: string }>> {
  const res = await authFetch(
    `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      privateExtendedProperty: "pomodoroom_type=project",
      showDeleted: "false",
      maxResults: "100",
    })
  );
  const data = await res.json();
  return ((data.items ?? []) as Record<string, unknown>[]).map((event) => {
    const ext = (event.extendedProperties as Record<string, Record<string, string>>)?.private ?? {};
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
```

**Step 2: コミット**

```bash
git add mobile/src/services/googleCalendarService.ts && git commit -m "feat(mobile): implement Google Calendar API service"
```

---

## Task 6: 同期サービスを実装

**Files:**
- Create: `mobile/src/services/syncService.ts`

**Step 1: syncService.ts を作成**

```typescript
// mobile/src/services/syncService.ts
import * as storage from "./storage";
import * as gcal from "./googleCalendarService";
import { getOrCreateCalendar } from "./googleCalendarService";
import { CALENDAR_NAMES } from "../config";
import type { Task, Project } from "../types";

// キャッシュ
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

// ─── タスク同期 ───────────────────────────────────────────

export async function pushTask(task: Task): Promise<Task> {
  const calId = await getTasksCalId();

  if (task.calendarEventId) {
    await gcal.updateCalendarTask(calId, task.calendarEventId, task);
    return task;
  } else {
    const eventId = await gcal.createCalendarTask(calId, task);
    const updated = await storage.updateTask(task.id, { calendarEventId: eventId });
    return updated ?? task;
  }
}

export async function pullTasks(): Promise<void> {
  const calId = await getTasksCalId();
  const remoteItems = await gcal.listCalendarTasks(calId);

  for (const remote of remoteItems) {
    if (!remote.id) continue;
    const local = await storage.getTaskById(remote.id);

    if (!local) {
      // リモートにあってローカルにない → ローカルに作成
      const now = new Date().toISOString();
      await storage.createTask({
        title: remote.title ?? "Untitled",
        state: remote.state ?? "READY",
        priority: remote.priority ?? 5,
        elapsedMinutes: remote.elapsedMinutes ?? 0,
        estimatedMinutes: remote.estimatedMinutes,
        calendarEventId: remote.calendarEventId,
      } as Omit<Task, "id" | "createdAt" | "updatedAt">);
    } else if (!local.calendarEventId) {
      // ローカルにあってcalendarEventIdが未設定
      await storage.updateTask(local.id, { calendarEventId: remote.calendarEventId });
    }
  }

  await storage.kvSet("last_sync_tasks", new Date().toISOString());
}

// ─── プロジェクト同期 ─────────────────────────────────────

export async function pushProject(project: Project): Promise<Project> {
  const calId = await getProjectsCalId();

  if (project.calendarEventId) {
    await gcal.updateCalendarProject(calId, project.calendarEventId, project);
    return project;
  } else {
    const eventId = await gcal.createCalendarProject(calId, project);
    const updated = await storage.updateProject(project.id, { calendarEventId: eventId });
    return updated ?? project;
  }
}

export async function pullProjects(): Promise<void> {
  const calId = await getProjectsCalId();
  const remoteItems = await gcal.listCalendarProjects(calId);

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

// ─── フル同期 ─────────────────────────────────────────────

export async function fullSync(): Promise<void> {
  await pullProjects();
  await pullTasks();

  // ローカルにあってcalendarEventIdがないものをpush
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
```

**Step 2: コミット**

```bash
git add mobile/src/services/syncService.ts && git commit -m "feat(mobile): implement sync service"
```

---

## Task 7: taskService.ts を更新してリモート同期を組み込む

**Files:**
- Modify: `mobile/src/services/taskService.ts`

**Step 1: createTask / updateTask / completeTask に push を追加**

既存関数の import に `pushTask` を追加し、以下のようにラップする：

```typescript
import * as syncService from "./syncService";
import { isAuthenticated } from "./googleAuth";

// createTask のラッパー
export async function createTaskWithSync(
  params: Omit<Task, "id" | "createdAt" | "updatedAt">
): Promise<Task> {
  const task = await storage.createTask(params);
  const authed = await isAuthenticated();
  if (authed) {
    try { await syncService.pushTask(task); } catch { /* オフライン時は無視 */ }
  }
  return task;
}

// completeTask のラッパー
export async function completeTaskWithSync(taskId: string): Promise<Task | null> {
  const task = await completeTask(taskId);
  if (!task) return null;
  const authed = await isAuthenticated();
  if (authed) {
    try { await syncService.pushTask(task); } catch { /* ignore */ }
  }
  return task;
}

// startTask のラッパー
export async function startTaskWithSync(taskId: string): Promise<Task | null> {
  const task = await startTask(taskId);
  if (!task) return null;
  const authed = await isAuthenticated();
  if (authed) {
    try { await syncService.pushTask(task); } catch { /* ignore */ }
  }
  return task;
}
```

**Step 2: コミット**

```bash
git add mobile/src/services/taskService.ts && git commit -m "feat(mobile): add remote sync to task operations"
```

---

## Task 8: SettingsScreen を実装（Google認証画面）

**Files:**
- Create: `mobile/src/screens/SettingsScreen.tsx`

**Step 1: SettingsScreen.tsx を作成**

```typescript
// mobile/src/screens/SettingsScreen.tsx
import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  List, Divider, Button, Text, ActivityIndicator,
  Banner, useTheme, Snackbar
} from "react-native-paper";
import * as AuthSession from "expo-auth-session";
import {
  useGoogleAuth, exchangeCodeForToken,
  revokeAuth, isAuthenticated, getStoredToken
} from "../services/googleAuth";
import { fullSync, getLastSyncAt } from "../services/syncService";
import { GOOGLE_CLIENT_ID } from "../config";

export default function SettingsScreen() {
  const theme = useTheme();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [snackMsg, setSnackMsg] = useState("");

  const { request, response, promptAsync } = useGoogleAuth();

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setAuthed(await isAuthenticated());
    setLastSync(await getLastSyncAt());
    setLoading(false);
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // OAuth コールバック処理
  useEffect(() => {
    if (response?.type !== "success") return;
    const { code } = response.params;
    const redirectUri = AuthSession.makeRedirectUri({ scheme: "com.pomodoroom.mobile" });

    (async () => {
      try {
        setLoading(true);
        await exchangeCodeForToken(code, redirectUri, request!.codeVerifier!);
        await checkAuth();
        setSnackMsg("Google アカウントに接続しました");
      } catch (e) {
        setSnackMsg(`認証エラー: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [response, request, checkAuth]);

  const handleConnect = () => {
    if (!GOOGLE_CLIENT_ID) {
      setSnackMsg("EXPO_PUBLIC_GOOGLE_CLIENT_ID が設定されていません");
      return;
    }
    promptAsync();
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await revokeAuth();
    await checkAuth();
    setSnackMsg("Google アカウントを切断しました");
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fullSync();
      setLastSync(await getLastSyncAt());
      setSnackMsg("同期が完了しました");
    } catch (e) {
      setSnackMsg(`同期エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {!GOOGLE_CLIENT_ID && (
        <Banner
          visible
          icon="alert"
          actions={[]}
        >
          EXPO_PUBLIC_GOOGLE_CLIENT_ID が未設定です。.env ファイルに設定してください。
        </Banner>
      )}

      <List.Section title="Google Calendar 連携">
        <List.Item
          title="接続状態"
          description={authed ? "接続済み ✓" : "未接続"}
          left={(props) => (
            <List.Icon
              {...props}
              icon={authed ? "check-circle" : "circle-outline"}
              color={authed ? theme.colors.primary : "gray"}
            />
          )}
        />
        <Divider />
        {authed ? (
          <>
            <View style={styles.buttonRow}>
              <Button
                mode="contained"
                onPress={handleSync}
                loading={syncing}
                disabled={syncing}
                icon="sync"
                style={styles.button}
              >
                今すぐ同期
              </Button>
              <Button
                mode="outlined"
                onPress={handleDisconnect}
                icon="logout"
                style={styles.button}
                textColor={theme.colors.error}
              >
                切断
              </Button>
            </View>
            {lastSync && (
              <Text variant="bodySmall" style={styles.lastSync}>
                最終同期: {new Date(lastSync).toLocaleString("ja-JP")}
              </Text>
            )}
          </>
        ) : (
          <View style={styles.buttonRow}>
            <Button
              mode="contained"
              onPress={handleConnect}
              icon="google"
              style={styles.button}
            >
              Google でログイン
            </Button>
          </View>
        )}
      </List.Section>

      <List.Section title="について">
        <List.Item title="バージョン" description="0.1.0" />
        <List.Item
          title="データ保存先"
          description={authed ? "Google Calendar (リモート) + ローカルキャッシュ" : "ローカルのみ"}
        />
      </List.Section>

      <Snackbar
        visible={!!snackMsg}
        onDismiss={() => setSnackMsg("")}
        duration={3000}
      >
        {snackMsg}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  buttonRow: { flexDirection: "row", gap: 8, padding: 16, flexWrap: "wrap" },
  button: { flex: 1, minWidth: 120 },
  lastSync: { paddingHorizontal: 16, paddingBottom: 8, opacity: 0.6 },
});
```

**Step 2: コミット**

```bash
git add mobile/src/screens/SettingsScreen.tsx && git commit -m "feat(mobile): add SettingsScreen with Google auth"
```

---

## Task 9: ProjectsScreen を実装

**Files:**
- Create: `mobile/src/screens/ProjectsScreen.tsx`
- Create: `mobile/src/hooks/useProjects.ts`

**Step 1: useProjects.ts を作成**

```typescript
// mobile/src/hooks/useProjects.ts
import { useState, useEffect, useCallback } from "react";
import type { Project } from "../types";
import * as storage from "../services/storage";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await storage.getAllProjects();
    setProjects(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { projects, loading, refresh };
}
```

**Step 2: ProjectsScreen.tsx を作成**

```typescript
// mobile/src/screens/ProjectsScreen.tsx
import { useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import {
  List, FAB, Portal, Dialog, TextInput, Button,
  IconButton, Text, useTheme, Snackbar
} from "react-native-paper";
import { useProjects } from "../hooks/useProjects";
import * as storage from "../services/storage";
import { pushProject } from "../services/syncService";
import { isAuthenticated } from "../services/googleAuth";
import type { Project } from "../types";

export default function ProjectsScreen() {
  const theme = useTheme();
  const { projects, loading, refresh } = useProjects();
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [snackMsg, setSnackMsg] = useState("");

  const openAdd = () => { setEditProject(null); setName(""); setDeadline(""); setDialogVisible(true); };
  const openEdit = (p: Project) => { setEditProject(p); setName(p.name); setDeadline(p.deadline ?? ""); setDialogVisible(true); };

  const handleSave = async () => {
    if (!name.trim()) return;
    const authed = await isAuthenticated();

    try {
      if (editProject) {
        const updated = await storage.updateProject(editProject.id, {
          name: name.trim(),
          deadline: deadline.trim() || undefined,
        });
        if (updated && authed) await pushProject(updated);
      } else {
        const created = await storage.createProject({
          name: name.trim(),
          deadline: deadline.trim() || undefined,
        });
        if (authed) await pushProject(created);
      }
      setDialogVisible(false);
      refresh();
      setSnackMsg(editProject ? "更新しました" : "作成しました");
    } catch (e) {
      setSnackMsg(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDelete = async (project: Project) => {
    await storage.deleteProject(project.id);
    refresh();
    setSnackMsg("削除しました");
  };

  const renderProject = ({ item }: { item: Project }) => (
    <List.Item
      title={item.name}
      description={item.deadline ? `期限: ${new Date(item.deadline).toLocaleDateString("ja-JP")}` : "期限なし"}
      left={(props) => <List.Icon {...props} icon="folder" color={theme.colors.primary} />}
      right={(props) => (
        <View style={styles.actions}>
          <IconButton {...props} icon="pencil" onPress={() => openEdit(item)} />
          <IconButton {...props} icon="delete" onPress={() => handleDelete(item)} />
        </View>
      )}
    />
  );

  return (
    <View style={styles.container}>
      {projects.length === 0 && !loading && (
        <View style={styles.empty}>
          <Text variant="titleMedium">プロジェクトがありません</Text>
          <Text variant="bodyMedium" style={styles.emptyHint}>
            ＋ ボタンでプロジェクトを追加してください
          </Text>
        </View>
      )}
      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={styles.list}
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>{editProject ? "プロジェクトを編集" : "新しいプロジェクト"}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="プロジェクト名"
              value={name}
              onChangeText={setName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="期限 (YYYY-MM-DD、任意)"
              value={deadline}
              onChangeText={setDeadline}
              mode="outlined"
              placeholder="2026-12-31"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>キャンセル</Button>
            <Button onPress={handleSave} mode="contained">保存</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={openAdd}
      />
      <Snackbar visible={!!snackMsg} onDismiss={() => setSnackMsg("")} duration={2500}>
        {snackMsg}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  actions: { flexDirection: "row", alignItems: "center" },
  fab: { position: "absolute", margin: 16, right: 0, bottom: 0 },
  input: { marginBottom: 12 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyHint: { marginTop: 8, opacity: 0.6, textAlign: "center" },
});
```

**Step 3: コミット**

```bash
git add mobile/src/screens/ProjectsScreen.tsx mobile/src/hooks/useProjects.ts && git commit -m "feat(mobile): add ProjectsScreen and useProjects hook"
```

---

## Task 10: TaskListScreen を更新（sync + project filter）

**Files:**
- Modify: `mobile/src/screens/TaskListScreen.tsx`

**Step 1: TaskListScreen に同期ボタン・プロジェクトフィルタを追加**

`handleAddTask` を `createTaskWithSync` に置き換え、ヘッダー右にsyncアイコンを追加する。主な変更点：

```typescript
// 追加import
import { createTaskWithSync, startTaskWithSync, completeTaskWithSync } from "../services/taskService";
import { fullSync } from "../services/syncService";
import { isAuthenticated } from "../services/googleAuth";
import { useNavigation } from "@react-navigation/native";
import { Snackbar } from "react-native-paper";

// handleAddTask を createTaskWithSync に変更
const handleAddTask = async () => {
  if (!newTaskTitle.trim()) return;
  await createTaskWithSync({
    title: newTaskTitle.trim(),
    state: "READY",
    priority: parseInt(newTaskPriority, 10),
    elapsedMinutes: 0,
    projectId: selectedProjectId || undefined,
  });
  setNewTaskTitle(""); setNewTaskPriority("5"); setDialogVisible(false);
  refresh();
};

// 完了ボタンを追加
const handleCompleteTask = async (taskId: string) => {
  await completeTaskWithSync(taskId);
  refresh();
};
```

**Step 2: コミット**

```bash
git add mobile/src/screens/TaskListScreen.tsx && git commit -m "feat(mobile): update TaskListScreen with sync and complete"
```

---

## Task 11: App.tsx を更新（新画面を追加・起動時同期）

**Files:**
- Modify: `mobile/App.tsx`

**Step 1: Settings タブと Projects タブを追加、起動時に sync を実行**

```typescript
import SettingsScreen from "./src/screens/SettingsScreen";
import ProjectsScreen from "./src/screens/ProjectsScreen";
import { isAuthenticated } from "./src/services/googleAuth";
import { fullSync } from "./src/services/syncService";

// useEffect の init() に追加
const init = async () => {
  await storage.initDatabase();
  setReady(true);
  // 認証済みなら起動時に同期
  const authed = await isAuthenticated();
  if (authed) {
    fullSync().catch(() => {}); // バックグラウンドで実行、エラーは無視
  }
};

// Tab.Navigator に追加
<Tab.Screen
  name="Projects"
  component={ProjectsScreen}
  options={{
    title: "プロジェクト",
    tabBarLabel: "プロジェクト",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="folder" color={color} size={size} />
    ),
  }}
/>
<Tab.Screen
  name="Settings"
  component={SettingsScreen}
  options={{
    title: "設定",
    tabBarLabel: "設定",
    tabBarIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="cog" color={color} size={size} />
    ),
  }}
/>
```

**Step 2: コミット**

```bash
git add mobile/App.tsx && git commit -m "feat(mobile): add Projects and Settings tabs, startup sync"
```

---

## Task 12: GitHub Actions の secrets を設定してビルド

**Step 1: Google Cloud Console でクライアントIDを取得**

1. [console.cloud.google.com](https://console.cloud.google.com) → 認証情報 → OAuth 2.0 クライアントID 作成
2. タイプ: **ウェブアプリケーション**
3. 承認済みリダイレクト URI: `com.pomodoroom.mobile:/oauth2redirect`
4. クライアントIDをコピー

**Step 2: GitHub Secrets に追加**

リポジトリ Settings → Secrets and variables → Actions：

| Secret名 | 値 |
|---|---|
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | `xxxxx.apps.googleusercontent.com` |

**Step 3: android-release.yml に環境変数を渡す**

```yaml
# "Prebuild Android native project" ステップの env に追加
- name: Prebuild Android native project
  env:
    EXPO_PUBLIC_GOOGLE_CLIENT_ID: ${{ secrets.EXPO_PUBLIC_GOOGLE_CLIENT_ID }}
  run: |
    cd mobile
    npx expo prebuild --platform android --no-install
```

**Step 4: 最終コミットとプッシュ**

```bash
git add .github/workflows/android-release.yml
git commit -m "feat(mobile): pass GOOGLE_CLIENT_ID to Android build"
git push
```

---

## 完成後の動作フロー

```
1. アプリ起動
   └─ initDatabase() → 起動時 fullSync()（認証済みの場合）

2. 設定タブ → Google でログイン
   └─ PKCE OAuth2 フロー → トークン保存 → 初回 fullSync()

3. タスク追加
   └─ createTaskWithSync() → SQLite + Google Calendar event 作成

4. タスク開始 / 完了
   └─ startTaskWithSync() / completeTaskWithSync() → 状態更新 + Calendar 更新

5. プロジェクト作成
   └─ storage.createProject() + pushProject() → Calendar 終日イベント作成

6. 手動同期（設定タブ）
   └─ fullSync() → pull（リモート→ローカル）+ push（未同期→リモート）
```
