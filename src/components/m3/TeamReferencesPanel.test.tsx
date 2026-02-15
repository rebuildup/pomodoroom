import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeamReferencesPanel } from "./TeamReferencesPanel";

const openWindowMock = vi.fn();

vi.mock("@/hooks/useWindowManager", () => ({
	useWindowManager: () => ({
		openWindow: openWindowMock,
	}),
}));

describe("TeamReferencesPanel", () => {
	it("renders migrated quick actions and opens matching windows", () => {
		render(<TeamReferencesPanel />);

		const actions: Array<[string, string]> = [
			["New Note", "note"],
			["Mini Timer", "mini-timer"],
			["Statistics", "stats"],
			["Timeline", "timeline"],
			["YouTube", "youtube"],
			["Settings", "settings"],
		];

		for (const [label, type] of actions) {
			fireEvent.click(screen.getByRole("button", { name: label }));
			expect(openWindowMock).toHaveBeenLastCalledWith(type);
		}
	});
});
