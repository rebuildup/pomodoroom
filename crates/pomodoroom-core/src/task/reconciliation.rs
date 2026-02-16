//! Startup reconciliation for stale RUNNING tasks.
//!
//! This module provides functionality to detect and recover from stale RUNNING
//! tasks that may occur after application crash, system sleep, or unexpected shutdown.
//!
//! ## Purpose
//! When the application restarts, any tasks left in RUNNING state may be stale
//! (the actual work was interrupted). This module detects such tasks and
//! automatically transitions them to PAUSED state with a clear reason.
//!
//! ## Usage
//! ```rust,ignore
//! use pomodoroom_core::task::reconciliation::{ReconciliationEngine, ReconciliationConfig};
//!
//! let engine = ReconciliationEngine::new(config);
//! let result = engine.reconcile(&db)?;
//!
//! // Display recovery suggestions to user
//! for task in &result.reconciled_tasks {
//!     println!("Task '{}' was paused. Resume: task resume {}", task.title, task.id);
//! }
//! ```

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use super::{Task, TaskState};

/// Default staleness threshold in minutes.
/// Tasks in RUNNING state older than this are considered stale.
pub const DEFAULT_STALE_THRESHOLD_MINUTES: i64 = 30;

/// Maximum staleness threshold allowed (to prevent accidental data loss).
pub const MAX_STALE_THRESHOLD_MINUTES: i64 = 1440; // 24 hours

/// Minimum staleness threshold allowed.
pub const MIN_STALE_THRESHOLD_MINUTES: i64 = 1;

/// Configuration for task reconciliation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationConfig {
    /// Threshold in minutes after which a RUNNING task is considered stale.
    /// Default: 30 minutes
    pub stale_threshold_minutes: i64,

    /// Whether to automatically transition stale tasks to PAUSED.
    /// If false, stale tasks are only reported.
    /// Default: true
    pub auto_pause: bool,

    /// Reason message to attach to reconciled tasks.
    /// Default: "Application restart detected"
    pub reason: String,
}

impl Default for ReconciliationConfig {
    fn default() -> Self {
        Self {
            stale_threshold_minutes: DEFAULT_STALE_THRESHOLD_MINUTES,
            auto_pause: true,
            reason: "Application restart detected".to_string(),
        }
    }
}

impl ReconciliationConfig {
    /// Create a new config with default values.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the staleness threshold in minutes.
    pub fn with_stale_threshold(mut self, minutes: i64) -> Self {
        self.stale_threshold_minutes = minutes.clamp(MIN_STALE_THRESHOLD_MINUTES, MAX_STALE_THRESHOLD_MINUTES);
        self
    }

    /// Set whether to auto-pause stale tasks.
    pub fn with_auto_pause(mut self, auto_pause: bool) -> Self {
        self.auto_pause = auto_pause;
        self
    }

    /// Set the reason message for reconciled tasks.
    pub fn with_reason(mut self, reason: impl Into<String>) -> Self {
        self.reason = reason.into();
        self
    }

    /// Get the staleness threshold as a Duration.
    pub fn stale_threshold(&self) -> Duration {
        Duration::minutes(self.stale_threshold_minutes)
    }
}

/// Information about a reconciled task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciledTask {
    /// The task ID.
    pub id: String,
    /// The task title (for display purposes).
    pub title: String,
    /// Original state before reconciliation (always RUNNING).
    pub original_state: TaskState,
    /// New state after reconciliation (PAUSED if auto_pause enabled).
    pub new_state: TaskState,
    /// How long the task was stale (in minutes).
    pub stale_duration_minutes: i64,
    /// Timestamp when the task was last updated.
    pub last_updated_at: DateTime<Utc>,
    /// Reason for reconciliation.
    pub reason: String,
    /// Quick resume command suggestion.
    pub resume_hint: String,
}

/// Summary of reconciliation operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationSummary {
    /// Total number of RUNNING tasks found.
    pub total_running: usize,
    /// Number of tasks identified as stale.
    pub stale_count: usize,
    /// Number of tasks actually reconciled (transitioned to PAUSED).
    pub reconciled_count: usize,
    /// List of reconciled tasks with details.
    pub reconciled_tasks: Vec<ReconciledTask>,
    /// Timestamp of reconciliation.
    pub reconciled_at: DateTime<Utc>,
    /// Whether auto-pause was enabled.
    pub auto_pause_enabled: bool,
}

