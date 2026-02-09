//! Task priority calculation module.
//!
//! Calculates task priority scores (0-100) based on multiple factors:
//! - Deadline proximity (closer = higher priority)
//! - User-defined importance (if provided)
//! - Effort estimation (shorter tasks may get priority for quick wins)
//! - Dependencies (blocking tasks get priority)
//!
//! The algorithm weights each factor to produce a normalized score.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::item::TimelineItem;

/// Priority calculation weights
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriorityWeights {
    /// Weight for deadline proximity (0.0-1.0, default 0.4)
    pub deadline_weight: f32,
    /// Weight for user importance (0.0-1.0, default 0.3)
    pub importance_weight: f32,
    /// Weight for effort estimation (0.0-1.0, default 0.2)
    pub effort_weight: f32,
    /// Weight for dependencies (0.0-1.0, default 0.1)
    pub dependency_weight: f32,
}

impl Default for PriorityWeights {
    fn default() -> Self {
        Self {
            deadline_weight: 0.4,
            importance_weight: 0.3,
            effort_weight: 0.2,
            dependency_weight: 0.1,
        }
    }
}

/// Priority calculation configuration
#[derive(Debug, Clone)]
pub struct PriorityConfig {
    /// Weights for each factor
    pub weights: PriorityWeights,
    /// Current time for deadline calculations
    pub current_time: DateTime<Utc>,
    /// Whether to boost priority for uncompleted tasks
    pub boost_incomplete: bool,
}

impl Default for PriorityConfig {
    fn default() -> Self {
        Self {
            weights: PriorityWeights::default(),
            current_time: Utc::now(),
            boost_incomplete: true,
        }
    }
}

/// Priority calculator for tasks
pub struct PriorityCalculator {
    config: PriorityConfig,
}

impl PriorityCalculator {
    /// Create a new priority calculator with default config
    pub fn new() -> Self {
        Self {
            config: PriorityConfig::default(),
        }
    }

    /// Create with custom config
    pub fn with_config(config: PriorityConfig) -> Self {
        Self { config }
    }

    /// Calculate priority score for a task (0-100)
    ///
    /// # Arguments
    /// * `task` - The task to calculate priority for
    ///
    /// # Returns
    /// Priority score from 0 to 100
    pub fn calculate_priority(&self, task: &TimelineItem) -> u8 {
        let mut score = 0.0f32;

        // 1. Deadline proximity score (0-100)
        let deadline_score = self.calculate_deadline_score(task);
        score += deadline_score * self.config.weights.deadline_weight;

        // 2. User-defined importance score (0-100)
        let importance_score = self.calculate_importance_score(task);
        score += importance_score * self.config.weights.importance_weight;

        // 3. Effort estimation score (0-100)
        let effort_score = self.calculate_effort_score(task);
        score += effort_score * self.config.weights.effort_weight;

        // 4. Dependency score (0-100)
        let dependency_score = self.calculate_dependency_score(task);
        score += dependency_score * self.config.weights.dependency_weight;

        // Boost for incomplete tasks
        if self.config.boost_incomplete && !task.completed {
            score = (score * 1.1).min(100.0);
        }

        score.min(100.0).max(0.0) as u8
    }

    /// Calculate deadline proximity score (0-100)
    ///
    /// - Overdue: 100
    /// - Due within 24h: 90-99 based on hours remaining
    /// - Due within 3 days: 60-89
    /// - Due within 7 days: 30-59
    /// - Due within 30 days: 10-29
    /// - No deadline or >30 days: 0-9
    fn calculate_deadline_score(&self, task: &TimelineItem) -> f32 {
        let Some(deadline) = task.deadline else {
            return 5.0; // Base score for tasks without deadline
        };

        let now = self.config.current_time;
        let duration = deadline.signed_duration_since(now);
        let hours_total = duration.num_hours();

        if hours_total < 0 {
            // Overdue - maximum priority
            100.0
        } else if hours_total < 24 {
            // Due within 24 hours - scale from 99 to 90
            90.0 + (9.0 * (1.0 - (hours_total as f32 / 24.0)))
        } else if hours_total < 72 {
            // Due within 3 days - scale from 89 to 60
            let progress = (hours_total - 24) as f32 / 48.0; // 0 to 1
            89.0 - (29.0 * progress)
        } else if hours_total < 168 {
            // Due within 7 days - scale from 59 to 30
            let progress = (hours_total - 72) as f32 / 96.0; // 0 to 1
            59.0 - (29.0 * progress)
        } else if hours_total < 720 {
            // Due within 30 days - scale from 29 to 10
            let progress = (hours_total - 168) as f32 / 552.0; // 0 to 1
            29.0 - (19.0 * progress)
        } else {
            // More than 30 days - low priority
            5.0
        }
    }

