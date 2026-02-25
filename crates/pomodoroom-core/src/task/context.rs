//! Context system for task pause/resume operations.
//!
//! Per CORE_POLICY.md §4.4, context is a mathematical model, NOT text input.
//! The system automatically records and reconstructs context elements:
//!
//! - Task metadata (tags, project, energy level)
//! - Operation history (start time, pause count, extend count, defer count)
//! - Task relationships (same project, same tags, dependencies)
//! - Temporal context (elapsed time, remaining estimate, time since pause)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Single operation record in task history.
///
/// Tracks all state transitions and user actions for context reconstruction.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationLog {
    /// Unique identifier for this operation
    pub id: String,
    /// Task ID this operation belongs to
    pub task_id: String,
    /// Type of operation performed
    pub operation: OperationType,
    /// When the operation occurred
    pub timestamp: DateTime<Utc>,
    /// Elapsed minutes at the time of operation
    pub elapsed_minutes: u32,
    /// Optional contextual data (e.g., previous state, reason)
    pub context: OperationContext,
}

/// Type of operation performed on a task.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OperationType {
    /// Task was started (READY → RUNNING)
    Start,
    /// Task was completed (RUNNING → DONE)
    Complete,
    /// Task timer was extended (RUNNING → RUNNING with reset)
    Extend,
    /// Task was paused (RUNNING → PAUSED)
    Pause,
    /// Task was resumed (PAUSED → RUNNING)
    Resume,
    /// Task was deferred (READY → READY with lower priority)
    Defer,
    /// Task timeout (RUNNING/PAUSED → DRIFTING)
    Timeout,
}

/// Additional context for an operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationContext {
    /// Previous state before this operation
    pub from_state: String,
    /// New state after this operation
    pub to_state: String,
    /// Priority change (if any)
    pub priority_delta: Option<i32>,
    /// Energy level at time of operation
    pub energy: String,
    /// Tags associated with task at time of operation
    pub tags: Vec<String>,
    /// Projects associated with task at time of operation
    pub project_ids: Vec<String>,
}

impl OperationLog {
    /// Create a new operation log entry.
    pub fn new(
        task_id: String,
        operation: OperationType,
        timestamp: DateTime<Utc>,
        elapsed_minutes: u32,
        context: OperationContext,
    ) -> Self {
        Self {
            id: format!("op-{}-{}", timestamp.timestamp_millis(), uuid::Uuid::new_v4()),
            task_id,
            operation,
            timestamp,
            elapsed_minutes,
            context,
        }
    }
}

/// Context captured when task is paused.
///
/// Contains all mathematical model elements needed to reconstruct
/// the task's situation when resumed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PauseContext {
    /// Task ID being paused
    pub task_id: String,
    /// When the pause occurred
    pub paused_at: DateTime<Utc>,
    /// Elapsed minutes at pause time
    pub elapsed_minutes: u32,
    /// Estimated remaining minutes
    pub estimated_remaining_minutes: Option<u32>,
    /// Task state before pause (should be RUNNING)
    pub previous_state: String,
    /// Energy level at pause time
    pub energy: String,
    /// Tags at pause time
    pub tags: Vec<String>,
    /// Projects at pause time
    pub project_ids: Vec<String>,
    /// Groups at pause time
    pub group_ids: Vec<String>,
    /// Priority at pause time
    pub priority: Option<i32>,
    /// Operation history snapshot
    pub operation_summary: OperationSummary,
    /// Related task IDs (same project, same tags)
    pub related_tasks: RelatedTasks,
}

/// Summary of operations performed on a task.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationSummary {
    /// Total number of start operations
    pub start_count: u32,
    /// Total number of pause operations
    pub pause_count: u32,
    /// Total number of resume operations
    pub resume_count: u32,
    /// Total number of extend operations
    pub extend_count: u32,
    /// Total number of defer operations
    pub defer_count: u32,
    /// First operation timestamp
    pub first_operation_at: Option<DateTime<Utc>>,
    /// Last operation timestamp
    pub last_operation_at: Option<DateTime<Utc>>,
}

