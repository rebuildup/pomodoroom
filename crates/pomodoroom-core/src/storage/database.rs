//! SQLite-based session storage and statistics.
//!
//! Provides persistent storage for:
//! - Completed Pomodoro sessions
//! - Session statistics (daily and all-time)
//! - Key-value store for application state

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::timer::StepType;

use super::data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: i64,
    pub step_type: String,
    pub step_label: String,
    pub duration_min: u64,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub task_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Stats {
    pub total_sessions: u64,
    pub total_focus_min: u64,
    pub total_break_min: u64,
    pub completed_pomodoros: u64,
    pub today_sessions: u64,
    pub today_focus_min: u64,
}

/// Row type for session queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRow {
    pub completed_at: String,
    pub step_type: String,
    pub duration_min: i64,
    pub task_id: Option<String>,
    pub project_name: Option<String>,
}

/// Row type for operation log queries (CRDT merge).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationLogRow {
    pub id: String,
    pub operation_type: String,
    pub data: String,
    pub lamport_ts: u64,
    pub device_id: String,
    pub vector_clock: Option<String>,
    pub created_at: String,
}

/// Row type for break adherence queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakAdherenceRow {
    pub completed_at: String,
    pub step_type: String,
    pub duration_min: i64,
    pub project_id: Option<String>,
    pub hour: u8,
    pub day_of_week: u8,
}

/// Row type for energy curve data queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyCurveRow {
    pub hour: u8,
    pub day_of_week: u8,
    pub session_count: u64,
    pub completed_count: u64,
    pub total_expected_min: u64,
    pub total_actual_min: u64,
}

