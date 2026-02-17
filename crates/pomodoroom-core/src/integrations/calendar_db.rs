//! Calendar-DB: Google Calendar as append-only event log.
//!
//! Uses a dedicated Google Calendar to store immutable event logs.
//! Each calendar event contains a JSON payload representing a domain event.
//! Event IDs serve as immutable log IDs for replay and state reconstruction.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Types of events that can be stored in the calendar log.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CalendarEventType {
    /// Task created
    TaskCreated,
    /// Task updated
    TaskUpdated,
    /// Task state changed (started, paused, completed)
    TaskStateChanged,
    /// Task deleted (soft delete)
    TaskDeleted,
    /// Pomodoro session started
    SessionStarted,
    /// Pomodoro session completed
    SessionCompleted,
    /// Manual checkpoint created
    Checkpoint,
    /// Configuration changed
    ConfigChanged,
}

/// Event payload stored in calendar event description.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEventPayload {
    /// Event type
    pub event_type: CalendarEventType,
    /// Entity ID (task_id, session_id, etc.)
    pub entity_id: String,
    /// Event timestamp (ISO 8601)
    pub timestamp: DateTime<Utc>,
    /// Lamport timestamp for causality tracking
    pub lamport_ts: u64,
    /// Event-specific data
    pub data: serde_json::Value,
    /// Client/device identifier
    pub device_id: String,
    /// Schema version
    pub version: u32,
}

impl CalendarEventPayload {
    /// Create a new event payload.
    pub fn new(
        event_type: CalendarEventType,
        entity_id: impl Into<String>,
        data: serde_json::Value,
        device_id: impl Into<String>,
    ) -> Self {
        Self {
            event_type,
            entity_id: entity_id.into(),
            timestamp: Utc::now(),
            lamport_ts: 0,
            data,
            device_id: device_id.into(),
            version: 1,
        }
    }

    /// Set Lamport timestamp.
    pub fn with_lamport_ts(mut self, ts: u64) -> Self {
        self.lamport_ts = ts;
        self
    }

    /// Serialize to JSON string.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Deserialize from JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

/// Log entry retrieved from calendar.
#[derive(Debug, Clone)]
pub struct CalendarLogEntry {
    /// Calendar event ID (immutable log ID)
    pub log_id: String,
    /// Calendar event timestamp
    pub created_at: DateTime<Utc>,
    /// Event payload
    pub payload: CalendarEventPayload,
}

/// Checkpoint for log truncation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarCheckpoint {
    /// Checkpoint ID
    pub id: String,
    /// Timestamp when checkpoint was created
    pub created_at: DateTime<Utc>,
    /// Last log ID included in checkpoint
    pub last_log_id: String,
    /// Lamport timestamp at checkpoint
    pub lamport_ts: u64,
    /// Serialized state snapshot
    pub state_snapshot: serde_json::Value,
}

/// Configuration for Calendar-DB mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarDbConfig {
    /// Calendar ID for event logs
    pub calendar_id: String,
    /// Calendar name
    pub calendar_name: String,
    /// Device ID for this client
    pub device_id: String,
    /// Whether to use Calendar-DB mode
    pub enabled: bool,
}

impl Default for CalendarDbConfig {
    fn default() -> Self {
        Self {
            calendar_id: String::new(),
            calendar_name: "Pomodoroom Logs".to_string(),
            device_id: format!(
                "device_{}",
                uuid::Uuid::new_v4()
                    .to_string()
                    .split('-')
                    .next()
                    .unwrap_or("unknown")
            ),
            enabled: false,
        }
    }
}

/// Statistics for calendar log.
#[derive(Debug, Clone, Default)]
pub struct CalendarLogStats {
    /// Total events in calendar
    pub total_events: usize,
    /// Events by type
    pub events_by_type: HashMap<CalendarEventType, usize>,
    /// Date range
    pub oldest_event: Option<DateTime<Utc>>,
    pub newest_event: Option<DateTime<Utc>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_payload_serialization() {
        let payload = CalendarEventPayload::new(
            CalendarEventType::TaskCreated,
            "task_123",
            json!({"title": "Test Task", "priority": 5}),
            "device_test",
        );

        let json = payload.to_json().unwrap();
        let deserialized = CalendarEventPayload::from_json(&json).unwrap();

        assert_eq!(deserialized.event_type, CalendarEventType::TaskCreated);
        assert_eq!(deserialized.entity_id, "task_123");
        assert_eq!(deserialized.device_id, "device_test");
        assert_eq!(deserialized.version, 1);
    }

    #[test]
    fn test_payload_with_lamport_ts() {
        let payload = CalendarEventPayload::new(
            CalendarEventType::TaskStateChanged,
            "task_456",
            json!({"state": "RUNNING"}),
            "device_test",
        )
        .with_lamport_ts(42);

        assert_eq!(payload.lamport_ts, 42);
    }

    #[test]
    fn test_calendar_db_config_default() {
        let config = CalendarDbConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.calendar_name, "Pomodoroom Logs");
        assert!(!config.device_id.is_empty());
    }
}
