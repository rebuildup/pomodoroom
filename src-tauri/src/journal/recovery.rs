//! Recovery engine for replaying uncommitted journal entries.

use crate::journal::entry::{EntryStatus, JournalEntry, JournalError, TransitionType};
use crate::journal::storage::JournalStorage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Result of attempting to recover a single entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryAction {
    /// Entry was successfully replayed.
    Replayed {
        entry_id: String,
        transition: TransitionType,
    },
    /// Entry was skipped (already committed or rolled back).
    Skipped {
        entry_id: String,
        reason: String,
    },
    /// Entry recovery failed.
    Failed {
        entry_id: String,
        error: String,
    },
    /// Entry was marked as too old to recover.
    Expired {
        entry_id: String,
        age_seconds: i64,
    },
}

/// Summary of a recovery operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryResult {
    /// Total entries examined.
    pub total_entries: usize,
    /// Successfully recovered entries.
    pub recovered_count: usize,
    /// Skipped entries.
    pub skipped_count: usize,
    /// Failed entries.
    pub failed_count: usize,
    /// Expired entries.
    pub expired_count: usize,
    /// Detailed actions taken.
    pub actions: Vec<RecoveryAction>,
}

impl RecoveryResult {
    /// Create an empty recovery result.
    pub fn new() -> Self {
        Self {
            total_entries: 0,
            recovered_count: 0,
            skipped_count: 0,
            failed_count: 0,
            expired_count: 0,
            actions: Vec::new(),
        }
    }

    /// Check if all entries were successfully recovered.
    pub fn is_complete(&self) -> bool {
        self.failed_count == 0 && self.expired_count == 0
    }
}

impl Default for RecoveryResult {
    fn default() -> Self {
        Self::new()
    }
}

/// Configuration for recovery behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryConfig {
    /// Maximum age in seconds for an entry to be considered recoverable.
    pub max_age_seconds: i64,
    /// Whether to automatically rollback expired entries.
    pub auto_rollback_expired: bool,
    /// Whether to continue recovery after a failure.
    pub continue_on_failure: bool,
    /// Custom handlers for specific transition types.
    pub custom_handlers: HashMap<String, String>,
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            max_age_seconds: 86400, // 24 hours
            auto_rollback_expired: true,
            continue_on_failure: true,
            custom_handlers: HashMap::new(),
        }
    }
}

/// A plan for recovering entries, created before execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryPlan {
    /// Entries that will be replayed.
    pub to_replay: Vec<JournalEntry>,
    /// Entries that will be skipped.
    pub to_skip: Vec<(String, String)>, // (id, reason)
    /// Entries that are expired.
    pub expired: Vec<(String, i64)>, // (id, age_seconds)
    /// Estimated impact of recovery.
    pub impact_estimate: RecoveryImpact,
}

/// Estimated impact of running recovery.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecoveryImpact {
    /// Number of tasks that will be affected.
    pub affected_tasks: usize,
    /// Number of timer states that will change.
    pub timer_changes: usize,
    /// Number of sessions that will be modified.
    pub session_changes: usize,
    /// Custom operations count.
    pub custom_operations: usize,
}

/// Engine for recovering from uncommitted journal entries.
pub struct RecoveryEngine {
    storage: JournalStorage,
    config: RecoveryConfig,
}

impl RecoveryEngine {
    /// Create a new recovery engine with the given storage.
    pub fn new(storage: JournalStorage) -> Self {
        Self {
            storage,
            config: RecoveryConfig::default(),
        }
    }

    /// Create a recovery engine with custom configuration.
    pub fn with_config(storage: JournalStorage, config: RecoveryConfig) -> Self {
        Self { storage, config }
    }

