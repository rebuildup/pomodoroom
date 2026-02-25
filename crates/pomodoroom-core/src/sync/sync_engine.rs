//! Sync engine for bidirectional calendar synchronization.

use crate::sync::types::{SyncEvent, SyncError, SyncStatus, SyncEventType};
use crate::sync::calendar_client::CalendarClient;
use crate::sync::event_codec::*;
use chrono::{DateTime, Utc, Duration};
use std::sync::{Arc, Mutex};

/// Simple logging macro for sync engine (removes log crate dependency).
macro_rules! sync_log {
    ($($arg:tt)*) => {
        // In production, this would use the actual logger
        // For now, we just suppress the output
    };
}

/// Merge decision for conflicting events.
#[derive(Debug, Clone, PartialEq)]
pub enum MergeDecision {
    UseLocal,
    UseRemote,
    Merged(SyncEvent),
    NeedsUserChoice,
}

/// Sync engine managing bidirectional sync.
pub struct SyncEngine {
    client: CalendarClient,
    last_sync_at: Arc<Mutex<Option<DateTime<Utc>>>>,
}

impl SyncEngine {
    /// Create new sync engine.
    pub fn new() -> Self {
        Self {
            client: CalendarClient::new(),
            last_sync_at: Arc::new(Mutex::new(None)),
        }
    }

    /// Perform initial sync on startup.
    pub fn startup_sync(&mut self) -> Result<SyncStatus, SyncError> {
        // Ensure calendar exists
        self.client.ensure_pomodoroom_calendar()?;

        // Get last sync time
        let since = {
            let guard = self.last_sync_at.lock().unwrap();
            *guard
        };

        // Fetch remote changes
        let remote_events = self.client.fetch_events(since)?;

        // Apply to local database
        let _applied_count = remote_events.iter()
            .filter_map(|event_json| parse_gcal_event(event_json).ok())
            .filter_map(|sync_event| self.apply_remote_event(&sync_event).ok())
            .count();

        // Update last sync time
        *self.last_sync_at.lock().unwrap() = Some(Utc::now());

        Ok(SyncStatus {
            last_sync_at: Some(Utc::now()),
            pending_count: 0,
            in_progress: false,
        })
    }

    /// Apply a single remote event to local database.
    fn apply_remote_event(&self, event: &SyncEvent) -> Result<(), SyncError> {
        match event.event_type {
            SyncEventType::Task => {
                let _task = sync_event_to_task(&event.id, &event.data)?;
                // TODO: Upsert to SQLite via schedule_db
                sync_log!("Applied remote task");
            }
            SyncEventType::Project => {
                let _project = sync_event_to_project(&event.id, &event.data)?;
                sync_log!("Applied remote project");
            }
            SyncEventType::Group => {
                let _group = sync_event_to_group(&event.id, &event.data)?;
                sync_log!("Applied remote group");
            }
            SyncEventType::DailyTemplate => {
                let _template = sync_event_to_daily_template(&event.data)?;
                sync_log!("Applied remote daily template");
            }
            SyncEventType::Session => {
                let _session = sync_event_to_session(&event.id, &event.data)?;
                sync_log!("Applied remote session");
            }
            SyncEventType::Config => {
                // TODO: Save to config.toml
                sync_log!("Applied remote config");
            }
            _ => {
                sync_log!("Unhandled event type: {:?}", event.event_type);
            }
        }

        Ok(())
    }

    /// Get current sync status.
    pub fn status(&self) -> SyncStatus {
        let guard = self.last_sync_at.lock().unwrap();
        SyncStatus {
            last_sync_at: *guard,
            pending_count: 0,
            in_progress: false,
        }
    }
}

