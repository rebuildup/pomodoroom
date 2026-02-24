# Google Calendar Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pomodoroomの全データをGoogleカレンダーに同期し、マルチデバイス共有とモバイル化を実現する

**Architecture:** ローカルファースト。SQLiteがプライマリ、Google Calendarがリモート同期先。専用カレンダー「Pomodoroom」を自動作成し、全データをイベントとして保存。

**Tech Stack:** Rust, Google Calendar API v3, SQLite, chrono, serde, reqwest

---

## M0: Foundation - インフラ整備

### Task 1: sync/types.rs - 同期関連の型定義

**Files:**
- Create: `crates/pomodoroom-core/src/sync/types.rs`
- Test: `crates/pomodoroom-core/src/sync/types_tests.rs`

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/types_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::types::*;

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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core sync_types`
Expected: FAIL with "module not found"

**Step 3: Create sync module structure**

Create `crates/pomodoroom-core/src/sync/mod.rs`:

```rust
//! Google Calendar synchronization layer.
//!
//! Provides bidirectional sync between local SQLite and Google Calendar.
//! All data is stored as calendar events in a dedicated "Pomodoroom" calendar.

pub mod types;
pub mod device_id;
pub mod calendar_client;
pub mod event_codec;

pub use types::{SyncEvent, SyncEventType, SyncStatus, SyncError};
```

**Step 4: Create types.rs**

Create `crates/pomodoroom-core/src/sync/types.rs`:

```rust
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
}
```

**Step 5: Update lib.rs to include sync module**

Modify `crates/pomodoroom-core/src/lib.rs`:

Add to the module list:
```rust
pub mod sync;
```

**Step 6: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core sync_types`
Expected: PASS

**Step 7: Commit**

```bash
git add crates/pomodoroom-core/src/sync/
git add crates/pomodoroom-core/src/lib.rs
git commit -m "feat(sync): add core types for calendar synchronization"
```

---

### Task 2: sync/device_id.rs - デバイスID管理

