//! Core types for calendar synchronization.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Syncable data type identifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncEventType {
    Task,
    Project,
    ProjectReference,
    Group,
    DailyTemplate,
    FixedEvent,
    ScheduleBlock,
    Session,
    Stats,
    Config,
    Profile,
    ProfileBackup,
    ProfilePerformance,
    OpLog,
}

impl SyncEventType {
    /// Event prefix for calendar summary.
    pub fn event_prefix(&self) -> &'static str {
        match self {
            SyncEventType::Task => "[TASK]",
            SyncEventType::Project => "[PROJECT]",
            SyncEventType::ProjectReference => "[PROJREF]",
            SyncEventType::Group => "[GROUP]",
            SyncEventType::DailyTemplate => "[TEMPLATE]",
            SyncEventType::FixedEvent => "[FIXED]",
            SyncEventType::ScheduleBlock => "[BLOCK]",
            SyncEventType::Session => "[SESSION]",
            SyncEventType::Stats => "[STATS]",
            SyncEventType::Config => "[CONFIG]",
            SyncEventType::Profile => "[PROFILE]",
            SyncEventType::ProfileBackup => "[PROFBACKUP]",
            SyncEventType::ProfilePerformance => "[PROFPERF]",
            SyncEventType::OpLog => "[OPLOG]",
        }
    }
}

/// A syncable event ready for calendar storage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SyncEvent {
    /// Unique identifier (matches local entity ID).
    pub id: String,
    /// Type of data being synced.
    pub event_type: SyncEventType,
    /// JSON serialized data.
    pub data: serde_json::Value,
    /// Last update timestamp.
    pub updated_at: DateTime<Utc>,
    /// Whether this represents a deletion.
    pub deleted: bool,
}

/// Current sync status.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SyncStatus {
    /// Last successful sync timestamp.
    pub last_sync_at: Option<DateTime<Utc>>,
    /// Number of pending changes to sync.
    pub pending_count: usize,
    /// Whether a sync is currently in progress.
    pub in_progress: bool,
}

/// Sync error types.
#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("Calendar API error: {0}")]
    CalendarApi(String),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Calendar not found")]
    CalendarNotFound,

    #[error("Authentication required")]
    AuthenticationRequired,

    #[error("Rate limited")]
    RateLimited,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Generic error: {0}")]
    Generic(#[from] Box<dyn std::error::Error + Send + Sync>),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_event_creation() {
        let event = SyncEvent {
            id: "test-123".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Test"}),
            updated_at: chrono::Utc::now(),
            deleted: false,
        };
        assert_eq!(event.id, "test-123");
        assert_eq!(event.event_type, SyncEventType::Task);
        assert!(!event.deleted);
    }

    #[test]
    fn test_sync_status() {
        let status = SyncStatus {
            last_sync_at: None,
            pending_count: 5,
            in_progress: true,
        };
        assert_eq!(status.pending_count, 5);
        assert!(status.in_progress);
    }
}