impl ReconciliationSummary {
    /// Check if any tasks were reconciled.
    pub fn has_reconciled(&self) -> bool {
        self.reconciled_count > 0
    }

    /// Get a human-readable summary message.
    pub fn message(&self) -> String {
        if self.reconciled_count == 0 {
            if self.total_running == 0 {
                "No stale tasks found.".to_string()
            } else {
                format!(
                    "Found {} RUNNING task(s), all recent (within {} min threshold).",
                    self.total_running, self.stale_count
                )
            }
        } else {
            format!(
                "Reconciled {} stale task(s) from RUNNING to PAUSED state.",
                self.reconciled_count
            )
        }
    }
}

/// Engine for detecting and reconciling stale RUNNING tasks.
#[derive(Debug, Clone)]
pub struct ReconciliationEngine {
    config: ReconciliationConfig,
}

impl ReconciliationEngine {
    /// Create a new reconciliation engine with default config.
    pub fn new() -> Self {
        Self {
            config: ReconciliationConfig::default(),
        }
    }

    /// Create a reconciliation engine with custom config.
    pub fn with_config(config: ReconciliationConfig) -> Self {
        Self { config }
    }

    /// Get the current configuration.
    pub fn config(&self) -> &ReconciliationConfig {
        &self.config
    }

    /// Check if a task is stale based on its updated_at timestamp.
    pub fn is_task_stale(&self, task: &Task, now: DateTime<Utc>) -> bool {
        if task.state != TaskState::Running {
            return false;
        }

        let age = now.signed_duration_since(task.updated_at);
        age > self.config.stale_threshold()
    }

    /// Calculate how long a task has been stale (in minutes).
    pub fn stale_duration_minutes(&self, task: &Task, now: DateTime<Utc>) -> i64 {
        if task.state != TaskState::Running {
            return 0;
        }

        let age = now.signed_duration_since(task.updated_at);
        let stale_age = age - self.config.stale_threshold();
        stale_age.num_minutes().max(0)
    }

    /// Detect all stale RUNNING tasks from a list.
    ///
    /// Does not modify any tasks; returns information about which tasks are stale.
    pub fn detect_stale_tasks(&self, tasks: &[Task]) -> Vec<ReconciledTask> {
        let now = Utc::now();
        tasks
            .iter()
            .filter(|t| t.state == TaskState::Running)
            .filter(|t| self.is_task_stale(t, now))
            .map(|t| ReconciledTask {
                id: t.id.clone(),
                title: t.title.clone(),
                original_state: TaskState::Running,
                new_state: if self.config.auto_pause {
                    TaskState::Paused
                } else {
                    TaskState::Running
                },
                stale_duration_minutes: self.stale_duration_minutes(t, now),
                last_updated_at: t.updated_at,
                reason: self.config.reason.clone(),
                resume_hint: format!("task resume {}", t.id),
            })
            .collect()
    }

    /// Run reconciliation on a list of tasks.
    ///
    /// This is a pure function that returns:
    /// - The updated tasks (with stale ones transitioned to PAUSED)
    /// - A summary of what was done
    ///
    /// The caller is responsible for persisting the updated tasks.
    pub fn reconcile(&self, tasks: Vec<Task>) -> (Vec<Task>, ReconciliationSummary) {
        let now = Utc::now();
        let total_running = tasks.iter().filter(|t| t.state == TaskState::Running).count();

        let mut reconciled_tasks = Vec::new();
        let mut updated_tasks = Vec::with_capacity(tasks.len());

        for mut task in tasks {
            if self.is_task_stale(&task, now) {
                let stale_duration = self.stale_duration_minutes(&task, now);

                reconciled_tasks.push(ReconciledTask {
                    id: task.id.clone(),
                    title: task.title.clone(),
                    original_state: TaskState::Running,
                    new_state: if self.config.auto_pause {
                        TaskState::Paused
                    } else {
                        TaskState::Running
                    },
                    stale_duration_minutes: stale_duration,
                    last_updated_at: task.updated_at,
                    reason: self.config.reason.clone(),
                    resume_hint: format!("task resume {}", task.id),
                });

                if self.config.auto_pause {
                    // Transition to PAUSED
                    let _ = task.transition_to(TaskState::Paused);
                }
            }
            updated_tasks.push(task);
        }

        let summary = ReconciliationSummary {
            total_running,
            stale_count: reconciled_tasks.len(),
            reconciled_count: if self.config.auto_pause {
                reconciled_tasks.len()
            } else {
                0
            },
            reconciled_tasks,
            reconciled_at: now,
            auto_pause_enabled: self.config.auto_pause,
        };

        (updated_tasks, summary)
    }

