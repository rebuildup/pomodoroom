/**
 * Tests for task duration estimation.
 */

import { describe, it, expect } from "vitest";
import {
	estimateTaskDuration,
	estimateTaskDurationWithConfidence,
	estimateTaskDurationRounded,
} from "./task-duration-estimation";

describe("task-duration-estimation", () => {
	describe("estimateTaskDuration", () => {
		it("should return 60 minutes for default task", () => {
			const result = estimateTaskDuration("Default task");
			expect(result).toBe(60);
		});

		it("should extract explicit hour duration", () => {
			const result = estimateTaskDuration("Task", "Estimated 2 hours");
			expect(result).toBe(120);
		});

		it("should extract explicit minute duration", () => {
			const result = estimateTaskDuration("Task", "Will take 45 minutes");
			expect(result).toBe(45);
		});

		it("should extract pomodoro count", () => {
			const result = estimateTaskDuration("Task", "About 3 pomodoros");
			expect(result).toBe(75); // 3 * 25
		});

		it("should estimate bug fix tasks as 45 minutes", () => {
			const result = estimateTaskDuration("Fix login bug");
			expect(result).toBe(45);
		});

		it("should estimate feature tasks as 90 minutes", () => {
			const result = estimateTaskDuration("Implement dark mode toggle");
			expect(result).toBe(90);
		});

		it("should estimate review tasks as 30 minutes", () => {
			const result = estimateTaskDuration("Review PR #123");
			expect(result).toBe(30);
		});

		it("should estimate meeting tasks as 60 minutes", () => {
			const result = estimateTaskDuration("Team sync meeting");
			expect(result).toBe(60);
		});

		it("should estimate quick fix tasks as 30 minutes", () => {
			const result = estimateTaskDuration("Quick fix: typo");
			expect(result).toBeGreaterThanOrEqual(30);
			expect(result).toBeLessThan(60);
		});

		it("should estimate refactor tasks as 120 minutes", () => {
			const result = estimateTaskDuration("Refactor auth module");
			expect(result).toBe(120);
		});

		it("should handle empty notes gracefully", () => {
			const result = estimateTaskDuration("Simple task");
			expect(result).toBeGreaterThanOrEqual(30);
			expect(result).toBeLessThanOrEqual(120);
		});
	});

	describe("estimateTaskDurationWithConfidence", () => {
		it("should return high confidence for explicit duration", () => {
			const result = estimateTaskDurationWithConfidence("Task", "Takes 2h");
			expect(result.baseMinutes).toBe(120);
			expect(result.confidence).toBe(0.9);
			expect(result.hints).toContain("explicit-duration");
		});

		it("should return medium confidence for pattern match", () => {
			const result = estimateTaskDurationWithConfidence("Fix bug in login");
			expect(result.baseMinutes).toBe(45);
			expect(result.confidence).toBe(0.7);
			expect(result.hints).toContain("pattern-match");
		});

		it("should return low confidence for complexity-based estimate", () => {
			const result = estimateTaskDurationWithConfidence("Random task");
			expect(result.confidence).toBeLessThan(0.6);
		});
	});

	describe("estimateTaskDurationRounded", () => {
		it("should round to nearest 15 minutes", () => {
			const result = estimateTaskDurationRounded("Task", "About 37 min");
			expect(result).toBe(30); // 37 -> 30 (nearest 15)
		});

		it("should round 90 minute tasks correctly", () => {
			const result = estimateTaskDurationRounded("Implement feature");
			expect(result).toBe(90); // Already at 15min increment
		});

		it("should round 45 minute bug fix correctly", () => {
			const result = estimateTaskDurationRounded("Fix bug");
			expect(result).toBe(45); // Already at 15min increment
		});
	});
});
