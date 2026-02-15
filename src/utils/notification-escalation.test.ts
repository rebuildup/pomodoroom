import { beforeEach, describe, expect, it } from "vitest";
import {
	acknowledgePrompt,
	computeEscalationChannel,
	getEscalationDecision,
	isQuietHours,
	markPromptIgnored,
	readQuietHoursPolicy,
} from "@/utils/notification-escalation";

describe("notification escalation", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it("uses badge -> toast -> modal ladder deterministically", () => {
		const promptKey = "critical-start:task-1";

		expect(
			getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false }).channel
		).toBe("badge");

		markPromptIgnored(promptKey, "badge");
		expect(
			getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false }).channel
		).toBe("toast");

		markPromptIgnored(promptKey, "toast");
		expect(
			getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false }).channel
		).toBe("modal");
	});

	it("resets ladder after acknowledged action", () => {
		const promptKey = "critical-start:task-2";

		markPromptIgnored(promptKey, "badge");
		markPromptIgnored(promptKey, "toast");
		expect(
			getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false }).channel
		).toBe("modal");

		acknowledgePrompt(promptKey);
		expect(
			getEscalationDecision(promptKey, { isDnd: false, isQuietHours: false }).channel
		).toBe("badge");
	});

	it("quiet hours policy always wins over escalation", () => {
		expect(
			computeEscalationChannel({ ignoredCount: 99, isQuietHours: true, isDnd: false })
				.channel
		).toBe("badge");
	});

	it("dnd always wins over escalation", () => {
		expect(
			computeEscalationChannel({ ignoredCount: 99, isQuietHours: false, isDnd: true })
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

	it("supports overnight and daytime quiet-hour windows", () => {
		expect(
			isQuietHours(new Date("2026-02-15T23:30:00"), {
				enabled: true,
				startHour: 22,
				endHour: 7,
			})
		).toBe(true);
		expect(
			isQuietHours(new Date("2026-02-15T08:30:00"), {
				enabled: true,
				startHour: 22,
				endHour: 7,
			})
		).toBe(false);

		expect(
			isQuietHours(new Date("2026-02-15T14:00:00"), {
				enabled: true,
				startHour: 12,
				endHour: 17,
			})
		).toBe(true);
	});
});