impl Default for SyncEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse Google Calendar event into SyncEvent.
///
/// Handles the description format with metadata separator (integrator.md §3.3).
pub fn parse_gcal_event(event_json: &serde_json::Value) -> Result<SyncEvent, SyncError> {
    let props = &event_json["extendedProperties"]["private"];

    let event_type_str = props["pomodoroom_type"]
        .as_str()
        .ok_or(SyncError::CalendarApi("Missing pomodoroom_type".into()))?;

    let id = props["pomodoroom_id"]
        .as_str()
        .ok_or(SyncError::CalendarApi("Missing pomodoroom_id".into()))?;

    let updated_str = props["pomodoroom_updated"]
        .as_str()
        .ok_or(SyncError::CalendarApi("Missing pomodoroom_updated".into()))?;

    let updated_at: DateTime<Utc> = DateTime::parse_from_rfc3339(updated_str)
        .map_err(|e| SyncError::CalendarApi(format!("Invalid timestamp: {}", e)))?
        .with_timezone(&Utc);

    // Extract metadata from description (integrator.md §3.3 format)
    let data = extract_metadata_from_description(
        event_json["description"].as_str().unwrap_or("")
    )?;

    // Parse event type from string
    let event_type = match event_type_str {
        "Task" => SyncEventType::Task,
        "Project" => SyncEventType::Project,
        "ProjectReference" => SyncEventType::ProjectReference,
        "Group" => SyncEventType::Group,
        "DailyTemplate" => SyncEventType::DailyTemplate,
        "FixedEvent" => SyncEventType::FixedEvent,
        "ScheduleBlock" => SyncEventType::ScheduleBlock,
        "Session" => SyncEventType::Session,
        "Stats" => SyncEventType::Stats,
        "Config" => SyncEventType::Config,
        "Profile" => SyncEventType::Profile,
        "ProfileBackup" => SyncEventType::ProfileBackup,
        "ProfilePerformance" => SyncEventType::ProfilePerformance,
        "OpLog" => SyncEventType::OpLog,
        _ => return Err(SyncError::CalendarApi(format!("Unknown type: {}", event_type_str))),
    };

    let deleted = event_json["status"].as_str() == Some("cancelled");

    Ok(SyncEvent {
        id: id.to_string(),
        event_type,
        data,
        updated_at,
        deleted,
    })
}

/// Extract JSON metadata from description field.
/// Handles both new format (with separator) and legacy format (pure JSON).
fn extract_metadata_from_description(description: &str) -> Result<serde_json::Value, SyncError> {
    const SEPARATOR: &str = "───────── pomodoroom-metadata ─────────";

    // Try new format with separator first
    if let Some(separator_pos) = description.find(SEPARATOR) {
        let json_part = description[separator_pos + SEPARATOR.len()..].trim();
        if let Ok(data) = serde_json::from_str(json_part) {
            return Ok(data);
        }
    }

    // Fall back to legacy format: entire description is JSON
    if let Ok(data) = serde_json::from_str(description) {
        return Ok(data);
    }

    // Final fallback: try to find JSON object anywhere in the description
    if let Some(brace_start) = description.find('{') {
        let json_candidate = &description[brace_start..];
        if let Ok(data) = serde_json::from_str(json_candidate) {
            return Ok(data);
        }
    }

    // No valid JSON found - return empty object
    Ok(serde_json::json!({}))
}

