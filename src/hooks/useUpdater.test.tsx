import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdater } from "./useUpdater";

const { mockCheck, mockRelaunch } = vi.hoisted(() => ({
	mockCheck: vi.fn(),
	mockRelaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
	check: mockCheck,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
	relaunch: mockRelaunch,
}));

vi.mock("@/lib/tauriEnv", () => ({
	isTauriEnvironment: () => true,
}));

describe("useUpdater", () => {
	beforeEach(() => {
		mockCheck.mockReset();
		mockRelaunch.mockReset();
	});

	it("sets error when restart fails after download/install", async () => {
		const mockUpdate = {
			currentVersion: "1.4.6",
			version: "1.4.7",
			body: "",
			date: "",
			downloadAndInstall: vi.fn().mockResolvedValue(undefined),
		};
		mockCheck.mockResolvedValue(mockUpdate);
		mockRelaunch.mockRejectedValue(new Error("restart denied"));

		const { result } = renderHook(() => useUpdater({ autoCheckOnMount: false }));

		await act(async () => {
			await result.current.checkForUpdates();
		});

		await act(async () => {
			await result.current.applyUpdateAndRestart();
		});

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
		expect(result.current.error).toContain("restart denied");
	});
});
