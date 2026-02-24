import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RecurringTaskEditor } from "./RecurringTaskEditor";
import { formatLocalDateKey } from "@/utils/recurring-auto-generation";

const createTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@/hooks/useTaskStore", () => ({
	useTaskStore: () => ({
		tasks: [],
		createTask: createTaskMock,
		deleteTask: deleteTaskMock,
	}),
}));

describe("RecurringTaskEditor auto generation", () => {
	beforeEach(() => {
		createTaskMock.mockReset();
		deleteTaskMock.mockReset();
		invokeMock.mockReset();
		(window as unknown as { __TAURI__: object }).__TAURI__ = {};
	});

	it("does not create recurring tasks when DB already has today's recurring markers", async () => {
		const dateKey = formatLocalDateKey(new Date());
		invokeMock.mockResolvedValue([
			{ description: `[recurring:life:lunch:${dateKey}] Auto-generated` },
			{ description: `[recurring:life:dinner:${dateKey}] Auto-generated` },
		]);

		render(<RecurringTaskEditor />);

		await waitFor(() => {
			expect(invokeMock).toHaveBeenCalledWith("cmd_task_list");
		});
		expect(createTaskMock).not.toHaveBeenCalled();
	});
});
