//! Journal entry types and serialization.

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Unique identifier for a journal entry.
pub type EntryId = String;

/// Types of transitions that can be journaled.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransitionType {
    /// Task state transition.
    TaskState {
        task_id: String,
        from_state: String,
        to_state: String,
    },
    /// Timer state transition.
    TimerState {
        from_state: String,
        to_state: String,
    },
    /// Session lifecycle event.
    SessionEvent {
        session_id: String,
        event: String,
    },
    /// Custom transition with arbitrary data.
    Custom {
        category: String,
        operation: String,
        data: serde_json::Value,
    },
}

impl TransitionType {
    /// Create a task state transition.
    pub fn task_transition(task_id: impl Into<String>, from: impl Into<String>, to: impl Into<String>) -> Self {
        TransitionType::TaskState {
            task_id: task_id.into(),
            from_state: from.into(),
            to_state: to.into(),
        }
    }

    /// Create a timer state transition.
    pub fn timer_transition(from: impl Into<String>, to: impl Into<String>) -> Self {
        TransitionType::TimerState {
            from_state: from.into(),
            to_state: to.into(),
        }
    }

    /// Create a session event transition.
    pub fn session_event(session_id: impl Into<String>, event: impl Into<String>) -> Self {
        TransitionType::SessionEvent {
            session_id: session_id.into(),
            event: event.into(),
        }
    }

    /// Create a custom transition.
    pub fn custom(category: impl Into<String>, operation: impl Into<String>, data: serde_json::Value) -> Self {
        TransitionType::Custom {
            category: category.into(),
            operation: operation.into(),
            data,
        }
    }

    /// Get the entity ID affected by this transition.
    pub fn entity_id(&self) -> Option<&str> {
        match self {
            TransitionType::TaskState { task_id, .. } => Some(task_id),
            TransitionType::SessionEvent { session_id, .. } => Some(session_id),
            TransitionType::TimerState { .. } => None,
            TransitionType::Custom { .. } => None,
        }
    }

    /// Get a human-readable description.
    pub fn description(&self) -> String {
        match self {
            TransitionType::TaskState { task_id, from_state, to_state } => {
                format!("Task {} state: {} -> {}", task_id, from_state, to_state)
            }
            TransitionType::TimerState { from_state, to_state } => {
                format!("Timer: {} -> {}", from_state, to_state)
            }
            TransitionType::SessionEvent { session_id, event } => {
                format!("Session {}: {}", session_id, event)
            }
            TransitionType::Custom { category, operation, .. } => {
                format!("Custom {}.{}", category, operation)
            }
        }
    }
}

/// Status of a journal entry.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum EntryStatus {
    /// Entry recorded but transition not yet applied.
    Pending,
    /// Transition applied, awaiting checkpoint.
    Applied,
    /// Checkpointed (committed).
    Committed,
    /// Rolled back due to failure.
    RolledBack,
}

/// A single entry in the transition journal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JournalEntry {
    /// Unique identifier for this entry.
    pub id: EntryId,
    /// The transition being recorded.
    pub transition: TransitionType,
    /// Current status of this entry.
    pub status: EntryStatus,
    /// When this entry was created.
    pub created_at: DateTime<Utc>,
    /// When this entry was last updated.
    pub updated_at: DateTime<Utc>,
    /// Optional correlation ID for related entries.
    pub correlation_id: Option<String>,
    /// Optional error message if rollback occurred.
    pub error: Option<String>,
    /// Sequence number for ordering.
    pub sequence: u64,
}

impl JournalEntry {
    /// Create a new pending journal entry.
    pub fn new(transition: TransitionType, sequence: u64) -> Self {
        let now = Utc::now();
        Self {
            id: format!("entry-{}-{}", now.timestamp_millis(), sequence),
            transition,
            status: EntryStatus::Pending,
            created_at: now,
            updated_at: now,
            correlation_id: None,
            error: None,
            sequence,
        }
    }