**Files:**
- Create: `crates/pomodoroom-core/src/sync/device_id.rs`
- Test: `crates/pomodoroom-core/src/sync/device_id_tests.rs`

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/device_id_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::device_id::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_device_id_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let device_id_path = temp_dir.path().join("device_id");

        // First call creates and persists
        let id1 = get_or_create_device_id_at(&device_id_path).unwrap();
        assert!(id1.starts_with("pomodoro-"));

        // Second call reads from file
        let id2 = get_or_create_device_id_at(&device_id_path).unwrap();
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_device_id_format() {
        let temp_dir = TempDir::new().unwrap();
        let device_id_path = temp_dir.path().join("device_id");

        let id = get_or_create_device_id_at(&device_id_path).unwrap();
        assert!(id.len() > 10);
        assert!(id.chars().all(|c| c.is_alphanumeric() || c == '-'));
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core device_id`
Expected: FAIL with "not found"

**Step 3: Implement device_id.rs**

Create `crates/pomodoroom-core/src/sync/device_id.rs`:

```rust
//! Device ID management for multi-device sync.

use std::fs;
use std::path::Path;
use uuid::Uuid;

/// Get or create device ID at specific path.
pub fn get_or_create_device_id_at(path: &Path) -> Result<String, std::io::Error> {
    if path.exists() {
        let id = fs::read_to_string(path)?;
        Ok(id.trim().to_string())
    } else {
        let device_id = format!("pomodoro-{}", Uuid::new_v4());
        fs::write(path, &device_id)?;
        Ok(device_id)
    }
}

/// Get or create device ID using default data directory.
pub fn get_or_create_device_id() -> Result<String, std::io::Error> {
    let data_dir = crate::storage::data_dir()?;
    let device_id_path = data_dir.join("device_id");
    get_or_create_device_id_at(&device_id_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_id_starts_with_prefix() {
        let temp = std::env::temp_dir().join("test-device-id");
        let id = get_or_create_device_id_at(&temp).unwrap();
        assert!(id.starts_with("pomodoro-"));
        let _ = fs::remove_file(temp);
    }
}
```

**Step 4: Add dev dependency on uuid and tempfile**

Modify `crates/pomodoroom-core/Cargo.toml`:

Add to dependencies:
```toml
uuid = { version = "1.10", features = ["v4", "serde"] }
```

Add to dev-dependencies:
```toml
tempfile = "3.10"
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core device_id`
Expected: PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/sync/device_id.rs
git add crates/pomodoroom-core/Cargo.toml
git commit -m "feat(sync): add device ID management"
```

---

### Task 3: sync/calendar_client.rs - Google Calendar API クライアント

**Files:**
- Create: `crates/pomodoroom-core/src/sync/calendar_client.rs`
- Modify: `crates/pomodoroom-core/src/integrations/google.rs` (re-use OAuth)

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/calendar_client_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::calendar_client::*;
    use chrono::{Utc, Duration};

    #[test]
    fn test_calendar_event_from_sync_event() {
        let sync_event = crate::sync::types::SyncEvent {
            id: "task-123".to_string(),
            event_type: crate::sync::types::SyncEventType::Task,
            data: serde_json::json!({"title": "Test Task"}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let gcal_event = to_gcal_event(&sync_event, "Pomodoroom").unwrap();
        assert!(gcal_event["summary"].as_str().unwrap().starts_with("[TASK]"));
        assert_eq!(gcal_event["extendedProperties"]["private"]["pomodoroom_id"], "task-123");
    }

    #[test]
    fn test_find_pomodoroom_calendar() {
        // Mock test - actual API calls require auth
        let calendars = vec![
            serde_json::json!({"id": "cal1", "summary": "Personal"}),
            serde_json::json!({"id": "cal2", "summary": "Pomodoroom"}),
        ];
        let found = find_pomodoroom_calendar_in_list(&calendars);
        assert_eq!(found, Some("cal2"));
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core calendar_client`
Expected: FAIL with "not found"

**Step 3: Implement calendar_client.rs**

Create `crates/pomodoroom-core/src/sync/calendar_client.rs`:

```rust
//! Google Calendar API client for sync operations.

use crate::sync::types::{SyncEvent, SyncError};
use crate::integrations::google::GoogleIntegration;
use chrono::{DateTime, Duration, Utc};
use serde_json::json;

/// Google Calendar API client.
pub struct CalendarClient {
    google: GoogleIntegration,
    calendar_id: Option<String>,
}

impl CalendarClient {
    /// Create new client.
    pub fn new() -> Self {
        Self {
            google: GoogleIntegration::new(),
            calendar_id: None,
        }
    }

    /// Ensure Pomodoroom calendar exists, returning its ID.
    pub fn ensure_pomodoroom_calendar(&mut self) -> Result<String, SyncError> {
        if let Some(ref id) = self.calendar_id {
            return Ok(id.clone());
        }

        if !self.google.is_authenticated() {
            return Err(SyncError::AuthenticationRequired);
        }

        // Try to find existing calendar
        if let Some(id) = self.find_or_create_pomodoroom_calendar()? {
            self.calendar_id = Some(id.clone());
            return Ok(id);
        }

        Err(SyncError::CalendarNotFound)
    }

    /// Find existing Pomodoroom calendar or create new one.
    fn find_or_create_pomodoroom_calendar(&self) -> Result<Option<String>, SyncError> {
        let token = self.google.access_token()?;

        // List calendars to find Pomodoroom
        let calendars: serde_json::Value = tokio::runtime::Handle::current()
            .block_on(async {
                reqwest::Client::new()
                    .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
                    .bearer_auth(&token)
                    .send()
                    .await?
                    .json()
                    .await
            })?;

        if let Some(items) = calendars["items"].as_array() {
            for cal in items {
                if cal["summary"].as_str() == Some("Pomodoroom") {
                    return Ok(cal["id"].as_str().map(|s| s.to_string()));
                }
            }
        }

        // Not found - create new calendar
        let new_cal: serde_json::Value = tokio::runtime::Handle::current()
            .block_on(async {
                reqwest::Client::new()
                    .post("https://www.googleapis.com/calendar/v3/calendars")
                    .bearer_auth(&token)
                    .json(&json!({"summary": "Pomodoroom"}))
                    .send()
                    .await?
                    .json()
                    .await
            })?;

        Ok(new_cal["id"].as_str().map(|s| s.to_string()))
    }

    /// Fetch events since last sync.
    pub fn fetch_events(
        &self,
        since: Option<DateTime<Utc>>,
    ) -> Result<Vec<serde_json::Value>, SyncError> {
        let calendar_id = self.calendar_id.as_ref()
            .ok_or(SyncError::CalendarNotFound)?;
        let token = self.google.access_token()?;

        let mut url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            calendar_id
        );

        let mut params = vec![
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ];

        if let Some(since) = since {
            params.push(("timeMin", since.to_rfc3339()));
        }

        // Build query string
        let query = params.iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        url.push('?');
        url.push_str(&query);

        let response: serde_json::Value = tokio::runtime::Handle::current()
            .block_on(async {
                reqwest::Client::new()
                    .get(&url)
                    .bearer_auth(&token)
                    .send()
                    .await?
                    .json()
                    .await
            })?;

        Ok(response["items"]
            .as_array()
            .cloned()
            .unwrap_or_default())
    }

    /// Batch upsert events.
    pub fn batch_upsert(&self, events: &[SyncEvent]) -> Result<(), SyncError> {
        let calendar_id = self.calendar_id.as_ref()
            .ok_or(SyncError::CalendarNotFound)?;

        for event in events {
            let gcal_event = to_gcal_event(event, calendar_id)?;
            self.upsert_event(&gcal_event)?;
        }

        Ok(())
    }

    /// Upsert single event.
    fn upsert_event(&self, event: &serde_json::Value) -> Result<(), SyncError> {
        let calendar_id = self.calendar_id.as_ref()
            .ok_or(SyncError::CalendarNotFound)?;
        let token = self.google.access_token()?;

        let event_id = event["extendedProperties"]["private"]["pomodoroom_id"]
            .as_str()
            .ok_or(SyncError::CalendarApi("Missing event ID".into()))?;

        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
            calendar_id, event_id
        );

        // Try PUT (update) first, fall back to POST (create)
        let result = tokio::runtime::Handle::current().block_on(async {
            reqwest::Client::new()
                .put(&url)
                .bearer_auth(&token)
                .json(event)
                .send()
                .await
        });

        match result {
            Ok(resp) if resp.status().is_success() => Ok(()),
            Ok(_) => {
                // Not found, try creating
                let url = format!(
                    "https://www.googleapis.com/calendar/v3/calendars/{}/events",
                    calendar_id
                );
                tokio::runtime::Handle::current().block_on(async {
                    reqwest::Client::new()
                        .post(&url)
                        .bearer_auth(&token)
                        .json(event)
                        .send()
                        .await?
                        .error_for_status()
                        .map_err(|e| SyncError::CalendarApi(e.to_string()))
                })
            }
            Err(e) => Err(SyncError::CalendarApi(e.to_string())),
        }
    }
}

impl Default for CalendarClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert SyncEvent to Google Calendar event format.
pub fn to_gcal_event(
    event: &SyncEvent,
    calendar_id: &str,
) -> Result<serde_json::Value, SyncError> {
    let prefix = event.event_type.event_prefix();
    let summary = format!("{} {}", prefix, event.id);

    // Use updated_at for both start and end (all-day event)
    let date_str = event.updated_at.format("%Y-%m-%d").to_string();

    let mut gcal_event = json!({
        "summary": summary,
        "start": {"date": date_str},
        "end": {"date": date_str},
        "description": event.data.to_string(),
        "extendedProperties": {
            "private": {
                "pomodoroom_type": format!("{:?}", event.event_type),
                "pomodoroom_id": event.id,
                "pomodoroom_version": "1",
                "pomodoroom_updated": event.updated_at.to_rfc3339(),
            }
        }
    });

    if event.deleted {
        gcal_event["status"] = json!("cancelled");
    }

    Ok(gcal_event)
}

/// Find Pomodoroom calendar in a list of calendars.
pub fn find_pomodoroom_calendar_in_list(
    calendars: &[serde_json::Value],
) -> Option<String> {
    calendars
        .iter()
        .find(|c| c["summary"].as_str() == Some("Pomodoroom"))
        .and_then(|c| c["id"].as_str())
        .map(|s| s.to_string())
}
```

**Step 4: Add urlencoding dependency**

Modify `crates/pomodoroom-core/Cargo.toml`:

```toml
urlencoding = "2.1"
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core calendar_client`
Expected: PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/sync/calendar_client.rs
git add crates/pomodoroom-core/Cargo.toml
git commit -m "feat(sync): add Google Calendar API client"
```

---

### Task 4: sync/event_codec.rs - Event ↔ データ型 変換

**Files:**
- Create: `crates/pomodoroom-core/src/sync/event_codec.rs`

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/event_codec_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::event_codec::*;
    use crate::task::{Task, TaskState};
    use crate::sync::types::SyncEventType;
    use chrono::Utc;

    #[test]
    fn test_task_to_sync_event() {
        let task = Task {
            id: "task-123".to_string(),
            title: "Test Task".to_string(),
            description: None,
            state: TaskState::Ready,
            ..Default::default()
        };

        let sync_event = task_to_sync_event(&task).unwrap();
        assert_eq!(sync_event.id, "task-123");
        assert_eq!(sync_event.event_type, SyncEventType::Task);
        assert_eq!(sync_event.data["title"], "Test Task");
    }

    #[test]
    fn test_sync_event_to_task() {
        let data = serde_json::json!({
            "id": "task-456",
            "title": "Another Task",
            "state": "RUNNING"
        });

        let task = sync_event_to_task("task-456", &data).unwrap();
        assert_eq!(task.id, "task-456");
        assert_eq!(task.title, "Another Task");
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core event_codec`
Expected: FAIL with "not found"

**Step 3: Implement event_codec.rs**

Create `crates/pomodoroom-core/src/sync/event_codec.rs`:

```rust
//! Encoding/decoding between sync events and domain types.

use crate::sync::types::{SyncEvent, SyncEventType, SyncError};
use crate::task::Task;
use crate::schedule::{Project, Group, DailyTemplate, FixedEvent, ScheduleBlock};
use crate::storage::database::SessionRecord;

// ============================================================================
// Task Encoding/Decoding
// ============================================================================

/// Convert Task to SyncEvent.
pub fn task_to_sync_event(task: &Task) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(task)?;
    Ok(SyncEvent {
        id: task.id.clone(),
        event_type: SyncEventType::Task,
        data,
        updated_at: task.updated_at,
        deleted: false,
    })
}

/// Convert SyncEvent to Task.
pub fn sync_event_to_task(id: &str, data: &serde_json::Value) -> Result<Task, SyncError> {
    let mut task: Task = serde_json::from_value(data.clone())?;
    task.id = id.to_string();
    Ok(task)
}

/// Create deletion event for Task.
pub fn task_deletion_event(task: &Task) -> SyncEvent {
    SyncEvent {
        id: task.id.clone(),
        event_type: SyncEventType::Task,
        data: serde_json::to_value(task).unwrap_or_default(),
        updated_at: task.updated_at,
        deleted: true,
    }
}

// ============================================================================
// Project Encoding/Decoding
// ============================================================================

/// Convert Project to SyncEvent.
pub fn project_to_sync_event(project: &Project) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(project)?;
    Ok(SyncEvent {
        id: project.id.clone(),
        event_type: SyncEventType::Project,
        data,
        updated_at: project.created_at, // Project has no updated_at
        deleted: false,
    })
}

/// Convert SyncEvent to Project.
pub fn sync_event_to_project(id: &str, data: &serde_json::Value) -> Result<Project, SyncError> {
    let mut project: Project = serde_json::from_value(data.clone())?;
    project.id = id.to_string();
    Ok(project)
}

// ============================================================================
// Group Encoding/Decoding
// ============================================================================

/// Convert Group to SyncEvent.
pub fn group_to_sync_event(group: &Group) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(group)?;
    Ok(SyncEvent {
        id: group.id.clone(),
        event_type: SyncEventType::Group,
        data,
        updated_at: group.updated_at,
        deleted: false,
    })
}

/// Convert SyncEvent to Group.
pub fn sync_event_to_group(id: &str, data: &serde_json::Value) -> Result<Group, SyncError> {
    let mut group: Group = serde_json::from_value(data.clone())?;
    group.id = id.to_string();
    Ok(group)
}

// ============================================================================
// DailyTemplate Encoding/Decoding
// ============================================================================

/// Convert DailyTemplate to SyncEvent.
///
/// Uses a fixed ID since there's typically one active template.
pub fn daily_template_to_sync_event(template: &DailyTemplate) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(template)?;
    Ok(SyncEvent {
        id: "daily-template".to_string(),
        event_type: SyncEventType::DailyTemplate,
        data,
        updated_at: chrono::Utc::now(),
        deleted: false,
    })
}

