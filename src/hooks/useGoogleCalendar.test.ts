import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { isTokenValid, useGoogleCalendar } from "./useGoogleCalendar";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

describe("useGoogleCalendar", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockInvoke.mockImplementation((command: string) => {
			if (command === "cmd_google_calendar_get_selected_calendars") {
				return Promise.resolve({ calendar_ids: ["primary"] });
			}
			if (command === "cmd_google_calendar_list_events") {
				return Promise.resolve([]);
			}
			return Promise.resolve(null);
		});
	});

	it("sets connected state when stored token is valid", async () => {
		const validTokens = JSON.stringify({
			access_token: "token",
			expires_at: Math.floor(Date.now() / 1000) + 3600,
		});
		mockInvoke.mockResolvedValueOnce(validTokens);

		const { result } = renderHook(() => useGoogleCalendar());

		await waitFor(() => {
			expect(result.current.state.isConnected).toBe(true);
		});

		expect(mockInvoke).toHaveBeenCalledWith("cmd_load_oauth_tokens", {
			serviceName: "google_calendar",
		});
	});

	it("fetches and normalizes events from selected calendars", async () => {
		const validTokens = JSON.stringify({
			access_token: "token",
			expires_at: Math.floor(Date.now() / 1000) + 3600,
		});
		mockInvoke.mockImplementation((command: string) => {
			if (command === "cmd_load_oauth_tokens") return Promise.resolve(validTokens);
			if (command === "cmd_google_calendar_get_selected_calendars") {
				return Promise.resolve({ calendar_ids: ["primary"] });
			}
			if (command === "cmd_google_calendar_list_events") {
				return Promise.resolve([
					{
						id: "evt-1",
						title: "Focus Session",
						start_time: "2025-02-12T10:00:00Z",
						end_time: "2025-02-12T10:25:00Z",
					},
					{
						id: "evt-2",
						summary: "All day",
						start: { date: "2025-02-13" },
						end: { date: "2025-02-14" },
					},
				]);
			}
			return Promise.reject(new Error(`unexpected command: ${command}`));
		});

		const { result } = renderHook(() => useGoogleCalendar());

		await waitFor(() => {
			expect(result.current.state.isConnected).toBe(true);
		});

		await act(async () => {
			await result.current.fetchEvents();
		});

		expect(result.current.events).toHaveLength(2);
		expect(result.current.events[0]).toMatchObject({
			id: "evt-1",
			summary: "Focus Session",
			start: { dateTime: "2025-02-12T10:00:00Z" },
		});
		expect(result.current.events[1]).toMatchObject({
			id: "evt-2",
			start: { date: "2025-02-13" },
		});
	});
});

describe("isTokenValid", () => {
	it("returns true only when token is outside expiry buffer", () => {
		const valid = isTokenValid({
			access_token: "token",
			expires_at: Math.floor(Date.now() / 1000) + 3600,
		});
		const expired = isTokenValid({
			access_token: "token",
			expires_at: Math.floor(Date.now() / 1000) - 10,
		});

		expect(valid).toBe(true);
		expect(expired).toBe(false);
	});
});