impl OperationSummary {
    /// Create a new empty operation summary.
    pub fn new() -> Self {
        Self {
            start_count: 0,
            pause_count: 0,
            resume_count: 0,
            extend_count: 0,
            defer_count: 0,
            first_operation_at: None,
            last_operation_at: None,
        }
    }

    /// Add an operation to the summary.
    pub fn add_operation(&mut self, operation: OperationType, timestamp: DateTime<Utc>) {
        match operation {
            OperationType::Start => self.start_count += 1,
            OperationType::Pause => self.pause_count += 1,
            OperationType::Resume => self.resume_count += 1,
            OperationType::Extend => self.extend_count += 1,
            OperationType::Defer => self.defer_count += 1,
            OperationType::Complete | OperationType::Timeout => {}
        }

        if self.first_operation_at.is_none() {
            self.first_operation_at = Some(timestamp);
        }
        self.last_operation_at = Some(timestamp);
    }

    /// Calculate total operation count.
    pub fn total_operations(&self) -> u32 {
        self.start_count + self.pause_count + self.resume_count + self.extend_count + self.defer_count
    }
}

impl Default for OperationSummary {
    fn default() -> Self {
        Self::new()
    }
}

/// Related tasks based on relationships.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RelatedTasks {
    /// Tasks in the same project(s)
    pub same_project: Vec<String>,
    /// Tasks with the same tag(s)
    pub same_tags: Vec<String>,
    /// Task dependencies (blocking tasks)
    pub dependencies: Vec<String>,
    /// Tasks that depend on this task
    pub dependents: Vec<String>,
}

impl RelatedTasks {
    /// Create empty related tasks.
    pub fn new() -> Self {
        Self {
            same_project: Vec::new(),
            same_tags: Vec::new(),
            dependencies: Vec::new(),
            dependents: Vec::new(),
        }
    }
}

impl Default for RelatedTasks {
    fn default() -> Self {
        Self::new()
    }
}

impl PauseContext {
    /// Create pause context from task data.
    pub fn from_task(
        task_id: String,
        paused_at: DateTime<Utc>,
        elapsed_minutes: u32,
        estimated_minutes: Option<u32>,
        previous_state: String,
        energy: String,
        tags: Vec<String>,
        project_ids: Vec<String>,
        group_ids: Vec<String>,
        priority: Option<i32>,
        operation_summary: OperationSummary,
        related_tasks: RelatedTasks,
    ) -> Self {
        let estimated_remaining = estimated_minutes.map(|est| {
            if elapsed_minutes >= est {
                0
            } else {
                est - elapsed_minutes
            }
        });

        Self {
            task_id,
            paused_at,
            elapsed_minutes,
            estimated_remaining_minutes: estimated_remaining,
            previous_state,
            energy,
            tags,
            project_ids,
            group_ids,
            priority,
            operation_summary,
            related_tasks,
        }
    }

    /// Calculate time since pause in minutes.
    pub fn minutes_since_pause(&self, now: DateTime<Utc>) -> i64 {
        now.signed_duration_since(self.paused_at).num_minutes()
    }

    /// Calculate completion percentage (0.0 to 1.0).
    pub fn completion_percentage(&self) -> f64 {
        if let Some(remaining) = self.estimated_remaining_minutes {
            let total = self.elapsed_minutes + remaining;
            if total == 0 {
                0.0
            } else {
                (self.elapsed_minutes as f64 / total as f64).min(1.0)
            }
        } else {
            0.0
        }
    }
}

