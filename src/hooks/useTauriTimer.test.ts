import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTauriTimer } from "./useTauriTimer";

const { mockInvoke } = vi.hoisted(() => ({
	mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn(() => ({
		minimize: vi.fn(),
		toggleMaximize: vi.fn(),
		close: vi.fn(),
	})),
}));

const RUNNING_SNAPSHOT = {
	state: "running",
	step_index: 0,
	step_type: "focus",
	step_label: "Focus",
	remaining_ms: 60_000,
	total_ms: 60_000,
	schedule_progress_pct: 0,
	at: "2026-02-24T00:00:00.000Z",
};

describe("useTauriTimer singleton ticking", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockInvoke.mockReset();
		Object.defineProperty(window, "__TAURI__", {
			value: {},
			writable: true,
			configurable: true,
		});
		mockInvoke.mockImplementation((command: string) => {
			if (command === "cmd_timer_status") return Promise.resolve(RUNNING_SNAPSHOT);
			if (command === "cmd_timer_tick") return Promise.resolve(RUNNING_SNAPSHOT);
			if (command === "cmd_get_window_state") {
				return Promise.resolve({
					always_on_top: false,
					float_mode: false,
				});
			}
			return Promise.resolve(null);
		});
	});

	it("runs only one backend tick loop even when multiple hooks are mounted", async () => {
		const hookA = renderHook(() => useTauriTimer());
		const hookB = renderHook(() => useTauriTimer());

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(hookA.result.current.isActive).toBe(true);
		expect(hookB.result.current.isActive).toBe(true);

		await act(async () => {
			vi.advanceTimersByTime(260);
			await Promise.resolve();
		});

		const tickCalls = mockInvoke.mock.calls.filter(
			([command]) => command === "cmd_timer_tick",
		).length;
		expect(tickCalls).toBe(1);

		hookA.unmount();
		hookB.unmount();
		vi.useRealTimers();
	});
});