    /// Calculate user-defined importance score (0-100)
    ///
    /// Uses the task's priority field if set, otherwise returns a neutral score.
    fn calculate_importance_score(&self, task: &TimelineItem) -> f32 {
        task.priority.unwrap_or(50) as f32
    }

    /// Calculate effort score (0-100)
    ///
    /// Shorter tasks get higher scores for quick wins:
    /// - < 15 min: 100 (quick win)
    /// - 15-30 min: 80
    /// - 30-60 min: 60
    /// - 1-2 hours: 40
    /// - 2-4 hours: 20
    /// - > 4 hours: 10 (large task, defer)
    fn calculate_effort_score(&self, task: &TimelineItem) -> f32 {
        let duration = task.duration_minutes();

        if duration <= 15 {
            100.0 // Quick win
        } else if duration <= 30 {
            80.0
        } else if duration <= 60 {
            60.0
        } else if duration <= 120 {
            40.0
        } else if duration <= 240 {
            20.0
        } else {
            10.0 // Large task
        }
    }

    /// Calculate dependency score (0-100)
    ///
    /// Tasks that block others get higher priority.
    /// This is a placeholder - actual dependency tracking requires
    /// integration with external services.
    fn calculate_dependency_score(&self, task: &TimelineItem) -> f32 {
        // Check if task has dependency metadata
        if let Some(blocking_count) = task.metadata.get("blocking_count") {
            if let Some(n) = blocking_count.as_u64() {
                if n > 0 {
                    // Scale based on how many tasks this blocks
                    return (50.0 + (n as f32 * 10.0)).min(100.0);
                }
            }
        }

        // Check for "blocked_by" metadata - lower priority if blocked
        if task.metadata.get("blocked_by").is_some() {
            return 20.0; // Lower priority if this task is blocked by something else
        }

        // Check for priority tags
        if task.tags.iter().any(|t| t.eq_ignore_ascii_case("blocking")) {
            return 80.0;
        }

        if task.tags.iter().any(|t| t.eq_ignore_ascii_case("blocked")) {
            return 20.0;
        }

        // Default: neutral score
        50.0
    }

    /// Calculate priorities for multiple tasks
    ///
    /// # Returns
    /// Vector of (task_id, priority_score) tuples
    pub fn calculate_priorities(&self, tasks: &[TimelineItem]) -> Vec<(String, u8)> {
        tasks
            .iter()
            .map(|task| (task.id.clone(), self.calculate_priority(task)))
            .collect()
    }

    /// Sort tasks by calculated priority (highest first)
    pub fn sort_by_priority(&self, tasks: &mut [TimelineItem]) {
        tasks.sort_by(|a, b| {
            let priority_a = self.calculate_priority(a);
            let priority_b = self.calculate_priority(b);
            priority_b.cmp(&priority_a) // Descending order
        });
    }
}

