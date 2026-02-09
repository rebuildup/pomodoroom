//! Task proposal engine.
//!
//! Suggests tasks for available time gaps based on:
//! - Task priority
//! - Deadline proximity
//! - Estimated duration
//! - User context (time of day, energy level)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::{gap::TimeGap, item::TimelineItem};

/// Reason why a task is being proposed
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalReason {
    HighPriority,
    DeadlineSoon,
    FitsGap,
    QuickTask,
    ContextMatch,
}

impl ProposalReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::HighPriority => "High priority task",
            Self::DeadlineSoon => "Deadline approaching",
            Self::FitsGap => "Fits available time",
            Self::QuickTask => "Quick task for gap",
            Self::ContextMatch => "Matches your current context",
        }
    }
}

/// A task proposal for a specific time gap
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskProposal {
    pub gap: TimeGap,
    pub task: TimelineItem,
    pub reason: ProposalReason,
    pub confidence: u8, // 0-100
}

impl TaskProposal {
    /// Create a new task proposal
    pub fn new(gap: TimeGap, task: TimelineItem, reason: ProposalReason, confidence: u8) -> Self {
        Self {
            gap,
            task,
            reason,
            confidence: confidence.min(100),
        }
    }

    /// Calculate confidence score based on multiple factors
    pub fn calculate_confidence(
        gap: &TimeGap,
        task: &TimelineItem,
        current_time: DateTime<Utc>,
    ) -> u8 {
        let mut score = 50u8; // Base score

        // Priority bonus (0-30 points)
        // Calculate with u16 first to preserve precision, then clamp to u8
        if let Some(priority) = task.priority {
            let priority_bonus = (priority as u16 * 3) / 10;
            score = score.saturating_add(priority_bonus as u8);
        }

        // Deadline urgency (0-20 points)
        if let Some(deadline) = task.deadline {
            let hours_until_deadline = (deadline - current_time).num_hours();
            if hours_until_deadline < 24 {
                score += 20;
            } else if hours_until_deadline < 72 {
                score += 10;
            }
        }

        // Size match bonus (0-10 points)
        let task_duration = task.duration_minutes();
        let gap_duration = gap.duration_minutes();
        if task_duration <= gap_duration && task_duration >= gap_duration / 2 {
            score += 10; // Good fit
        } else if task_duration <= gap_duration {
            score += 5; // Fits but might be small for the gap
        }

        // Task not completed bonus (0-10 points)
        if !task.completed {
            score += 10;
        }

        score.min(100)
    }
}

/// Task proposal configuration
#[derive(Debug, Clone)]
pub struct ProposalConfig {
    /// Maximum number of proposals to return
    pub max_proposals: usize,
    /// Minimum confidence threshold
    pub min_confidence: u8,
    /// Whether to prioritize urgent tasks
    pub prioritize_urgent: bool,
}

impl Default for ProposalConfig {
    fn default() -> Self {
        Self {
            max_proposals: 5,
            min_confidence: 40,
            prioritize_urgent: true,
        }
    }
}

/// Task proposal engine
pub struct ProposalEngine {
    config: ProposalConfig,
}

impl ProposalEngine {
    /// Create a new proposal engine with default config
    pub fn new() -> Self {
        Self {
            config: ProposalConfig::default(),
        }
    }

    /// Create with custom config
    pub fn with_config(config: ProposalConfig) -> Self {
        Self { config }
    }

