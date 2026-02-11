/**
 * mockTauriInvoke — Helper for mocking Tauri invoke commands in tests.
 *
 * Provides utilities for setting up mock responses, tracking calls,
 * and simulating async Tauri IPC behavior.
 */

import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

// Mock Tauri invoke for all tests
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

// ─── Types ───────────────────────────────────────────────────────────────────────

export type MockInvoke = ReturnType<typeof vi.fn>;

export interface InvokeCall {
	command: string;
	args: Record<string, unknown>;
}

// ─── Mock Setup Helpers ────────────────────────────────────────────────────────

/**
 * Create a fresh invoke mock with optional default responses.
 */
export function createMockInvoke(
	defaultResponses?: Record<string, unknown>
): MockInvoke {
	const mock = vi.fn();

	// Set up default responses if provided
	if (defaultResponses) {
		for (const [command, response] of Object.entries(defaultResponses)) {
			mock.mockImplementation((cmd: string) => {
				if (cmd === command) {
					return Promise.resolve(response);
				}
				return Promise.reject(new Error(`Unknown command: ${cmd}`));
			});
		}
	}

	return mock;
}

/**
 * Reset invoke mock state between tests.
 * Clears all calls and resets implementation.
 */
export function resetMockInvoke(mock: MockInvoke): void {
	mock.mockClear();
	mock.mockReset();
}

/**
 * Setup invoke to resolve with a value for a specific command.
 */
export function mockResolve(
	mock: MockInvoke,
	command: string,
	value: unknown
): void {
	mock.mockImplementation((cmd: string) => {
		if (cmd === command) {
			return Promise.resolve(value);
		}
		return Promise.reject(new Error(`Unknown command: ${cmd}`));
	});
}

/**
 * Setup invoke to reject for a specific command.
 */
export function mockReject(
	mock: MockInvoke,
	command: string,
	error: string | Error
): void {
	mock.mockImplementation((cmd: string) => {
		if (cmd === command) {
			return Promise.reject(error instanceof Error ? error : new Error(error));
		}
		return Promise.reject(new Error(`Unknown command: ${cmd}`));
	});
}

/**
 * Setup invoke to handle multiple commands with different responses.
 */
export function mockCommands(
	mock: MockInvoke,
	commands: Record<string, unknown | (() => Promise<unknown>)>
): void {
	mock.mockImplementation((cmd: string, args?: unknown) => {
		const handler = commands[cmd];
		if (handler === undefined) {
			return Promise.reject(new Error(`Unknown command: ${cmd}`));
		}
		if (typeof handler === "function") {
			return (handler as () => Promise<unknown>)(args);
		}
		return Promise.resolve(handler);
	});
}

// ─── Call Tracking ───────────────────────────────────────────────────────────────

/**
 * Get all calls made to invoke.
 */
export function getCalls(mock: MockInvoke): InvokeCall[] {
	return mock.mock.calls.map(([command, args]) => ({
		command,
		args: args as Record<string, unknown>,
	}));
}

/**
 * Get calls for a specific command.
 */
export function getCallsForCommand(mock: MockInvoke, command: string): unknown[] {
	return mock.mock.calls
		.filter(([cmd]) => cmd === command)
		.map(([, args]) => args);
}

/**
 * Get the number of times a command was called.
 */
export function getCallCount(mock: MockInvoke, command: string): number {
	return mock.mock.calls.filter(([cmd]) => cmd === command).length;
}

/**
 * Assert a command was called with specific arguments.
 */
export function expectCalledWith(
	mock: MockInvoke,
	command: string,
	args: Record<string, unknown>
): void {
	const calls = getCallsForCommand(mock, command);
	expect(calls).toContainEqual(args);
}

/**
 * Assert a command was called exactly once.
 */
export function expectCalledOnce(mock: MockInvoke, command: string): void {
	expect(getCallCount(mock, command)).toBe(1);
}

/**
 * Assert a command was never called.
 */
export function expectNotCalled(mock: MockInvoke, command: string): void {
	expect(getCallCount(mock, command)).toBe(0);
}

// ─── Matchers ────────────────────────────────────────────────────────────────────

/**
 * Create a matcher for partial object matching in args.
 */
export function partialMatch(expected: Record<string, unknown>): Record<string, unknown> {
	return expect.objectContaining(expected);
}

// ─── Export mock instance for direct use ─────────────────────────────────────

export { invoke } from "@tauri-apps/api/core";