/// Convert SyncEvent to DailyTemplate.
pub fn sync_event_to_daily_template(data: &serde_json::Value) -> Result<DailyTemplate, SyncError> {
    serde_json::from_value(data.clone()).map_err(Into::into)
}

// ============================================================================
// Session Encoding/Decoding
// ============================================================================

/// Convert SessionRecord to SyncEvent.
pub fn session_to_sync_event(session: &SessionRecord) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(session)?;
    Ok(SyncEvent {
        id: session.id.to_string(),
        event_type: SyncEventType::Session,
        data,
        updated_at: session.completed_at,
        deleted: false,
    })
}

/// Convert SyncEvent to SessionRecord.
pub fn sync_event_to_session(id: i64, data: &serde_json::Value) -> Result<SessionRecord, SyncError> {
    let mut session: SessionRecord = serde_json::from_value(data.clone())?;
    session.id = id;
    Ok(session)
}

// ============================================================================
// Config Encoding/Decoding
// ============================================================================

/// Convert Config to SyncEvent.
pub fn config_to_sync_event(config: &crate::storage::Config) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(config)?;
    Ok(SyncEvent {
        id: "app-config".to_string(),
        event_type: SyncEventType::Config,
        data,
        updated_at: chrono::Utc::now(),
        deleted: false,
    })
}

/// Convert SyncEvent to Config.
pub fn sync_event_to_config(data: &serde_json::Value) -> Result<crate::storage::Config, SyncError> {
    serde_json::from_value(data.clone()).map_err(Into::into)
}
```

**Step 4: Update mod.rs**

Modify `crates/pomodoroom-core/src/sync/mod.rs`:

```rust
//! Google Calendar synchronization layer.

pub mod types;
pub mod device_id;
pub mod calendar_client;
pub mod event_codec;