/// Context reconstructed when task is resumed.
///
/// Provides calculated contextual information to help user
/// understand the task's situation without requiring memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResumeContext {
    /// Task ID being resumed
    pub task_id: String,
    /// When the resume occurred
    pub resumed_at: DateTime<Utc>,
    /// How long the task was paused (in minutes)
    pub pause_duration_minutes: i64,
    /// Elapsed minutes before pause
    pub elapsed_before_pause: u32,
    /// Estimated remaining minutes
    pub estimated_remaining_minutes: Option<u32>,
    /// Completion percentage
    pub completion_percentage: f64,
    /// Energy level (may have changed since pause)
    pub energy: String,
    /// Priority (may have changed since pause)
    pub priority: Option<i32>,
    /// Operation summary
    pub operation_summary: OperationSummary,
    /// Contextual insights for the user
    pub insights: Vec<ContextInsight>,
    /// Related tasks that may be relevant
    pub related_tasks: RelatedTasks,
}

/// Calculated insight about the task context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextInsight {
    /// Type of insight
    pub insight_type: InsightType,
    /// Human-readable message (calculated, not user input)
    pub message: String,
    /// Relevant data points
    pub data: HashMap<String, String>,
}

/// Type of contextual insight.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InsightType {
    /// Progress tracking insight
    Progress,
    /// Time-based insight
    Temporal,
    /// Relationship-based insight
    Relational,
    /// Pattern-based insight
    Pattern,
}

impl ResumeContext {
    /// Create resume context from pause context and current state.
    pub fn from_pause_context(
        pause_ctx: PauseContext,
        resumed_at: DateTime<Utc>,
        current_energy: String,
        current_priority: Option<i32>,
        related_tasks: RelatedTasks,
    ) -> Self {
        let pause_duration = resumed_at.signed_duration_since(pause_ctx.paused_at).num_minutes();
        let completion = pause_ctx.completion_percentage();

        // Generate insights based on context
        let mut insights = Vec::new();

        // Progress insight
        if let Some(remaining) = pause_ctx.estimated_remaining_minutes {
            if remaining == 0 {
                insights.push(ContextInsight {
                    insight_type: InsightType::Progress,
                    message: "Task is estimated to be complete based on elapsed time.".to_string(),
                    data: vec![("elapsed".to_string(), format!("{} min", pause_ctx.elapsed_minutes))]
                        .into_iter()
                        .collect(),
                });
            } else if completion >= 0.8 {
                insights.push(ContextInsight {
                    insight_type: InsightType::Progress,
                    message: "Task is nearly complete (80%+ done).".to_string(),
                    data: vec![
                        ("completion".to_string(), format!("{:.0}%", completion * 100.0)),
                        ("remaining".to_string(), format!("{} min", remaining)),
                    ]
                    .into_iter()
                    .collect(),
                });
            }
        }

        // Temporal insight
        if pause_duration > 60 {
            insights.push(ContextInsight {
                insight_type: InsightType::Temporal,
                message: format!("Task was paused for {:.1} hours.", pause_duration as f64 / 60.0),
                data: vec![("pause_duration_minutes".to_string(), pause_duration.to_string())]
                    .into_iter()
                    .collect(),
            });
        }

        // Operation pattern insight
        let ops = &pause_ctx.operation_summary;
        if ops.pause_count >= 3 {
            insights.push(ContextInsight {
                insight_type: InsightType::Pattern,
                message: "This task has been paused multiple times. Consider breaking it down.".to_string(),
                data: vec![
                    ("pause_count".to_string(), ops.pause_count.to_string()),
                    ("extend_count".to_string(), ops.extend_count.to_string()),
                ]
                .into_iter()
                .collect(),
            });
        }

        Self {
            task_id: pause_ctx.task_id,
            resumed_at,
            pause_duration_minutes: pause_duration,
            elapsed_before_pause: pause_ctx.elapsed_minutes,
            estimated_remaining_minutes: pause_ctx.estimated_remaining_minutes,
            completion_percentage: completion,
            energy: current_energy,
            priority: current_priority,
            operation_summary: pause_ctx.operation_summary,
            insights,
            related_tasks,
        }
    }

    /// Check if this is a "cold" resume (long pause duration).
    pub fn is_cold_resume(&self) -> bool {
        self.pause_duration_minutes > 120 // 2+ hours
    }