/// Decide merge outcome based on timestamps and deletion status.
pub fn decide_merge(
    local_updated: DateTime<Utc>,
    remote_updated: DateTime<Utc>,
    local_deleted: bool,
    remote_deleted: bool,
) -> MergeDecision {
    let day = Duration::days(1);
    let time_diff = remote_updated - local_updated;

    // Deletion conflicts - deletion always wins
    match (local_deleted, remote_deleted) {
        (true, _) => return MergeDecision::UseLocal,  // Local already deleted
        (_, true) => return MergeDecision::UseRemote, // Mark local for deletion
        (false, false) => {} // Continue to timestamp comparison
    }

    // Clear time difference wins
    if time_diff > day {
        return MergeDecision::UseRemote;
    } else if time_diff < -day {
        return MergeDecision::UseLocal;
    }

    // Within same day - newer timestamp wins
    if remote_updated > local_updated {
        MergeDecision::UseRemote
    } else {
        MergeDecision::UseLocal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decide_merge_local_newer() {
        let local = Utc::now();
        let remote = local - Duration::hours(2);
        assert_eq!(
            decide_merge(local, remote, false, false),
            MergeDecision::UseLocal
        );
    }

    #[test]
    fn test_decide_merge_remote_newer() {
        let local = Utc::now() - Duration::hours(2);
        let remote = Utc::now();
        assert_eq!(
            decide_merge(local, remote, false, false),
            MergeDecision::UseRemote
        );
    }

    #[test]
    fn test_decide_merge_local_deleted() {
        let local = Utc::now() - Duration::hours(1);
        let remote = Utc::now();
        assert_eq!(
            decide_merge(local, remote, true, false),
            MergeDecision::UseLocal  // Already deleted locally
        );
    }

    #[test]
    fn test_decide_merge_remote_deleted() {
        let local = Utc::now();
        let remote = local - Duration::hours(1);
        assert_eq!(
            decide_merge(local, remote, false, true),
            MergeDecision::UseRemote  // Should delete local
        );
    }

    #[test]
    fn test_parse_gcal_event_task() {
        // New format with metadata separator
        let gcal_event = serde_json::json!({
            "id": "gcal-123",
            "status": "confirmed",
            "summary": "[TASK] task-456",
            "description": "User description goes here.\n\n───────── pomodoroom-metadata ─────────\n{\"id\":\"task-456\",\"title\":\"Test Task\",\"state\":\"READY\"}",
            "extendedProperties": {
                "private": {
                    "pomodoroom_type": "Task",
                    "pomodoroom_id": "task-456",
                    "pomodoroom_updated": "2025-02-25T12:00:00Z",
                    "pomodoroom_version": "1",
                    "pomodoroom_state": "READY",
                    "pomodoroom_priority": "75",
                    "pomodoroom_energy": "high"
                }
            }
        });

        let sync_event = parse_gcal_event(&gcal_event).unwrap();
        assert_eq!(sync_event.id, "task-456");
        assert_eq!(sync_event.event_type, SyncEventType::Task);
        assert!(!sync_event.deleted);
        assert_eq!(sync_event.data["title"], "Test Task");
    }

    #[test]
    fn test_parse_gcal_event_deleted() {
        let gcal_event = serde_json::json!({
            "id": "gcal-456",
            "status": "cancelled",
            "summary": "[TASK] task-789",
            "description": "{\"id\":\"task-789\",\"title\":\"Deleted Task\"}",
            "extendedProperties": {
                "private": {
                    "pomodoroom_type": "Task",
                    "pomodoroom_id": "task-789",
                    "pomodoroom_updated": "2025-02-25T12:00:00Z"
                }
            }
        });

        let sync_event = parse_gcal_event(&gcal_event).unwrap();
        assert_eq!(sync_event.id, "task-789");
        assert!(sync_event.deleted);
    }

    #[test]
    fn test_parse_gcal_event_legacy_format() {
        // Legacy format without separator (pure JSON)
        let gcal_event = serde_json::json!({
            "id": "gcal-789",
            "status": "confirmed",
            "summary": "[TASK] task-legacy",
            "description": r#"{"id":"task-legacy","title":"Legacy Task","state":"RUNNING"}"#,
            "extendedProperties": {
                "private": {
                    "pomodoroom_type": "Task",
                    "pomodoroom_id": "task-legacy",
                    "pomodoroom_updated": "2025-02-25T12:00:00Z"
                }
            }
        });

        let sync_event = parse_gcal_event(&gcal_event).unwrap();
        assert_eq!(sync_event.id, "task-legacy");
        assert_eq!(sync_event.data["title"], "Legacy Task");
    }
}
