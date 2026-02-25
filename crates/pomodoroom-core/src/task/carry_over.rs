//! Carry-over strategy for unfinished split task chains.
//!
//! This module handles moving remaining task segments to the next day
//! when a split task chain spans multiple days.
//!
//! # Features
//! - Detects unfinished split chains at day boundary
//! - Creates new child task segments for next day
//! - Optional break compression between carried segments
//! - Preserves historical chain integrity
//!
//! # Usage
//! ```rust,ignore
//! use pomodoroom_core::task::carry_over::{CarryOverPolicy, CarryOverEngine};
//!
//! let policy = CarryOverPolicy::default();
//! let engine = CarryOverEngine::new(policy);
//! let carried = engine.carry_over_unfinished(&tasks, next_day);
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::task::{Task, TaskState};

/// Policy for handling unfinished split task carry-over
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarryOverPolicy {
    /// Whether to compress breaks between carried segments
    pub compress_breaks: bool,
    /// Break duration in minutes when compressed (default: 5)
    pub compressed_break_minutes: u32,
    /// Maximum segments to carry over per day
    pub max_segments_per_day: usize,
    /// Whether to preserve original segment order
    pub preserve_order: bool,
}

impl Default for CarryOverPolicy {
    fn default() -> Self {
        Self {
            compress_breaks: true,
            compressed_break_minutes: 5,
            max_segments_per_day: 10,
            preserve_order: true,
        }
    }
}

impl CarryOverPolicy {
    /// Create a new policy with custom settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Set whether to compress breaks
    pub fn with_compress_breaks(mut self, compress: bool) -> Self {
        self.compress_breaks = compress;
        self
    }

    /// Set compressed break duration
    pub fn with_compressed_break_minutes(mut self, minutes: u32) -> Self {
        self.compressed_break_minutes = minutes;
        self
    }

    /// Set max segments per day
    pub fn with_max_segments(mut self, max: usize) -> Self {
        self.max_segments_per_day = max;
        self
    }
}

/// Result of carrying over unfinished segments
#[derive(Debug, Clone)]
pub struct CarryOverResult {
    /// Parent tasks that had unfinished segments
    pub parent_tasks: Vec<ParentTaskStatus>,
    /// Newly created child tasks for next day
    pub carried_segments: Vec<Task>,
    /// Segments that were dropped (e.g., exceeded max)
    pub dropped_segments: Vec<DroppedSegment>,
}

/// Status of a parent task with unfinished segments
#[derive(Debug, Clone)]
pub struct ParentTaskStatus {
    /// Parent task ID
    pub parent_id: String,
    /// Total segments in chain
    pub total_segments: usize,
    /// Completed segments
    pub completed_segments: usize,
    /// Remaining segments
    pub remaining_segments: usize,
    /// Whether chain was fully carried over
    pub fully_carried: bool,
}

/// A segment that was dropped during carry-over
#[derive(Debug, Clone)]
pub struct DroppedSegment {
    /// Original segment ID
    pub segment_id: String,
    /// Parent task ID
    pub parent_id: String,
    /// Reason for dropping
    pub reason: DropReason,
}

/// Reason why a segment was dropped
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DropReason {
    /// Exceeded max segments per day
    MaxSegmentsExceeded,
    /// Segment was optional and skipped
    OptionalSkipped,
    /// Parent task was cancelled
    ParentCancelled,
}

/// Engine for carrying over unfinished split task segments
pub struct CarryOverEngine {
    policy: CarryOverPolicy,
}

impl CarryOverEngine {
    /// Create a new carry-over engine with default policy
    pub fn new() -> Self {
        Self {
            policy: CarryOverPolicy::default(),
        }
    }

    /// Create a new carry-over engine with custom policy
    pub fn with_policy(policy: CarryOverPolicy) -> Self {
        Self { policy }
    }