    /// Create a recovery plan without executing it.
    pub fn plan(&self) -> Result<RecoveryPlan, JournalError> {
        let pending = self.storage.get_pending()?;
        let now = chrono::Utc::now();
        let mut plan = RecoveryPlan {
            to_replay: Vec::new(),
            to_skip: Vec::new(),
            expired: Vec::new(),
            impact_estimate: RecoveryImpact::default(),
        };

        for entry in pending {
            let age = (now - entry.created_at).num_seconds();

            if age > self.config.max_age_seconds {
                plan.expired.push((entry.id.clone(), age));
            } else if entry.status == EntryStatus::Committed || entry.status == EntryStatus::RolledBack {
                plan.to_skip.push((entry.id.clone(), format!("Already {:?}", entry.status)));
            } else {
                plan.to_replay.push(entry);
            }
        }

        // Calculate impact estimate
        for entry in &plan.to_replay {
            match &entry.transition {
                TransitionType::TaskState { .. } => plan.impact_estimate.affected_tasks += 1,
                TransitionType::TimerState { .. } => plan.impact_estimate.timer_changes += 1,
                TransitionType::SessionEvent { .. } => plan.impact_estimate.session_changes += 1,
                TransitionType::Custom { .. } => plan.impact_estimate.custom_operations += 1,
            }
        }

        Ok(plan)
    }

    /// Run recovery on all pending entries.
    pub fn run(&self) -> Result<RecoveryResult, JournalError> {
        let plan = self.plan()?;
        let mut result = RecoveryResult::new();
        result.total_entries = plan.to_replay.len() + plan.to_skip.len() + plan.expired.len();

        // Handle expired entries
        for (id, age) in &plan.expired {
            if self.config.auto_rollback_expired {
                if let Err(e) = self.storage.rollback(id, &format!("Entry expired (age: {}s)", age)) {
                    result.failed_count += 1;
                    result.actions.push(RecoveryAction::Failed {
                        entry_id: id.clone(),
                        error: e.to_string(),
                    });
                } else {
                    result.expired_count += 1;
                    result.actions.push(RecoveryAction::Expired {
                        entry_id: id.clone(),
                        age_seconds: *age,
                    });
                }
            } else {
                result.expired_count += 1;
                result.actions.push(RecoveryAction::Expired {
                    entry_id: id.clone(),
                    age_seconds: *age,
                });
            }
        }

        // Handle skipped entries
        for (id, reason) in &plan.to_skip {
            result.skipped_count += 1;
            result.actions.push(RecoveryAction::Skipped {
                entry_id: id.clone(),
                reason: reason.clone(),
            });
        }

        // Replay entries
        for entry in &plan.to_replay {
            match self.replay_entry(entry) {
                Ok(()) => {
                    result.recovered_count += 1;
                    result.actions.push(RecoveryAction::Replayed {
                        entry_id: entry.id.clone(),
                        transition: entry.transition.clone(),
                    });
                }
                Err(e) => {
                    result.failed_count += 1;
                    result.actions.push(RecoveryAction::Failed {
                        entry_id: entry.id.clone(),
                        error: e.to_string(),
                    });

                    if !self.config.continue_on_failure {
                        break;
                    }
                }
            }
        }

        Ok(result)
    }

    /// Replay a single journal entry.
    fn replay_entry(&self, entry: &JournalEntry) -> Result<(), JournalError> {
        // In a real implementation, this would actually apply the transition
        // to the relevant state (task, timer, session, etc.)
        // For now, we just mark it as applied and checkpoint it.

        // Mark as applied
        self.storage.update_status(&entry.id, EntryStatus::Applied, None)?;

        // Simulate applying the transition
        // In production, this would call the appropriate state handler
        match &entry.transition {
            TransitionType::TaskState { task_id, from_state, to_state } => {
                tracing::info!(
                    "Replaying task transition: {} from {} to {}",
                    task_id, from_state, to_state
                );
            }
            TransitionType::TimerState { from_state, to_state } => {
                tracing::info!(
                    "Replaying timer transition: {} to {}",
                    from_state, to_state
                );
            }
            TransitionType::SessionEvent { session_id, event } => {
                tracing::info!(
                    "Replaying session event: {} - {}",
                    session_id, event
                );
            }
            TransitionType::Custom { category, operation, .. } => {
                tracing::info!(
                    "Replaying custom operation: {}.{}",
                    category, operation
                );
            }
        }

        // Checkpoint after successful replay
        self.storage.checkpoint(&entry.id)?;

        Ok(())
    }