    /// Set the correlation ID.
    pub fn with_correlation_id(mut self, id: impl Into<String>) -> Self {
        self.correlation_id = Some(id.into());
        self
    }

    /// Mark as applied.
    pub fn mark_applied(&mut self) {
        self.status = EntryStatus::Applied;
        self.updated_at = Utc::now();
    }

    /// Mark as committed (checkpoint).
    pub fn mark_committed(&mut self) {
        self.status = EntryStatus::Committed;
        self.updated_at = Utc::now();
    }

    /// Mark as rolled back with error.
    pub fn mark_rolled_back(&mut self, error: impl Into<String>) {
        self.status = EntryStatus::RolledBack;
        self.error = Some(error.into());
        self.updated_at = Utc::now();
    }

    /// Check if this entry is pending (not yet applied).
    pub fn is_pending(&self) -> bool {
        self.status == EntryStatus::Pending
    }

    /// Check if this entry needs recovery (pending or applied without commit).
    pub fn needs_recovery(&self) -> bool {
        matches!(self.status, EntryStatus::Pending | EntryStatus::Applied)
    }
}

/// Error types for journal operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JournalError {
    /// Failed to open journal storage.
    StorageError(String),
    /// Failed to serialize/deserialize entry.
    SerializationError(String),
    /// Entry not found.
    EntryNotFound(String),
    /// Invalid entry state for operation.
    InvalidState(String),
    /// Recovery failed.
    RecoveryFailed(String),
}

impl std::fmt::Display for JournalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JournalError::StorageError(msg) => write!(f, "Journal storage error: {}", msg),
            JournalError::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            JournalError::EntryNotFound(id) => write!(f, "Entry not found: {}", id),
            JournalError::InvalidState(msg) => write!(f, "Invalid entry state: {}", msg),
            JournalError::RecoveryFailed(msg) => write!(f, "Recovery failed: {}", msg),
        }
    }
}

impl std::error::Error for JournalError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transition_type_task() {
        let t = TransitionType::task_transition("task-123", "READY", "RUNNING");
        assert_eq!(t.entity_id(), Some("task-123"));
        assert!(t.description().contains("task-123"));
        assert!(t.description().contains("READY"));
        assert!(t.description().contains("RUNNING"));
    }

    #[test]
    fn transition_type_timer() {
        let t = TransitionType::timer_transition("Idle", "Running");
        assert!(t.entity_id().is_none());
        assert!(t.description().contains("Timer"));
    }

    #[test]
    fn journal_entry_new() {
        let entry = JournalEntry::new(
            TransitionType::task_transition("task-1", "A", "B"),
            1,
        );
        assert!(entry.is_pending());
        assert!(entry.needs_recovery());
        assert_eq!(entry.sequence, 1);
    }

    #[test]
    fn journal_entry_status_transitions() {
        let mut entry = JournalEntry::new(
            TransitionType::task_transition("task-1", "A", "B"),
            1,
        );

        assert!(entry.is_pending());

        entry.mark_applied();
        assert!(!entry.is_pending());
        assert!(entry.needs_recovery());

        entry.mark_committed();
        assert!(!entry.needs_recovery());

        // Test rollback
        let mut entry2 = JournalEntry::new(
            TransitionType::task_transition("task-2", "A", "B"),
            2,
        );
        entry2.mark_rolled_back("test error");
        assert!(!entry2.needs_recovery());
        assert!(entry2.error.is_some());
    }

    #[test]
    fn journal_entry_serialization() {
        let entry = JournalEntry::new(
            TransitionType::task_transition("task-1", "READY", "RUNNING"),
            42,
        ).with_correlation_id("corr-123");

        let json = serde_json::to_string(&entry).unwrap();
        let decoded: JournalEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.sequence, 42);
        assert_eq!(decoded.correlation_id, Some("corr-123".to_string()));
    }
}
