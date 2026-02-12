/**
 * setupTestDb — Test SQLite database setup helper.
 *
 * Creates temporary SQLite databases for testing database operations.
 * Each test gets an isolated database that is cleaned up after the test.
 */

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// @ts-ignore
import Database from "better-sqlite3";

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface TestDbSetup {
	db: any;
	dbPath: string;
	tempDir: string;
	cleanup: () => void;
}

export interface TestDbOptions {
	/**
	 * Schema SQL to run after creating the database.
	 */
	schema?: string;
	/**
	 * Seed data SQL to insert after schema.
	 */
	seed?: string;
}

// ─── Default Schema (matches Pomodoroom's schema) ───────────────────────────

const DEFAULT_SCHEMA = `
-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	description TEXT,
	state TEXT NOT NULL,
	priority INTEGER DEFAULT 50,
	project_id TEXT,
	tags TEXT,
	estimated_pomodoros INTEGER DEFAULT 1,
	completed_pomodoros INTEGER DEFAULT 0,
	completed INTEGER DEFAULT 0,
	category TEXT DEFAULT 'active',
	created_at TEXT NOT NULL,
	estimated_minutes INTEGER DEFAULT 25,
	elapsed_minutes INTEGER DEFAULT 0,
	energy TEXT DEFAULT 'medium',
	"group" TEXT,
	updated_at TEXT NOT NULL,
	completed_at TEXT,
	paused_at TEXT
);

-- Sessions table for Pomodoro sessions
CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	task_id TEXT NOT NULL,
	start_time TEXT NOT NULL,
	end_time TEXT,
	planned_duration INTEGER NOT NULL,
	actual_duration INTEGER,
	completed INTEGER DEFAULT 0,
	pressure_events TEXT,
	FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- OAuth tokens for external integrations
CREATE TABLE IF NOT EXISTS oauth_tokens (
	service_name TEXT PRIMARY KEY,
	tokens_json TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

-- Calendar selections
CREATE TABLE IF NOT EXISTS calendar_selections (
	service_name TEXT NOT NULL,
	calendar_id TEXT NOT NULL,
	selected INTEGER NOT NULL DEFAULT 1,
	PRIMARY KEY (service_name, calendar_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
`;

// ─── Test Database Creation ─────────────────────────────────────────────────────

/**
 * Create a temporary test database.
 *
 * @param options - Schema and seed data options
 * @returns Test database setup with cleanup function
 *
 * @example
 * ```ts
 * const { db, cleanup } = createTestDb({
 *   schema: DEFAULT_SCHEMA,
 *   seed: "INSERT INTO tasks (id, title, state) VALUES ('1', 'Test', 'READY');"
 * });
 *
 * // ... run tests ...
 *
 * cleanup();
 * ```
 */
export function createTestDb(options: TestDbOptions = {}): TestDbSetup {
	// Create unique temp directory for this test
	const tempDir = mkdtempSync(join(tmpdir(), "pomodoroom-test-"));
	const dbPath = join(tempDir, "test.db");

	// Create database connection
	const db = new Database(dbPath);

	// Enable foreign keys
	db.pragma("foreign_keys = ON");

	// Run schema if provided
	const schema = options.schema ?? DEFAULT_SCHEMA;
	db.exec(schema);

	// Run seed data if provided
	if (options.seed) {
		db.exec(options.seed);
	}

	// Return cleanup function
	const cleanup = () => {
		db.close();
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	};

	return {
		db,
		dbPath,
		tempDir,
		cleanup,
	};
}

/**
 * Create multiple test databases for parallel testing.
 *
 * @param count - Number of databases to create
 * @param options - Schema and seed data options
 * @returns Array of test database setups
 */
export function createTestDbs(
	count: number,
	options: TestDbOptions = {}
): TestDbSetup[] {
	return Array.from({ length: count }, () => createTestDb(options));
}

// ─── Seed Data Helpers ────────────────────────────────────────────────────────

/**
 * Generate a single task row for seeding.
 */
export function taskRow(task: {
	id: string;
	title: string;
	state: string;
	priority?: number;
	description?: string;
}): string {
	return `
		INSERT INTO tasks (
			id, title, description, state, priority,
			project_id, tags, estimated_pomodoros, completed_pomodoros,
			completed, category, created_at, estimated_minutes,
			elapsed_minutes, energy, "group", updated_at
		) VALUES (
			'${task.id}',
			'${task.title}',
			'${task.description ?? ""}',
			'${task.state}',
			${task.priority ?? 50},
			NULL,
			'[]',
			1,
			0,
			0,
			'active',
			datetime('now'),
			25,
			0,
			'medium',
			NULL,
			datetime('now')
		);
	`;
}

/**
 * Generate OAuth token row for seeding.
 */
export function oauthTokenRow(serviceName: string, tokens: Record<string, unknown>): string {
	return `
		INSERT INTO oauth_tokens (service_name, tokens_json, updated_at)
		VALUES (
			'${serviceName}',
			'${JSON.stringify(tokens)}',
			datetime('now')
		);
	`;
}

/**
 * Generate a session row for seeding.
 */
export function sessionRow(session: {
	id: string;
	taskId: string;
	startTime: string;
	plannedDuration: number;
	completed?: boolean;
}): string {
	return `
		INSERT INTO sessions (
			id, task_id, start_time, planned_duration,
			completed, pressure_events
		) VALUES (
			'${session.id}',
			'${session.taskId}',
			'${session.startTime}',
			${session.plannedDuration},
			${session.completed ? 1 : 0},
			NULL
		);
	`;
}

// ─── Query Helpers ─────────────────────────────────────────────────────────────

/**
 * Count rows in a table.
 */
export function countRows(db: any, table: string): number {
	const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as {
		count: number;
	};
	return result.count;
}

/**
 * Get all rows from a table.
 */
export function getAllRows<T = Record<string, unknown>>(db: any, table: string): T[] {
	return db.prepare(`SELECT * FROM ${table}`).all() as T[];
}

/**
 * Assert a row exists in a table.
 */
export function assertRowExists(
	db: any,
	table: string,
	where: Record<string, unknown>
): boolean {
	const conditions = Object.entries(where)
		.map(([col, val]) => `${col} = ${typeof val === "string" ? `'${val}'` : val}`)
		.join(" AND ");
	const result = db
		.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${conditions}`)
		.get() as { count: number };
	return result.count > 0;
}

// ─── Common Seeds ───────────────────────────────────────────────────────────────

/**
 * Common seed data for Google Calendar tests.
 */
export function seedGoogleTokens(db: any): void {
	const future = Math.floor(Date.now() / 1000) + 3600;
	db.exec(
		oauthTokenRow("google_calendar", {
			access_token: "test_access_token",
			refresh_token: "test_refresh_token",
			expires_at: future,
		})
	);
}

/**
 * Common seed data for task tests.
 */
export function seedTasks(db: Database): void {
	db.exec(`
		${taskRow({ id: "task-1", title: "Task 1", state: "READY", priority: 80 })}
		${taskRow({ id: "task-2", title: "Task 2", state: "RUNNING", priority: 50 })}
		${taskRow({ id: "task-3", title: "Task 3", state: "PAUSED", priority: 30 })}
		${taskRow({ id: "task-4", title: "Task 4", state: "DONE", priority: 10 })}
	`);
}