pub use types::{SyncEvent, SyncEventType, SyncStatus, SyncError};
pub use device_id::{get_or_create_device_id, get_or_create_device_id_at};
pub use calendar_client::{CalendarClient, to_gcal_event, find_pomodoroom_calendar_in_list};
pub use event_codec::{
    task_to_sync_event, sync_event_to_task, task_deletion_event,
    project_to_sync_event, sync_event_to_project,
    group_to_sync_event, sync_event_to_group,
    daily_template_to_sync_event, sync_event_to_daily_template,
    session_to_sync_event, sync_event_to_session,
    config_to_sync_event, sync_event_to_config,
};
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core event_codec`
Expected: PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/sync/event_codec.rs
git add crates/pomodoroom-core/src/sync/mod.rs
git commit -m "feat(sync): add event encoding/decoding"
```

---

## M1: Read Path - リモート → ローカル

### Task 5: sync_engine.rs - 起動時同期

**Files:**
- Create: `crates/pomodoroom-core/src/sync/sync_engine.rs`
- Create: `crates/pomodoroom-core/src/sync/sync_engine_tests.rs`

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/sync_engine_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::sync_engine::*;
    use crate::sync::types::{SyncEvent, SyncEventType};
    use chrono::Utc;

    #[test]
    fn test_merge_decision_local_newer() {
        let local_time = Utc::now();
        let remote_time = local_time - chrono::Duration::hours(1);

        let decision = decide_merge(local_time, remote_time, false, false);
        assert_eq!(decision, MergeDecision::UseLocal);
    }

    #[test]
    fn test_merge_decision_remote_newer() {
        let local_time = Utc::now() - chrono::Duration::hours(1);
        let remote_time = Utc::now();

        let decision = decide_merge(local_time, remote_time, false, false);
        assert_eq!(decision, MergeDecision::UseRemote);
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core sync_engine`
Expected: FAIL with "not found"

**Step 3: Implement sync_engine.rs**

Create `crates/pomodoroom-core/src/sync/sync_engine.rs`:

```rust
//! Sync engine for bidirectional calendar synchronization.

use crate::sync::types::{SyncEvent, SyncError, SyncStatus};
use crate::sync::calendar_client::CalendarClient;
use crate::sync::event_codec::*;
use chrono::{DateTime, Utc, Duration};
use std::sync::{Arc, Mutex};

/// Merge decision for conflicting events.
#[derive(Debug, Clone, PartialEq)]
pub enum MergeDecision {
    UseLocal,
    UseRemote,
    Merge(SyncEvent),
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
        let mut applied_count = 0;
        for event_json in remote_events {
            if let Ok(sync_event) = parse_gcal_event(&event_json) {
                self.apply_remote_event(&sync_event)?;
                applied_count += 1;
            }
        }

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
        use crate::sync::types::SyncEventType;

        match event.event_type {
            SyncEventType::Task => {
                let task = sync_event_to_task(&event.id, &event.data)?;
                // TODO: Upsert to SQLite via schedule_db
                log::debug!("Applied remote task: {}", task.title);
            }
            SyncEventType::Project => {
                let project = sync_event_to_project(&event.id, &event.data)?;
                log::debug!("Applied remote project: {}", project.name);
            }
            SyncEventType::Config => {
                let config = sync_event_to_config(&event.data)?;
                // TODO: Save to config.toml
                log::debug!("Applied remote config");
            }
            _ => {
                log::debug!("Unhandled event type: {:?}", event.event_type);
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

    let updated_at: DateTime<Utc> = DateTime::parse_from_rfc3339(updated_str)?
        .with_timezone(&Utc);

    let data: serde_json::Value = serde_json::from_str(
        event_json["description"]
            .as_str()
            .unwrap_or("{}")
    )?;

    // Parse event type from string
    let event_type = match event_type_str {
        "Task" => crate::sync::types::SyncEventType::Task,
        "Project" => crate::sync::types::SyncEventType::Project,
        "Group" => crate::sync::types::SyncEventType::Group,
        "DailyTemplate" => crate::sync::types::SyncEventType::DailyTemplate,
        "Session" => crate::sync::types::SyncEventType::Session,
        "Config" => crate::sync::types::SyncEventType::Config,
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
}
```

**Step 4: Update mod.rs**

Modify `crates/pomodoroom-core/src/sync/mod.rs`:

```rust
//! Google Calendar synchronization layer.

pub mod types;
pub mod device_id;
pub mod calendar_client;
pub mod event_codec;
pub mod sync_engine;

pub use types::{SyncEvent, SyncEventType, SyncStatus, SyncError};
pub use device_id::{get_or_create_device_id, get_or_create_device_id_at};
pub use calendar_client::{CalendarClient, to_gcal_event, find_pomodoroom_calendar_in_list};
pub use event_codec::{
    task_to_sync_event, sync_event_to_task, task_deletion_event,
    project_to_sync_event, sync_event_to_project,
    group_to_sync_event, sync_event_to_group,
    daily_template_to_sync_event, sync_event_to_daily_template,
    session_to_sync_event, sync_event_to_session,
    config_to_sync_event, sync_event_to_config,
};
pub use sync_engine::{SyncEngine, MergeDecision, decide_merge, parse_gcal_event};
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core sync_engine`
Expected: PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/sync/sync_engine.rs
git add crates/pomodoroom-core/src/sync/mod.rs
git commit -m "feat(sync): add sync engine with startup sync"
```

---

### Task 6: Integrate startup sync into main app

**Files:**
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/bridge.rs`

**Step 1: Add Tauri command for sync**

Modify `src-tauri/src/bridge.rs`:

Add to imports:
```rust
use pomodoroom_core::sync::{SyncEngine, SyncStatus};
```

Add command:
```rust
/// Perform startup sync with Google Calendar.
#[tauri::command]
async fn sync_startup() -> Result<SyncStatus, String> {
    let mut engine = SyncEngine::new();
    engine.startup_sync().map_err(|e| e.to_string())
}

/// Get current sync status.
#[tauri::command]
async fn sync_get_status() -> Result<SyncStatus, String> {
    let engine = SyncEngine::new();
    Ok(engine.status())
}
```

Add to `invoke_handler()` in `main.rs`:
```rust
invoke_handler![
    // ... existing commands ...
    sync_startup,
    sync_get_status,
]
```

**Step 2: Update frontend types**

Modify `src/types/sync.ts` (create if not exists):

```typescript
export interface SyncStatus {
  last_sync_at: string | null;
  pending_count: number;
  in_progress: boolean;
}

export async function syncStartup(): Promise<SyncStatus> {
  return invoke('sync_startup');
}

export async function syncGetStatus(): Promise<SyncStatus> {
  return invoke('sync_get_status');
}
```

**Step 3: Call sync on app startup**

Modify `src/main.tsx`:

```typescript
import { syncStartup } from './types/sync';

async function initApp() {
  // ... existing init ...

  // Perform startup sync
  try {
    const status = await syncStartup();
    console.log('Sync completed:', status);
  } catch (err) {
    console.warn('Sync failed (may require auth):', err);
  }
}

initApp();
```

**Step 4: Test compilation**

Run: `pnpm run tauri build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add src-tauri/src/bridge.rs
git add src-tauri/src/main.rs
git add src/types/sync.ts
git add src/main.tsx
git commit -m "feat(sync): integrate startup sync into app"
```

---

## M2: Write Path - ローカル → リモート

### Task 7: sync_queue.rs - 変更キュー

**Files:**
- Create: `crates/pomodoroom-core/src/sync/sync_queue.rs`
- Create: `crates/pomodoroom-core/src/sync/sync_queue_tests.rs`

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/sync_queue_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::sync_queue::*;
    use crate::sync::types::{SyncEvent, SyncEventType};
    use chrono::Utc;

    #[test]
    fn test_enqueue_and_drain() {
        let mut queue = SyncQueue::new();
        let event = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({}),
            updated_at: Utc::now(),
            deleted: false,
        };

        queue.enqueue(event.clone());
        assert_eq!(queue.len(), 1);

        let drained = queue.drain_up_to(10);
        assert_eq!(drained.len(), 1);
        assert_eq!(queue.len(), 0);
    }

    #[test]
    fn test_debounce_same_id() {
        let mut queue = SyncQueue::new();

        let event1 = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"v": 1}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let event2 = SyncEvent {
            id: "test-1".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"v": 2}),
            updated_at: Utc::now() + chrono::Duration::seconds(1),
            deleted: false,
        };

        queue.enqueue(event1);
        queue.enqueue(event2);

        // Should have only 1 (debounced)
        assert_eq!(queue.len(), 1);

        let drained = queue.drain_up_to(10);
        assert_eq!(drained[0].data["v"], 2);
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core sync_queue`
Expected: FAIL with "not found"

**Step 3: Implement sync_queue.rs**

Create `crates/pomodoroom-core/src/sync/sync_queue.rs`:

```rust
//! In-memory sync queue with debounce support.

use crate::sync::types::SyncEvent;
use chrono::{DateTime, Utc, Duration};
use std::collections::HashMap;
use std::path::PathBuf;

/// Pending sync event with debounce timestamp.
#[derive(Debug, Clone)]
struct PendingEvent {
    event: SyncEvent,
    debounce_until: DateTime<Utc>,
}

/// Sync queue for batching upload operations.
pub struct SyncQueue {
    /// Pending events by ID for debounce.
    pending: HashMap<String, PendingEvent>,
    /// When to next process debounced events.
    next_process: Option<DateTime<Utc>>,
    /// Persistent queue file path.
    queue_file: PathBuf,
}

impl SyncQueue {
    /// Create new sync queue.
    pub fn new() -> Self {
        let data_dir = crate::storage::data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let queue_file = data_dir.join("sync_queue.json");

        Self {
            pending: HashMap::new(),
            next_process: None,
            queue_file,
        }
    }

    /// Enqueue an event for sync (with debounce).
    pub fn enqueue(&mut self, event: SyncEvent) {
        let debounce_until = Utc::now() + Duration::seconds(3);
        self.pending.insert(
            event.id.clone(),
            PendingEvent {
                event,
                debounce_until,
            },
        );

        // Update next process time
        self.update_next_process();
    }

    /// Drain up to n events ready for sync.
    pub fn drain_up_to(&mut self, n: usize) -> Vec<SyncEvent> {
        let now = Utc::now();
        let mut ready = Vec::new();

        self.pending.retain(|_, pending| {
            if pending.debounce_until <= now && ready.len() < n {
                ready.push(pending.event.clone());
                false // Remove from pending
            } else {
                true // Keep in pending
            }
        });

        self.update_next_process();
        ready
    }

    /// Get number of pending events.
    pub fn len(&self) -> usize {
        self.pending.len()
    }

    /// Check if queue is empty.
    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    /// Get time until next batch is ready.
    pub fn time_until_next_batch(&self) -> Option<Duration> {
        self.next_process.map(|t| {
            let now = Utc::now();
            if t > now {
                t - now
            } else {
                Duration::zero()
            }
        })
    }

    /// Persist queue to disk.
    pub fn persist(&self) -> Result<(), std::io::Error> {
        let data = serde_json::to_string_pretty(&self.pending)?;
        std::fs::write(&self.queue_file, data)?;
        Ok(())
    }

    /// Load queue from disk.
    pub fn load(&mut self) -> Result<(), std::io::Error> {
        if !self.queue_file.exists() {
            return Ok(());
        }

        let content = std::fs::read_to_string(&self.queue_file)?;
        let loaded: HashMap<String, PendingEvent> = serde_json::from_str(&content)?;
        self.pending = loaded;
        self.update_next_process();
        Ok(())
    }

    /// Update next process time based on earliest debounce.
    fn update_next_process(&mut self) {
        self.next_process = self.pending
            .values()
            .map(|p| p.debounce_until)
            .min();
    }
}

impl Default for SyncQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enqueue_debounce() {
        let mut queue = SyncQueue::new();

        let event = SyncEvent {
            id: "test-1".to_string(),
            event_type: crate::sync::types::SyncEventType::Task,
            data: serde_json::json!({}),
            updated_at: Utc::now(),
            deleted: false,
        };

        queue.enqueue(event.clone());
        assert_eq!(queue.len(), 1);

        // Should be empty immediately (debounce not expired)
        let ready = queue.drain_up_to(10);
        assert_eq!(ready.len(), 0);
        assert_eq!(queue.len(), 1); // Still pending
    }

    #[test]
    fn test_same_id_replacement() {
        let mut queue = SyncQueue::new();

        let event1 = SyncEvent {
            id: "test-1".to_string(),
            event_type: crate::sync::types::SyncEventType::Task,
            data: serde_json::json!({"v": 1}),
            updated_at: Utc::now(),
            deleted: false,
        };

        let event2 = SyncEvent {
            id: "test-1".to_string(),
            event_type: crate::sync::types::SyncEventType::Task,
            data: serde_json::json!({"v": 2}),
            updated_at: Utc::now(),
            deleted: false,
        };

        queue.enqueue(event1);
        queue.enqueue(event2);

        assert_eq!(queue.len(), 1); // Replaced
    }

    #[test]
    fn test_time_until_next_batch() {
        let mut queue = SyncQueue::new();
        assert!(queue.time_until_next_batch().is_none());

        let event = SyncEvent {
            id: "test-1".to_string(),
            event_type: crate::sync::types::SyncEventType::Task,
            data: serde_json::json!({}),
            updated_at: Utc::now(),
            deleted: false,
        };

        queue.enqueue(event);
        let time = queue.time_until_next_batch();
        assert!(time.is_some());
        assert!(time.unwrap().num_seconds() <= 3);
        assert!(time.unwrap().num_seconds() > 0);
    }
}
```

**Step 4: Implement PendingEvent serialization**

Add to `sync_queue.rs` before `SyncQueue`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingEvent {
    #[serde(flatten)]
    event: SyncEvent,
    debounce_until: String, // RFC3339
}

impl PendingEvent {
    fn debounce_until(&self) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&self.debounce_until)
            .unwrap()
            .with_timezone(&Utc)
    }
}
```

Wait - this requires restructuring. Let me fix the implementation:

**Revised Step 4:**

Replace `PendingEvent` with serializable version:

```rust
/// Pending sync event with debounce timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingEvent {
    /// The event to sync.
    #[serde(flatten)]
    pub event: SyncEvent,
    /// When debounce expires (RFC3339 string).
    pub debounce_until: String,
}

impl PendingEvent {
    /// Create new pending event with debounce duration.
    fn new(event: SyncEvent, debounce_until: DateTime<Utc>) -> Self {
        Self {
            event,
            debounce_until: debounce_until.to_rfc3339(),
        }
    }

    /// Get debounce expiry time.
    fn expires_at(&self) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&self.debounce_until)
            .unwrap()
            .with_timezone(&Utc)
    }
}
```

Update `SyncQueue` methods:

```rust
    /// Enqueue an event for sync (with debounce).
    pub fn enqueue(&mut self, event: SyncEvent) {
        let debounce_until = Utc::now() + Duration::seconds(3);
        self.pending.insert(
            event.id.clone(),
            PendingEvent::new(event, debounce_until),
        );
        self.update_next_process();
    }

    /// Drain up to n events ready for sync.
    pub fn drain_up_to(&mut self, n: usize) -> Vec<SyncEvent> {
        let now = Utc::now();
        let mut ready = Vec::new();

        self.pending.retain(|_, pending| {
            if pending.expires_at() <= now && ready.len() < n {
                ready.push(pending.event.clone());
                false
            } else {
                true
            }
        });

        self.update_next_process();
        ready
    }

    /// Update next process time based on earliest debounce.
    fn update_next_process(&mut self) {
        self.next_process = self.pending
            .values()
            .map(|p| p.expires_at())
            .min();
    }
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core sync_queue`
Expected: PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/sync/sync_queue.rs
git commit -m "feat(sync): add sync queue with debounce"
```

