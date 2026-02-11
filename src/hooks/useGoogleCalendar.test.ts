import { describe, expect, it } from "vitest";
import { isTokenValid } from "./useGoogleCalendar";

describe("isTokenValid", () => {
	it("accepts snake_case token shape", () => {
		const future = Math.floor(Date.now() / 1000) + 3600;
		expect(
			isTokenValid({
				access_token: "token",
				expires_at: future,
			}),
		).toBe(true);
	});

	it("accepts camelCase token shape", () => {
		const future = Math.floor(Date.now() / 1000) + 3600;
		expect(
			isTokenValid({
				accessToken: "token",
				expiresAt: future,
			}),
		).toBe(true);
	});
});
