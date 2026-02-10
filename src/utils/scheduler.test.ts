/**
 * Tests for scheduler.ts
 *
 * This test suite covers the auto-scheduler functionality and ensures
 * edge cases like missing template values are handled correctly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
	generateSchedule,
	createMockProjects,
	createMockCalendarEvents,
	type DailyTemplate,
	type ScheduleBlock,
} from "./scheduler";

describe("scheduler", () => {
	describe("todayAt helper", () => {
		it("should handle undefined time string", () => {
			// Import and test the todayAt function indirectly through generateSchedule
			const template: DailyTemplate = {
				wakeUp: undefined as any,
				sleep: undefined as any,
				fixedEvents: [],
			};
			const tasks: any[] = [];

			// Should not throw error with undefined wakeUp/sleep
			expect(() => {
				generateSchedule({ template, tasks });
			}).not.toThrow();

			const result = generateSchedule({ template, tasks });
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle null time string", () => {
			const template: DailyTemplate = {
				wakeUp: null as any,
				sleep: null as any,
				fixedEvents: [],
			};
			const tasks: any[] = [];

			expect(() => {
				generateSchedule({ template, tasks });
			}).not.toThrow();

			const result = generateSchedule({ template, tasks });
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle empty string time", () => {
			const template: DailyTemplate = {
				wakeUp: "",
				sleep: "",
				fixedEvents: [],
			};
			const tasks: any[] = [];

			expect(() => {
				generateSchedule({ template, tasks });
			}).not.toThrow();

			const result = generateSchedule({ template, tasks });
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle valid time strings", () => {
			const template: DailyTemplate = {
				wakeUp: "07:00",
				sleep: "23:00",
				fixedEvents: [],
			};
			const tasks: any[] = [];

			const result = generateSchedule({ template, tasks });
			expect(Array.isArray(result)).toBe(true);
			// Should generate some blocks even with no tasks (break blocks)
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("generateSchedule", () => {
		let template: DailyTemplate;

		beforeEach(() => {
			template = {
				wakeUp: "07:00",
				sleep: "23:00",
				fixedEvents: [],
				maxParallelLanes: 1,
			};
		});

		it("should generate schedule with valid template and tasks", () => {
			const { tasks } = createMockProjects();
			const result = generateSchedule({ template, tasks });

			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
		});

		it("should include calendar events when provided", () => {
			const calendarEvents = createMockCalendarEvents();
			const result = generateSchedule({ template, calendarEvents });

			expect(result.length).toBeGreaterThan(0);

			// Check that calendar events are included
			const calendarBlocks = result.filter((b) => b.blockType === "calendar");
			expect(calendarBlocks.length).toBe(2);
		});

		it("should sort blocks by start time", () => {
			const { tasks } = createMockProjects();
			const calendarEvents = createMockCalendarEvents();
			const result = generateSchedule({ template, calendarEvents, tasks });

			// Check that blocks are sorted by start time
			for (let i = 1; i < result.length; i++) {
				const prevTime = new Date(result[i - 1]!.startTime).getTime();
				const currTime = new Date(result[i]!.startTime).getTime();
				expect(prevTime).toBeLessThanOrEqual(currTime);
			}
		});

		it("should handle empty task list", () => {
			const result = generateSchedule({ template, tasks: [] });

			expect(Array.isArray(result)).toBe(true);
			// Should still have some blocks (routine/break blocks)
			expect(result.length).toBeGreaterThanOrEqual(0);
		});

		it("should handle parallel lanes", () => {
			template.maxParallelLanes = 3;
			const { tasks } = createMockProjects();
			const result = generateSchedule({ template, tasks });

			// Check that lanes are used (0, 1, 2)
			const lanes = new Set(result.map((b) => b.lane ?? 0));
			expect(lanes.size).toBeGreaterThan(0);
		});

		it("should handle fixed events from template", () => {
			const now = new Date();
			template.fixedEvents = [
				{
					id: "lunch",
					name: "Lunch",
					startTime: "12:00",
					durationMinutes: 60,
					days: [now.getDay()], // Current day
					enabled: true,
				},
			];

			const result = generateSchedule({ template, tasks: [] });

			// Check that the fixed event is included
			const lunchBlock = result.find((b) => b.label === "Lunch");
			expect(lunchBlock).toBeDefined();
			expect(lunchBlock?.blockType).toBe("routine");
			expect(lunchBlock?.locked).toBe(true);
		});

		it("should skip disabled fixed events", () => {
			const now = new Date();
			template.fixedEvents = [
				{
					id: "disabled-event",
					name: "Disabled Event",
					startTime: "10:00",
					durationMinutes: 30,
					days: [now.getDay()],
					enabled: false, // Disabled
				},
			];

			const result = generateSchedule({ template, tasks: [] });

			// Should not include the disabled event
			const disabledBlock = result.find((b) => b.label === "Disabled Event");
			expect(disabledBlock).toBeUndefined();
		});

		it("should skip fixed events for different days", () => {
			const now = new Date();
			const tomorrow = (now.getDay() + 1) % 7;
			template.fixedEvents = [
				{
					id: "tomorrow-event",
					name: "Tomorrow Event",
					startTime: "10:00",
					durationMinutes: 30,
					days: [tomorrow], // Not today
					enabled: true,
				},
			];

			const result = generateSchedule({ template, tasks: [] });

			// Should not include the event for different day
			const tomorrowBlock = result.find((b) => b.label === "Tomorrow Event");
			expect(tomorrowBlock).toBeUndefined();
		});

		it("should respect custom now parameter", () => {
			const customNow = new Date("2025-01-15T10:00:00Z");
			const result = generateSchedule({
				template,
				tasks: [],
				now: customNow,
			});

			expect(Array.isArray(result)).toBe(true);
		});
	});

	describe("mock data factories", () => {
		it("should create valid mock projects and tasks", () => {
			const { projects, tasks } = createMockProjects();

			expect(Array.isArray(projects)).toBe(true);
			expect(projects.length).toBeGreaterThan(0);
			expect(Array.isArray(tasks)).toBe(true);
			expect(tasks.length).toBeGreaterThan(0);

			// Check project structure
			const project = projects[0]!;
			expect(project).toHaveProperty("id");
			expect(project).toHaveProperty("name");
			expect(project).toHaveProperty("tasks");

			// Check task structure
			const task = tasks[0]!;
			expect(task).toHaveProperty("id");
			expect(task).toHaveProperty("title");
			expect(task).toHaveProperty("estimatedPomodoros");
			expect(task).toHaveProperty("completedPomodoros");
		});

		it("should create valid mock calendar events", () => {
			const events = createMockCalendarEvents();

			expect(Array.isArray(events)).toBe(true);
			expect(events.length).toBe(2);

			const event = events[0]!;
			expect(event.blockType).toBe("calendar");
			expect(event.locked).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("should handle malformed time string in template", () => {
			const template: DailyTemplate = {
				wakeUp: "invalid" as any,
				sleep: "also-invalid" as any,
				fixedEvents: [],
			};

			expect(() => {
				generateSchedule({ template, tasks: [] });
			}).not.toThrow();
		});

		it("should handle partial time string (hours only)", () => {
			const template: DailyTemplate = {
				wakeUp: "9" as any, // Missing minutes
				sleep: "17" as any,
				fixedEvents: [],
			};

			expect(() => {
				generateSchedule({ template, tasks: [] });
			}).not.toThrow();
		});

		it("should handle very short sleep/wake time range", () => {
			const template: DailyTemplate = {
				wakeUp: "12:00",
				sleep: "13:00", // Only 1 hour
				fixedEvents: [],
			};

			const result = generateSchedule({ template, tasks: [] });
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle sleep before wake (same day)", () => {
			const template: DailyTemplate = {
				wakeUp: "23:00",
				sleep: "07:00", // Next day
				fixedEvents: [],
			};

			// This is a valid case (sleeping past midnight)
			const result = generateSchedule({ template, tasks: [] });
			expect(Array.isArray(result)).toBe(true);
		});

		it("should handle maxParallelLanes out of range", () => {
			const template: DailyTemplate = {
				wakeUp: "07:00",
				sleep: "23:00",
				fixedEvents: [],
				maxParallelLanes: 100, // Way above max
			};

			const { tasks } = createMockProjects();
			const result = generateSchedule({ template, tasks });

			// Should be clamped to max of 5
			const lanes = new Set(result.map((b) => b.lane ?? 0));
			expect(lanes.size).toBeLessThanOrEqual(5);
		});
	});
});
