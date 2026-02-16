//! Action execution.
//!
//! Executes actions produced by the recipe engine and logs results.

use crate::recipes::{action::Action, log::{ActionResult, ActionLog, ExecutionStatus}};

/// Executes actions and logs results
pub struct ActionExecutor {
    /// Whether to actually execute actions (false for dry-run)
    dry_run: bool,
}

impl ActionExecutor {
    /// Create a new executor
    pub fn new() -> Self {
        Self { dry_run: false }
    }

    /// Create a dry-run executor (doesn't actually execute)
    pub fn dry_run() -> Self {
        Self { dry_run: true }
    }

    /// Execute a batch of actions and return the log
    pub fn execute_batch(&self, actions: Vec<(String, Action)>) -> ActionLog {
        let mut results = Vec::new();

        for (recipe_name, action) in actions {
            let result = self.execute_action(&recipe_name, &action);
            results.push(result);
        }

        ActionLog::new(results)
    }

    /// Execute a single action
    fn execute_action(&self, recipe_name: &str, action: &Action) -> ActionResult {
        let action_type = format!("{:?}", action);

        if self.dry_run {
            return ActionResult {
                recipe_name: recipe_name.to_string(),
                action_type,
                status: ExecutionStatus::Skipped {
                    reason: "dry-run mode".to_string(),
                },
            };
        }

        match action {
            Action::CreateBreak { duration_mins: _ } => {
                // Placeholder: would actually create a break session
                // For now, just log success
                ActionResult {
                    recipe_name: recipe_name.to_string(),
                    action_type,
                    status: ExecutionStatus::Success,
                }
            }
        }
    }
}

impl Default for ActionExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_executor_dry_run_skips() {
        let executor = ActionExecutor::dry_run();
        let actions = vec![
            ("test".to_string(), Action::CreateBreak { duration_mins: 5 }),
        ];

        let log = executor.execute_batch(actions);
        assert_eq!(log.results.len(), 1);
        assert!(matches!(log.results[0].status, ExecutionStatus::Skipped { .. }));
    }

    #[test]
    fn test_executor_normal_mode_executes() {
        let executor = ActionExecutor::new();
        let actions = vec![
            ("test".to_string(), Action::CreateBreak { duration_mins: 5 }),
        ];

        let log = executor.execute_batch(actions);
        assert_eq!(log.results.len(), 1);
        assert!(matches!(log.results[0].status, ExecutionStatus::Success));
    }
}
