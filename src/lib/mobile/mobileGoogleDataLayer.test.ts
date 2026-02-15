import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearSyncQueue,
  enqueueSyncOperation,
  flushSyncQueue,
  getSyncQueue,
  isOAuthCallbackUrl,
  isTokenValid,
  beginGoogleOAuth,
  loadGoogleTokens,
  saveGoogleTokens,
  type GoogleTokens,
} from "./mobileGoogleDataLayer";

describe("mobileGoogleDataLayer", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("enqueues operations in FIFO order", () => {
    enqueueSyncOperation({ type: "calendar.create", payload: { summary: "A" } });
    enqueueSyncOperation({ type: "tasks.complete", payload: { taskId: "t1" } });

    const queue = getSyncQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe("calendar.create");
    expect(queue[1].type).toBe("tasks.complete");
  });

  it("flushes successful operations and keeps failures", async () => {
    enqueueSyncOperation({ type: "calendar.create", payload: { summary: "A" } });
    enqueueSyncOperation({ type: "tasks.complete", payload: { taskId: "t1" } });

    const handled: string[] = [];
    await flushSyncQueue(async (op) => {
      handled.push(op.type);
      if (op.type === "tasks.complete") {
        throw new Error("network");
      }
    });

    expect(handled).toEqual(["calendar.create", "tasks.complete"]);
    const queue = getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe("tasks.complete");
  });

  it("persists and validates token expiration", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const tokens: GoogleTokens = {
      accessToken: "abc",
      expiresAt: future,
      refreshToken: "refresh",
    };

    saveGoogleTokens(tokens);
    const loaded = loadGoogleTokens();

    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe("abc");
    expect(isTokenValid(loaded)).toBe(true);

    saveGoogleTokens({ accessToken: "expired", expiresAt: 1 });
    expect(isTokenValid(loadGoogleTokens())).toBe(false);
  });

  it("builds oauth url and marks callback URLs", async () => {
    const result = await beginGoogleOAuth({
      clientId: "client-1",
      redirectUri: "http://localhost:5173",
      scopes: ["scope:a", "scope:b"],
    });

    expect(result.authUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(result.authUrl).toContain("client_id=client-1");
    expect(result.authUrl).toContain("code_challenge=");
    expect(result.state.length).toBeGreaterThan(10);

    const cb = `http://localhost:5173?code=abc&state=${encodeURIComponent(result.state)}`;
    expect(isOAuthCallbackUrl(cb)).toBe(true);
    expect(isOAuthCallbackUrl("http://localhost:5173")).toBe(false);
  });

  it("can clear queue", () => {
    enqueueSyncOperation({ type: "calendar.delete", payload: { eventId: "e1" } });
    expect(getSyncQueue()).toHaveLength(1);
    clearSyncQueue();
    expect(getSyncQueue()).toHaveLength(0);
  });
});