    /// Get the underlying storage reference.
    pub fn storage(&self) -> &JournalStorage {
        &self.storage
    }

    /// Get the current configuration.
    pub fn config(&self) -> &RecoveryConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::storage::JournalStorage;

    fn create_test_engine() -> RecoveryEngine {
        let storage = JournalStorage::open_memory().unwrap();
        RecoveryEngine::new(storage)
    }

    #[test]
    fn recovery_plan_empty() {
        let engine = create_test_engine();
        let plan = engine.plan().unwrap();
        assert_eq!(plan.to_replay.len(), 0);
        assert_eq!(plan.to_skip.len(), 0);
        assert_eq!(plan.expired.len(), 0);
    }

    #[test]
    fn recovery_plan_with_pending_entry() {
        let engine = create_test_engine();
        let storage = engine.storage();

        let entry = storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        let plan = engine.plan().unwrap();

        assert_eq!(plan.to_replay.len(), 1);
        assert_eq!(plan.to_replay[0].id, entry.id);
    }

    #[test]
    fn recovery_run_basic() {
        let engine = create_test_engine();
        let storage = engine.storage();

        storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        let result = engine.run().unwrap();

        assert_eq!(result.total_entries, 1);
        assert_eq!(result.recovered_count, 1);
        assert_eq!(result.failed_count, 0);
        assert!(result.is_complete());
    }

    #[test]
    fn recovery_result_actions() {
        let engine = create_test_engine();
        let storage = engine.storage();

        let entry = storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        let result = engine.run().unwrap();

        assert_eq!(result.actions.len(), 1);
        match &result.actions[0] {
            RecoveryAction::Replayed { entry_id, transition } => {
                assert_eq!(*entry_id, entry.id);
                if let TransitionType::TaskState { task_id, .. } = transition {
                    assert_eq!(task_id, "task-1");
                } else {
                    panic!("Expected TaskState transition");
                }
            }
            _ => panic!("Expected Replayed action"),
        }
    }

    #[test]
    fn recovery_multiple_entries() {
        let engine = create_test_engine();
        let storage = engine.storage();

        storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        storage.append(TransitionType::timer_transition("Idle", "Running")).unwrap();
        storage.append(TransitionType::task_transition("task-2", "C", "D")).unwrap();

        let result = engine.run().unwrap();

        assert_eq!(result.total_entries, 3);
        assert_eq!(result.recovered_count, 3);
    }

    #[test]
    fn recovery_impact_estimate() {
        let engine = create_test_engine();
        let storage = engine.storage();

        storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        storage.append(TransitionType::timer_transition("Idle", "Running")).unwrap();
        storage.append(TransitionType::session_event("sess-1", "started")).unwrap();

        let plan = engine.plan().unwrap();

        assert_eq!(plan.impact_estimate.affected_tasks, 1);
        assert_eq!(plan.impact_estimate.timer_changes, 1);
        assert_eq!(plan.impact_estimate.session_changes, 1);
    }

    #[test]
    fn recovery_config_custom() {
        let storage = JournalStorage::open_memory().unwrap();
        let config = RecoveryConfig {
            max_age_seconds: 3600,
            auto_rollback_expired: false,
            continue_on_failure: false,
            custom_handlers: HashMap::new(),
        };
        let engine = RecoveryEngine::with_config(storage, config);

        assert_eq!(engine.config().max_age_seconds, 3600);
        assert!(!engine.config().auto_rollback_expired);
        assert!(!engine.config().continue_on_failure);
    }

    #[test]
    fn recovery_entry_after_commit() {
        let engine = create_test_engine();
        let storage = engine.storage();

        let entry = storage.append(TransitionType::task_transition("task-1", "A", "B")).unwrap();
        storage.checkpoint(&entry.id).unwrap();

        let plan = engine.plan().unwrap();
        assert_eq!(plan.to_replay.len(), 0);
    }

    #[test]
    fn recovery_result_default() {
        let result = RecoveryResult::default();
        assert_eq!(result.total_entries, 0);
        assert_eq!(result.recovered_count, 0);
        assert!(result.is_complete());
    }
}