    /// Get primary insight message (first insight or default).
    pub fn primary_message(&self) -> String {
        self.insights
            .first()
            .map(|i| i.message.clone())
            .unwrap_or_else(|| {
                format!(
                    "Task resumed after {} min. {:.0}% complete.",
                    self.pause_duration_minutes,
                    self.completion_percentage * 100.0
                )
            })
    }
}

/// Context manager for tracking and reconstructing task context.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ContextManager {
    /// All operation logs indexed by task ID
    operation_logs: HashMap<String, Vec<OperationLog>>,
    /// Active pause contexts (tasks currently paused)
    pause_contexts: HashMap<String, PauseContext>,
}

impl ContextManager {
    /// Create a new context manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Record an operation for a task.
    pub fn record_operation(
        &mut self,
        task_id: String,
        operation: OperationType,
        timestamp: DateTime<Utc>,
        elapsed_minutes: u32,
        context: OperationContext,
    ) {
        let log = OperationLog::new(task_id.clone(), operation, timestamp, elapsed_minutes, context);
        self.operation_logs
            .entry(task_id)
            .or_insert_with(Vec::new)
            .push(log);
    }

    /// Get operation summary for a task.
    pub fn get_operation_summary(&self, task_id: &str) -> OperationSummary {
        self.operation_logs
            .get(task_id)
            .map(|logs| {
                let mut summary = OperationSummary::new();
                for log in logs {
                    summary.add_operation(log.operation, log.timestamp);
                }
                summary
            })
            .unwrap_or_default()
    }

    /// Get all operations for a task.
    pub fn get_operations(&self, task_id: &str) -> Vec<OperationLog> {
        self.operation_logs.get(task_id).cloned().unwrap_or_default()
    }

    /// Save pause context for a task.
    pub fn save_pause_context(&mut self, context: PauseContext) {
        self.pause_contexts.insert(context.task_id.clone(), context);
    }

    /// Get pause context for a task (if exists).
    pub fn get_pause_context(&self, task_id: &str) -> Option<PauseContext> {
        self.pause_contexts.get(task_id).cloned()
    }

    /// Remove pause context (after resume).
    pub fn clear_pause_context(&mut self, task_id: &str) {
        self.pause_contexts.remove(task_id);
    }

    /// Build pause context from current task state and related tasks.
    pub fn build_pause_context(
        &self,
        task_id: String,
        paused_at: DateTime<Utc>,
        elapsed_minutes: u32,
        estimated_minutes: Option<u32>,
        previous_state: String,
        energy: String,
        tags: Vec<String>,
        project_ids: Vec<String>,
        group_ids: Vec<String>,
        priority: Option<i32>,
        related_tasks: RelatedTasks,
    ) -> PauseContext {
        let operation_summary = self.get_operation_summary(&task_id);
        PauseContext::from_task(
            task_id,
            paused_at,
            elapsed_minutes,
            estimated_minutes,
            previous_state,
            energy,
            tags,
            project_ids,
            group_ids,
            priority,
            operation_summary,
            related_tasks,
        )
    }

    /// Build resume context from saved pause context.
    pub fn build_resume_context(
        &self,
        task_id: &str,
        resumed_at: DateTime<Utc>,
        current_energy: String,
        current_priority: Option<i32>,
        related_tasks: RelatedTasks,
    ) -> Option<ResumeContext> {
        let pause_ctx = self.get_pause_context(task_id)?;
        Some(ResumeContext::from_pause_context(
            pause_ctx,
            resumed_at,
            current_energy,
            current_priority,
            related_tasks,
        ))
    }

