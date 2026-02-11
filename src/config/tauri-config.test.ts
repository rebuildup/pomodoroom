import { describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";

describe("tauri config", () => {
	it("does not force a specific window route in devUrl", () => {
		const config = tauriConfig as { build?: { devUrl?: string } };
		const devUrl = config.build?.devUrl ?? "";
		const url = new URL(devUrl);
		expect(url.searchParams.get("window")).toBeNull();
	});

	it("uses updater endpoint from the active releases repository", () => {
		const config = tauriConfig as {
			plugins?: { updater?: { endpoints?: string[] } };
		};

		const endpoint = config.plugins?.updater?.endpoints?.[0] ?? "";
		expect(endpoint).toContain("github.com/rebuildup/pomodoroom/releases/latest/download/latest.json");
	});
});