    /// Run reconciliation with a database accessor.
    ///
    /// This method is designed to work with any type that can provide
    /// task list and update operations.
    ///
    /// Returns a summary of the reconciliation.
    pub fn reconcile_with_db<DB: TaskDatabase>(&self, db: &DB) -> Result<ReconciliationSummary, String> {
        let tasks = db.list_tasks().map_err(|e| e.to_string())?;
        let (updated_tasks, summary) = self.reconcile(tasks);

        // Persist updated tasks
        for task in &updated_tasks {
            if task.state == TaskState::Paused && summary.reconciled_tasks.iter().any(|r| r.id == task.id) {
                db.update_task(task).map_err(|e| e.to_string())?;
            }
        }

        Ok(summary)
    }
}

impl Default for ReconciliationEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Trait for database access required by reconciliation.
///
/// This trait abstracts the database operations needed for reconciliation,
/// allowing the engine to work with different storage backends.
pub trait TaskDatabase {
    /// Error type for database operations.
    type Error: std::fmt::Display;

    /// List all tasks.
    fn list_tasks(&self) -> Result<Vec<Task>, Self::Error>;

    /// Update a task.
    fn update_task(&self, task: &Task) -> Result<(), Self::Error>;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_task_with_state(state: TaskState, updated_at: DateTime<Utc>) -> Task {
        Task {
            id: format!("task-{}", uuid::Uuid::new_v4()),
            title: "Test task".to_string(),
            description: None,
            estimated_pomodoros: 1,
            completed_pomodoros: 0,
            completed: false,
            state,
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: super::super::TaskKind::DurationOnly,
            required_minutes: None,
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec![],
            priority: None,
            category: super::super::TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: super::super::EnergyLevel::Medium,
            group: None,
            group_ids: vec![],
            created_at: updated_at,
            updated_at,
            completed_at: None,
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
        }
    }

    #[test]
    fn config_default_values() {
        let config = ReconciliationConfig::default();
        assert_eq!(config.stale_threshold_minutes, 30);
        assert!(config.auto_pause);
        assert_eq!(config.reason, "Application restart detected");
    }

    #[test]
    fn config_with_stale_threshold_clamps_values() {
        let config = ReconciliationConfig::new()
            .with_stale_threshold(0);
        assert_eq!(config.stale_threshold_minutes, 1); // Min is 1

        let config = ReconciliationConfig::new()
            .with_stale_threshold(2000);
        assert_eq!(config.stale_threshold_minutes, 1440); // Max is 24 hours

        let config = ReconciliationConfig::new()
            .with_stale_threshold(60);
        assert_eq!(config.stale_threshold_minutes, 60);
    }

    #[test]
    fn is_task_stale_detects_old_running_task() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();
        let old_time = now - Duration::minutes(60);