    /// Find related tasks based on relationships.
    ///
    /// This is a placeholder for the full implementation that would
    /// query the task storage to find related tasks.
    pub fn find_related_tasks(
        &self,
        _task_id: &str,
        project_ids: &[String],
        tags: &[String],
        all_tasks: &[String],
    ) -> RelatedTasks {
        let mut related = RelatedTasks::new();

        // Placeholder: Find tasks with same projects
        for task_id in all_tasks {
            // In real implementation, this would query task data
            // and check for matching projects/tags
            if !project_ids.is_empty() {
                related.same_project.push(task_id.clone());
            }
        }

        // Placeholder: Find tasks with same tags
        if !tags.is_empty() {
            for task_id in all_tasks {
                if !related.same_project.contains(task_id) {
                    related.same_tags.push(task_id.clone());
                }
            }
        }

        related
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_operation_summary_counts() {
        let mut summary = OperationSummary::new();
        let now = Utc::now();

        summary.add_operation(OperationType::Start, now);
        summary.add_operation(OperationType::Pause, now + Duration::seconds(60));
        summary.add_operation(OperationType::Resume, now + Duration::seconds(120));
        summary.add_operation(OperationType::Extend, now + Duration::seconds(180));

        assert_eq!(summary.start_count, 1);
        assert_eq!(summary.pause_count, 1);
        assert_eq!(summary.resume_count, 1);
        assert_eq!(summary.extend_count, 1);
        assert_eq!(summary.defer_count, 0);
        assert_eq!(summary.total_operations(), 4);
    }

    #[test]
    fn test_pause_context_completion() {
        let ctx = PauseContext::from_task(
            "task-1".to_string(),
            Utc::now(),
            15, // elapsed
            Some(30), // estimated
            "RUNNING".to_string(),
            "medium".to_string(),
            vec!["work".to_string()],
            vec![],
            vec![],
            Some(50),
            OperationSummary::new(),
            RelatedTasks::new(),
        );

        assert_eq!(ctx.completion_percentage(), 0.5); // 50% complete
        assert_eq!(ctx.estimated_remaining_minutes, Some(15));
    }

    #[test]
    fn test_pause_context_complete() {
        let ctx = PauseContext::from_task(
            "task-1".to_string(),
            Utc::now(),
            30, // elapsed
            Some(25), // estimated (less than elapsed)
            "RUNNING".to_string(),
            "medium".to_string(),
            vec![],
            vec![],
            vec![],
            Some(50),
            OperationSummary::new(),
            RelatedTasks::new(),
        );

        assert_eq!(ctx.completion_percentage(), 1.0); // 100% complete
        assert_eq!(ctx.estimated_remaining_minutes, Some(0));
    }

    #[test]
    fn test_resume_context_insights() {
        let mut summary = OperationSummary::new();
        summary.pause_count = 3;
        summary.extend_count = 1;

        let pause_ctx = PauseContext::from_task(
            "task-1".to_string(),
            Utc::now() - Duration::hours(3), // 3 hours ago
            20,
            Some(100),
            "RUNNING".to_string(),
            "medium".to_string(),
            vec![],
            vec![],
            vec![],
            Some(50),
            summary,
            RelatedTasks::new(),
        );

        let resume_ctx = ResumeContext::from_pause_context(
            pause_ctx,
            Utc::now(),
            "medium".to_string(),
            Some(50),
            RelatedTasks::new(),
        );

        // Should have temporal insight (long pause)
        assert!(resume_ctx.insights.iter().any(|i| i.insight_type == InsightType::Temporal));
        // Should have pattern insight (multiple pauses)
        assert!(resume_ctx.insights.iter().any(|i| i.insight_type == InsightType::Pattern));
        assert!(resume_ctx.is_cold_resume());
    }

    #[test]
    fn test_context_manager_record_and_retrieve() {
        let mut manager = ContextManager::new();
        let task_id = "task-1".to_string();
        let now = Utc::now();

        let context = OperationContext {
            from_state: "READY".to_string(),
            to_state: "RUNNING".to_string(),
            priority_delta: None,
            energy: "medium".to_string(),
            tags: vec!["work".to_string()],
            project_ids: vec![],
        };

        manager.record_operation(
            task_id.clone(),
            OperationType::Start,
            now,
            0,
            context,
        );

        let summary = manager.get_operation_summary(&task_id);
        assert_eq!(summary.start_count, 1);
        assert_eq!(summary.total_operations(), 1);
    }
}
