//! Parent-child task sync for Google Tasks integration.
//!
//! This module handles syncing split task segments with Google Tasks,
//! preserving parent-child relationships as subtasks.
//!
//! ## Features
//! - Map parent task to tasklist entry
//! - Sync child segments as checkable subtasks
//! - Deterministic conflict resolution
//! - Bidirectional sync support

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Sync status for a task in the parent-child hierarchy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    /// Task is synced with Google Tasks.
    Synced,
    /// Task has local changes pending sync.
    PendingSync,
    /// Task has remote changes pending merge.
    PendingMerge,
    /// Task has conflicts that need resolution.
    Conflict,
    /// Task is not synced (new or opted out).
    NotSynced,
}

/// Sync direction for conflict resolution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncDirection {
    /// Local changes take precedence.
    LocalWins,
    /// Remote (Google Tasks) changes take precedence.
    RemoteWins,
    /// Merge both changes intelligently.
    Merge,
    /// Keep both (create duplicate).
    KeepBoth,
}

/// Mapping between local task and Google Tasks entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMapping {
    /// Local task ID.
    pub local_id: String,
    /// Google Tasks entry ID.
    pub google_task_id: String,
    /// Google Tasks list ID.
    pub google_list_id: String,
    /// Parent mapping (if this is a subtask).
    pub parent_google_id: Option<String>,
    /// Last sync timestamp.
    pub last_synced_at: DateTime<Utc>,
    /// Current sync status.
    pub status: SyncStatus,
    /// ETag for optimistic concurrency.
    pub etag: Option<String>,
}

/// Conflict record for sync operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    /// Local task ID.
    pub local_id: String,
    /// Google task ID.
    pub google_task_id: String,
    /// Conflict type.
    pub conflict_type: String,
    /// Local value.
    pub local_value: String,
    /// Remote value.
    pub remote_value: String,
    /// Detected at.
    pub detected_at: DateTime<Utc>,
    /// Resolution (if resolved).
    pub resolution: Option<SyncDirection>,
}

/// Result of a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncResult {
    /// Number of tasks synced successfully.
    pub synced_count: usize,
    /// Number of tasks created in Google Tasks.
    pub created_count: usize,
    /// Number of tasks updated.
    pub updated_count: usize,
    /// Number of conflicts detected.
    pub conflict_count: usize,
    /// Number of conflicts resolved.
    pub resolved_count: usize,
    /// Detailed conflicts (if any).
    pub conflicts: Vec<SyncConflict>,
    /// Task mappings updated.
    pub mappings: Vec<TaskMapping>,
}

impl SyncResult {
    /// Create an empty sync result.
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if sync was successful (no unresolved conflicts).
    pub fn is_successful(&self) -> bool {
        self.conflict_count == self.resolved_count
    }
}

/// Configuration for parent-child sync behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    /// Default conflict resolution strategy.
    pub default_resolution: SyncDirection,
    /// Whether to auto-create subtasks for split segments.
    pub auto_create_subtasks: bool,
    /// Whether to sync completion status bidirectionally.
    pub sync_completion_status: bool,
    /// Whether to preserve local order when syncing.
    pub preserve_local_order: bool,
    /// Maximum retry attempts for failed syncs.
    pub max_retries: u32,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            default_resolution: SyncDirection::LocalWins,
            auto_create_subtasks: true,
            sync_completion_status: true,
            preserve_local_order: true,
            max_retries: 3,
        }
    }
}

/// Manager for parent-child task sync operations.
pub struct ParentChildSyncManager {
    /// Sync configuration.
    config: SyncConfig,
    /// Task mappings cache.
    mappings: HashMap<String, TaskMapping>,
    /// Unresolved conflicts.
    conflicts: Vec<SyncConflict>,
}

impl ParentChildSyncManager {
    /// Create a new sync manager with default configuration.
    pub fn new() -> Self {
        Self {
            config: SyncConfig::default(),
            mappings: HashMap::new(),
            conflicts: Vec::new(),
        }
    }

    /// Create a new sync manager with custom configuration.
    pub fn with_config(config: SyncConfig) -> Self {
        Self {
            config,
            mappings: HashMap::new(),
            conflicts: Vec::new(),
        }
    }

    /// Get the current configuration.
    pub fn config(&self) -> &SyncConfig {
        &self.config
    }

    /// Register a task mapping.
    pub fn register_mapping(&mut self, mapping: TaskMapping) {
        self.mappings.insert(mapping.local_id.clone(), mapping);
    }

    /// Get a mapping by local ID.
    pub fn get_mapping(&self, local_id: &str) -> Option<&TaskMapping> {
        self.mappings.get(local_id)
    }

    /// Get all mappings.
    pub fn get_all_mappings(&self) -> Vec<&TaskMapping> {
        self.mappings.values().collect()
    }

    /// Remove a mapping.
    pub fn remove_mapping(&mut self, local_id: &str) -> Option<TaskMapping> {
        self.mappings.remove(local_id)
    }

