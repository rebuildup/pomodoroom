import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("scrollbar-hover CSS behavior", () => {
	it("reserves symmetric gutter and reveals scrollbar only on hover", () => {
		const root = process.cwd();
		const indexCss = readFileSync(path.join(root, "src", "index.css"), "utf8");

		expect(indexCss).toContain("scrollbar-gutter: auto;");
		expect(indexCss).toContain(".scrollbar-hover {");
		expect(indexCss).toContain("--scrollbar-size: 6px;");
		expect(indexCss).toContain("scrollbar-width: thin;");
		expect(indexCss).toContain(".scrollbar-hover::-webkit-scrollbar,");
		expect(indexCss).toContain(".scrollbar-hover-no-gutter::-webkit-scrollbar {");
		expect(indexCss).toContain("width: var(--scrollbar-size);");
		expect(indexCss).toContain("height: var(--scrollbar-size);");
		expect(indexCss).toContain(".scrollbar-hover::-webkit-scrollbar-thumb,");
		expect(indexCss).toContain("background-color: transparent;");
		expect(indexCss).toContain("border: 1px solid transparent;");
		expect(indexCss).toContain(".scrollbar-hover:hover::-webkit-scrollbar-thumb,");
		expect(indexCss).toContain("background-color: var(--color-border);");
		expect(indexCss).toContain(".scrollbar-hover-no-gutter {");
		expect(indexCss).toContain("scrollbar-gutter: auto;");
		expect(indexCss).toContain("scrollbar-width: thin;");
		expect(indexCss).toContain(".scrollbar-hover-no-gutter::-webkit-scrollbar {");
		expect(indexCss).toContain(".scrollbar-hover-y {");
		expect(indexCss).toContain("scrollbar-gutter: stable;");
		expect(indexCss).toContain("@supports (scrollbar-gutter: stable both-edges)");
		expect(indexCss).toContain("scrollbar-gutter: stable both-edges;");
		expect(indexCss).toContain(".scrollbar-hover-x {");
		expect(indexCss).toContain(".scrollbar-stable-y {");
		expect(indexCss).toContain(".scrollbar-hover-y::-webkit-scrollbar {");
		expect(indexCss).toContain("height: 0px;");
		expect(indexCss).toContain(".scrollbar-hover-x::-webkit-scrollbar {");
		expect(indexCss).toContain("width: 0px;");
		expect(indexCss).toContain(".scrollbar-hover-x {");
		expect(indexCss).toContain(".scrollbar-hover-x:hover {");
		expect(indexCss).toContain(".task-list-scroll {");
		expect(indexCss).toContain("padding-inline: 0.25rem;");
		expect(indexCss).toContain("@supports not (scrollbar-gutter: stable both-edges)");
		expect(indexCss).toContain("padding-inline-start: calc(0.25rem + var(--scrollbar-size));");
		expect(indexCss).not.toContain("padding: var(--scrollbar-size);");
		expect(indexCss).not.toContain("margin: calc(var(--scrollbar-size) * -1);");
		expect(indexCss).not.toMatch(/\n::-webkit-scrollbar\s*\{/);
	});
});
