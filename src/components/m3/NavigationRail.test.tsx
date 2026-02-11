import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NavigationRail } from "./NavigationRail";

describe("NavigationRail", () => {
	it("shows unified recurring tab", () => {
		const html = renderToStaticMarkup(
			<NavigationRail active="overview" onNavigate={() => undefined} />,
		);

		expect(html).toContain('aria-label="生活時間"');
		expect(html).not.toContain('aria-label="マクロ時間"');
	});
});