    /// Carry over unfinished segments to the next day
    ///
    /// # Arguments
    /// * `tasks` - All tasks from current day
    /// * `next_day` - The target day for carried segments
    ///
    /// # Returns
    /// Carry-over result with new tasks and status information
    pub fn carry_over_unfinished(
        &self,
        tasks: &[Task],
        next_day: DateTime<Utc>,
    ) -> CarryOverResult {
        // Group tasks by parent to find split chains
        let mut parent_groups: HashMap<String, Vec<Task>> = HashMap::new();

        for task in tasks {
            if let Some(parent_id) = &task.parent_task_id {
                parent_groups
                    .entry(parent_id.clone())
                    .or_insert_with(Vec::new)
                    .push(task.clone());
            }
        }

        // Find unfinished chains
        let mut parent_statuses = Vec::new();
        let mut carried_segments = Vec::new();
        let mut dropped_segments = Vec::new();

        let mut carried_count = 0;

        for (parent_id, segments) in parent_groups {
            // Sort by segment order
            let mut sorted_segments: Vec<_> = segments
                .iter()
                .filter(|s| s.segment_order.is_some())
                .collect();

            if self.policy.preserve_order {
                sorted_segments.sort_by_key(|s| s.segment_order.unwrap());
            }

            let total_segments = sorted_segments.len();
            let completed_segments = sorted_segments
                .iter()
                .filter(|s| matches!(s.state, TaskState::Done))
                .count();

            if completed_segments < total_segments {
                // This chain is unfinished
                let remaining = total_segments - completed_segments;

                parent_statuses.push(ParentTaskStatus {
                    parent_id: parent_id.clone(),
                    total_segments,
                    completed_segments,
                    remaining_segments: remaining,
                    fully_carried: false,
                });

                // Carry over remaining segments
                for segment in sorted_segments
                    .into_iter()
                    .filter(|s| !matches!(s.state, TaskState::Done))
                {
                    if carried_count >= self.policy.max_segments_per_day {
                        dropped_segments.push(DroppedSegment {
                            segment_id: segment.id.clone(),
                            parent_id: parent_id.clone(),
                            reason: DropReason::MaxSegmentsExceeded,
                        });
                        continue;
                    }

                    // Create new task for next day
                    let mut new_task = segment.clone();
                    new_task.id = format!("{}-next-{}", segment.id, uuid::Uuid::new_v4());
                    new_task.created_at = next_day;
                    new_task.updated_at = next_day;
                    new_task.completed_at = None;
                    new_task.paused_at = None;
                    new_task.completed_pomodoros = 0;
                    new_task.elapsed_minutes = 0;

                    // Mark as ready for the new day
                    new_task.state = TaskState::Ready;

                    carried_segments.push(new_task);
                    carried_count += 1;
                }

                // Update status
                if let Some(status) = parent_statuses.last_mut() {
                    status.fully_carried = carried_count >= remaining;
                }
            }
        }

        CarryOverResult {
            parent_tasks: parent_statuses,
            carried_segments,
            dropped_segments,
        }
    }

    /// Get the current policy
    pub fn policy(&self) -> &CarryOverPolicy {
        &self.policy
    }

    /// Update the policy
    pub fn set_policy(&mut self, policy: CarryOverPolicy) {
        self.policy = policy;
    }
}

impl Default for CarryOverEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Calculate remaining workload for a split chain
pub fn calculate_remaining_workload(parent_id: &str, tasks: &[Task]) -> Option<RemainingWorkload> {
    let segments: Vec<_> = tasks
        .iter()
        .filter(|t| t.parent_task_id.as_deref() == Some(parent_id))
        .collect();

    if segments.is_empty() {
        return None;
    }

    let total_estimated: i32 = segments.iter().map(|t| t.estimated_pomodoros).sum();
    let total_completed: i32 = segments.iter().map(|t| t.completed_pomodoros).sum();
    let total_elapsed: i32 = segments.iter().map(|t| t.elapsed_minutes as i32).sum();

    let remaining_pomodoros = total_estimated - total_completed;

    Some(RemainingWorkload {
        parent_id: parent_id.to_string(),
        total_segments: segments.len(),
        completed_segments: segments.iter().filter(|t| t.completed).count(),
        remaining_pomodoros,
        remaining_minutes: {
            let completed_ids: std::collections::HashSet<_> =
                segments.iter().filter(|s| s.completed).map(|s| &s.id).collect();
            segments
                .iter()
                .filter(|t| !completed_ids.contains(&t.id))
                .filter_map(|t| t.required_minutes)
                .map(|m| m as i32)
                .sum()
        },
        total_elapsed_minutes: total_elapsed,
    })
}

/// Information about remaining workload in a split chain
#[derive(Debug, Clone)]
pub struct RemainingWorkload {
    /// Parent task ID
    pub parent_id: String,
    /// Total segments in chain
    pub total_segments: usize,
    /// Number of completed segments
    pub completed_segments: usize,
    /// Remaining pomodoros across all segments
    pub remaining_pomodoros: i32,
    /// Remaining required minutes
    pub remaining_minutes: i32,
    /// Total elapsed minutes so far
    pub total_elapsed_minutes: i32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::{EnergyLevel, TaskCategory, TaskKind};

