export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // unix seconds
  scope?: string;
  tokenType?: string;
};

export type SyncOperation = {
  id: string;
  createdAt: string;
  type: "calendar.create" | "calendar.delete" | "tasks.create" | "tasks.complete";
  payload: Record<string, unknown>;
};

type PendingOAuthFlow = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com";
const TOKENS_KEY = "mobile_google_tokens";
const SYNC_QUEUE_KEY = "mobile_google_sync_queue";
const OAUTH_PENDING_KEY = "mobile_google_oauth_pending";
const CALENDAR_SELECTION_KEY = "mobile_google_selected_calendars";
const TASKLIST_SELECTION_KEY = "mobile_google_selected_tasklists";
const TOKEN_EXPIRY_BUFFER_SEC = 5 * 60;

function readJson<T>(_key: string, fallback: T): T {
  // Database-only architecture - mobile mode no longer supported
  return fallback;
}

function writeJson<T>(_key: string, _value: T): void {
  // No-op - database-only architecture
}

function base64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes).slice(0, length);
}

async function sha256Base64Url(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64Url(new Uint8Array(digest));
}

export function loadGoogleTokens(): GoogleTokens | null {
  return readJson<GoogleTokens | null>(TOKENS_KEY, null);
}

export function saveGoogleTokens(tokens: GoogleTokens): void {
  writeJson(TOKENS_KEY, tokens);
}

export function clearGoogleTokens(): void {
  // No-op - database-only architecture
}

export function getMobileGoogleClientId(): string {
  const env = import.meta.env as { VITE_GOOGLE_CLIENT_ID?: string };
  return env.VITE_GOOGLE_CLIENT_ID ?? "";
}

export function isMobileBackendlessMode(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  const isTauri = w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined;
  return !isTauri && getMobileGoogleClientId().length > 0;
}

export function isTokenValid(tokens: GoogleTokens | null | undefined): boolean {
  if (!tokens?.accessToken) return false;
  if (!tokens.expiresAt) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return tokens.expiresAt > nowSec + TOKEN_EXPIRY_BUFFER_SEC;
}

export function getSyncQueue(): SyncOperation[] {
  return readJson<SyncOperation[]>(SYNC_QUEUE_KEY, []);
}

export function enqueueSyncOperation(input: {
  type: SyncOperation["type"];
  payload: Record<string, unknown>;
}): SyncOperation {
  const next: SyncOperation = {
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    type: input.type,
    payload: input.payload,
  };

  const queue = getSyncQueue();
  queue.push(next);
  writeJson(SYNC_QUEUE_KEY, queue);
  return next;
}

export function clearSyncQueue(): void {
  // No-op - database-only architecture
}

export async function flushSyncQueue(
  handler: (op: SyncOperation) => Promise<void>,
): Promise<{ processed: number; failed: number }> {
  const queue = getSyncQueue();
  const failed: SyncOperation[] = [];
  let processed = 0;

  for (const op of queue) {
    try {
      await handler(op);
      processed += 1;
    } catch {
      failed.push(op);
    }
  }

  writeJson(SYNC_QUEUE_KEY, failed);
  return {
    processed,
    failed: failed.length,
  };
}

export async function beginGoogleOAuth(input: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}): Promise<{ authUrl: string; state: string }> {
  const state = randomString(24);
  const codeVerifier = randomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const pending: PendingOAuthFlow = {
    state,
    codeVerifier,
    redirectUri: input.redirectUri,
  };
  writeJson(OAUTH_PENDING_KEY, pending);

  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state,
  };
}

export function isOAuthCallbackUrl(url: string): boolean {
  const parsed = new URL(url);
  return parsed.searchParams.has("code") && parsed.searchParams.has("state");
}

