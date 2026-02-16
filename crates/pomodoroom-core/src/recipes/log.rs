//! Action execution logging.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Result of executing a single action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    /// Name of the recipe that produced this action
    pub recipe_name: String,
    /// Type of action that was executed
    pub action_type: String,
    /// Execution status
    pub status: ExecutionStatus,
}

/// Status of action execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionStatus {
    /// Action executed successfully
    Success,
    /// Action failed but is retriable
    Failed {
        /// Human-readable reason for failure
        reason: String,
        /// Whether this action can be retried
        retriable: bool,
    },
    /// Action was skipped due to condition
    Skipped {
        /// Human-readable reason for skip
        reason: String,
    },
}

/// Log of a recipe evaluation batch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionLog {
    /// When this evaluation occurred
    pub executed_at: DateTime<Utc>,
    /// Results of all executed actions
    pub results: Vec<ActionResult>,
}

impl ActionLog {
    /// Create a new action log
    pub fn new(results: Vec<ActionResult>) -> Self {
        Self {
            executed_at: Utc::now(),
            results,
        }
    }

    /// Get the number of successful actions
    pub fn success_count(&self) -> usize {
        self.results.iter()
            .filter(|r| matches!(r.status, ExecutionStatus::Success))
            .count()
    }

    /// Get the number of failed actions
    pub fn failure_count(&self) -> usize {
        self.results.iter()
            .filter(|r| matches!(r.status, ExecutionStatus::Failed { .. }))
            .count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_log_counts() {
        let log = ActionLog::new(vec![
            ActionResult {
                recipe_name: "test".to_string(),
                action_type: "CreateBreak".to_string(),
                status: ExecutionStatus::Success,
            },
            ActionResult {
                recipe_name: "test".to_string(),
                action_type: "CreateBreak".to_string(),
                status: ExecutionStatus::Failed {
                    reason: "error".to_string(),
                    retriable: false,
                },
            },
        ]);

        assert_eq!(log.success_count(), 1);
        assert_eq!(log.failure_count(), 1);
    }
}
