// Test setup file for Vitest
import { expect, beforeEach, vi } from "vitest";

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