---

### Task 8: Batch write sync

**Files:**
- Modify: `crates/pomodoroom-core/src/sync/sync_engine.rs`

**Step 1: Add batch sync method to SyncEngine**

Modify `crates/pomodoroom-core/src/sync/sync_engine.rs`:

```rust
use crate::sync::sync_queue::SyncQueue;

/// Sync engine managing bidirectional sync.
pub struct SyncEngine {
    client: CalendarClient,
    last_sync_at: Arc<Mutex<Option<DateTime<Utc>>>>,
    queue: Arc<Mutex<SyncQueue>>,
}

impl SyncEngine {
    /// Create new sync engine.
    pub fn new() -> Self {
        Self {
            client: CalendarClient::new(),
            last_sync_at: Arc::new(Mutex::new(None)),
            queue: Arc::new(Mutex::new(SyncQueue::new())),
        }
    }

    /// ... existing methods ...

    /// Enqueue a local change for sync.
    pub fn enqueue_change(&self, event: SyncEvent) -> Result<(), SyncError> {
        let mut queue = self.queue.lock().unwrap();
        queue.enqueue(event);
        queue.persist()?;
        Ok(())
    }

    /// Perform batch sync of pending changes.
    pub fn batch_sync(&mut self) -> Result<SyncStatus, SyncError> {
        // Ensure calendar exists
        self.client.ensure_pomodoroom_calendar()?;

        // Drain up to 10 events
        let events = {
            let mut queue = self.queue.lock().unwrap();
            queue.drain_up_to(10)
        };

        if events.is_empty() {
            return Ok(SyncStatus {
                last_sync_at: *self.last_sync_at.lock().unwrap(),
                pending_count: 0,
                in_progress: false,
            });
        }

        // Batch upload to calendar
        self.client.batch_upsert(&events)?;

        // Persist queue state
        {
            let mut queue = self.queue.lock().unwrap();
            queue.persist()?;
        }

        // Update last sync time
        *self.last_sync_at.lock().unwrap() = Some(Utc::now());

        // Get remaining count
        let pending_count = {
            let queue = self.queue.lock().unwrap();
            queue.len()
        };

        Ok(SyncStatus {
            last_sync_at: Some(Utc::now()),
            pending_count,
            in_progress: pending_count > 0,
        })
    }

    /// Get current sync status.
    pub fn status(&self) -> SyncStatus {
        let last_sync = *self.last_sync_at.lock().unwrap();
        let pending_count = {
            let queue = self.queue.lock().unwrap();
            queue.len()
        };

        SyncStatus {
            last_sync_at: last_sync,
            pending_count,
            in_progress: false,
        }
    }
}
```

