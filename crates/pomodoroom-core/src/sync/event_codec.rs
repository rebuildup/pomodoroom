//! Encoding/decoding between sync events and domain types.

use crate::sync::types::{SyncEvent, SyncEventType, SyncError};
use crate::task::Task;
use crate::schedule::{Project, Group, DailyTemplate};
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
        id: "daily_template".to_string(),
        event_type: SyncEventType::DailyTemplate,
        data,
        updated_at: chrono::Utc::now(),
        deleted: false,
    })
}

/// Convert SyncEvent to DailyTemplate.
pub fn sync_event_to_daily_template(data: &serde_json::Value) -> Result<DailyTemplate, SyncError> {
    serde_json::from_value(data.clone())
        .map_err(SyncError::Serialization)
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
pub fn sync_event_to_session(id: &str, data: &serde_json::Value) -> Result<SessionRecord, SyncError> {
    let mut session: SessionRecord = serde_json::from_value(data.clone())?;
    session.id = id.parse().unwrap_or(0);
    Ok(session)
}

// ============================================================================
// Config Encoding/Decoding
// ============================================================================

/// Convert Config to SyncEvent.
///
/// Uses a fixed ID since config is a singleton.
pub fn config_to_sync_event(config: &crate::storage::Config) -> Result<SyncEvent, SyncError> {
    let data = serde_json::to_value(config)?;
    Ok(SyncEvent {
        id: "config".to_string(),
        event_type: SyncEventType::Config,
        data,
        updated_at: chrono::Utc::now(),
        deleted: false,
    })
}

/// Convert SyncEvent to Config.
pub fn sync_event_to_config(data: &serde_json::Value) -> Result<crate::storage::Config, SyncError> {
    serde_json::from_value(data.clone())
        .map_err(SyncError::Serialization)
}
