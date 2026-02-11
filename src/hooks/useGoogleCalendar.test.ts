/**
 * Tests for useGoogleCalendar — OAuth flow + API mock responses.
 *
 * Tests cover:
 * - OAuth authentication flow (getAuthUrl, exchangeCode, connectInteractive)
 * - Token validation and connection status
 * - Event fetching, creation, and deletion
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useGoogleCalendar, isTokenValid } from "./useGoogleCalendar";
import type { GoogleCalendarEvent } from "./useGoogleCalendar";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

// ─── Test Data ───────────────────────────────────────────────────────────────────

const mockAuthUrlResponse = {
	auth_url: "https://accounts.google.com/o/oauth2/v2/auth?test",
	state: "test-state-123",
	redirect_port: 42069,
};

const mockTokenResponse = {
	access_token: "test_access_token",
	expires_in: 3600,
	token_type: "Bearer",
	authenticated: true,
};

const mockEvents: GoogleCalendarEvent[] = [
	{
		id: "evt-1",
		summary: "Pomodoroom: Focus session",
		description: "Focus time",
		start: { dateTime: "2025-02-12T10:00:00Z" },
		end: { dateTime: "2025-02-12T10:25:00Z" },
		status: "confirmed",
		created: "2025-02-12T09:00:00Z",
		updated: "2025-02-12T09:00:00Z",
	},
	{
		id: "evt-2",
		summary: "Team standup",
		description: "Daily sync",
		start: { dateTime: "2025-02-12T11:00:00Z" },
		end: { dateTime: "2025-02-12T11:30:00Z" },
		status: "confirmed",
		colorId: "5",
	},
	{
		id: "evt-3",
		summary: "All day event",
		start: { date: "2025-02-13" },
		end: { date: "2025-02-14" },
		status: "confirmed",
	},
];

const mockTokens = JSON.stringify({
	access_token: "stored_token",
	refresh_token: "stored_refresh_token",
	expires_at: Math.floor(Date.now() / 1000) + 3600,
});

const expiredTokens = JSON.stringify({
	access_token: "expired_token",
	refresh_token: "refresh_token",
	expires_at: Math.floor(Date.now() / 1000) - 100, // expired 100s ago
});

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function createMockInvoke() {
	const mock = invoke as ReturnType<typeof vi.fn>;
	mock.mockReset();
	return mock;
}

describe("useGoogleCalendar", () => {
	let mockInvoke: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockInvoke = createMockInvoke();
	});

	// ─── Connection Status Tests ────────────────────────────────────────────

	describe("checkConnectionStatus", () => {
		it("detects connected state with valid tokens", async () => {
			mockInvoke.mockResolvedValue(mockTokens);

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.syncEnabled).toBe(true);
			});

			expect(mockInvoke).toHaveBeenCalledWith("cmd_load_oauth_tokens", {
				serviceName: "google_calendar",
			});
		});

		it("detects disconnected state with no tokens", async () => {
			mockInvoke.mockRejectedValue(new Error("No tokens found"));

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.syncEnabled).toBe(false);
			});
		});

		it("detects disconnected state with expired tokens", async () => {
			mockInvoke.mockResolvedValue(expiredTokens);

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
				expect(result.current.state.syncEnabled).toBe(false);
			});
		});

		it("handles malformed token JSON", async () => {
			mockInvoke.mockResolvedValue("invalid-json{");

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.syncEnabled).toBe(false);
			});
		});
	});

	// ─── OAuth Flow Tests ────────────────────────────────────────────────────

	describe("getAuthUrl", () => {
		it("returns auth URL with CSRF state", async () => {
			mockInvoke.mockResolvedValue(mockAuthUrlResponse);

			const { result } = renderHook(() => useGoogleCalendar());

			let authUrl: Awaited<ReturnType<typeof result.current.getAuthUrl>>;
			await act(async () => {
				authUrl = await result.current.getAuthUrl();
			});

			expect(authUrl).toEqual(mockAuthUrlResponse);
			expect(mockInvoke).toHaveBeenCalledWith("cmd_google_auth_get_auth_url");
		});

		it("throws error on failed auth URL fetch", async () => {
			mockInvoke.mockRejectedValue(new Error("Network error"));

			const { result } = renderHook(() => useGoogleCalendar());

			await expect(async () => {
				await act(async () => {
					await result.current.getAuthUrl();
				});
			}).rejects.toThrow("Failed to get auth URL: Network error");
		});
	});

	describe("exchangeCode", () => {
		it("exchanges auth code for tokens successfully", async () => {
			mockInvoke.mockResolvedValue(mockTokenResponse);

			// First call getAuthUrl to set pending state
			mockInvoke.mockResolvedValueOnce(mockAuthUrlResponse);
			const { result } = renderHook(() => useGoogleCalendar());

			await act(async () => {
				await result.current.getAuthUrl();
			});

			// Clear mock to track exchange call
			mockInvoke.mockClear();
			mockInvoke.mockResolvedValue(mockTokenResponse);

			await act(async () => {
				await result.current.exchangeCode("auth-code-123", "test-state-123");
			});

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.syncEnabled).toBe(true);
				expect(result.current.state.lastSync).toBeDefined();
			});

			expect(mockInvoke).toHaveBeenCalledWith(
				"cmd_google_auth_exchange_code",
				{
					code: "auth-code-123",
					state: "test-state-123",
					expectedState: "test-state-123",
				}
			);
		});

		it("throws error when no pending OAuth flow", async () => {
			const { result } = renderHook(() => useGoogleCalendar());

			await expect(async () => {
				await act(async () => {
					await result.current.exchangeCode("code", "state");
				});
			}).rejects.toThrow("No pending OAuth flow. Call getAuthUrl first.");
		});

		it("throws error on state mismatch (CSRF protection)", async () => {
			// Set up pending state
			mockInvoke.mockResolvedValueOnce(mockAuthUrlResponse);
			const { result } = renderHook(() => useGoogleCalendar());

			await act(async () => {
				await result.current.getAuthUrl();
			});

			// Try to exchange with different state
			await expect(async () => {
				await act(async () => {
					await result.current.exchangeCode("code", "different-state");
				});
			}).rejects.toThrow("State mismatch - possible CSRF attack");

			await waitFor(() => {
				expect(result.current.state.error).toBe(
					"State mismatch - possible CSRF attack"
				);
			});
		});

		it("handles token exchange failure", async () => {
			mockInvoke.mockResolvedValueOnce(mockAuthUrlResponse);
			mockInvoke.mockRejectedValue(new Error("Invalid authorization code"));

			const { result } = renderHook(() => useGoogleCalendar());

			await act(async () => {
				await result.current.getAuthUrl();
			});

			await expect(async () => {
				await act(async () => {
					await result.current.exchangeCode("invalid-code", "test-state-123");
				});
			}).rejects.toThrow("Invalid authorization code");

			await waitFor(() => {
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.error).toBeDefined();
			});
		});
	});

	describe("connectInteractive", () => {
		it("completes full interactive OAuth flow", async () => {
			mockInvoke.mockResolvedValue(mockTokenResponse);

			const { result } = renderHook(() => useGoogleCalendar());

			await act(async () => {
				await result.current.connectInteractive();
			});

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.syncEnabled).toBe(true);
				expect(result.current.state.lastSync).toBeDefined();
			});

			expect(mockInvoke).toHaveBeenCalledWith("cmd_google_auth_connect");
		});

		it("throws error when authentication fails", async () => {
			mockInvoke.mockResolvedValue({
				authenticated: false,
			});

			const { result } = renderHook(() => useGoogleCalendar());

			await expect(async () => {
				await act(async () => {
					await result.current.connectInteractive();
				});
			}).rejects.toThrow("Google authentication did not complete");

			await waitFor(() => {
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.error).toBeDefined();
			});
		});

		it("handles connection errors", async () => {
			mockInvoke.mockRejectedValue(new Error("OAuth server error"));

			const { result } = renderHook(() => useGoogleCalendar());

			await expect(async () => {
				await act(async () => {
					await result.current.connectInteractive();
				});
			}).rejects.toThrow("OAuth server error");

			await waitFor(() => {
				expect(result.current.state.isConnecting).toBe(false);
				expect(result.current.state.error).toBe("OAuth server error");
			});
		});
	});

	describe("disconnect", () => {
		it("clears tokens and resets state", async () => {
			// Start with connected state
			mockInvoke.mockResolvedValueOnce(mockTokens);
			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			// Clear mock and setup for disconnect
			mockInvoke.mockClear();
			mockInvoke.mockResolvedValue(undefined);

			await act(async () => {
				await result.current.disconnect();
			});

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
				expect(result.current.state.syncEnabled).toBe(false);
				expect(result.current.events).toHaveLength(0);
			});

			expect(mockInvoke).toHaveBeenCalledWith("cmd_clear_oauth_tokens", {
				serviceName: "google_calendar",
			});
		});

		it("handles disconnect errors gracefully", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			mockInvoke.mockRejectedValue(new Error("Failed to clear tokens"));

			const { result } = renderHook(() => useGoogleCalendar());

			// Should not throw, just log error
			await act(async () => {
				await result.current.disconnect();
			});

			// State should still be reset
			expect(result.current.state.isConnected).toBe(false);

			consoleSpy.mockRestore();
		});
	});

	// ─── Event Operations Tests ────────────────────────────────────────────

	describe("fetchEvents", () => {
		it("fetches events from selected calendars", async () => {
			// Mock all invoke calls to return proper values
			mockInvoke.mockImplementation((cmd: string) => {
				if (cmd === "cmd_load_oauth_tokens") {
					return Promise.resolve(mockTokens);
				}
				if (cmd === "cmd_google_calendar_get_selected_calendars") {
					return Promise.resolve({
						calendar_ids: ["primary", "holiday@group.v.calendar.google.com"],
					});
				}
				if (cmd === "cmd_google_calendar_list_events") {
					return Promise.resolve([mockEvents[0], mockEvents[1]]);
				}
				return Promise.reject(new Error(`Unknown command: ${cmd}`));
			});

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			// Fetch events
			await act(async () => {
				await result.current.fetchEvents(
					new Date("2025-02-10"),
					new Date("2025-02-15")
				);
			});

			await waitFor(() => {
				expect(result.current.events).toHaveLength(3);
			});

			// Verify list calls for both calendars
			const listCalls = mockInvoke.mock.calls.filter(
				([cmd]) => cmd === "cmd_google_calendar_list_events"
			);
			expect(listCalls.length).toBeGreaterThan(0);

			// Verify last sync timestamp
			expect(result.current.state.lastSync).toBeDefined();
		});

		it("handles missing calendar selection", async () => {
			mockInvoke.mockImplementation((cmd: string) => {
				if (cmd === "cmd_load_oauth_tokens") {
					return Promise.resolve(mockTokens);
				}
				if (cmd === "cmd_google_calendar_get_selected_calendars") {
					return Promise.reject(new Error("No selection"));
				}
				if (cmd === "cmd_google_calendar_list_events") {
					return Promise.resolve([mockEvents[0]]);
				}
				return Promise.reject(new Error(`Unknown command: ${cmd}`));
			});

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await act(async () => {
				await result.current.fetchEvents();
			});

			// Should fallback to primary calendar
			await waitFor(() => {
				expect(result.current.events).toHaveLength(1);
			});
		});

		it("returns empty array when not connected", async () => {
			mockInvoke.mockRejectedValue(new Error("No tokens"));

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
			});

			await act(async () => {
				const events = await result.current.fetchEvents();
				expect(events).toHaveLength(0);
			});

			expect(result.current.events).toHaveLength(0);
		});

		it("deduplicates events across calendars", async () => {
			mockInvoke.mockImplementation((cmd: string, args) => {
				if (cmd === "cmd_load_oauth_tokens") {
					return Promise.resolve(mockTokens);
				}
				if (cmd === "cmd_google_calendar_get_selected_calendars") {
					return Promise.resolve({ calendar_ids: ["primary", "secondary"] });
				}
				if (cmd === "cmd_google_calendar_list_events") {
					// First call (primary) returns evt-1, evt-2
					// Second call (secondary) returns evt-1, evt-3 (evt-1 is duplicate)
					const calls = mockInvoke.mock.calls.filter(([c]) => c === cmd);
					if (calls.length === 1) {
						return Promise.resolve([mockEvents[0], mockEvents[1]]);
					}
					return Promise.resolve([mockEvents[0], mockEvents[2]]);
				}
				return Promise.reject(new Error(`Unknown command: ${cmd}`));
			});

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await act(async () => {
				await result.current.fetchEvents();
			});

			await waitFor(() => {
				// Should only have 3 unique events (evt-1 appears in both calendars)
				expect(result.current.events).toHaveLength(3);
			});
		});

		it("sorts events by start time", async () => {
			mockInvoke.mockImplementation((cmd: string) => {
				if (cmd === "cmd_load_oauth_tokens") {
					return Promise.resolve(mockTokens);
				}
				if (cmd === "cmd_google_calendar_get_selected_calendars") {
					return Promise.resolve({ calendar_ids: ["primary"] });
				}
				if (cmd === "cmd_google_calendar_list_events") {
					// Return events out of order
					return Promise.resolve([mockEvents[1], mockEvents[0], mockEvents[2]]);
				}
				return Promise.reject(new Error(`Unknown command: ${cmd}`));
			});

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await act(async () => {
				await result.current.fetchEvents();
			});

			await waitFor(() => {
				// Should be sorted: evt-1 (10:00), evt-2 (11:00), evt-3 (all day)
				expect(result.current.events[0].id).toBe("evt-1");
				expect(result.current.events[1].id).toBe("evt-2");
				expect(result.current.events[2].id).toBe("evt-3");
			});
		});
	});

	describe("createEvent", () => {
		it("creates a new event", async () => {
			mockInvoke
				.mockResolvedValue(mockTokens) // checkConnectionStatus (called multiple times)
				.mockResolvedValueOnce(mockTokens); // additional call if needed
			const newEvent: GoogleCalendarEvent = {
				id: "new-evt-1",
				summary: "Test Event",
				start: { dateTime: "2025-02-12T14:00:00Z" },
				end: { dateTime: "2025-02-12T14:25:00Z" },
				status: "confirmed",
			};
			mockInvoke.mockResolvedValueOnce(newEvent);

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await act(async () => {
				const created = await result.current.createEvent(
					"Test Event",
					new Date("2025-02-12T14:00:00Z"),
					25,
					"Test description"
				);

				expect(created).toEqual(newEvent);
			});

			await waitFor(() => {
				expect(result.current.events).toContainEqual(newEvent);
			});

			expect(mockInvoke).toHaveBeenCalledWith(
				"cmd_google_calendar_create_event",
				{
					calendarId: "primary",
					summary: "Test Event",
					description: "Test description",
					startTime: "2025-02-12T14:00:00.000Z",
					endTime: "2025-02-12T14:25:00.000Z",
				}
			);
		});

		it("throws error when not connected", async () => {
			mockInvoke.mockRejectedValue(new Error("No tokens"));

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
			});

			await expect(async () => {
				await act(async () => {
					await result.current.createEvent(
						"Test",
						new Date(),
						25
					);
				});
			}).rejects.toThrow("Not connected to Google Calendar");
		});

		it("throws error for empty summary", async () => {
			mockInvoke.mockResolvedValue(mockTokens);

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await expect(async () => {
				await act(async () => {
					await result.current.createEvent(
						"   ", // whitespace only
						new Date(),
						25
					);
				});
			}).rejects.toThrow("Event summary cannot be empty");
		});

		it("handles create event errors", async () => {
			mockInvoke.mockResolvedValueOnce(mockTokens);
			mockInvoke.mockRejectedValueOnce(new Error("API rate limit exceeded"));

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await expect(async () => {
				await act(async () => {
					await result.current.createEvent(
						"Test Event",
						new Date(),
						25
					);
				});
			}).rejects.toThrow("API rate limit exceeded");

			await waitFor(() => {
				expect(result.current.state.error).toBe("API rate limit exceeded");
			});
		});
	});

	describe("deleteEvent", () => {
		it("deletes an event by ID", async () => {
			mockInvoke.mockResolvedValueOnce(mockTokens);
			mockInvoke.mockResolvedValueOnce([mockEvents[0]]);
			mockInvoke.mockResolvedValueOnce(undefined);

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			// Load events first
			await act(async () => {
				await result.current.fetchEvents();
			});

			await waitFor(() => {
				expect(result.current.events).toHaveLength(1);
			});

			// Delete the event
			await act(async () => {
				await result.current.deleteEvent("evt-1");
			});

			await waitFor(() => {
				expect(result.current.events).toHaveLength(0);
			});

			expect(mockInvoke).toHaveBeenCalledWith(
				"cmd_google_calendar_delete_event",
				{
					calendarId: "primary",
					eventId: "evt-1",
				}
			);
		});

		it("throws error when not connected", async () => {
			mockInvoke.mockRejectedValue(new Error("No tokens"));

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(false);
			});

			await expect(async () => {
				await act(async () => {
					await result.current.deleteEvent("evt-1");
				});
			}).rejects.toThrow("Not connected to Google Calendar");
		});

		it("throws error for empty event ID", async () => {
			mockInvoke.mockResolvedValue(mockTokens);

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await expect(async () => {
				await act(async () => {
					await result.current.deleteEvent("  ");
				});
			}).rejects.toThrow("Event ID cannot be empty");
		});

		it("handles delete event errors", async () => {
			mockInvoke.mockResolvedValueOnce(mockTokens);
			mockInvoke.mockRejectedValueOnce(new Error("Event not found"));

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			await expect(async () => {
				await act(async () => {
					await result.current.deleteEvent("non-existent");
				});
			}).rejects.toThrow("Event not found");

			await waitFor(() => {
				expect(result.current.state.error).toBe("Event not found");
			});
		});
	});

	describe("toggleSync", () => {
		it("enables sync when true", async () => {
			// Mock connection status and calendar selection to avoid errors
			mockInvoke
				.mockResolvedValue(mockTokens) // checkConnectionStatus
				.mockResolvedValue({ calendar_ids: ["primary"] }); // calendar selection for auto-fetch

			const { result } = renderHook(() => useGoogleCalendar());

			await waitFor(() => {
				expect(result.current.state.isConnected).toBe(true);
			});

			act(() => {
				result.current.toggleSync(false);
			});

			expect(result.current.state.syncEnabled).toBe(false);

			act(() => {
				result.current.toggleSync(true);
			});

			expect(result.current.state.syncEnabled).toBe(true);
		});
	});
});

// ─── Auto-load Events on Mount ───────────────────────────────────────

describe("Auto-load events", () => {
	let mockInvoke: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockInvoke = createMockInvoke();
	});

	it("loads events when connected and sync enabled", async () => {
		mockInvoke
			.mockResolvedValueOnce(mockTokens) // checkConnectionStatus
			.mockResolvedValueOnce({ calendar_ids: ["primary"] }) // calendar selection
			.mockResolvedValueOnce(mockEvents); // fetchEvents

		const { result } = renderHook(() => useGoogleCalendar());

		await waitFor(() => {
			expect(result.current.events).toHaveLength(3);
		});
	});

	it("does not load events when sync disabled", async () => {
		mockInvoke.mockResolvedValueOnce(mockTokens);

		const { result } = renderHook(() => useGoogleCalendar());

		await waitFor(() => {
			expect(result.current.state.isConnected).toBe(true);
		});

		act(() => {
			result.current.toggleSync(false);
		});

		// Events should be cleared
		await waitFor(() => {
			expect(result.current.events).toHaveLength(0);
		});
	});
});

// ─── Utility Function Tests ─────────────────────────────────────────────────

describe("isTokenValid", () => {
	it("accepts snake_case token shape with valid expiry", () => {
		const future = Math.floor(Date.now() / 1000) + 3600;
		expect(
			isTokenValid({
				access_token: "token",
				expires_at: future,
			})
		).toBe(true);
	});

	it("accepts camelCase token shape with valid expiry", () => {
		const future = Math.floor(Date.now() / 1000) + 3600;
		expect(
			isTokenValid({
				accessToken: "token",
				expiresAt: future,
			})
		).toBe(true);
	});

	it("rejects expired tokens", () => {
		const past = Math.floor(Date.now() / 1000) - 100;
		expect(
			isTokenValid({
				access_token: "token",
				expires_at: past,
			})
		).toBe(false);
	});

	it("rejects tokens within expiry buffer (5 minutes)", () => {
		const nearFuture = Math.floor(Date.now() / 1000) + 200; // 3.3 minutes
		expect(
			isTokenValid({
				access_token: "token",
				expires_at: nearFuture,
			})
		).toBe(false);
	});

	it("rejects tokens without expiry", () => {
		expect(
			isTokenValid({
				access_token: "token",
			})
		).toBe(false);
	});

	it("rejects undefined tokens", () => {
		expect(isTokenValid(undefined)).toBe(false);
	});

	it("rejects null tokens", () => {
		expect(isTokenValid(null)).toBe(false);
	});
});