**Step 2: Update mod.rs**

Modify `crates/pomodoroom-core/src/sync/mod.rs`:

```rust
pub mod sync_queue;
pub use sync_queue::SyncQueue;
```

**Step 3: Add test**

Add to `sync_engine_tests.rs`:

```rust
    #[test]
    fn test_enqueue_and_batch_sync() {
        let engine = SyncEngine::new();

        let event = SyncEvent {
            id: "test-sync".to_string(),
            event_type: SyncEventType::Task,
            data: serde_json::json!({"title": "Sync Test"}),
            updated_at: Utc::now(),
            deleted: false,
        };

        // Enqueue
        engine.enqueue_change(event.clone()).unwrap();
        assert_eq!(engine.status().pending_count, 1);

        // Batch sync (will fail without auth, but queue should drain)
        let _ = engine.batch_sync();
        // Note: In real test, would mock calendar client
    }
```

**Step 4: Run tests**

Run: `cargo test -p pomodoroom-core sync_engine`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/pomodoroom-core/src/sync/sync_engine.rs
git add crates/pomodoroom-core/src/sync/mod.rs
git commit -m "feat(sync): add batch write sync"
```

---

## M3: Conflict - コンフリクト解決

### Task 9: conflict_resolver.rs - マージロジック

**Files:**
- Create: `crates/pomodoroom-core/src/sync/conflict_resolver.rs`

**Step 1: Write the failing test**

Create `crates/pomodoroom-core/src/sync/conflict_resolver_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::conflict_resolver::*;
    use crate::task::{Task, TaskState};
    use crate::sync::types::SyncEvent;
    use chrono::Utc;

    #[test]
    fn test_merge_task_state() {
        let local = Task {
            id: "test".to_string(),
            title: "Test".to_string(),
            state: TaskState::Ready,
            ..Default::default()
        };

        let remote = Task {
            id: "test".to_string(),
            title: "Test".to_string(),
            state: TaskState::Running,
            ..Default::default()
        };

        let merged = merge_task_state(local.state, remote.state);
        assert_eq!(merged, TaskState::Running); // RUNNING > READY
    }

    #[test]
    fn test_field_merge_tasks() {
        let local = Task {
            id: "test".to_string(),
            title: "Local Title".to_string(),
            state: TaskState::Running,
            tags: vec!["local".to_string()],
            updated_at: Utc::now() - chrono::Duration::minutes(10),
            ..Default::default()
        };

        let remote = Task {
            id: "test".to_string(),
            title: "Remote Title".to_string(),
            state: TaskState::Ready,
            tags: vec!["remote".to_string()],
            updated_at: Utc::now(),
            ..Default::default()
        };

        let merged = merge_task_fields(&local, &remote);
        assert_eq!(merged.title, "Remote Title"); // Remote wins (newer)
        assert_eq!(merged.state, TaskState::Running); // RUNNING > READY
        // Tags should be merged (union)
        assert!(merged.tags.contains(&"local".to_string()));
        assert!(merged.tags.contains(&"remote".to_string()));
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p pomodoroom-core conflict_resolver`
Expected: FAIL with "not found"

**Step 3: Implement conflict_resolver.rs**

Create `crates/pomodoroom-core/src/sync/conflict_resolver.rs`:

```rust
//! Conflict resolution for sync events.

use crate::task::{Task, TaskState};
use crate::sync::types::{SyncEvent, SyncEventType};

/// Merge decision for conflicting events.
#[derive(Debug, Clone, PartialEq)]
pub enum MergeDecision {
    UseLocal,
    UseRemote,
    Merged(SyncEvent),
    NeedsUserChoice,
}

/// Resolve conflict between two sync events.
pub fn resolve_conflict(
    local: &SyncEvent,
    remote: &SyncEvent,
) -> MergeDecision {
    // Different types - shouldn't happen, but use remote
    if local.event_type != remote.event_type {
        return MergeDecision::UseRemote;
    }

    // One is deleted - deletion wins
    if local.deleted {
        return MergeDecision::UseLocal;
    }
    if remote.deleted {
        return MergeDecision::UseRemote;
    }

    // Try field-level merge for supported types
    match local.event_type {
        SyncEventType::Task => {
            if let (Ok(local_task), Ok(remote_task)) = (
                serde_json::from_value::<Task>(local.data.clone()),
                serde_json::from_value::<Task>(remote.data.clone()),
            ) {
                let merged = merge_task_fields(&local_task, &remote_task);
                let merged_data = serde_json::to_value(&merged).unwrap();
                return MergeDecision::Merged(SyncEvent {
                    id: local.id.clone(),
                    event_type: SyncEventType::Task,
                    data: merged_data,
                    updated_at: std::cmp::max(local.updated_at, remote.updated_at),
                    deleted: false,
                });
            }
        }
        _ => {}
    }

    // Fall back to timestamp-based
    if remote.updated_at > local.updated_at {
        MergeDecision::UseRemote
    } else {
        MergeDecision::UseLocal
    }
}

/// Merge two tasks, combining fields intelligently.
pub fn merge_task_fields(local: &Task, remote: &Task) -> Task {
    let mut merged = Task {
        id: local.id.clone(),
        // Newer timestamp wins
        updated_at: std::cmp::max(local.updated_at, remote.updated_at),
        // State: progress wins (DONE > RUNNING > PAUSED > READY)
        state: merge_task_state(local.state, remote.state),
        // Title: newer wins
        title: if remote.updated_at > local.updated_at {
            remote.title.clone()
        } else {
            local.title.clone()
        },
        // Description: concatenate if both exist and differ
        description: merge_optional_text(
            local.description.as_deref(),
            remote.description.as_deref(),
        ),
        // Tags: union of both
        tags: merge_string_lists(&local.tags, &remote.tags),
        // Project IDs: union
        project_ids: merge_string_lists(&local.project_ids, &remote.project_ids),
        // Group IDs: union
        group_ids: merge_string_lists(&local.group_ids, &remote.group_ids),
        // Use local as base for remaining fields
        ..local.clone()
    };

    // Override fields where remote is newer
    if remote.updated_at > local.updated_at {
        merged.priority = remote.priority.or(local.priority);
        merged.energy = remote.energy; // Energy level from remote
        merged.estimated_minutes = remote.estimated_minutes.or(local.estimated_minutes);
        merged.required_minutes = remote.required_minutes.or(local.required_minutes);
    }

    merged
}

/// Merge task states using priority order.
/// DONE > RUNNING > PAUSED > READY
pub fn merge_task_state(local: TaskState, remote: TaskState) -> TaskState {
    use TaskState::*;

    match (local, remote) {
        // DONE always wins
        (DONE, _) | (_, DONE) => DONE,

        // RUNNING beats PAUSED and READY
        (RUNNING, _) | (_, RUNNING) => RUNNING,

        // PAUSED beats READY
        (PAUSED, READY) | (READY, PAUSED) => PAUSED,
        (PAUSED, PAUSED) => PAUSED,

        // READY is lowest
        (READY, READY) => READY,
    }
}

/// Merge two optional text fields.
fn merge_optional_text(local: Option<&str>, remote: Option<&str>) -> Option<String> {
    match (local, remote) {
        (Some(l), Some(r)) if l != r => Some(format!("{}\n---\n{}", l, r)),
        (Some(l), None) => Some(l.to_string()),
        (None, Some(r)) => Some(r.to_string()),
        (None, None) => None,
    }
}

/// Merge two string lists, keeping unique values.
fn merge_string_lists(local: &[String], remote: &[String]) -> Vec<String> {
    let mut merged: std::collections::HashSet<String> = local.iter().cloned().collect();
    merged.extend(remote.iter().cloned());
    merged.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_merge_task_state_priority() {
        // DONE beats everything
        assert_eq!(merge_task_state(TaskState::Done, TaskState::Ready), TaskState::Done);
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Done), TaskState::Done);

        // RUNNING beats PAUSED and READY
        assert_eq!(merge_task_state(TaskState::Running, TaskState::Paused), TaskState::Running);
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Running), TaskState::Running);

        // PAUSED beats READY
        assert_eq!(merge_task_state(TaskState::Paused, TaskState::Ready), TaskState::Paused);
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Paused), TaskState::Paused);

        // Same states
        assert_eq!(merge_task_state(TaskState::Ready, TaskState::Ready), TaskState::Ready);
    }

    #[test]
    fn test_merge_string_lists() {
        let local = vec!["a".to_string(), "b".to_string()];
        let remote = vec!["b".to_string(), "c".to_string()];
        let merged = merge_string_lists(&local, &remote);

        assert_eq!(merged.len(), 3);
        assert!(merged.contains(&"a".to_string()));
        assert!(merged.contains(&"b".to_string()));
        assert!(merged.contains(&"c".to_string()));
    }

    #[test]
    fn test_merge_task_fields() {
        let now = Utc::now();
        let earlier = now - chrono::Duration::minutes(10);

        let local = Task {
            id: "test".to_string(),
            title: "Local Title".to_string(),
            state: TaskState::Running,
            tags: vec!["local".to_string()],
            updated_at: earlier,
            ..Default::default()
        };

        let remote = Task {
            id: "test".to_string(),
            title: "Remote Title".to_string(),
            state: TaskState::Ready,
            tags: vec!["remote".to_string()],
            updated_at: now,
            ..Default::default()
        };

        let merged = merge_task_fields(&local, &remote);

        assert_eq!(merged.title, "Remote Title"); // Newer wins
        assert_eq!(merged.state, TaskState::Running); // RUNNING > READY
        assert_eq!(merged.tags.len(), 2); // Union
    }
}
```

**Step 4: Update mod.rs**

Modify `crates/pomodoroom-core/src/sync/mod.rs`:

```rust
pub mod conflict_resolver;
pub use conflict_resolver::{MergeDecision, resolve_conflict, merge_task_fields, merge_task_state};
```

**Step 5: Run tests to verify they pass**

Run: `cargo test -p pomodoroom-core conflict_resolver`
Expected: PASS

**Step 6: Commit**

```bash
git add crates/pomodoroom-core/src/sync/conflict_resolver.rs
git add crates/pomodoroom-core/src/sync/mod.rs
git commit -m "feat(sync): add conflict resolver with field-level merge"
```

---

## M4: Polish - UX向上

### Task 10: Manual sync command

**Files:**
- Modify: `src-tauri/src/bridge.rs`
- Create: `src/components/SyncStatus.tsx`

**Step 1: Add manual sync command**

Modify `src-tauri/src/bridge.rs`:

```rust
/// Perform manual bidirectional sync.
#[tauri::command]
async fn sync_manual() -> Result<SyncStatus, String> {
    let mut engine = SyncEngine::new();

    // First pull from remote
    let _ = engine.startup_sync();

    // Then push local changes
    engine.batch_sync().map_err(|e| e.to_string())
}
```

Add to `invoke_handler()`:
```rust
sync_manual,
```

**Step 2: Create sync status component**

Create `src/components/SyncStatus.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { syncGetStatus, syncManual, syncStartup, type SyncStatus } from '../types/sync';

