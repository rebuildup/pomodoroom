import { describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

describe("tauri config", () => {
	it("does not force a specific window route in devUrl", () => {
		const config = tauriConfig as { build?: { devUrl?: string } };
		const devUrl = config.build?.devUrl ?? "";
		const url = new URL(devUrl);
		expect(url.searchParams.get("window")).toBeNull();
	});

	it("has valid product configuration", () => {
		const config = tauriConfig as {
			productName?: string;
			version?: string;
			identifier?: string;
		};

		expect(config.productName).toBe("Pomodoroom");
		expect(config.version).toBeDefined();
		expect(config.identifier).toBe("com.pomodoroom.desktop");
	});
});