export async function completeGoogleOAuth(input: {
  clientId: string;
  code: string;
  state: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const pending = readJson<PendingOAuthFlow | null>(OAUTH_PENDING_KEY, null);
  if (!pending) throw new Error("No pending OAuth flow");
  if (pending.state !== input.state) throw new Error("OAuth state mismatch");

  const body = new URLSearchParams({
    client_id: input.clientId,
    code: input.code,
    code_verifier: pending.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const tokens: GoogleTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: nowSec + data.expires_in,
    scope: data.scope,
    tokenType: data.token_type,
  };

  saveGoogleTokens(tokens);
  // localStorage cleared - database-only architecture
  return tokens;
}

export async function refreshGoogleAccessToken(clientId: string): Promise<GoogleTokens | null> {
  const tokens = loadGoogleTokens();
  if (!tokens?.refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    return null;
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const nextTokens: GoogleTokens = {
    accessToken: data.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: nowSec + data.expires_in,
    scope: data.scope ?? tokens.scope,
    tokenType: data.token_type ?? tokens.tokenType,
  };

  saveGoogleTokens(nextTokens);
  return nextTokens;
}

async function getValidTokens(clientId: string): Promise<GoogleTokens> {
  const stored = loadGoogleTokens();
  if (isTokenValid(stored)) return stored as GoogleTokens;
  const refreshed = await refreshGoogleAccessToken(clientId);
  if (!refreshed) {
    throw new Error("Google authentication required");
  }
  return refreshed;
}

async function googleApiRequest<T>(
  clientId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const tokens = await getValidTokens(clientId);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  if (!headers.has("Content-Type") && init.body && typeof init.body !== "string") {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    const refreshed = await refreshGoogleAccessToken(clientId);
    if (!refreshed) throw new Error("Google token refresh failed");
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${refreshed.accessToken}`);
    if (!retryHeaders.has("Content-Type") && init.body && typeof init.body !== "string") {
      retryHeaders.set("Content-Type", "application/json");
    }
    const retry = await fetch(`${GOOGLE_API_BASE}${path}`, {
      ...init,
      headers: retryHeaders,
    });
    if (!retry.ok) {
      throw new Error(await retry.text());
    }
    if (retry.status === 204) return undefined as T;
    return (await retry.json()) as T;
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getSelectedCalendarIds(): string[] {
  const ids = readJson<string[]>(CALENDAR_SELECTION_KEY, []);
  return ids.length > 0 ? ids : ["primary"];
}

export function setSelectedCalendarIds(ids: string[]): void {
  const normalized = ids.length > 0 ? ids : ["primary"];
  writeJson(CALENDAR_SELECTION_KEY, normalized);
}

export function getSelectedTasklistIds(): string[] {
  return readJson<string[]>(TASKLIST_SELECTION_KEY, []);
}

export function setSelectedTasklistIds(ids: string[]): void {
  writeJson(TASKLIST_SELECTION_KEY, ids);
}

export async function mobileCalendarListCalendars(clientId: string): Promise<{ items?: unknown[] }> {
  return googleApiRequest<{ items?: unknown[] }>(clientId, "/calendar/v3/users/me/calendarList");
}

export async function mobileCalendarListEvents(
  clientId: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ items?: unknown[] }> {
  const path =
    `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}`;
  return googleApiRequest<{ items?: unknown[] }>(clientId, path);
}

export async function mobileCalendarCreateEvent(
  clientId: string,
  calendarId: string,
  event: {
    summary: string;
    description?: string | null;
    start: { dateTime: string };
    end: { dateTime: string };
  },
): Promise<unknown> {
  const path = `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return googleApiRequest<unknown>(clientId, path, {
    method: "POST",
    body: JSON.stringify(event),
    headers: { "Content-Type": "application/json" },
  });
}

export async function mobileCalendarDeleteEvent(
  clientId: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const path = `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  await googleApiRequest<void>(clientId, path, { method: "DELETE" });
}

export async function mobileTasksListTasklists(clientId: string): Promise<{ items?: unknown[] }> {
  return googleApiRequest<{ items?: unknown[] }>(clientId, "/tasks/v1/users/@me/lists");
}

export async function mobileTasksListTasks(
  clientId: string,
  tasklistId: string,
): Promise<{ items?: unknown[] }> {
  const path = `/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks?showCompleted=false&showHidden=false`;
  return googleApiRequest<{ items?: unknown[] }>(clientId, path);
}

export async function mobileTasksCreateTask(
  clientId: string,
  tasklistId: string,
  payload: { title: string; notes?: string | null },
): Promise<unknown> {
  const path = `/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks`;
  return googleApiRequest<unknown>(clientId, path, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
}

export async function mobileTasksCompleteTask(
  clientId: string,
  tasklistId: string,
  task: { id: string; title: string; notes?: string; updated?: string },
): Promise<unknown> {
  const path = `/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(task.id)}`;
  return googleApiRequest<unknown>(clientId, path, {
    method: "PATCH",
    body: JSON.stringify({
      id: task.id,
      title: task.title,
      notes: task.notes,
      status: "completed",
      completed: new Date().toISOString(),
      updated: task.updated,
    }),
    headers: { "Content-Type": "application/json" },
  });
}
