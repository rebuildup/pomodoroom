import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SplitPreviewEditor } from "./SplitPreviewEditor";

describe("SplitPreviewEditor", () => {
	it("supports cancel without applying", () => {
		const onAccept = vi.fn();
		const onCancel = vi.fn();

		render(
			<SplitPreviewEditor
				isOpen
				title="Deep Work"
				totalMinutes={90}
				onAccept={onAccept}
				onCancel={onCancel}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onAccept).not.toHaveBeenCalled();
	});

	it("shows localized validation and disables apply when invalid", () => {
		const onAccept = vi.fn();

		render(
			<SplitPreviewEditor
				isOpen
				title="Deep Work"
				totalMinutes={90}
				onAccept={onAccept}
				onCancel={() => {}}
			/>
		);

		const durationInput = screen.getByTestId("split-duration-focus-1");
		fireEvent.change(durationInput, { target: { value: "0" } });

		expect(screen.queryByText(/検証エラー/)).not.toBeNull();
		const apply = screen.getByRole("button", { name: "Apply" });
		expect((apply as HTMLButtonElement).disabled).toBe(true);
	});

	it("returns edited preview exactly in accepted order", () => {
		const onAccept = vi.fn();

		render(
			<SplitPreviewEditor
				isOpen
				title="Deep Work"
				totalMinutes={90}
				onAccept={onAccept}
				onCancel={() => {}}
			/>
		);

		fireEvent.change(screen.getByTestId("split-duration-focus-1"), {
			target: { value: "45" },
		});
		fireEvent.change(screen.getByTestId("split-duration-break-1"), {
			target: { value: "5" },
		});
		fireEvent.change(screen.getByTestId("split-duration-focus-2"), {
			target: { value: "40" },
		});
		fireEvent.change(screen.getByTestId("split-title-focus-2"), {
			target: { value: "Final pass" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(onAccept).toHaveBeenCalledTimes(1);
		expect(onAccept.mock.calls[0][0]).toEqual([
			{
				id: "focus-1",
				kind: "focus",
				title: "Deep Work (1)",
				durationMinutes: 45,
			},
			{
				id: "break-1",
				kind: "break",
				title: "Break (1)",
				durationMinutes: 5,
			},
			{
				id: "focus-2",
				kind: "focus",
				title: "Final pass",
				durationMinutes: 40,
			},
		]);
	});
});