export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadStatus();
    // Perform startup sync
    syncStartup().catch(console.warn);
  }, []);

  async function loadStatus() {
    const s = await syncGetStatus();
    setStatus(s);
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      const s = await syncManual();
      setStatus(s);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }

  if (!status) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={syncing ? 'animate-pulse' : ''}>
        {syncing ? '同期中...' : status.last_sync_at
          ? `最終同期: ${new Date(status.last_sync_at).toLocaleTimeString()}`
          : '未同期'
        }
      </span>
      {status.pending_count > 0 && (
        <span className="text-orange-500">
          {status.pending_count}件保留中
        </span>
      )}
      <button
        onClick={handleManualSync}
        disabled={syncing}
        className="px-2 py-1 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        同期
      </button>
    </div>
  );
}
```

**Step 3: Add to settings view**

Modify `src/views/SettingsView.tsx`:

```typescript
import { SyncStatus } from '../components/SyncStatus';

export function SettingsView() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">設定</h1>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">同期</h2>
        <SyncStatus />
      </section>

      {/* ... existing settings ... */}
    </div>
  );
}
```

**Step 4: Test build**

Run: `pnpm run tauri build`
Expected: SUCCESS

**Step 5: Commit**

```bash
git add src-tauri/src/bridge.rs
git add src/components/SyncStatus.tsx
git add src/views/SettingsView.tsx
git commit -m "feat(sync): add manual sync command and UI"
```

---

## Summary

This plan implements Google Calendar synchronization in 5 phases:

| Phase | Tasks | Output |
|-------|-------|--------|
| **M0: Foundation** | 1-4 | Core types, device ID, calendar client, event codec |
| **M1: Read Path** | 5-6 | Startup sync, remote → local |
| **M2: Write Path** | 7-8 | Sync queue, batch upload |
| **M3: Conflict** | 9 | Field-level merge, state priority |
| **M4: Polish** | 10 | Manual sync, status UI |

**Key files created:**
- `crates/pomodoroom-core/src/sync/` - 7 new modules
- `src/components/SyncStatus.tsx` - UI component

**Key integration points:**
- Tauri commands: `sync_startup`, `sync_manual`, `sync_get_status`
- Frontend types: `src/types/sync.ts`
