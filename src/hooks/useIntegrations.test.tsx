import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { INTEGRATION_SERVICES } from "@/types";
import { useIntegrations } from "./useIntegrations";

describe("integration service id normalization", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("uses google_calendar service id in integration services", () => {
    const ids = INTEGRATION_SERVICES.map((s) => s.id);
    expect(ids).toContain("google_calendar");
    expect(ids).not.toContain("google");
  });

  it("migrates legacy google config to google_calendar", async () => {
    localStorage.setItem(
      "pomodoroom-integrations",
      JSON.stringify({
        google: {
          service: "google",
          connected: true,
          accountId: "acct-1",
          accountName: "Legacy Google",
          lastSyncAt: "2026-02-15T00:00:00.000Z",
        },
      }),
    );

    const { result } = renderHook(() => useIntegrations());

    await waitFor(() => {
      const cfg = result.current.getServiceConfig("google_calendar");
      expect(cfg.connected).toBe(true);
      expect(cfg.accountName).toBe("Legacy Google");
    });

    const raw = localStorage.getItem("pomodoroom-integrations");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as Record<string, unknown>;
    expect(parsed.google).toBeUndefined();
    expect(parsed.google_calendar).toBeTruthy();
  });
});
