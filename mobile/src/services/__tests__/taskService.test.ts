import { getBreakSuggestion } from "../taskService";

describe("getBreakSuggestion", () => {
	it("returns null when elapsed minutes < 25", () => {
		expect(getBreakSuggestion(0)).toBeNull();
		expect(getBreakSuggestion(24)).toBeNull();
	});

	it("returns short break after 25 minutes", () => {
		const suggestion = getBreakSuggestion(25);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.durationMinutes).toBe(5);
		expect(suggestion?.title).toBe("短休憩");
	});

	it("returns long break after 4 pomodoros (100 minutes)", () => {
		const suggestion = getBreakSuggestion(100);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.durationMinutes).toBe(15);
		expect(suggestion?.title).toBe("長休憩");
	});

	it("returns short break after 50 minutes (2 pomodoros)", () => {
		const suggestion = getBreakSuggestion(50);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.durationMinutes).toBe(5);
	});

	it("returns long break after 150 minutes (6 pomodoros)", () => {
		const suggestion = getBreakSuggestion(150);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.durationMinutes).toBe(15);
	});
});