        let task = make_test_task_with_state(TaskState::Running, old_time);
        assert!(engine.is_task_stale(&task, now));
    }

    #[test]
    fn is_task_stale_ignores_recent_running_task() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();
        let recent_time = now - Duration::minutes(10);

        let task = make_test_task_with_state(TaskState::Running, recent_time);
        assert!(!engine.is_task_stale(&task, now));
    }

    #[test]
    fn is_task_stale_ignores_non_running_tasks() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();
        let old_time = now - Duration::minutes(60);

        // PAUSED task should not be considered stale
        let task = make_test_task_with_state(TaskState::Paused, old_time);
        assert!(!engine.is_task_stale(&task, now));

        // READY task should not be considered stale
        let task = make_test_task_with_state(TaskState::Ready, old_time);
        assert!(!engine.is_task_stale(&task, now));

        // DONE task should not be considered stale
        let task = make_test_task_with_state(TaskState::Done, old_time);
        assert!(!engine.is_task_stale(&task, now));
    }

    #[test]
    fn stale_duration_minutes_calculates_correctly() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();

        // Task that's 60 minutes old with 30-minute threshold
        // Should be 30 minutes stale
        let old_time = now - Duration::minutes(60);
        let task = make_test_task_with_state(TaskState::Running, old_time);
        assert_eq!(engine.stale_duration_minutes(&task, now), 30);

        // Task that's exactly at threshold
        let threshold_time = now - Duration::minutes(30);
        let task = make_test_task_with_state(TaskState::Running, threshold_time);
        assert_eq!(engine.stale_duration_minutes(&task, now), 0);
    }

    #[test]
    fn detect_stale_tasks_finds_all_stale() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();

        let task1 = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));
        let task2 = make_test_task_with_state(TaskState::Running, now - Duration::minutes(45));
        let task3 = make_test_task_with_state(TaskState::Running, now - Duration::minutes(10)); // Not stale
        let task4 = make_test_task_with_state(TaskState::Paused, now - Duration::minutes(60)); // Not RUNNING

        let stale = engine.detect_stale_tasks(&[task1, task2, task3, task4]);
        assert_eq!(stale.len(), 2);
    }

    #[test]
    fn reconcile_transitions_stale_to_paused() {
        let config = ReconciliationConfig::new().with_auto_pause(true);
        let engine = ReconciliationEngine::with_config(config);
        let now = Utc::now();

        let task1 = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));
        let task2 = make_test_task_with_state(TaskState::Running, now - Duration::minutes(10));

        let (updated, summary) = engine.reconcile(vec![task1, task2]);

        assert_eq!(summary.total_running, 2);
        assert_eq!(summary.stale_count, 1);
        assert_eq!(summary.reconciled_count, 1);
        assert!(summary.has_reconciled());

        // Check that stale task was transitioned to PAUSED
        let reconciled = updated.iter().find(|t| t.state == TaskState::Paused);
        assert!(reconciled.is_some());
        assert!(reconciled.unwrap().paused_at.is_some());
    }

    #[test]
    fn reconcile_without_auto_pause_only_reports() {
        let config = ReconciliationConfig::new().with_auto_pause(false);
        let engine = ReconciliationEngine::with_config(config);
        let now = Utc::now();

        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));

        let (updated, summary) = engine.reconcile(vec![task]);

        assert_eq!(summary.stale_count, 1);
        assert_eq!(summary.reconciled_count, 0); // Not transitioned
        assert!(!summary.auto_pause_enabled);

        // Task should still be RUNNING
        assert_eq!(updated[0].state, TaskState::Running);
    }

    #[test]
    fn reconcile_empty_list() {
        let engine = ReconciliationEngine::new();
        let (updated, summary) = engine.reconcile(vec![]);

        assert!(updated.is_empty());
        assert_eq!(summary.total_running, 0);
        assert_eq!(summary.reconciled_count, 0);
        assert!(!summary.has_reconciled());
    }

    #[test]
    fn reconciliation_summary_message() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();

        // No running tasks
        let (_, summary) = engine.reconcile(vec![]);
        assert_eq!(summary.message(), "No stale tasks found.");

        // With reconciled tasks
        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));
        let (_, summary) = engine.reconcile(vec![task]);
        assert!(summary.message().contains("Reconciled 1 stale task"));
    }

    #[test]
    fn reconciled_task_has_resume_hint() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();

        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));
        let (_, summary) = engine.reconcile(vec![task]);

        assert_eq!(summary.reconciled_tasks.len(), 1);
        assert!(summary.reconciled_tasks[0].resume_hint.starts_with("task resume "));
    }

    #[test]
    fn reconcile_is_idempotent() {
        let engine = ReconciliationEngine::new();
        let now = Utc::now();

        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));

        // First reconciliation
        let (updated1, summary1) = engine.reconcile(vec![task]);

        // Second reconciliation on already-reconciled tasks
        let (_, summary2) = engine.reconcile(updated1);

        // First should find 1 stale, second should find 0 (already PAUSED)
        assert_eq!(summary1.reconciled_count, 1);
        assert_eq!(summary2.reconciled_count, 0);
    }

    #[test]
    fn custom_reason_applied_to_reconciled_tasks() {
        let config = ReconciliationConfig::new()
            .with_reason("System crash recovery");
        let engine = ReconciliationEngine::with_config(config);
        let now = Utc::now();

        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(60));
        let (_, summary) = engine.reconcile(vec![task]);

        assert_eq!(summary.reconciled_tasks[0].reason, "System crash recovery");
    }

    #[test]
    fn custom_threshold_respected() {
        let config = ReconciliationConfig::new()
            .with_stale_threshold(60); // 60 minutes
        let engine = ReconciliationEngine::with_config(config);
        let now = Utc::now();

        // Task that's 45 minutes old - not stale with 60-minute threshold
        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(45));

        assert!(!engine.is_task_stale(&task, now));

        // Task that's 90 minutes old - stale with 60-minute threshold
        let task = make_test_task_with_state(TaskState::Running, now - Duration::minutes(90));

        assert!(engine.is_task_stale(&task, now));
    }
}
