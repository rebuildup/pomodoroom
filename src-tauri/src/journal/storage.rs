//! Journal storage implementation using SQLite.

use crate::journal::entry::{EntryId, EntryStatus, JournalEntry, JournalError, TransitionType};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Configuration for journal storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalConfig {
    /// Maximum number of entries before auto-compact.
    pub max_entries: usize,
    /// Whether to auto-compact on checkpoint.
    pub auto_compact: bool,
    /// Keep entries for this many seconds after commit.
    pub retention_seconds: i64,
}

impl Default for JournalConfig {
    fn default() -> Self {
        Self {
            max_entries: 10000,
            auto_compact: true,
            retention_seconds: 3600, // 1 hour
        }
    }
}

/// Statistics about the journal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalStats {
    /// Total number of entries.
    pub total_entries: usize,
    /// Number of pending entries.
    pub pending_count: usize,
    /// Number of applied entries.
    pub applied_count: usize,
    /// Number of committed entries.
    pub committed_count: usize,
    /// Number of rolled back entries.
    pub rolled_back_count: usize,
    /// Oldest entry timestamp.
    pub oldest_entry: Option<DateTime<Utc>>,
    /// Newest entry timestamp.
    pub newest_entry: Option<DateTime<Utc>>,
    /// Journal file size in bytes.
    pub file_size_bytes: u64,
}

/// SQLite-based journal storage.
pub struct JournalStorage {
    conn: Mutex<Connection>,
    config: JournalConfig,
    sequence: Mutex<u64>,
}

impl JournalStorage {
    /// Open the journal storage at the default location.
    pub fn open() -> Result<Self, JournalError> {
        let path = Self::journal_path()?;
        let conn = Connection::open(&path)
            .map_err(|e| JournalError::StorageError(e.to_string()))?;

        let storage = Self {
            conn: Mutex::new(conn),
            config: JournalConfig::default(),
            sequence: Mutex::new(0),
        };

        storage.initialize()?;
        storage.load_sequence()?;

        Ok(storage)
    }

    /// Open an in-memory journal (for testing).
    #[cfg(test)]
    pub fn open_memory() -> Result<Self, JournalError> {
        let conn = Connection::open_in_memory()
            .map_err(|e| JournalError::StorageError(e.to_string()))?;

        let storage = Self {
            conn: Mutex::new(conn),
            config: JournalConfig::default(),
            sequence: Mutex::new(0),
        };

        storage.initialize()?;
        storage.load_sequence()?;

        Ok(storage)
    }

