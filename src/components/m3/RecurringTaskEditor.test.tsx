import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecurringTaskEditor } from "./RecurringTaskEditor";

describe("RecurringTaskEditor", () => {
	it("renders unified life and macro sections", () => {
		const html = renderToStaticMarkup(
			<RecurringTaskEditor />,
		);
		// Check for "基本設定" button
		expect(html).toContain("基本設定");
		// Check for filter buttons
		expect(html).toContain("全て");
		expect(html).toContain("今日");
		expect(html).toContain("曜日");
		// Check for add button text
		expect(html).toContain("追加");
	});

	it("renders timeline structure with track", () => {
		const html = renderToStaticMarkup(<RecurringTaskEditor />);
		expect(html).toContain('data-testid="life-timeline-track"');
		// Check for time markers (24-hour format)
		expect(html).toContain("00:00");
		expect(html).toContain("06:00");
		expect(html).toContain("12:00");
	});
});
