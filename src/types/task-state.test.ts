/**
 * Tests for task state transition model.
 */

import { describe, it, expect } from "vitest";
import {
	type TaskState,
	isValidTransition,
	getTransitionLabel,
	InvalidTransitionError,
} from "./task-state";
import { createTaskStateMachine } from "../lib/StateMachine";

describe("TaskState types", () => {
	describe("isValidTransition", () => {
		const validTransitions: Array<[TaskState, TaskState]> = [
			["READY", "RUNNING"],
			["READY", "READY"],
			["RUNNING", "DONE"],
			["RUNNING", "RUNNING"],
			["RUNNING", "PAUSED"],
			["PAUSED", "RUNNING"],
		];

		const invalidTransitions: Array<[TaskState, TaskState]> = [
			["READY", "PAUSED"],
			["READY", "DONE"],
			["RUNNING", "READY"],
			["PAUSED", "READY"],
			["PAUSED", "DONE"],
			["PAUSED", "PAUSED"],
			["DONE", "READY"],
			["DONE", "RUNNING"],
			["DONE", "PAUSED"],
			["DONE", "DONE"],
		];

		it("accepts valid transitions", () => {
			validTransitions.forEach(([from, to]) => {
				expect(isValidTransition(from, to)).toBe(true);
			});
		});

		it("rejects invalid transitions", () => {
			invalidTransitions.forEach(([from, to]) => {
				expect(isValidTransition(from, to)).toBe(false);
			});
		});
	});

	describe("getTransitionLabel", () => {
		it("returns English labels by default", () => {
			expect(getTransitionLabel("READY", "RUNNING")).toBe("Start");
			expect(getTransitionLabel("READY", "READY")).toBe("Defer");
			expect(getTransitionLabel("RUNNING", "DONE")).toBe("Complete");
			expect(getTransitionLabel("RUNNING", "RUNNING")).toBe("Extend");
			expect(getTransitionLabel("RUNNING", "PAUSED")).toBe("Pause");
			expect(getTransitionLabel("PAUSED", "RUNNING")).toBe("Resume");
		});

		it("returns Japanese labels when locale is 'ja'", () => {
			expect(getTransitionLabel("READY", "RUNNING", "ja")).toBe("開始");
			expect(getTransitionLabel("READY", "READY", "ja")).toBe("先送り");
			expect(getTransitionLabel("RUNNING", "DONE", "ja")).toBe("完了");
			expect(getTransitionLabel("RUNNING", "RUNNING", "ja")).toBe("延長");
			expect(getTransitionLabel("RUNNING", "PAUSED", "ja")).toBe("中断");
			expect(getTransitionLabel("PAUSED", "RUNNING", "ja")).toBe("再開");
		});

		it("returns undefined for invalid transitions", () => {
			expect(getTransitionLabel("READY", "PAUSED")).toBeUndefined();
			expect(getTransitionLabel("DONE", "READY")).toBeUndefined();
		});
	});
});

describe("StateMachine", () => {
	it("tracks state transitions", () => {
		const machine = createTaskStateMachine();
		expect(machine.currentState).toBe("READY");

		machine.transition("RUNNING", "start");
		expect(machine.currentState).toBe("RUNNING");

		machine.transition("PAUSED", "pause");
		expect(machine.currentState).toBe("PAUSED");

		machine.transition("RUNNING", "resume");
		expect(machine.currentState).toBe("RUNNING");

		machine.transition("DONE", "complete");
		expect(machine.currentState).toBe("DONE");
	});

	it("records transition history", () => {
		const machine = createTaskStateMachine();
		machine.transition("RUNNING", "start");
		machine.transition("PAUSED", "pause");

		expect(machine.history).toHaveLength(2);
		expect(machine.history[0]).toEqual({
			from: "READY",
			to: "RUNNING",
			at: expect.any(Date),
			operation: "start",
		});
		expect(machine.history[1]).toEqual({
			from: "RUNNING",
			to: "PAUSED",
			at: expect.any(Date),
			operation: "pause",
		});
	});

	it("throws on invalid transitions", () => {
		const machine = createTaskStateMachine();

		// Valid first transition
		machine.transition("RUNNING", "start");

		// Invalid: RUNNING → READY
		expect(() => {
			machine.transition("READY", "invalid");
		}).toThrow(InvalidTransitionError);
		expect(() => {
			machine.transition("READY", "invalid");
		}).toThrow("Invalid state transition: RUNNING → READY");
	});

	it("canTransition returns correct boolean", () => {
		const machine = createTaskStateMachine();

		expect(machine.canTransition("RUNNING")).toBe(true);
		expect(machine.canTransition("READY")).toBe(true);
		expect(machine.canTransition("PAUSED")).toBe(false);
		expect(machine.canTransition("DONE")).toBe(false);
	});

	it("reset returns to initial state", () => {
		const machine = createTaskStateMachine();
		machine.transition("RUNNING", "start");
		machine.transition("PAUSED", "pause");

		machine.reset();

		expect(machine.currentState).toBe("READY");
		expect(machine.history).toHaveLength(0);
	});

	it("allows self-transition for READY and RUNNING", () => {
		const machine = createTaskStateMachine();

		// READY → READY (defer)
		machine.transition("READY", "defer");
		expect(machine.currentState).toBe("READY");

		machine.transition("RUNNING", "start");
		expect(machine.currentState).toBe("RUNNING");

		// RUNNING → RUNNING (extend)
		machine.transition("RUNNING", "extend");
		expect(machine.currentState).toBe("RUNNING");
	});
});
