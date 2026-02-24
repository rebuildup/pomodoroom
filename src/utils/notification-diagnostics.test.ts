import { beforeEach, describe, expect, it } from "vitest";
import {
	clearNotificationDiagnostics,
	getNotificationDiagnostics,
	pushNotificationDiagnostic,
} from "./notification-diagnostics";

describe("notification diagnostics", () => {
	beforeEach(() => {
		clearNotificationDiagnostics();
	});

	it("stores recent diagnostics in append order", () => {
		pushNotificationDiagnostic("timer.tick", "tick loop started");
		pushNotificationDiagnostic("action.show", "notification shown", {
			title: "集中完了",
		});

		const rows = getNotificationDiagnostics();
		expect(rows).toHaveLength(2);
		expect(rows[0]?.stage).toBe("timer.tick");
		expect(rows[1]?.stage).toBe("action.show");
		expect(rows[1]?.context?.title).toBe("集中完了");
	});
});