    fn make_test_segment(
        parent_id: &str,
        segment_order: i32,
        completed: bool,
    ) -> Task {
        Task {
            id: format!("{}-seg-{}", parent_id, segment_order),
            title: format!("Segment {}", segment_order),
            description: None,
            estimated_pomodoros: 2,
            completed_pomodoros: if completed { 2 } else { 0 },
            completed,
            state: if completed {
                TaskState::Done
            } else {
                TaskState::Ready
            },
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: TaskKind::DurationOnly,
            required_minutes: Some(60),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec![],
            priority: Some(50),
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: EnergyLevel::Medium,
            group: None,
            group_ids: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: if completed { Some(Utc::now()) } else { None },
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: Some(parent_id.to_string()),
            segment_order: Some(segment_order),
            allow_split: false,
            suggested_tags: vec![],
            approved_tags: vec![],
        }
    }

    #[test]
    fn test_carry_over_policy_default() {
        let policy = CarryOverPolicy::default();
        assert!(policy.compress_breaks);
        assert_eq!(policy.compressed_break_minutes, 5);
        assert_eq!(policy.max_segments_per_day, 10);
        assert!(policy.preserve_order);
    }

    #[test]
    fn test_carry_over_unfinished_segments() {
        let engine = CarryOverEngine::new();
        let next_day = Utc::now() + chrono::Duration::days(1);

        // Create a split chain with 3 segments, only 1 completed
        let tasks = vec![
            make_test_segment("parent-1", 1, true),
            make_test_segment("parent-1", 2, false),
            make_test_segment("parent-1", 3, false),
        ];

        let result = engine.carry_over_unfinished(&tasks, next_day);

        assert_eq!(result.parent_tasks.len(), 1);
        assert_eq!(result.parent_tasks[0].remaining_segments, 2);
        assert_eq!(result.carried_segments.len(), 2);
    }

    #[test]
    fn test_carry_over_preserves_order() {
        let engine = CarryOverEngine::new();
        let next_day = Utc::now() + chrono::Duration::days(1);

        // Create segments out of order in the list
        let tasks = vec![
            make_test_segment("parent-1", 3, false),
            make_test_segment("parent-1", 1, true),
            make_test_segment("parent-1", 2, false),
        ];

        let result = engine.carry_over_unfinished(&tasks, next_day);

        // Should carry segments 2 and 3 (not 1 which is done)
        assert_eq!(result.carried_segments.len(), 2);
    }

    #[test]
    fn test_max_segments_limit() {
        let policy = CarryOverPolicy {
            max_segments_per_day: 2,
            ..Default::default()
        };
        let engine = CarryOverEngine::with_policy(policy);
        let next_day = Utc::now() + chrono::Duration::days(1);

        // Create 4 unfinished segments
        let tasks = vec![
            make_test_segment("parent-1", 1, false),
            make_test_segment("parent-1", 2, false),
            make_test_segment("parent-1", 3, false),
            make_test_segment("parent-1", 4, false),
        ];

        let result = engine.carry_over_unfinished(&tasks, next_day);

        assert_eq!(result.carried_segments.len(), 2);
        assert_eq!(result.dropped_segments.len(), 2);
        assert_eq!(
            result.dropped_segments[0].reason,
            DropReason::MaxSegmentsExceeded
        );
    }

    #[test]
    fn test_calculate_remaining_workload() {
        let tasks = vec![
            make_test_segment("parent-1", 1, true),
            make_test_segment("parent-1", 2, false),
            make_test_segment("parent-1", 3, false),
        ];

        let workload = calculate_remaining_workload("parent-1", &tasks).unwrap();

        assert_eq!(workload.total_segments, 3);
        assert_eq!(workload.completed_segments, 1);
        assert_eq!(workload.remaining_pomodoros, 4);
        assert_eq!(workload.remaining_minutes, 120);
    }

    #[test]
    fn test_fully_completed_chain_not_carried() {
        let engine = CarryOverEngine::new();
        let next_day = Utc::now() + chrono::Duration::days(1);

        // All segments completed
        let tasks = vec![
            make_test_segment("parent-1", 1, true),
            make_test_segment("parent-1", 2, true),
            make_test_segment("parent-1", 3, true),
        ];

        let result = engine.carry_over_unfinished(&tasks, next_day);

        assert_eq!(result.parent_tasks.len(), 0);
        assert_eq!(result.carried_segments.len(), 0);
    }

    #[test]
    fn test_multiple_parent_tasks() {
        let engine = CarryOverEngine::new();
        let next_day = Utc::now() + chrono::Duration::days(1);

        let tasks = vec![
            make_test_segment("parent-1", 1, true),
            make_test_segment("parent-1", 2, false),
            make_test_segment("parent-2", 1, true),
            make_test_segment("parent-2", 2, false),
            make_test_segment("parent-2", 3, false),
        ];

        let result = engine.carry_over_unfinished(&tasks, next_day);

        assert_eq!(result.parent_tasks.len(), 2);
        assert_eq!(result.carried_segments.len(), 3);
    }
}
