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
    match (local, remote) {
        // DONE always wins
        (TaskState::Done, _) | (_, TaskState::Done) => TaskState::Done,

        // RUNNING beats PAUSED and READY
        (TaskState::Running, _) | (_, TaskState::Running) => TaskState::Running,

        // PAUSED beats READY
        (TaskState::Paused, TaskState::Ready) | (TaskState::Ready, TaskState::Paused) => TaskState::Paused,
        (TaskState::Paused, TaskState::Paused) => TaskState::Paused,

        // READY is lowest
        (TaskState::Ready, TaskState::Ready) => TaskState::Ready,
    }
}

/// Merge two optional text fields.
fn merge_optional_text(local: Option<&str>, remote: Option<&str>) -> Option<String> {
    match (local, remote) {
        (Some(l), Some(r)) if l != r => Some(format!("{}\n---\n{}", l, r)),
        (Some(l), Some(_)) => Some(l.to_string()), // Values are equal
        (Some(l), None) => Some(l.to_string()),
        (None, Some(r)) => Some(r.to_string()),
        (None, None) => None,
    }
}

/// Merge two string lists, keeping unique values.
pub fn merge_string_lists(local: &[String], remote: &[String]) -> Vec<String> {
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
