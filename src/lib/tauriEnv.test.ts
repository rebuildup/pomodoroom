import { describe, expect, it } from "vitest";
import { isTauriEnvironment } from "./tauriEnv";

describe("isTauriEnvironment", () => {
	it("returns true when __TAURI__ exists", () => {
		Object.defineProperty(window, "__TAURI__", {
			value: {},
			configurable: true,
		});
		expect(isTauriEnvironment()).toBe(true);
	});

	it("returns true when __TAURI_INTERNALS__ exists", () => {
		Object.defineProperty(window, "__TAURI__", {
			value: undefined,
			configurable: true,
		});
		Object.defineProperty(window, "__TAURI_INTERNALS__", {
			value: {},
			configurable: true,
		});
		expect(isTauriEnvironment()).toBe(true);
	});
});

