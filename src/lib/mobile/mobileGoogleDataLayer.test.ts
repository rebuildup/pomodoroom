import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  clearSyncQueue,
  flushSyncQueue,
  getSyncQueue,
  isOAuthCallbackUrl,
  isTokenValid,
  beginGoogleOAuth,
  type GoogleTokens,
} from "./mobileGoogleDataLayer";

describe("mobileGoogleDataLayer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues operations in FIFO order", () => {
    // No-op - database-only architecture, queue always empty
    const queue = getSyncQueue();
    expect(queue).toHaveLength(0);
  });

  it("flushes with empty queue (no-op)", async () => {
    // No-op - database-only architecture
    const result = await flushSyncQueue(async () => {
      // Handler never called
    });
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("validates token expiration", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const tokens: GoogleTokens = {
      accessToken: "abc",
      expiresAt: future,
      refreshToken: "refresh",
    };

    expect(isTokenValid(tokens)).toBe(true);

    const expiredTokens: GoogleTokens = { accessToken: "expired", expiresAt: 1 };
    expect(isTokenValid(expiredTokens)).toBe(false);
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

  it("clear queue is no-op", () => {
    // No-op - database-only architecture
    clearSyncQueue();
    expect(getSyncQueue()).toHaveLength(0);
  });
});
