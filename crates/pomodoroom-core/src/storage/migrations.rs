//! Database schema migrations for pomodoroom.
//!
//! Migrations are versioned and applied automatically when opening the database.
//! The `schema_version` table tracks the current migration version.

use rusqlite::{Connection, Result as SqliteResult};

/// Current schema version.
///
/// Increment this when adding new migrations.


/// Apply all pending migrations to bring the database to the current schema version.
///
/// # Errors
/// Returns an error if migration fails.
pub fn migrate(conn: &Connection) -> SqliteResult<()> {
    // Ensure schema_version table exists
    create_schema_version_table(conn)?;

    // Get current version
    let current_version = get_schema_version(conn);

    // Apply migrations sequentially
    if current_version < 1 {
        migrate_v1(conn)?;
    }
    if current_version < 2 {
        migrate_v2(conn)?;
    }
    if current_version < 3 {
        migrate_v3(conn)?;
    }

    Ok(())
}

/// Create the schema_version table if it doesn't exist.
fn create_schema_version_table(conn: &Connection) -> SqliteResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );",
    )
}

/// Get the current schema version from the database.
///
/// Returns 0 if no version is set (initial database).
fn get_schema_version(conn: &Connection) -> i32 {
    conn.query_row(
        "SELECT version FROM schema_version",
        [],
        |row| row.get::<_, i32>(0),
    )
    .unwrap_or_else(|e| {
        // If table doesn't exist or query fails, return 0
        if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
            0
        } else {
            eprintln!("Warning: failed to read schema_version: {}", e);
            0
        }
    })
}

/// Set the schema version in the database.
fn set_schema_version(conn: &Connection, version: i32) -> SqliteResult<()> {
    // Delete any existing version
    conn.execute("DELETE FROM schema_version", [])?;

    // Insert new version
    conn.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        [version],
    )?;

    Ok(())
}

/// Migration v1: Initial schema (baseline).
///
/// This migration represents the original schema before any migrations were tracked.
/// It's a no-op since the tables are created by ScheduleDb::migrate() directly.
fn migrate_v1(conn: &Connection) -> SqliteResult<()> {
    // Mark as v1 (tables already exist)
    set_schema_version(conn, 1)?;
    Ok(())
}

/// Migration v2: Add Task extension fields.
///
/// Adds the following columns to the tasks table:
/// - state: Task state (READY, RUNNING, PAUSED, DONE)
/// - estimated_minutes: Estimated duration in minutes
/// - elapsed_minutes: Actual elapsed time in minutes
/// - energy: Energy level (LOW, MEDIUM, HIGH)
/// - group_name: Task group name
/// - updated_at: Last update timestamp
/// - completed_at: Completion timestamp
/// - paused_at: Pause timestamp
/// - project_name: Project name (denormalized for convenience)
///
/// Also migrates existing data: completed=1 -> state=DONE, others -> READY.
fn migrate_v2(conn: &Connection) -> SqliteResult<()> {
    let tx = conn.unchecked_transaction()?;

    // Add new columns with default values
    tx.execute_batch(
        "ALTER TABLE tasks ADD COLUMN state TEXT NOT NULL DEFAULT 'READY';
         ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER;
         ALTER TABLE tasks ADD COLUMN elapsed_minutes INTEGER NOT NULL DEFAULT 0;
         ALTER TABLE tasks ADD COLUMN energy TEXT;
         ALTER TABLE tasks ADD COLUMN group_name TEXT;
         ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
         ALTER TABLE tasks ADD COLUMN completed_at TEXT;
         ALTER TABLE tasks ADD COLUMN paused_at TEXT;
         ALTER TABLE tasks ADD COLUMN project_name TEXT;",
    )?;

    // Migrate existing data: completed=1 -> state=DONE
    tx.execute(
        "UPDATE tasks SET state = 'DONE' WHERE completed = 1",
        [],
    )?;

    // Set updated_at from created_at for existing records
    tx.execute(
        "UPDATE tasks SET updated_at = created_at WHERE updated_at = ''",
        [],
    )?;

    // Set completed_at for completed tasks
    tx.execute(
        "UPDATE tasks SET completed_at = created_at WHERE completed = 1 AND completed_at IS NULL",
        [],
    )?;

    // Mark as v2
    tx.execute("DELETE FROM schema_version", [])?;
    tx.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        [2],
    )?;

    tx.commit()?;
    Ok(())
}

