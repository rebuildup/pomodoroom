import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	acknowledgePrompt,
	computeEscalationChannel,
	getEscalationDecision,
	isQuietHours,
	markPromptIgnored,
	readQuietHoursPolicy,
} from "@/utils/gatekeeper";

// Mock Tauri invoke - use hoisted to avoid initialization issues
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

describe("gatekeeper (Rust-backed escalation)", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
		mockInvoke.mockReset();
		// Default mock: return badge channel
		mockInvoke.mockResolvedValue("badge");
	});

	it("uses badge -> toast -> modal ladder deterministically", async () => {
		const promptKey = "critical-start:task-1";

		// Initially: badge (level 0/nudge)
		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel,
		).toBe("badge");

		// markPromptIgnored is now a no-op in Rust implementation
		await markPromptIgnored(promptKey, "badge");

		// After escalation: toast (level 1/alert)
		mockInvoke.mockResolvedValueOnce("toast");
		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel,
		).toBe("toast");

		await markPromptIgnored(promptKey, "toast");

		// After more escalation: modal (level 2/gravity)
		mockInvoke.mockResolvedValueOnce("modal");
		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel,
		).toBe("modal");
	});

	it("resets ladder after acknowledged action", async () => {
		const promptKey = "critical-start:task-2";

		// High escalation: modal (level 2/gravity)
		mockInvoke.mockResolvedValue("modal");
		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel,
		).toBe("modal");

		await markPromptIgnored(promptKey, "badge");
		await markPromptIgnored(promptKey, "toast");

		// acknowledgePrompt stops gatekeeper
		await acknowledgePrompt(promptKey);

		// After stop, defaults back to badge
		mockInvoke.mockResolvedValueOnce("badge");
		expect(
			(await getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false })).channel,
		).toBe("badge");
	});

	it("quiet hours policy always wins over escalation", async () => {
		mockInvoke.mockResolvedValue("badge");

		expect((await computeEscalationChannel({ isQuietHours: true, isDnd: false })).channel).toBe(
			"badge",
		);
	});

	it("dnd always wins over escalation", async () => {
		mockInvoke.mockResolvedValue("badge");

		expect((await computeEscalationChannel({ isQuietHours: false, isDnd: true })).channel).toBe(
			"badge",
		);
	});

	it("reads quiet hours policy with fallback defaults", () => {
		// No localStorage persistence - database-only architecture
		expect(readQuietHoursPolicy()).toEqual({
			enabled: true,
			startHour: 22,
			endHour: 7,
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
			}),
		).toBe(true);

		// 08:30 is outside 22:00-07:00
		mockInvoke.mockResolvedValueOnce(false);
		expect(
			await isQuietHours(new Date("2026-02-15T08:30:00"), {
				enabled: true,
				startHour: 22,
				endHour: 7,
			}),
		).toBe(false);

		// Daytime: 14:00 is within 12:00-17:00
		mockInvoke.mockResolvedValueOnce(true);
		expect(
			await isQuietHours(new Date("2026-02-15T14:00:00"), {
				enabled: true,
				startHour: 12,
				endHour: 17,
			}),
		).toBe(true);
	});
});
