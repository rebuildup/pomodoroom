import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { INTEGRATION_SERVICES } from "@/types";
import { useIntegrations } from "./useIntegrations";

const mockIsTauriEnvironment = vi.fn(() => false);
const mockInvoke = vi.fn();

vi.mock("@/lib/tauriEnv", () => ({
	isTauriEnvironment: () => mockIsTauriEnvironment(),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("integration service id normalization", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    mockInvoke.mockReset();
    mockIsTauriEnvironment.mockReset();
    mockIsTauriEnvironment.mockReturnValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("uses google_calendar service id in integration services", () => {
    const ids = INTEGRATION_SERVICES.map((s) => s.id);
    expect(ids).toContain("google_calendar");
    expect(ids).not.toContain("google");
  });

  // Legacy migration test removed - database-only architecture

  it("loads connection state from tauri integration bridge", async () => {
    mockIsTauriEnvironment.mockReturnValue(true);
    mockInvoke.mockImplementation((command: string) => {
      if (command === "cmd_integration_list") {
        return Promise.resolve([
          {
            service: "google_calendar",
            connected: true,
            last_sync: "2026-02-15T03:00:00.000Z",
          },
          {
            service: "notion",
            connected: false,
            last_sync: null,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useIntegrations());

    await waitFor(() => {
      const google = result.current.getServiceConfig("google_calendar");
      expect(google.connected).toBe(true);
      expect(google.lastSyncAt).toBe("2026-02-15T03:00:00.000Z");
    });

    expect(mockInvoke).toHaveBeenCalledWith("cmd_integration_list");
  });

  it("uses tauri commands for disconnect and sync", async () => {
    mockIsTauriEnvironment.mockReturnValue(true);
    mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "cmd_integration_list") {
        return Promise.resolve([
          {
            service: "notion",
            connected: true,
            last_sync: "2026-02-15T03:00:00.000Z",
          },
        ]);
      }
      if (command === "cmd_integration_disconnect") {
        expect(args).toEqual({ serviceName: "notion" });
        return Promise.resolve(null);
      }
      if (command === "cmd_integration_get_status") {
        if (args?.serviceName === "notion") {
          return Promise.resolve({
            service: "notion",
            connected: false,
            last_sync: null,
          });
        }
      }
      if (command === "cmd_integration_sync") {
        expect(args).toEqual({ serviceName: "notion" });
        return Promise.resolve({
          service: "notion",
          synced_at: "2026-02-15T04:00:00.000Z",
          status: "success",
        });
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useIntegrations());

    await waitFor(() => {
      expect(result.current.getServiceConfig("notion").connected).toBe(true);
    });

    result.current.disconnectService("notion");

    await waitFor(() => {
      expect(result.current.getServiceConfig("notion").connected).toBe(false);
    });

    result.current.syncService("notion");

    await waitFor(() => {
      expect(result.current.getServiceConfig("notion").lastSyncAt).toBe("2026-02-15T04:00:00.000Z");
    });
  });

  it("connects non-google services through tauri token bridge", async () => {
    mockIsTauriEnvironment.mockReturnValue(true);
    mockInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "cmd_integration_list") {
        return Promise.resolve([]);
      }
      if (command === "cmd_store_oauth_tokens") {
        expect(args?.serviceName).toBe("notion");
        const payload = JSON.parse(String(args?.tokensJson)) as { access_token?: string };
        expect(payload.access_token).toBe("token-123");
        return Promise.resolve(null);
      }
      if (command === "cmd_integration_get_status") {
        return Promise.resolve({
          service: "notion",
          connected: true,
          last_sync: null,
        });
      }
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useIntegrations());

    act(() => {
      result.current.connectService("notion", {
        id: "token-123",
        name: "Notion Workspace",
      });
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("cmd_store_oauth_tokens", {
        serviceName: "notion",
        tokensJson: expect.any(String),
      });
    });

    await waitFor(() => {
      const notion = result.current.getServiceConfig("notion");
      expect(notion.connected).toBe(true);
      expect(notion.accountName).toBe("Notion Workspace");
    });
  });
});