    /// Generate task proposals for available time gaps
    ///
    /// # Arguments
    /// * `gaps` - Available time slots
    /// * `tasks` - Pool of available tasks
    /// * `current_time` - Current time for deadline calculations
    ///
    /// # Returns
    /// Vector of task proposals, sorted by confidence
    pub fn generate_proposals(
        &self,
        gaps: &[TimeGap],
        tasks: &[TimelineItem],
        current_time: DateTime<Utc>,
    ) -> Vec<TaskProposal> {
        let mut proposals = Vec::new();

        for gap in gaps {
            for task in tasks {
                // Skip completed tasks
                if task.completed {
                    continue;
                }

                // Skip tasks that don't fit in the gap
                if task.duration_minutes() > gap.duration_minutes() {
                    continue;
                }

                // Calculate confidence
                let confidence = TaskProposal::calculate_confidence(gap, task, current_time);

                // Filter by minimum confidence
                if confidence < self.config.min_confidence {
                    continue;
                }

                // Determine reason
                let reason = self.determine_reason(gap, task, current_time, confidence);

                proposals.push(TaskProposal::new(gap.clone(), task.clone(), reason, confidence));
            }
        }

        // Sort by confidence
        if self.config.prioritize_urgent {
            proposals.sort_by(|a, b| {
                b.confidence.cmp(&a.confidence)
                    .then_with(|| {
                        // Secondary sort by deadline
                        match (&a.task.deadline, &b.task.deadline) {
                            (Some(da), Some(db)) => da.cmp(db),
                            (Some(_), None) => std::cmp::Ordering::Less,
                            (None, Some(_)) => std::cmp::Ordering::Greater,
                            (None, None) => std::cmp::Ordering::Equal,
                        }
                    })
            });
        } else {
            proposals.sort_by(|a, b| b.confidence.cmp(&a.confidence));
        }

        // Limit to max proposals
        proposals.truncate(self.config.max_proposals);

        proposals
    }

    /// Determine the reason for proposing a task
    fn determine_reason(
        &self,
        gap: &TimeGap,
        task: &TimelineItem,
        current_time: DateTime<Utc>,
        confidence: u8,
    ) -> ProposalReason {
        // High priority
        if task.priority.unwrap_or(0) >= 70 {
            return ProposalReason::HighPriority;
        }

        // Deadline soon
        if let Some(deadline) = task.deadline {
            let hours_until = (deadline - current_time).num_hours();
            if hours_until < 24 {
                return ProposalReason::DeadlineSoon;
            }
        }

        // Quick task for small gap
        if gap.size == super::gap::GapSize::Small && task.duration_minutes() <= 25 {
            return ProposalReason::QuickTask;
        }

        // Good fit for gap
        if confidence >= 70 {
            return ProposalReason::FitsGap;
        }

        ProposalReason::ContextMatch
    }
}

impl Default for ProposalEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience function to generate proposals with default settings
pub fn generate_proposals(
    gaps: &[TimeGap],
    tasks: &[TimelineItem],
    current_time: DateTime<Utc>,
) -> Vec<TaskProposal> {
    ProposalEngine::new().generate_proposals(gaps, tasks, current_time)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timeline::{TimelineItem, TimelineItemSource, TimelineItemType};

    #[test]
    fn test_confidence_calculation() {
        let now = Utc::now();
        let gap_start = now + chrono::Duration::hours(1);
        let gap_end = gap_start + chrono::Duration::minutes(30);
        let gap = TimeGap::new(gap_start, gap_end).unwrap();

        let task = TimelineItem::new(
            "test",
            TimelineItemType::Task,
            TimelineItemSource::Manual,
            "Test task",
            gap_start,
            gap_end,
        )
        .with_priority(80);

        let confidence = TaskProposal::calculate_confidence(&gap, &task, now);
        assert!(confidence > 50);
    }

    #[test]
    fn test_generate_proposals() {
        let now = Utc::now();
        let gap_start = now + chrono::Duration::hours(1);
        let gap_end = gap_start + chrono::Duration::minutes(30);
        let gap = TimeGap::new(gap_start, gap_end).unwrap();

        let task = TimelineItem::new(
            "test",
            TimelineItemType::Task,
            TimelineItemSource::Notion,
            "Test task",
            gap_start,
            gap_end,
        )
        .with_priority(60);

        let proposals = generate_proposals(&[gap], &[task], now);
        assert!(!proposals.is_empty());
    }
}
