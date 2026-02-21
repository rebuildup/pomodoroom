import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RecurringTaskEditor } from "./RecurringTaskEditor";

// Mock Tauri invoke to return empty data
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn().mockResolvedValue({ data: null, is_stale: false }),
}));

// Mock Tauri event API
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
	unlisten: vi.fn(),
}));

// Mock useTaskStore since RecurringTaskEditor depends on it
vi.mock("@/hooks/useTaskStore", () => ({
	useTaskStore: () => ({
		tasks: [],
		createTask: vi.fn(),
		deleteTask: vi.fn(),
		updateTask: vi.fn(),
		getAllTasks: () => [],
		totalCount: 0,
	}),
}));

describe("RecurringTaskEditor", () => {
	beforeEach(() => {
		// Ensure Tauri globals are NOT present in window
		// (Other tests like useTaskStore.test.ts set these, and they persist globally)
		delete (window as unknown as Record<string, unknown>).__TAURI__;
		delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
	});

	afterEach(() => {
		// Clean up - restore if needed by other tests
		delete (window as unknown as Record<string, unknown>).__TAURI__;
		delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
	});

	it("renders unified life and macro sections", async () => {
		render(<RecurringTaskEditor />);

		// Wait for loading to complete (component has async useEffect)
		await waitFor(
			() => {
				expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
			},
			{ timeout: 3000 },
		);

		// Check for "基本設定" button
		expect(screen.getByText("基本設定")).toBeInTheDocument();
		// Check for filter buttons (timeline section at top)
		// Note: "全て", "今日", "曜日" appear in multiple places, so we check they exist
		expect(screen.getAllByText("全て").length).toBeGreaterThan(0);
		expect(screen.getAllByText("今日").length).toBeGreaterThan(0);
		expect(screen.getAllByText("曜日").length).toBeGreaterThan(0);
		// Check for add button text
		expect(screen.getByText("追加")).toBeInTheDocument();
	});

	it("renders timeline structure with track", async () => {
		render(<RecurringTaskEditor />);

		// Wait for loading to complete (component has async useEffect)
		await waitFor(
			() => {
				expect(screen.queryByText("読み込み中...")).not.toBeInTheDocument();
			},
			{ timeout: 3000 },
		);

		expect(screen.getByTestId("life-timeline-track")).toBeInTheDocument();
		// Check for time markers (24-hour format)
		expect(screen.getByText("00:00")).toBeInTheDocument();
		expect(screen.getByText("06:00")).toBeInTheDocument();
		expect(screen.getByText("12:00")).toBeInTheDocument();
	});
});
