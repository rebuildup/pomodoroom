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

    /// Open an in-memory database (for tests).
    #[cfg(test)]
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
                completed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Create indexes for common query patterns
            CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions(completed_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_step_type ON sessions(step_type);
            CREATE INDEX IF NOT EXISTS idx_sessions_completed_at_step_type ON sessions(completed_at, step_type);",
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
    ) -> Result<i64, rusqlite::Error> {
        let type_str = match step_type {
            StepType::Focus => "focus",
            StepType::Break => "break",
        };
        self.conn.execute(
            "INSERT INTO sessions (step_type, step_label, duration_min, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                type_str,
                step_label,
                duration_min,
                started_at.to_rfc3339(),
                completed_at.to_rfc3339(),
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
        let row = stmt2.query_row(
            params![format!("{today}T00:00:00+00:00")],
            |row| Ok((row.get::<_, u64>(0)?, row.get::<_, u64>(1)?)),
        )?;
        stats.today_sessions = row.0;
        stats.today_focus_min = row.1;

        Ok(stats)
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_and_query() {
        let db = Database::open_memory().unwrap();
        let now = Utc::now();
        db.record_session(StepType::Focus, "Warm Up", 15, now, now)
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
}
