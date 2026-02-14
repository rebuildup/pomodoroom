import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecurringTaskEditor } from "./RecurringTaskEditor";

describe("RecurringTaskEditor", () => {
	it("renders unified life and macro sections", () => {
		const html = renderToStaticMarkup(
			<RecurringTaskEditor />,
		);
		expect(html).toContain("一覧");
		expect(html).toContain("編集");
		expect(html).toContain("生活時間");
		expect(html).toContain("起床");
		expect(html).toContain("就寝");
		expect(html).toContain("マクロ時間");
		// Check for "予定追加" button (shown when timeline has data)
		// Note: "定期予定を追加" and "マクロタスクを追加" only appear in empty states
		expect(html).toContain('aria-label="予定追加"');
	});

	it("renders timeline structure with anchored macro block", () => {
		const html = renderToStaticMarkup(<RecurringTaskEditor />);
		expect(html).toContain('data-testid="life-timeline-scroll"');
		expect(html).toContain('data-testid="life-timeline-track"');
		expect(html).toContain('data-testid="macro-time-slot"');
	});
});
