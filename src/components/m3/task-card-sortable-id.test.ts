import { describe, expect, it } from "vitest";
import { buildTaskCardSortableId } from "./task-card-sortable-id";

describe("buildTaskCardSortableId", () => {
	it("uses raw task id when draggable", () => {
		expect(buildTaskCardSortableId("task-1", true)).toBe("task-1");
	});

	it("uses disabled-prefixed id when not draggable", () => {
		expect(buildTaskCardSortableId("task-1", false)).toBe("__taskcard-disabled-task-1");
	});

	it("uses fallback ids when task id is missing", () => {
		expect(buildTaskCardSortableId(undefined, true)).toBe("__empty__");
		expect(buildTaskCardSortableId(undefined, false)).toBe("__taskcard-disabled-__empty__");
	});
});
