// Test setup file for Vitest
import { expect, beforeEach, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { TextEncoder, TextDecoder } from "node:util";

// Import types for jest-dom matchers
import "@testing-library/jest-dom/vitest";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Polyfill TextEncoder/TextDecoder for jsdom/happy-dom
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Extend globalThis type for Tauri mock
declare global {
	var __TAURI__: {
		core: {
			invoke: ReturnType<typeof vi.fn>;
		};
	};
}

// Mock Tauri API
globalThis.__TAURI__ = {
	core: {
		invoke: vi.fn(),
	},
};

// Mock Notification API
globalThis.Notification = {
	permission: "default" as NotificationPermission,
	requestPermission: vi.fn(async () => "granted"),
} as any;

// Mock window.__TAURI__
Object.defineProperty(window, "__TAURI__", {
	value: {
		core: {
			invoke: vi.fn(),
		},
	},
	writable: true,
});

// Mock localStorage for jsdom
const localStorageMock = (() => {
	let store: Record<string, string> = {};

	return {
		getItem: (key: string) => store[key] ?? null,
		setItem: (key: string, value: string) => {
			store[key] = String(value);
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		get length() {
			return Object.keys(store).length;
		},
		key: (index: number) => {
			return Object.keys(store)[index] ?? null;
		},
	};
})();

Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
	writable: true,
});

// Clear localStorage before each test to prevent state leakage
beforeEach(() => {
	window.localStorage.clear();
});
