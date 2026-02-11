import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("icon font loading", () => {
	it("loads Material Symbols from main entry instead of CSS @import", () => {
		const root = process.cwd();
		const main = readFileSync(path.join(root, "src", "main.tsx"), "utf8");
		const indexCss = readFileSync(path.join(root, "src", "index.css"), "utf8");

		expect(main).toContain('@fontsource/material-symbols-outlined');
		expect(indexCss).not.toContain('@import "@fontsource/material-symbols-outlined"');
	});
});