    /// Check if a task is synced.
    pub fn is_synced(&self, local_id: &str) -> bool {
        self.mappings.get(local_id).map_or(false, |m| m.status == SyncStatus::Synced)
    }

    /// Detect conflicts between local and remote task data.
    pub fn detect_conflicts(
        &mut self,
        local_title: &str,
        local_completed: bool,
        remote_title: &str,
        remote_completed: bool,
        local_updated: DateTime<Utc>,
        remote_updated: DateTime<Utc>,
    ) -> Vec<SyncConflict> {
        let mut conflicts = Vec::new();

        // Title conflict
        if local_title != remote_title && local_updated > remote_updated {
            conflicts.push(SyncConflict {
                local_id: String::new(),
                google_task_id: String::new(),
                conflict_type: "title".to_string(),
                local_value: local_title.to_string(),
                remote_value: remote_title.to_string(),
                detected_at: Utc::now(),
                resolution: None,
            });
        }

        // Completion status conflict
        if local_completed != remote_completed {
            conflicts.push(SyncConflict {
                local_id: String::new(),
                google_task_id: String::new(),
                conflict_type: "completed".to_string(),
                local_value: local_completed.to_string(),
                remote_value: remote_completed.to_string(),
                detected_at: Utc::now(),
                resolution: None,
            });
        }

        conflicts
    }

    /// Resolve a conflict using the configured strategy.
    pub fn resolve_conflict(&self, conflict: &mut SyncConflict) -> SyncDirection {
        let resolution = self.config.default_resolution.clone();
        conflict.resolution = Some(resolution.clone());
        resolution
    }

    /// Add a conflict to the unresolved list.
    pub fn add_conflict(&mut self, conflict: SyncConflict) {
        self.conflicts.push(conflict);
    }

    /// Get unresolved conflicts.
    pub fn get_unresolved_conflicts(&self) -> &[SyncConflict] {
        &self.conflicts
    }

    /// Clear resolved conflicts.
    pub fn clear_resolved_conflicts(&mut self) {
        self.conflicts.retain(|c| c.resolution.is_none());
    }

    /// Prepare a subtask creation payload for Google Tasks API.
    pub fn prepare_subtask_payload(
        &self,
        parent_google_id: &str,
        title: &str,
        notes: Option<&str>,
    ) -> serde_json::Value {
        let mut payload = serde_json::json!({
            "title": title,
            "parent": parent_google_id,
        });

        if let Some(n) = notes {
            payload["notes"] = serde_json::Value::String(n.to_string());
        }

        payload
    }

    /// Build a parent-child hierarchy from flat task list.
    pub fn build_hierarchy(
        &self,
        tasks: &[LocalTaskInfo],
    ) -> HashMap<String, Vec<String>> {
        let mut hierarchy: HashMap<String, Vec<String>> = HashMap::new();

        for task in tasks {
            if let Some(parent_id) = &task.parent_id {
                hierarchy
                    .entry(parent_id.clone())
                    .or_default()
                    .push(task.id.clone());
            }
        }

        hierarchy
    }

    /// Get sync statistics.
    pub fn get_stats(&self) -> SyncStats {
        let total_mappings = self.mappings.len();
        let synced_count = self.mappings.values().filter(|m| m.status == SyncStatus::Synced).count();
        let pending_count = self.mappings.values().filter(|m| m.status == SyncStatus::PendingSync).count();
        let conflict_count = self.conflicts.len();

        SyncStats {
            total_mappings,
            synced_count,
            pending_count,
            conflict_count,
        }
    }
}

impl Default for ParentChildSyncManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Local task information for sync operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTaskInfo {
    /// Task ID.
    pub id: String,
    /// Task title.
    pub title: String,
    /// Task description/notes.
    pub notes: Option<String>,
    /// Whether task is completed.
    pub completed: bool,
    /// Parent task ID (if subtask).
    pub parent_id: Option<String>,
    /// Order index among siblings.
    pub order_index: i32,
    /// Last updated timestamp.
    pub updated_at: DateTime<Utc>,
}