/// Migration v3: Add task kind and scheduling-bound fields.
///
/// Adds:
/// - kind: fixed_event | flex_window | duration_only | break
/// - required_minutes: required duration in minutes
/// - fixed_start_at / fixed_end_at
/// - window_start_at / window_end_at
fn migrate_v3(conn: &Connection) -> SqliteResult<()> {
    let tx = conn.unchecked_transaction()?;

    // Add new columns with default values (safe to run even if table already exists)
    tx.execute_batch(
        "ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'duration_only';
         ALTER TABLE tasks ADD COLUMN required_minutes INTEGER;
         ALTER TABLE tasks ADD COLUMN fixed_start_at TEXT;
         ALTER TABLE tasks ADD COLUMN fixed_end_at TEXT;
         ALTER TABLE tasks ADD COLUMN window_start_at TEXT;
         ALTER TABLE tasks ADD COLUMN window_end_at TEXT;",
    )?;

    // Backfill required_minutes from estimated_pomodoros if that column exists
    // (it may not exist in very old schemas)
    // Check if estimated_pomodoros column exists by querying table info
    let has_estimated_pomodoros: bool = tx
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'estimated_pomodoros'",
            [],
            |row| row.get::<_, i32>(0),
        )
        .unwrap_or(0)
        > 0;

    if has_estimated_pomodoros {
        tx.execute(
            "UPDATE tasks
             SET required_minutes = estimated_pomodoros * 25
             WHERE required_minutes IS NULL",
            [],
        )?;
    }

    // Mark as v3
    tx.execute("DELETE FROM schema_version", [])?;
    tx.execute(
        "INSERT INTO schema_version (version) VALUES (?1)",
        [3],
    )?;

    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test migration from scratch (v0 -> v3)
    #[test]
    fn test_migrate_from_scratch() {
        let conn = Connection::open_in_memory().unwrap();

        // Create initial v1 schema (without migration tracking)
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                estimated_pomodoros INTEGER NOT NULL DEFAULT 0,
                completed_pomodoros INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                project_id TEXT,
                tags TEXT NOT NULL DEFAULT '[]',
                priority INTEGER,
                category TEXT NOT NULL DEFAULT 'Active',
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        // Insert some test data
        conn.execute(
            "INSERT INTO tasks (id, title, completed, created_at)
             VALUES ('task1', 'Done task', 1, '2024-01-01T12:00:00Z')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO tasks (id, title, completed, created_at)
             VALUES ('task2', 'Active task', 0, '2024-01-01T12:00:00Z')",
            [],
        )
        .unwrap();

        // Run migrations
        migrate(&conn).unwrap();

        // Check version
        let version = get_schema_version(&conn);
        assert_eq!(version, 3);

        // Check that new columns exist
        let mut stmt = conn
            .prepare("SELECT state FROM tasks WHERE id = 'task1'")
            .unwrap();
        let state: String = stmt.query_row([], |row| row.get(0)).unwrap();
        assert_eq!(state, "DONE");

        let mut stmt = conn
            .prepare("SELECT state FROM tasks WHERE id = 'task2'")
            .unwrap();
        let state: String = stmt.query_row([], |row| row.get(0)).unwrap();
        assert_eq!(state, "READY");

        // Check that completed_at is set for done task
        let mut stmt = conn
            .prepare("SELECT completed_at FROM tasks WHERE id = 'task1'")
            .unwrap();
        let completed_at: Option<String> = stmt.query_row([], |row| row.get(0)).unwrap();
        assert!(completed_at.is_some());

        // Check that elapsed_minutes defaults to 0
        let mut stmt = conn
            .prepare("SELECT elapsed_minutes FROM tasks WHERE id = 'task2'")
            .unwrap();
        let elapsed_minutes: i32 = stmt.query_row([], |row| row.get(0)).unwrap();
        assert_eq!(elapsed_minutes, 0);

        let mut stmt = conn
            .prepare("SELECT kind, required_minutes FROM tasks WHERE id = 'task2'")
            .unwrap();
        let (kind, required_minutes): (String, Option<i32>) =
            stmt.query_row([], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
        assert_eq!(kind, "duration_only");
        assert_eq!(required_minutes, Some(0));
    }

    /// Test that migrations are idempotent
    #[test]
    fn test_migrate_idempotent() {
        let conn = Connection::open_in_memory().unwrap();

        // Create initial schema
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        // Run migrations twice
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();

        // Should still be at version 3
        let version = get_schema_version(&conn);
        assert_eq!(version, 3);
    }

    /// Test incremental migration (v1 -> v3)
    #[test]
    fn test_incremental_migration() {
        let conn = Connection::open_in_memory().unwrap();

        // Create schema_version table at v1
        conn.execute(
            "CREATE TABLE schema_version (version INTEGER PRIMARY KEY)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO schema_version (version) VALUES (1)",
            [],
        )
        .unwrap();

        // Create tasks table (v1)
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        // Run migrations
        migrate(&conn).unwrap();

        // Should be at version 3
        let version = get_schema_version(&conn);
        assert_eq!(version, 3);

        // New columns should exist
        let stmt = conn
            .prepare("SELECT state, elapsed_minutes, kind, required_minutes FROM tasks")
            .unwrap();
        // Query should not fail (columns exist)
        drop(stmt);
    }
}
