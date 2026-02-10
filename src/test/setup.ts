// Test setup file for Vitest
import { expect, beforeEach, vi } from "vitest";

// Mock Tauri API
global.__TAURI__ = {
	core: {
		invoke: vi.fn(),
	},
};

// Mock Notification API
global.Notification = {
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