/// SQLite database for session storage.
///
/// Stores completed Pomodoro sessions and provides statistics.
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Get a reference to the underlying SQLite connection.
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Open the database at `~/.config/pomodoroom/pomodoroom.db`.
    ///
    /// Creates the database file and schema if they don't exist.
    ///
    /// # Errors
    /// Returns an error if the database cannot be opened or migrated.
    pub fn open() -> Result<Self, Box<dyn std::error::Error>> {
        let path = data_dir()?.join("pomodoroom.db");
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    /// Open an in-memory database (primarily for tests and ephemeral usage).
    pub fn open_memory() -> Result<Self, Box<dyn std::error::Error>> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                step_type   TEXT NOT NULL,
                step_label  TEXT NOT NULL DEFAULT '',
                duration_min INTEGER NOT NULL,
                started_at  TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                task_id     TEXT,
                project_id  TEXT
            );

            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Ensure projects table exists for LEFT JOIN queries
            -- This table is also created by ScheduleDb but needed here for session queries
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                deadline TEXT,
                created_at TEXT NOT NULL
            );

            -- Checkpoints for fast event replay
            CREATE TABLE IF NOT EXISTS checkpoints (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                state_snapshot TEXT NOT NULL
            );

            -- Operation log for CRDT-style conflict-free merge
            CREATE TABLE IF NOT EXISTS operation_log (
                id TEXT PRIMARY KEY,
                operation_type TEXT NOT NULL,
                data TEXT NOT NULL,
                lamport_ts INTEGER NOT NULL,
                device_id TEXT NOT NULL,
                vector_clock TEXT,
                created_at TEXT NOT NULL
            );

            -- Calendar shards for multi-tenant event storage
            CREATE TABLE IF NOT EXISTS calendar_shards (
                shard_key TEXT PRIMARY KEY,
                shard_type TEXT NOT NULL,
                event_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                rotated_at TEXT
            );",
        )?;

        // Migration: add columns for existing DBs while surfacing unexpected errors.
        for stmt in &[
            "ALTER TABLE sessions ADD COLUMN task_id TEXT",
            "ALTER TABLE sessions ADD COLUMN project_id TEXT",
        ] {
            if let Err(e) = self.conn.execute(stmt, []) {
                let msg = e.to_string().to_ascii_lowercase();
                if !msg.contains("duplicate column") && !msg.contains("already exists") {
                    return Err(e);
                }
            }
        }

        // Create indexes only after legacy-column migrations have run.
        self.conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions(completed_at);
             CREATE INDEX IF NOT EXISTS idx_sessions_step_type ON sessions(step_type);
             CREATE INDEX IF NOT EXISTS idx_sessions_completed_at_step_type ON sessions(completed_at, step_type);
             CREATE INDEX IF NOT EXISTS idx_sessions_task_id ON sessions(task_id);
             CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);",
        )?;

        Ok(())
    }

    /// Record a completed session to the database.
    ///
    /// # Errors
    /// Returns an error if the insert fails.
    pub fn record_session(
        &self,
        step_type: StepType,
        step_label: &str,
        duration_min: u64,
        started_at: DateTime<Utc>,
        completed_at: DateTime<Utc>,
        task_id: Option<&str>,
        project_id: Option<&str>,
    ) -> Result<i64, rusqlite::Error> {
        let type_str = match step_type {
            StepType::Focus => "focus",
            StepType::Break => "break",
        };
        self.conn.execute(
            "INSERT INTO sessions (step_type, step_label, duration_min, started_at, completed_at, task_id, project_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                type_str,
                step_label,
                duration_min,
                started_at.to_rfc3339(),
                completed_at.to_rfc3339(),
                task_id,
                project_id,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn stats_today(&self) -> Result<Stats, rusqlite::Error> {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let mut stmt = self.conn.prepare(
            "SELECT step_type, COUNT(*), COALESCE(SUM(duration_min), 0)
             FROM sessions
             WHERE completed_at >= ?1
             GROUP BY step_type",
        )?;

        let mut stats = Stats::default();
        let rows = stmt.query_map(params![format!("{today}T00:00:00+00:00")], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u64>(1)?,
                row.get::<_, u64>(2)?,
            ))
        })?;

        for row in rows {
            let (step_type, count, minutes) = row?;
            stats.total_sessions += count;
            match step_type.as_str() {
                "focus" => {
                    stats.completed_pomodoros += count;
                    stats.total_focus_min += minutes;
                    stats.today_sessions += count;
                    stats.today_focus_min += minutes;
                }
                "break" => {
                    stats.total_break_min += minutes;
                }
                _ => {}
            }
        }
        Ok(stats)
    }

    pub fn stats_all(&self) -> Result<Stats, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT step_type, COUNT(*), COALESCE(SUM(duration_min), 0)
             FROM sessions
             GROUP BY step_type",
        )?;

        let today = Utc::now().format("%Y-%m-%d").to_string();
        let mut stats = Stats::default();
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u64>(1)?,
                row.get::<_, u64>(2)?,
            ))
        })?;

        for row in rows {
            let (step_type, count, minutes) = row?;
            stats.total_sessions += count;
            match step_type.as_str() {
                "focus" => {
                    stats.completed_pomodoros += count;
                    stats.total_focus_min += minutes;
                }
                "break" => {
                    stats.total_break_min += minutes;
                }
                _ => {}
            }
        }

        // Today's sessions
        let mut stmt2 = self.conn.prepare(
            "SELECT COUNT(*), COALESCE(SUM(duration_min), 0)
             FROM sessions
             WHERE step_type = 'focus' AND completed_at >= ?1",
        )?;
        let row = stmt2.query_row(params![format!("{today}T00:00:00+00:00")], |row| {
            Ok((row.get::<_, u64>(0)?, row.get::<_, u64>(1)?))
        })?;
        stats.today_sessions = row.0;
        stats.today_focus_min = row.1;

        Ok(stats)
    }

    /// Get sessions for a specific date.
    pub fn get_sessions_by_date(&self, date: &str) -> Result<Vec<SessionRow>, rusqlite::Error> {
        let start = format!("{date}T00:00:00+00:00");
        let end = format!("{date}T23:59:59+00:00");

        let mut stmt = self.conn.prepare(
            "SELECT s.completed_at, s.step_type, s.duration_min, s.task_id, p.name as project_name
             FROM sessions s
             LEFT JOIN projects p ON s.project_id = p.id
             WHERE s.completed_at >= ?1 AND s.completed_at <= ?2
             ORDER BY s.completed_at DESC",
        )?;

        let rows = stmt.query_map(params![start, end], |row| {
            Ok(SessionRow {
                completed_at: row.get(0)?,
                step_type: row.get(1)?,
                duration_min: row.get(2)?,
                task_id: row.get(3)?,
                project_name: row.get(4)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    /// Get sessions within a date range.
    pub fn get_sessions_by_range(
        &self,
        start: &str,
        end: &str,
    ) -> Result<Vec<SessionRow>, rusqlite::Error> {
        let start = format!("{start}T00:00:00+00:00");
        let end = format!("{end}T23:59:59+00:00");

        let mut stmt = self.conn.prepare(
            "SELECT s.completed_at, s.step_type, s.duration_min, s.task_id, p.name as project_name
             FROM sessions s
             LEFT JOIN projects p ON s.project_id = p.id
             WHERE s.completed_at >= ?1 AND s.completed_at <= ?2
             ORDER BY s.completed_at DESC",
        )?;

        let rows = stmt.query_map(params![start, end], |row| {
            Ok(SessionRow {
                completed_at: row.get(0)?,
                step_type: row.get(1)?,
                duration_min: row.get(2)?,
                task_id: row.get(3)?,
                project_name: row.get(4)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    /// Get all sessions, most recent first, with optional limit.
    pub fn get_all_sessions(&self, limit: usize) -> Result<Vec<SessionRow>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT s.completed_at, s.step_type, s.duration_min, s.task_id, p.name as project_name
             FROM sessions s
             LEFT JOIN projects p ON s.project_id = p.id
             ORDER BY s.completed_at DESC
             LIMIT {}",
            limit
        ))?;

        let rows = stmt.query_map([], |row| {
            Ok(SessionRow {
                completed_at: row.get(0)?,
                step_type: row.get(1)?,
                duration_min: row.get(2)?,
                task_id: row.get(3)?,
                project_name: row.get(4)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    /// Get a value from the kv store.
    pub fn kv_get(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT value FROM kv WHERE key = ?1")?;
        let result = stmt.query_row(params![key], |row| row.get::<_, String>(0));
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Set a value in the kv store.
    pub fn kv_set(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "INSERT OR REPLACE INTO kv (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    // Checkpoint functions for fast replay

    /// Create a new checkpoint with the given state snapshot.
    ///
    /// Returns the checkpoint ID.
    pub fn create_checkpoint(&self, state: &str) -> Result<String, rusqlite::Error> {
        let id = format!("ckpt_{}", chrono::Utc::now().timestamp());
        let created_at = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO checkpoints (id, created_at, state_snapshot) VALUES (?1, ?2, ?3)",
            params![&id, created_at, state],
        )?;
        Ok(id)
    }

    /// Get the most recent checkpoint.
    pub fn get_latest_checkpoint(&self) -> Result<Option<(String, String, String)>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, created_at, state_snapshot FROM checkpoints ORDER BY created_at DESC LIMIT 1"
        )?;
        let result = stmt.query_row([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        });
        match result {
            Ok(checkpoint) => Ok(Some(checkpoint)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Delete checkpoints older than the specified number of months.
    /// Keeps the most recent checkpoint regardless of age.
    pub fn cleanup_old_checkpoints(&self, months_to_keep: i64) -> Result<usize, rusqlite::Error> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(30 * months_to_keep);
        let cutoff_str = cutoff.to_rfc3339();
        self.conn.execute(
            "DELETE FROM checkpoints
             WHERE created_at < ?1
             AND id != (SELECT id FROM checkpoints ORDER BY created_at DESC LIMIT 1)",
            params![cutoff_str],
        )
    }

    /// Get sessions since the given checkpoint time (for differential replay).
    pub fn get_sessions_since(&self, since: &str) -> Result<Vec<SessionRow>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT s.completed_at, s.step_type, s.duration_min, s.task_id, p.name as project_name
             FROM sessions s
             LEFT JOIN projects p ON s.project_id = p.id
             WHERE s.completed_at > ?1
             ORDER BY s.completed_at ASC",
        )?;

        let rows = stmt.query_map(params![since], |row| {
            Ok(SessionRow {
                completed_at: row.get(0)?,
                step_type: row.get(1)?,
                duration_min: row.get(2)?,
                task_id: row.get(3)?,
                project_name: row.get(4)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    // CRDT Operation Log functions for conflict-free merge

    /// Append an operation to the operation log.
    pub fn append_operation(
        &self,
        operation_id: &str,
        operation_type: &str,
        data: &str,
        lamport_ts: u64,
        device_id: &str,
        vector_clock: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO operation_log (id, operation_type, data, lamport_ts, device_id, vector_clock, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                operation_id,
                operation_type,
                data,
                lamport_ts as i64,
                device_id,
                vector_clock,
                created_at,
            ],
        )?;
        Ok(())
    }

    /// Get all operations since a given Lamport timestamp.
    pub fn get_operations_since(&self, since_ts: u64) -> Result<Vec<OperationLogRow>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, operation_type, data, lamport_ts, device_id, vector_clock, created_at
             FROM operation_log
             WHERE lamport_ts > ?1
             ORDER BY lamport_ts ASC",
        )?;

        let rows = stmt.query_map(params![since_ts as i64], |row| {
            Ok(OperationLogRow {
                id: row.get(0)?,
                operation_type: row.get(1)?,
                data: row.get(2)?,
                lamport_ts: row.get::<_, i64>(3)? as u64,
                device_id: row.get(4)?,
                vector_clock: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;

        let mut operations = Vec::new();
        for row in rows {
            operations.push(row?);
        }
        Ok(operations)
    }

    /// Get the maximum Lamport timestamp in the operation log.
    pub fn get_max_lamport_ts(&self) -> Result<u64, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT COALESCE(MAX(lamport_ts), 0) FROM operation_log")?;
        let max_ts = stmt.query_row([], |row| row.get::<_, i64>(0))?;
        Ok(max_ts.max(0) as u64)
    }

    /// Merge remote operations using deterministic Last-Writer-Wins based on Lamport timestamps.
    /// Returns the number of operations merged.
    pub fn merge_operations(&self, operations: &[OperationLogRow]) -> Result<usize, rusqlite::Error> {
        let mut merged = 0;
        for op in operations {
            // Check if operation already exists (by ID) to avoid duplicates
            let exists: bool = self.conn.query_row(
                "SELECT COUNT(*) FROM operation_log WHERE id = ?1",
                params![&op.id],
                |row| row.get::<_, i64>(0).map(|c| c > 0),
            )?;

            if !exists {
                self.conn.execute(
                    "INSERT INTO operation_log (id, operation_type, data, lamport_ts, device_id, vector_clock, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        &op.id,
                        &op.operation_type,
                        &op.data,
                        op.lamport_ts as i64,
                        &op.device_id,
                        &op.vector_clock,
                        &op.created_at,
                    ],
                )?;
                merged += 1;
            }
        }
        Ok(merged)
    }

    // Calendar Shard functions for multi-tenant storage

    /// Get or create a calendar shard
    pub fn get_or_create_shard(&self, shard_key: &str, shard_type: &str) -> Result<(), rusqlite::Error> {
        let exists: bool = self.conn.query_row(
            "SELECT COUNT(*) FROM calendar_shards WHERE shard_key = ?1",
            params![shard_key],
            |row| row.get::<_, i64>(0).map(|c| c > 0),
        )?;

        if !exists {
            let now = Utc::now().to_rfc3339();
            self.conn.execute(
                "INSERT INTO calendar_shards (shard_key, shard_type, event_count, created_at)
                 VALUES (?1, ?2, 0, ?3)",
                params![shard_key, shard_type, now],
            )?;
        }
        Ok(())
    }

    /// Increment event count for a shard
    pub fn increment_shard_event_count(&self, shard_key: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE calendar_shards SET event_count = event_count + 1 WHERE shard_key = ?1",
            params![shard_key],
        )?;
        Ok(())
    }

    /// Get event count for a shard
    pub fn get_shard_event_count(&self, shard_key: &str) -> Result<usize, rusqlite::Error> {
        let count = self.conn.query_row(
            "SELECT event_count FROM calendar_shards WHERE shard_key = ?1",
            params![shard_key],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(count.max(0) as usize)
    }

    /// Get all shards (for aggregation)
    pub fn get_all_shards(&self) -> Result<Vec<ShardInfo>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT shard_key, shard_type, event_count, created_at, rotated_at
             FROM calendar_shards
             ORDER BY shard_key",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(ShardInfo {
                shard_key: row.get(0)?,
                shard_type: row.get(1)?,
                event_count: row.get::<_, i64>(2)? as usize,
                created_at: row.get(3)?,
                rotated_at: row.get(4)?,
            })
        })?;

        let mut shards = Vec::new();
        for row in rows {
            shards.push(row?);
        }
        Ok(shards)
    }

    /// Mark a shard as rotated (create new shard for same logical partition)
    pub fn rotate_shard(&self, shard_key: &str, new_shard_key: &str) -> Result<(), rusqlite::Error> {
        let now = Utc::now().to_rfc3339();

        // Mark old shard as rotated
        self.conn.execute(
            "UPDATE calendar_shards SET rotated_at = ?1 WHERE shard_key = ?2",
            params![now, shard_key],
        )?;

        // Create new shard
        self.conn.execute(
            "INSERT INTO calendar_shards (shard_key, shard_type, event_count, created_at)
             VALUES (?1, (SELECT shard_type FROM calendar_shards WHERE shard_key = ?2), 0, ?3)",
            params![new_shard_key, shard_key, now],
        )?;
        Ok(())
    }

    // Break Adherence functions for analytics dashboard

    /// Get break adherence data from sessions within a date range.
    ///
    /// Returns session data with hour and day-of-week information for break adherence analysis.
    pub fn get_break_adherence_data(
        &self,
        start: &str,
        end: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<BreakAdherenceRow>, rusqlite::Error> {
        let start_ts = format!("{}T00:00:00+00:00", start);
        let end_ts = format!("{}T23:59:59+00:00", end);

        // Use a single query with optional project filter via COALESCE
        let query =
            "SELECT s.completed_at, s.step_type, s.duration_min, s.project_id,
                    CAST(strftime('%H', s.completed_at) AS INTEGER) as hour,
                    CAST(strftime('%w', s.completed_at) AS INTEGER) as day_of_week
             FROM sessions s
             WHERE s.completed_at >= ?1 AND s.completed_at <= ?2
               AND (?3 IS NULL OR s.project_id = ?3)
             ORDER BY s.completed_at ASC";

        let mut stmt = self.conn.prepare(query)?;

        let rows = stmt.query_map(params![start_ts, end_ts, project_id], |row| {
            Ok(BreakAdherenceRow {
                completed_at: row.get(0)?,
                step_type: row.get(1)?,
                duration_min: row.get(2)?,
                project_id: row.get(3)?,
                hour: row.get::<_, i64>(4)? as u8,
                day_of_week: row.get::<_, i64>(5)? as u8,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    /// Get all sessions for diagnostics export (full records with timestamps).
    pub fn get_all_session_records(&self) -> Result<Vec<SessionRecord>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, step_type, step_label, duration_min, started_at, completed_at, task_id, project_id
             FROM sessions
             ORDER BY started_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let started_at_str: String = row.get(4)?;
            let completed_at_str: String = row.get(5)?;

            let started_at = chrono::DateTime::parse_from_rfc3339(&started_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            let completed_at = chrono::DateTime::parse_from_rfc3339(&completed_at_str)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            Ok(SessionRecord {
                id: row.get(0)?,
                step_type: row.get(1)?,
                step_label: row.get(2)?,
                duration_min: row.get::<_, i64>(3)? as u64,
                started_at,
                completed_at,
                task_id: row.get(6)?,
                project_id: row.get(7)?,
            })
        })?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    /// Get energy curve data aggregated by hour and day of week.
    ///
    /// Returns aggregated session data for computing energy curves.
    /// Only includes focus sessions within the optional date range.
    pub fn get_energy_curve_data(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> Result<Vec<EnergyCurveRow>, rusqlite::Error> {
        // Helper function to map a row to EnergyCurveRow
        fn map_row(row: &rusqlite::Row) -> rusqlite::Result<EnergyCurveRow> {
            Ok(EnergyCurveRow {
                hour: row.get::<_, i64>(0)? as u8,
                day_of_week: row.get::<_, i64>(1)? as u8,
                session_count: row.get::<_, i64>(2)? as u64,
                completed_count: row.get::<_, i64>(3)? as u64,
                total_expected_min: row.get::<_, i64>(4)? as u64,
                total_actual_min: row.get::<_, i64>(5)? as u64,
            })
        }

        let mut results = Vec::new();

        if let (Some(start), Some(end)) = (start_date, end_date) {
            let query = "SELECT
                CAST(strftime('%H', completed_at) AS INTEGER) as hour,
                CAST(strftime('%w', completed_at) AS INTEGER) as day_of_week,
                COUNT(*) as session_count,
                SUM(CASE WHEN duration_min >= 20 THEN 1 ELSE 0 END) as completed_count,
                SUM(25) as total_expected_min,
                SUM(duration_min) as total_actual_min
             FROM sessions
             WHERE step_type = 'focus'
               AND completed_at >= ?1
               AND completed_at <= ?2
             GROUP BY hour, day_of_week
             ORDER BY day_of_week, hour";

            let start_ts = format!("{}T00:00:00+00:00", start);
            let end_ts = format!("{}T23:59:59+00:00", end);
            let mut stmt = self.conn.prepare(query)?;
            let rows = stmt.query_map(params![start_ts, end_ts], map_row)?;
            for row in rows {
                results.push(row?);
            }
        } else {
            let query = "SELECT
                CAST(strftime('%H', completed_at) AS INTEGER) as hour,
                CAST(strftime('%w', completed_at) AS INTEGER) as day_of_week,
                COUNT(*) as session_count,
                SUM(CASE WHEN duration_min >= 20 THEN 1 ELSE 0 END) as completed_count,
                SUM(25) as total_expected_min,
                SUM(duration_min) as total_actual_min
             FROM sessions
             WHERE step_type = 'focus'
             GROUP BY hour, day_of_week
             ORDER BY day_of_week, hour";

            let mut stmt = self.conn.prepare(query)?;
            let rows = stmt.query_map([], map_row)?;
            for row in rows {
                results.push(row?);
            }
        }

        Ok(results)
    }
}

/// Shard information for aggregation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShardInfo {
    pub shard_key: String,
    pub shard_type: String,
    pub event_count: usize,
    pub created_at: String,
    pub rotated_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn record_and_query() {
        let db = Database::open_memory().unwrap();
        let now = Utc::now();
        db.record_session(StepType::Focus, "Warm Up", 15, now, now, None, None)
            .unwrap();
        let stats = db.stats_all().unwrap();
        assert_eq!(stats.completed_pomodoros, 1);
        assert_eq!(stats.total_focus_min, 15);
    }

    #[test]
    fn kv_store() {
        let db = Database::open_memory().unwrap();
        assert!(db.kv_get("test").unwrap().is_none());
        db.kv_set("test", "hello").unwrap();
        assert_eq!(db.kv_get("test").unwrap().unwrap(), "hello");
    }

    #[test]
    fn migrate_legacy_sessions_table_before_creating_task_indexes() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                step_type   TEXT NOT NULL,
                step_label  TEXT NOT NULL DEFAULT '',
                duration_min INTEGER NOT NULL,
                started_at  TEXT NOT NULL,
                completed_at TEXT NOT NULL
            );
            CREATE TABLE kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                deadline TEXT,
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        let db = Database { conn };
        db.migrate().unwrap();

        // Columns added by migration should be available for indexed queries.
        db.conn
            .execute("INSERT INTO sessions (step_type, step_label, duration_min, started_at, completed_at, task_id, project_id) VALUES ('focus', '', 25, '2026-01-01T00:00:00Z', '2026-01-01T00:25:00Z', 'task-1', 'project-1')", [])
            .unwrap();
    }

    /// Integration test: Timer → Session記録 → Stats集計
    #[test]
    fn timer_to_session_to_stats_integration() {
        use crate::timer::{Schedule, Step};
        use crate::TimerEngine;
        use crate::{Event, StepType};

        // Setup in-memory database
        let db = Database::open_memory().unwrap();

        // Create timer schedule (25min focus + 5min break)
        let focus_step = Step {
            step_type: StepType::Focus,
            label: "Work".to_string(),
            duration_min: 25,
            description: String::new(),
        };
        let break_step = Step {
            step_type: StepType::Break,
            label: "Rest".to_string(),
            duration_min: 5,
            description: String::new(),
        };
        let schedule = Schedule {
            steps: vec![focus_step.clone(), break_step.clone()],
        };

        // Simulate timer lifecycle: start → tick → complete → record session
        let mut engine = TimerEngine::new(schedule.clone());

        // Start timer
        let start_event = engine.start().unwrap();
        match start_event {
            Event::TimerStarted { step_index, .. } => {
                assert_eq!(step_index, 0);
            }
            _ => panic!("Expected TimerStarted event"),
        }

        // Manually complete the step (simulate tick that reaches 0)
        // In real scenario, tick() would be called periodically
        // For integration test, we directly record a completed session
        let started_at = Utc::now();
        let completed_at = started_at + chrono::Duration::minutes(25);

        // Record the completed focus session to database
        db.record_session(
            StepType::Focus,
            &focus_step.label,
            25,
            started_at,
            completed_at,
            Some("task-123"),
            Some("project-456"),
        )
        .unwrap();

        // Verify stats reflect the recorded session
        let stats = db.stats_all().unwrap();
        assert_eq!(stats.completed_pomodoros, 1);
        assert_eq!(stats.total_focus_min, 25);
        assert_eq!(stats.total_sessions, 1);
    }

    /// Integration test: Multiple sessions → Stats aggregation
    #[test]
    fn multiple_sessions_stats_aggregation() {
        let db = Database::open_memory().unwrap();
        let base_time = Utc::now();

        // Record 3 focus sessions and 2 break sessions
        for i in 0..3 {
            let start = base_time + chrono::Duration::minutes(i * 30);
            let end = start + chrono::Duration::minutes(25);
            db.record_session(
                StepType::Focus,
                &format!("Session {}", i),
                25,
                start,
                end,
                Some(&format!("task-{}", i)),
                None,
            )
            .unwrap();
        }

        for i in 0..2 {
            let start = base_time + chrono::Duration::minutes(25 + i * 30);
            let end = start + chrono::Duration::minutes(5);
            db.record_session(StepType::Break, "Break", 5, start, end, None, None)
                .unwrap();
        }

        let stats = db.stats_all().unwrap();
        assert_eq!(stats.completed_pomodoros, 3);
        assert_eq!(stats.total_focus_min, 75); // 3 * 25
        assert_eq!(stats.total_break_min, 10); // 2 * 5
        assert_eq!(stats.total_sessions, 5); // 3 + 2
    }

    /// Checkpoint tests
    #[test]
    fn create_and_retrieve_checkpoint() {
        let db = Database::open_memory().unwrap();
        let state = r#"{"focus_minutes": 150, "break_minutes": 30}"#;

        let id = db.create_checkpoint(state).unwrap();
        assert!(id.starts_with("ckpt_"));

        let checkpoint = db.get_latest_checkpoint().unwrap();
        assert!(checkpoint.is_some());
        let (ckpt_id, _created_at, state_snapshot) = checkpoint.unwrap();
        assert_eq!(ckpt_id, id);
        assert_eq!(state_snapshot, state);
    }

    #[test]
    fn get_latest_checkpoint_returns_none_when_empty() {
        let db = Database::open_memory().unwrap();
        let checkpoint = db.get_latest_checkpoint().unwrap();
        assert!(checkpoint.is_none());
    }

    #[test]
    fn cleanup_old_checkpoints_keeps_most_recent() {
        let db = Database::open_memory().unwrap();
        let base_time = chrono::Utc::now();

        // Create checkpoints with different timestamps
        for i in 0..5 {
            let state = format!(r#"{{"index": {}}}"#, i);
            let id = format!("ckpt_{}", i);
            let created_at = (base_time - chrono::Duration::days(i * 40)).to_rfc3339();
            db.conn.execute(
                "INSERT INTO checkpoints (id, created_at, state_snapshot) VALUES (?1, ?2, ?3)",
                params![id, created_at, state],
            ).unwrap();
        }

        // Clean up checkpoints older than 3 months (90 days)
        // ckpt_0: 0 days ago - keep (most recent)
        // ckpt_1: 40 days ago - keep
        // ckpt_2: 80 days ago - keep
        // ckpt_3: 120 days ago - delete (older than 90 days)
        // ckpt_4: 160 days ago - delete (older than 90 days)
        let deleted = db.cleanup_old_checkpoints(3).unwrap();
        assert_eq!(deleted, 2);

        // Most recent checkpoint should still exist
        let checkpoint = db.get_latest_checkpoint().unwrap();
        assert!(checkpoint.is_some());
    }

    #[test]
    fn get_sessions_since_checkpoint() {
        let db = Database::open_memory().unwrap();
        let base_time = chrono::Utc::now();

        // Create a checkpoint
        let checkpoint_time = (base_time + chrono::Duration::minutes(10)).to_rfc3339();
        db.create_checkpoint(r#"{"test": "checkpoint"}"#).unwrap();

        // Add sessions after the checkpoint
        let session_time = base_time + chrono::Duration::minutes(20);
        db.record_session(
            StepType::Focus,
            "After Checkpoint",
            25,
            session_time,
            session_time + chrono::Duration::minutes(25),
            None,
            None,
        )
        .unwrap();

        // Get sessions since checkpoint
        let sessions = db.get_sessions_since(&checkpoint_time).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].step_type, "focus");
    }

    /// CRDT Operation Log tests
    #[test]
    fn append_and_retrieve_operation() {
        let db = Database::open_memory().unwrap();

        db.append_operation(
            "op-1",
            "task_create",
            r#"{"task_id": "t1", "title": "Test"}"#,
            1,
            "device-1",
            None,
        )
        .unwrap();

        let ops = db.get_operations_since(0).unwrap();
        assert_eq!(ops.len(), 1);
        assert_eq!(ops[0].id, "op-1");
        assert_eq!(ops[0].lamport_ts, 1);
    }

    #[test]
    fn get_max_lamport_ts() {
        let db = Database::open_memory().unwrap();

        assert_eq!(db.get_max_lamport_ts().unwrap(), 0);

        db.append_operation("op-1", "test", "{}", 5, "d1", None)
            .unwrap();
        db.append_operation("op-2", "test", "{}", 10, "d1", None)
            .unwrap();

        assert_eq!(db.get_max_lamport_ts().unwrap(), 10);
    }

    #[test]
    fn merge_operations_deduplicates() {
        let db = Database::open_memory().unwrap();

        let remote_ops = vec![
            OperationLogRow {
                id: "op-remote-1".to_string(),
                operation_type: "task_create".to_string(),
                data: r#"{"task_id": "t1"}"#.to_string(),
                lamport_ts: 1,
                device_id: "device-2".to_string(),
                vector_clock: None,
                created_at: Utc::now().to_rfc3339(),
            },
            OperationLogRow {
                id: "op-remote-2".to_string(),
                operation_type: "task_update".to_string(),
                data: r#"{"task_id": "t1", "title": "Updated"}"#.to_string(),
                lamport_ts: 2,
                device_id: "device-2".to_string(),
                vector_clock: None,
                created_at: Utc::now().to_rfc3339(),
            },
        ];

        let merged = db.merge_operations(&remote_ops).unwrap();
        assert_eq!(merged, 2);

        // Merge again should deduplicate
        let merged_again = db.merge_operations(&remote_ops).unwrap();
        assert_eq!(merged_again, 0);
    }

    #[test]
    fn operations_since_timestamp() {
        let db = Database::open_memory().unwrap();

        for i in 1..=5 {
            db.append_operation(
                &format!("op-{}", i),
                "test",
                "{}",
                i * 10,
                "device-1",
                None,
            )
            .unwrap();
        }

        // Get operations since timestamp 25 (should return op-3, op-4, op-5)
        let ops = db.get_operations_since(25).unwrap();
        assert_eq!(ops.len(), 3);
        assert_eq!(ops[0].lamport_ts, 30);
    }

    /// Calendar Shard tests
    #[test]
    fn get_or_create_shard() {
        let db = Database::open_memory().unwrap();

        // Create a new shard
        db.get_or_create_shard("project:abc123", "project").unwrap();

        // Event count should be 0
        let count = db.get_shard_event_count("project:abc123").unwrap();
        assert_eq!(count, 0);

        // Increment event count
        db.increment_shard_event_count("project:abc123").unwrap();
        let count = db.get_shard_event_count("project:abc123").unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn get_all_shards() {
        let db = Database::open_memory().unwrap();

        db.get_or_create_shard("global", "global").unwrap();
        db.get_or_create_shard("project:p1", "project").unwrap();
        db.get_or_create_shard("stream:focus", "stream").unwrap();

        let shards = db.get_all_shards().unwrap();
        assert_eq!(shards.len(), 3);
    }

    #[test]
    fn rotate_shard_creates_new_entry() {
        let db = Database::open_memory().unwrap();

        // Create original shard
        db.get_or_create_shard("project:p1", "project").unwrap();
        db.increment_shard_event_count("project:p1").unwrap();
        db.increment_shard_event_count("project:p1").unwrap();

        // Rotate to new shard
        db.rotate_shard("project:p1", "project:p1-v2").unwrap();

        // Original shard should have rotated_at
        let shards = db.get_all_shards().unwrap();
        let original = shards.iter().find(|s| s.shard_key == "project:p1").unwrap();
        assert!(original.rotated_at.is_some());
        assert_eq!(original.event_count, 2);

        // New shard should exist with 0 events
        let new_shard = shards.iter().find(|s| s.shard_key == "project:p1-v2").unwrap();
        assert_eq!(new_shard.event_count, 0);
    }

    /// Break Adherence tests
    #[test]
    fn get_break_adherence_data_basic() {
        let db = Database::open_memory().unwrap();
        let base_time = chrono::Utc::now();

        // Record a focus session followed by a break
        db.record_session(
            StepType::Focus,
            "Work",
            25,
            base_time,
            base_time + chrono::Duration::minutes(25),
            None,
            None,
        )
        .unwrap();
        db.record_session(
            StepType::Break,
            "Rest",
            5,
            base_time + chrono::Duration::minutes(25),
            base_time + chrono::Duration::minutes(30),
            None,
            None,
        )
        .unwrap();

        let today = base_time.format("%Y-%m-%d").to_string();
        let data = db.get_break_adherence_data(&today, &today, None).unwrap();
        assert_eq!(data.len(), 2);
        assert_eq!(data[0].step_type, "focus");
        assert_eq!(data[1].step_type, "break");
    }

    #[test]
    fn get_break_adherence_data_with_project_filter() {
        let db = Database::open_memory().unwrap();
        let base_time = chrono::Utc::now();

        // Record sessions with different projects
        db.record_session(
            StepType::Focus,
            "Work",
            25,
            base_time,
            base_time + chrono::Duration::minutes(25),
            None,
            Some("project-a"),
        )
        .unwrap();
        db.record_session(
            StepType::Break,
            "Rest",
            5,
            base_time + chrono::Duration::minutes(25),
            base_time + chrono::Duration::minutes(30),
            None,
            Some("project-b"),
        )
        .unwrap();

        let today = base_time.format("%Y-%m-%d").to_string();

        // Filter by project-a should return only focus session
        let data_a = db
            .get_break_adherence_data(&today, &today, Some("project-a"))
            .unwrap();
        assert_eq!(data_a.len(), 1);
        assert_eq!(data_a[0].step_type, "focus");
        assert_eq!(data_a[0].project_id, Some("project-a".to_string()));

        // Filter by project-b should return only break session
        let data_b = db
            .get_break_adherence_data(&today, &today, Some("project-b"))
            .unwrap();
        assert_eq!(data_b.len(), 1);
        assert_eq!(data_b[0].step_type, "break");
        assert_eq!(data_b[0].project_id, Some("project-b".to_string()));
    }

    #[test]
    fn get_break_adherence_data_includes_hour_and_day() {
        let db = Database::open_memory().unwrap();
        // Use a fixed time to ensure predictable hour/day values
        // 2026-02-16 is a Monday (day_of_week = 1 in SQLite's %w format)
        let base_time = chrono::DateTime::parse_from_rfc3339("2026-02-16T14:30:00+00:00")
            .unwrap()
            .with_timezone(&chrono::Utc);

        db.record_session(
            StepType::Focus,
            "Work",
            25,
            base_time,
            base_time + chrono::Duration::minutes(25),
            None,
            None,
        )
        .unwrap();

        let date_str = base_time.format("%Y-%m-%d").to_string();
        let data = db
            .get_break_adherence_data(&date_str, &date_str, None)
            .unwrap();
        assert_eq!(data.len(), 1);
        // Hour should be 14 (from 14:30)
        assert_eq!(data[0].hour, 14);
        // Day of week: SQLite %w returns 0-6 where 0=Sunday, 1=Monday, etc.
        // 2026-02-16 is a Monday, so day_of_week should be 1
        assert_eq!(data[0].day_of_week, 1);
    }
}
