import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	acknowledgePrompt,
	computeEscalationChannel,
	getEscalationDecision,
	isQuietHours,
	markPromptIgnored,
	readQuietHoursPolicy,
} from "@/utils/gatekeeper";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

describe("gatekeeper (Rust-backed escalation)", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		mockInvoke.mockReset();
	});

	it("uses badge -> toast -> modal ladder deterministically", async () => {
		const promptKey = "critical-start:task-1";

		// Mock gatekeeper state to return badge (level 0)
		mockInvoke.mockResolvedValue({
			level: "nudge",
			completedAt: new Date().toISOString(),
			breakDebtMs: 0,
			promptKey,
		});

		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel
		).toBe("badge");

		// markPromptIgnored is now a no-op in Rust implementation
		await markPromptIgnored(promptKey, "badge");

		// Mock escalation to toast (level 1)
		mockInvoke.mockResolvedValueOnce({
			level: "alert",
			completedAt: new Date().toISOString(),
			breakDebtMs: 4 * 60 * 1000,
			promptKey,
		});

		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel
		).toBe("toast");

		await markPromptIgnored(promptKey, "toast");

		// Mock escalation to modal (level 2)
		mockInvoke.mockResolvedValueOnce({
			level: "gravity",
			completedAt: new Date().toISOString(),
			breakDebtMs: 6 * 60 * 1000,
			promptKey,
		});

		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel
		).toBe("modal");
	});

	it("resets ladder after acknowledged action", async () => {
		const promptKey = "critical-start:task-2";

		// Mock escalation to modal (level 2)
		mockInvoke.mockResolvedValue({
			level: "gravity",
			completedAt: new Date().toISOString(),
			breakDebtMs: 6 * 60 * 1000,
			promptKey,
		});

		await markPromptIgnored(promptKey, "badge");
		await markPromptIgnored(promptKey, "toast");
		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel
		).toBe("modal");

		// acknowledgePrompt stops gatekeeper (returns null state)
		mockInvoke.mockResolvedValueOnce(null);

		await acknowledgePrompt(promptKey);

		// After stop, getEscalationDecision defaults to badge
		mockInvoke.mockResolvedValueOnce({
			level: "nudge",
			completedAt: new Date().toISOString(),
			breakDebtMs: 0,
			promptKey,
		});

		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel
		).toBe("badge");
	});

	it("quiet hours policy always wins over escalation", async () => {
		mockInvoke.mockResolvedValue("badge");

		expect(
			(await computeEscalationChannel({ ignoredCount: 99, isQuietHours: true, isDnd: false }))
				.channel
		).toBe("badge");
	});

	it("dnd always wins over escalation", async () => {
		mockInvoke.mockResolvedValue("badge");

		expect(
			(await computeEscalationChannel({ ignoredCount: 99, isQuietHours: false, isDnd: true }))
				.channel
		).toBe("badge");
	});

	it("reads quiet hours policy from storage with fallback defaults", () => {
		expect(readQuietHoursPolicy()).toEqual({
			enabled: true,
			startHour: 22,
			endHour: 7,
		});

		localStorage.setItem(
			"notification_quiet_hours",
			JSON.stringify({ enabled: true, startHour: 23, endHour: 6 })
		);
		expect(readQuietHoursPolicy()).toEqual({
			enabled: true,
			startHour: 23,
			endHour: 6,
		});
	});

	it("supports overnight and daytime quiet-hour windows", async () => {
		// Overnight: 23:30 is within 22:00-07:00
		mockInvoke.mockResolvedValueOnce(true);
		expect(
			await isQuietHours(new Date("2026-02-15T23:30:00"), {
				enabled: true,
				startHour: 22,
				endHour: 7,
			})
		).toBe(true);

		// 08:30 is outside 22:00-07:00
		mockInvoke.mockResolvedValueOnce(false);
		expect(
			await isQuietHours(new Date("2026-02-15T08:30:00"), {
				enabled: true,
				startHour: 22,
				endHour: 7,
			})
		).toBe(false);

		// Daytime: 14:00 is within 12:00-17:00
		mockInvoke.mockResolvedValueOnce(true);
		expect(
			await isQuietHours(new Date("2026-02-15T14:00:00"), {
				enabled: true,
				startHour: 12,
				endHour: 17,
			})
		).toBe(true);
	});
});
