/**
 * useLogger - Frontend logging hook with Tauri backend integration.
 *
 * Provides structured logging with levels and metadata.
 * Logs are sent to backend for persistent storage and console output.
 */

import { invoke } from "@tauri-apps/api/core";

/** Log levels for categorization */
export enum LogLevel {
	Debug = "debug",
	Info = "info",
	Warn = "warn",
	Error = "error",
}

/** Log entry metadata */
export interface LogMetadata {
	[key: string]: unknown;
}

/** Log entry structure */
export interface LogEntry {
	level: LogLevel;
	message: string;
	context?: string;
	metadata?: LogMetadata;
	timestamp?: string;
}

/**
 * Log a message to the backend and console.
 *
 * @param level - Log level
 * @param message - Log message
 * @param context - Optional context identifier (e.g., component name, function name)
 * @param metadata - Additional structured data
 */
async function log(
	level: LogLevel,
	message: string,
	context?: string,
	metadata?: LogMetadata,
): Promise<void> {
	const entry: LogEntry = {
		level,
		message,
		context,
		metadata,
		timestamp: new Date().toISOString(),
	};

	// Console output with styling
	const consoleMethod =
		level === LogLevel.Error ? "error" : level === LogLevel.Warn ? "warn" : "log";
	const prefix = context ? `[${context}]` : "";
	const styledMessage = `${prefix} ${message}`;

	// Include metadata in console
	if (metadata && Object.keys(metadata).length > 0) {
		console[consoleMethod](styledMessage, metadata);
	} else {
		console[consoleMethod](styledMessage);
	}

	// Send to backend if available (in Tauri)
	if (window.__TAURI__) {
		try {
			await invoke("cmd_log", { entry });
		} catch (err) {
			// Don't fail if logging fails
			console.error("[useLogger] Failed to send log to backend:", err);
		}
	}
}

/** Logger interface for convenient logging */
export interface Logger {
	debug: (message: string, metadata?: LogMetadata) => Promise<void>;
	info: (message: string, metadata?: LogMetadata) => Promise<void>;
	warn: (message: string, metadata?: LogMetadata) => Promise<void>;
	error: (message: string, metadata?: LogMetadata) => Promise<void>;
}

/**
 * Hook for logging with a specific context.
 *
 * @param context - Context identifier (e.g., component name)
 *
 * @example
 * ```tsx
 * const logger = useLogger("MyComponent");
 *
 * await logger.info("Component mounted");
 * await logger.warn("Something unexpected", { value: 42 });
 * await logger.error("Operation failed", { errorCode: 500 });
 * ```
 */
export function useLogger(context: string): Logger {
	return {
		debug: (message: string, metadata?: LogMetadata) =>
			log(LogLevel.Debug, message, context, metadata),
		info: (message: string, metadata?: LogMetadata) =>
			log(LogLevel.Info, message, context, metadata),
		warn: (message: string, metadata?: LogMetadata) =>
			log(LogLevel.Warn, message, context, metadata),
		error: (message: string, metadata?: LogMetadata) =>
			log(LogLevel.Error, message, context, metadata),
	};
}

/**
 * Global logger without context.
 */
export const globalLogger: Logger = {
	debug: (message: string, metadata?: LogMetadata) =>
		log(LogLevel.Debug, message, undefined, metadata),
	info: (message: string, metadata?: LogMetadata) =>
		log(LogLevel.Info, message, undefined, metadata),
	warn: (message: string, metadata?: LogMetadata) =>
		log(LogLevel.Warn, message, undefined, metadata),
	error: (message: string, metadata?: LogMetadata) =>
		log(LogLevel.Error, message, undefined, metadata),
};

/**
 * Log an error and optionally rethrow it.
 *
 * @param error - The error to log
 * @param context - Optional context
 * @param rethrow - Whether to rethrow the error (default: false)
 */
export async function logError(
	error: unknown,
	context?: string,
	rethrow: boolean = false,
): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await globalLogger.error(message, { error, context });
	if (rethrow) {
		throw error;
	}
}

/**
 * Wrap an async function with error logging.
 *
 * @param fn - The async function to wrap
 * @param context - Optional context for logging
 * @returns A wrapped function that logs errors
 */
export function withErrorLogging<T extends unknown[], R>(
	fn: (...args: T) => Promise<R>,
	context?: string,
): (...args: T) => Promise<R> {
	return async (...args: T): Promise<R> => {
		try {
			return await fn(...args);
		} catch (error) {
			await logError(error, context, false);
			throw error;
		}
	};
}
