import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

function Harness() {
	const [value] = useLocalStorage<string[]>("test-local-storage-loop", []);
	return <div>{value.length}</div>;
}

describe("useLocalStorage", () => {
	it("does not trigger an infinite update loop with array literal initialValue", async () => {
		const store = new Map<string, string>();
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: (key: string) => store.get(key) ?? null,
				setItem: (key: string, value: string) => {
					store.set(key, value);
				},
				removeItem: (key: string) => {
					store.delete(key);
				},
				clear: () => store.clear(),
			},
			configurable: true,
		});
		window.localStorage.setItem("test-local-storage-loop", JSON.stringify(["a"]));

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			await Promise.resolve();
		});

		const maxDepthLogged = errorSpy.mock.calls.some((args) =>
			args.some((arg) =>
				typeof arg === "string" && arg.includes("Maximum update depth exceeded"),
			),
		);

		expect(maxDepthLogged).toBe(false);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		errorSpy.mockRestore();
		warnSpy.mockRestore();
	});
});