impl Default for PriorityCalculator {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience function to calculate priority for a single task
pub fn calculate_priority(task: &TimelineItem) -> u8 {
    PriorityCalculator::new().calculate_priority(task)
}

/// Convenience function to calculate priorities with custom config
pub fn calculate_priority_with_config(task: &TimelineItem, config: &PriorityConfig) -> u8 {
    PriorityCalculator::with_config(config.clone()).calculate_priority(task)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timeline::{TimelineItem, TimelineItemType, TimelineItemSource};

    #[test]
    fn test_priority_overdue() {
        let now = Utc::now();
        let task = TimelineItem::new(
            "1",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Overdue task",
            now - chrono::Duration::hours(25),
            now,
        )
        .with_deadline(now - chrono::Duration::hours(1))
        .with_priority(80); // High importance for overdue task

        let calculator = PriorityCalculator::with_config(PriorityConfig {
            current_time: now,
            ..Default::default()
        });

        let priority = calculator.calculate_priority(&task);
        // Overdue tasks get boosted: 100*0.4 + 80*0.3 + 10*0.2 + 50*0.1 = 71, then *1.1 for incomplete = 78
        assert!(priority >= 75, "Overdue task should have high priority, got {}", priority);
    }

    #[test]
    fn test_priority_due_soon() {
        let now = Utc::now();
        let task = TimelineItem::new(
            "1",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Due soon",
            now,
            now + chrono::Duration::hours(1),
        )
        .with_deadline(now + chrono::Duration::hours(12));

        let calculator = PriorityCalculator::with_config(PriorityConfig {
            current_time: now,
            ..Default::default()
        });

        let priority = calculator.calculate_priority(&task);
        assert!(priority >= 50, "Task due within 24h should have decent priority");
    }

    #[test]
    fn test_priority_effort() {
        let now = Utc::now();
        let quick_task = TimelineItem::new(
            "1",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Quick task",
            now,
            now + chrono::Duration::minutes(10),
        );

        let long_task = TimelineItem::new(
            "2",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Long task",
            now,
            now + chrono::Duration::hours(5),
        );

        let calculator = PriorityCalculator::new();

        let quick_priority = calculator.calculate_priority(&quick_task);
        let long_priority = calculator.calculate_priority(&long_task);

        assert!(
            quick_priority > long_priority,
            "Quick task should have higher priority than long task"
        );
    }

    #[test]
    fn test_priority_importance() {
        let now = Utc::now();
        let low_importance = TimelineItem::new(
            "1",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Low importance",
            now,
            now + chrono::Duration::hours(1),
        )
        .with_priority(10);

        let high_importance = TimelineItem::new(
            "2",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "High importance",
            now,
            now + chrono::Duration::hours(1),
        )
        .with_priority(90);

        let calculator = PriorityCalculator::new();

        let low_priority = calculator.calculate_priority(&low_importance);
        let high_priority = calculator.calculate_priority(&high_importance);

        assert!(
            high_priority > low_priority,
            "High importance task should have higher priority"
        );
    }

    #[test]
    fn test_priority_bounds() {
        let now = Utc::now();
        let task = TimelineItem::new(
            "1",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Test task",
            now,
            now + chrono::Duration::hours(1),
        );

        let calculator = PriorityCalculator::new();
        let priority = calculator.calculate_priority(&task);

        assert!(
            priority <= 100,
            "Priority should be at most 100, got {}",
            priority
        );
    }

    #[test]
    fn test_sort_by_priority() {
        let now = Utc::now();
        let mut tasks = vec![
            TimelineItem::new("1", TimelineItemType::Task, TimelineItemSource::Manual, "Low", now, now + chrono::Duration::hours(1))
                .with_priority(10),
            TimelineItem::new("2", TimelineItemType::Task, TimelineItemSource::Manual, "High", now, now + chrono::Duration::hours(1))
                .with_priority(90),
            TimelineItem::new("3", TimelineItemType::Task, TimelineItemSource::Manual, "Medium", now, now + chrono::Duration::hours(1))
                .with_priority(50),
        ];

        let calculator = PriorityCalculator::new();
        calculator.sort_by_priority(&mut tasks);

        assert_eq!(tasks[0].id, "2", "High priority task should be first");
        assert_eq!(tasks[1].id, "3", "Medium priority task should be second");
        assert_eq!(tasks[2].id, "1", "Low priority task should be last");
    }
}