    /// Get the default journal file path.
    fn journal_path() -> Result<PathBuf, JournalError> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| JournalError::StorageError("Cannot determine data directory".into()))?;
        let app_dir = data_dir.join("pomodoroom");
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| JournalError::StorageError(e.to_string()))?;
        Ok(app_dir.join("journal.db"))
    }

    /// Initialize the journal tables.
    fn initialize(&self) -> Result<(), JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS journal_entries (
                id TEXT PRIMARY KEY,
                transition_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                correlation_id TEXT,
                error TEXT,
                sequence INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_status ON journal_entries(status);
            CREATE INDEX IF NOT EXISTS idx_sequence ON journal_entries(sequence);
            CREATE INDEX IF NOT EXISTS idx_created_at ON journal_entries(created_at);
            ",
        )
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Load the current sequence number.
    fn load_sequence(&self) -> Result<(), JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        // Use COALESCE to return 0 instead of NULL when table is empty
        let max_seq: u64 = conn
            .query_row("SELECT COALESCE(MAX(sequence), 0) FROM journal_entries", [], |row| row.get(0))
            .map_err(|e| JournalError::StorageError(e.to_string()))?;

        let mut seq = self.sequence.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock sequence".into()))?;
        *seq = max_seq;

        Ok(())
    }

    /// Get the next sequence number.
    fn next_sequence(&self) -> Result<u64, JournalError> {
        let mut seq = self.sequence.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock sequence".into()))?;
        *seq += 1;
        Ok(*seq)
    }

    /// Append a new entry to the journal.
    pub fn append(&self, transition: TransitionType) -> Result<JournalEntry, JournalError> {
        let sequence = self.next_sequence()?;
        let entry = JournalEntry::new(transition, sequence);

        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        let transition_json = serde_json::to_string(&entry.transition)
            .map_err(|e| JournalError::SerializationError(e.to_string()))?;

        conn.execute(
            "INSERT INTO journal_entries (id, transition_json, status, created_at, updated_at, correlation_id, error, sequence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                entry.id,
                transition_json,
                format!("{:?}", entry.status),
                entry.created_at.to_rfc3339(),
                entry.updated_at.to_rfc3339(),
                entry.correlation_id,
                entry.error,
                entry.sequence,
            ],
        )
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(entry)
    }

    /// Update entry status.
    pub fn update_status(&self, id: &EntryId, status: EntryStatus, error: Option<&str>) -> Result<(), JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE journal_entries SET status = ?1, updated_at = ?2, error = ?3 WHERE id = ?4",
            params![format!("{:?}", status), now, error, id],
        )
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Get an entry by ID.
    pub fn get(&self, id: &EntryId) -> Result<Option<JournalEntry>, JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        let result = conn.query_row(
            "SELECT id, transition_json, status, created_at, updated_at, correlation_id, error, sequence
             FROM journal_entries WHERE id = ?1",
            params![id],
            |row| self.row_to_entry(row),
        ).optional()
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(result)
    }

    /// Get all pending entries (need recovery).
    pub fn get_pending(&self) -> Result<Vec<JournalEntry>, JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        let mut stmt = conn.prepare(
            "SELECT id, transition_json, status, created_at, updated_at, correlation_id, error, sequence
             FROM journal_entries
             WHERE status IN ('Pending', 'Applied')
             ORDER BY sequence ASC"
        )
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        let entries = stmt.query_map([], |row| self.row_to_entry(row))
            .map_err(|e| JournalError::StorageError(e.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(entries)
    }

    /// Mark an entry as committed (checkpoint).
    pub fn checkpoint(&self, id: &EntryId) -> Result<(), JournalError> {
        self.update_status(id, EntryStatus::Committed, None)?;

        if self.config.auto_compact {
            self.compact_if_needed()?;
        }

        Ok(())
    }

    /// Mark an entry as rolled back.
    pub fn rollback(&self, id: &EntryId, error: &str) -> Result<(), JournalError> {
        self.update_status(id, EntryStatus::RolledBack, Some(error))
    }

    /// Remove old committed entries.
    pub fn compact(&self) -> Result<usize, JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        let cutoff = Utc::now() - chrono::Duration::seconds(self.config.retention_seconds);
        let cutoff_str = cutoff.to_rfc3339();

        let rows_deleted = conn.execute(
            "DELETE FROM journal_entries WHERE status = 'Committed' AND updated_at < ?1",
            params![cutoff_str],
        )
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(rows_deleted)
    }

    /// Compact if entry count exceeds threshold.
    fn compact_if_needed(&self) -> Result<(), JournalError> {
        let stats = self.get_stats()?;
        if stats.total_entries > self.config.max_entries {
            self.compact()?;
        }
        Ok(())
    }

    /// Get journal statistics.
    pub fn get_stats(&self) -> Result<JournalStats, JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        let total_entries: usize = conn.query_row(
            "SELECT COUNT(*) FROM journal_entries", [],
            |row| row.get(0)
        ).map_err(|e| JournalError::StorageError(e.to_string()))?;

        let pending_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE status = 'Pending'", [],
            |row| row.get(0)
        ).map_err(|e| JournalError::StorageError(e.to_string()))?;

        let applied_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE status = 'Applied'", [],
            |row| row.get(0)
        ).map_err(|e| JournalError::StorageError(e.to_string()))?;

        let committed_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE status = 'Committed'", [],
            |row| row.get(0)
        ).map_err(|e| JournalError::StorageError(e.to_string()))?;

        let rolled_back_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM journal_entries WHERE status = 'RolledBack'", [],
            |row| row.get(0)
        ).map_err(|e| JournalError::StorageError(e.to_string()))?;

        let oldest_entry: Option<String> = conn.query_row(
            "SELECT MIN(created_at) FROM journal_entries", [],
            |row| row.get(0)
        ).optional()
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        let newest_entry: Option<String> = conn.query_row(
            "SELECT MAX(created_at) FROM journal_entries", [],
            |row| row.get(0)
        ).optional()
        .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(JournalStats {
            total_entries,
            pending_count,
            applied_count,
            committed_count,
            rolled_back_count,
            oldest_entry: oldest_entry.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|d| d.with_timezone(&Utc))),
            newest_entry: newest_entry.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|d| d.with_timezone(&Utc))),
            file_size_bytes: 0, // Would need path access
        })
    }

    /// Clear all entries (for testing/reset).
    pub fn clear(&self) -> Result<(), JournalError> {
        let conn = self.conn.lock()
            .map_err(|_| JournalError::StorageError("Failed to lock connection".into()))?;

        conn.execute("DELETE FROM journal_entries", [])
            .map_err(|e| JournalError::StorageError(e.to_string()))?;

        Ok(())
    }

    /// Convert a database row to a JournalEntry.
    fn row_to_entry(&self, row: &rusqlite::Row) -> Result<JournalEntry, rusqlite::Error> {
        let id: String = row.get(0)?;
        let transition_json: String = row.get(1)?;
        let status_str: String = row.get(2)?;
        let created_at_str: String = row.get(3)?;
        let updated_at_str: String = row.get(4)?;
        let correlation_id: Option<String> = row.get(5)?;
        let error: Option<String> = row.get(6)?;
        let sequence: u64 = row.get(7)?;

        let transition: TransitionType = serde_json::from_str(&transition_json)
            .map_err(|_| rusqlite::Error::InvalidQuery)?;

        let status = match status_str.as_str() {
            "Pending" => EntryStatus::Pending,
            "Applied" => EntryStatus::Applied,
            "Committed" => EntryStatus::Committed,
            "RolledBack" => EntryStatus::RolledBack,
            _ => EntryStatus::Pending,
        };

        let created_at = DateTime::parse_from_rfc3339(&created_at_str)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
            .map(|d| d.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        Ok(JournalEntry {
            id,
            transition,
            status,
            created_at,
            updated_at,
            correlation_id,
            error,
            sequence,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_basic_operations() {
        let storage = JournalStorage::open_memory().unwrap();

        // Append entry
        let entry = storage.append(TransitionType::task_transition("task-1", "READY", "RUNNING")).unwrap();
        assert!(entry.is_pending());

        // Get entry
        let retrieved = storage.get(&entry.id).unwrap().unwrap();
        assert_eq!(retrieved.id, entry.id);

        // Update status
        storage.update_status(&entry.id, EntryStatus::Applied, None).unwrap();
        let updated = storage.get(&entry.id).unwrap().unwrap();
        assert_eq!(updated.status, EntryStatus::Applied);

        // Checkpoint
        storage.checkpoint(&entry.id).unwrap();
        let committed = storage.get(&entry.id).unwrap().unwrap();
        assert_eq!(committed.status, EntryStatus::Committed);
    }

    #[test]
    fn storage_get_pending() {
        let storage = JournalStorage::open_memory().unwrap();

        // Add entries with different statuses
        let entry1 = storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        let entry2 = storage.append(TransitionType::task_transition("task-2", "A", "B")).unwrap();
        storage.checkpoint(&entry2.id).unwrap();

        let pending = storage.get_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, entry1.id);
    }

    #[test]
    fn storage_stats() {
        let storage = JournalStorage::open_memory().unwrap();

        let entry = storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        storage.checkpoint(&entry.id).unwrap();

        let stats = storage.get_stats().unwrap();
        assert_eq!(stats.total_entries, 1);
        assert_eq!(stats.committed_count, 1);
    }

    #[test]
    fn storage_rollback() {
        let storage = JournalStorage::open_memory().unwrap();

        let entry = storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        storage.rollback(&entry.id, "test error").unwrap();

        let updated = storage.get(&entry.id).unwrap().unwrap();
        assert_eq!(updated.status, EntryStatus::RolledBack);
        assert!(updated.error.unwrap().contains("test error"));
    }
}