/// Sync statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStats {
    /// Total task mappings.
    pub total_mappings: usize,
    /// Successfully synced tasks.
    pub synced_count: usize,
    /// Tasks pending sync.
    pub pending_count: usize,
    /// Unresolved conflicts.
    pub conflict_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_manager() -> ParentChildSyncManager {
        ParentChildSyncManager::new()
    }

    fn create_mapping(local_id: &str, google_id: &str) -> TaskMapping {
        TaskMapping {
            local_id: local_id.to_string(),
            google_task_id: google_id.to_string(),
            google_list_id: "list-1".to_string(),
            parent_google_id: None,
            last_synced_at: Utc::now(),
            status: SyncStatus::Synced,
            etag: None,
        }
    }

    #[test]
    fn manager_starts_empty() {
        let manager = create_manager();
        assert_eq!(manager.get_all_mappings().len(), 0);
    }

    #[test]
    fn register_mapping() {
        let mut manager = create_manager();
        manager.register_mapping(create_mapping("task-1", "google-1"));

        assert!(manager.get_mapping("task-1").is_some());
        assert!(manager.is_synced("task-1"));
    }

    #[test]
    fn remove_mapping() {
        let mut manager = create_manager();
        manager.register_mapping(create_mapping("task-1", "google-1"));

        let removed = manager.remove_mapping("task-1");
        assert!(removed.is_some());
        assert!(manager.get_mapping("task-1").is_none());
    }

    #[test]
    fn detect_title_conflict() {
        let mut manager = create_manager();
        let conflicts = manager.detect_conflicts(
            "Local Title",
            false,
            "Remote Title",
            false,
            Utc::now(),
            Utc::now() - chrono::Duration::seconds(10),
        );

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type, "title");
    }

    #[test]
    fn detect_completion_conflict() {
        let mut manager = create_manager();
        let conflicts = manager.detect_conflicts(
            "Title",
            true,
            "Title",
            false,
            Utc::now(),
            Utc::now(),
        );

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type, "completed");
    }

    #[test]
    fn resolve_conflict_uses_default() {
        let manager = create_manager();
        let mut conflict = SyncConflict {
            local_id: "task-1".to_string(),
            google_task_id: "google-1".to_string(),
            conflict_type: "title".to_string(),
            local_value: "Local".to_string(),
            remote_value: "Remote".to_string(),
            detected_at: Utc::now(),
            resolution: None,
        };

        let resolution = manager.resolve_conflict(&mut conflict);
        assert_eq!(resolution, SyncDirection::LocalWins);
        assert!(conflict.resolution.is_some());
    }

    #[test]
    fn prepare_subtask_payload() {
        let manager = create_manager();
        let payload = manager.prepare_subtask_payload(
            "parent-123",
            "Subtask Title",
            Some("Notes"),
        );

        assert_eq!(payload["title"], "Subtask Title");
        assert_eq!(payload["parent"], "parent-123");
        assert_eq!(payload["notes"], "Notes");
    }

    #[test]
    fn build_hierarchy() {
        let manager = create_manager();
        let tasks = vec![
            LocalTaskInfo {
                id: "child-1".to_string(),
                title: "Child 1".to_string(),
                notes: None,
                completed: false,
                parent_id: Some("parent-1".to_string()),
                order_index: 0,
                updated_at: Utc::now(),
            },
            LocalTaskInfo {
                id: "child-2".to_string(),
                title: "Child 2".to_string(),
                notes: None,
                completed: false,
                parent_id: Some("parent-1".to_string()),
                order_index: 1,
                updated_at: Utc::now(),
            },
            LocalTaskInfo {
                id: "parent-1".to_string(),
                title: "Parent".to_string(),
                notes: None,
                completed: false,
                parent_id: None,
                order_index: 0,
                updated_at: Utc::now(),
            },
        ];

        let hierarchy = manager.build_hierarchy(&tasks);
        assert_eq!(hierarchy.len(), 1);
        assert_eq!(hierarchy.get("parent-1").unwrap().len(), 2);
    }

    #[test]
    fn sync_stats() {
        let mut manager = create_manager();
        manager.register_mapping(create_mapping("task-1", "google-1"));
        manager.register_mapping(create_mapping("task-2", "google-2"));

        let stats = manager.get_stats();
        assert_eq!(stats.total_mappings, 2);
        assert_eq!(stats.synced_count, 2);
        assert_eq!(stats.pending_count, 0);
    }

    #[test]
    fn sync_result_successful() {
        let result = SyncResult {
            synced_count: 5,
            conflict_count: 0,
            ..Default::default()
        };
        assert!(result.is_successful());
    }

    #[test]
    fn sync_result_with_unresolved_conflicts() {
        let result = SyncResult {
            synced_count: 5,
            conflict_count: 2,
            resolved_count: 1,
            ..Default::default()
        };
        assert!(!result.is_successful());
    }

    #[test]
    fn config_default() {
        let config = SyncConfig::default();
        assert_eq!(config.default_resolution, SyncDirection::LocalWins);
        assert!(config.auto_create_subtasks);
        assert!(config.sync_completion_status);
    }

    #[test]
    fn add_and_clear_conflicts() {
        let mut manager = create_manager();
        let conflict = SyncConflict {
            local_id: "task-1".to_string(),
            google_task_id: "google-1".to_string(),
            conflict_type: "title".to_string(),
            local_value: "Local".to_string(),
            remote_value: "Remote".to_string(),
            detected_at: Utc::now(),
            resolution: None,
        };

        manager.add_conflict(conflict);
        assert_eq!(manager.get_unresolved_conflicts().len(), 1);

        manager.clear_resolved_conflicts();
        assert_eq!(manager.get_unresolved_conflicts().len(), 1); // Still unresolved
    }
}
