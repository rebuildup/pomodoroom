//! Slack insertion policy for uncertainty buffering.
//!
//! Provides strategic slack blocks to absorb task overruns and reduce
//! cascade failures in schedules.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

/// Types of slack blocks for uncertainty buffering
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SlackType {
    /// Strategic slack before hard deadlines
    DeadlineBuffer,
    /// Volatility-based slack for high-risk tasks
    VolatilityBuffer,
    /// Recovery slack for cascade failure prevention
    RecoveryBuffer,
    /// Reclaimable slack for low-risk periods
    Reclaimable,
}

impl SlackType {
    /// Get default duration for this slack type
    pub fn default_duration_minutes(&self) -> u32 {
        match self {
            SlackType::DeadlineBuffer => 15,
            SlackType::VolatilityBuffer => 20,
            SlackType::RecoveryBuffer => 10,
            SlackType::Reclaimable => 10,
        }
    }

    /// Check if this slack type can be reclaimed
    pub fn is_reclaimable(&self) -> bool {
        matches!(self, SlackType::Reclaimable)
    }

    /// Get human-readable description
    pub fn description(&self) -> &'static str {
        match self {
            SlackType::DeadlineBuffer => "Buffer before hard deadline",
            SlackType::VolatilityBuffer => "Buffer for high-risk tasks",
            SlackType::RecoveryBuffer => "Recovery buffer for overruns",
            SlackType::Reclaimable => "Reclaimable slack time",
        }
    }
}

/// Volatility level for task categories
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Volatility {
    /// Low volatility - predictable tasks
    Low,
    /// Medium volatility - some uncertainty
    Medium,
    /// High volatility - significant uncertainty
    High,
}

impl Volatility {
    /// Calculate required slack based on volatility
    pub fn calculate_slack(&self, task_duration: u32) -> u32 {
        let percentage = match self {
            Volatility::Low => 0.1,    // 10% buffer
            Volatility::Medium => 0.2, // 20% buffer
            Volatility::High => 0.35,  // 35% buffer
        };
        (task_duration as f64 * percentage).ceil() as u32
    }
}

/// Configuration for slack insertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackConfig {
    /// Enable slack insertion
    pub enabled: bool,
    /// Default slack before deadlines (minutes)
    pub deadline_buffer_minutes: u32,
    /// Maximum slack per task (minutes)
    pub max_slack_per_task: u32,
    /// Whether to reclaim unused slack
    pub enable_reclamation: bool,
    /// Minimum time before deadline to insert slack (minutes)
    pub min_time_before_deadline: u32,
}

impl Default for SlackConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            deadline_buffer_minutes: 15,
            max_slack_per_task: 30,
            enable_reclamation: true,
            min_time_before_deadline: 30,
        }
    }
}

/// A slack block in the schedule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackBlock {
    /// Block ID
    pub id: String,
    /// Type of slack
    pub slack_type: SlackType,
    /// Start time
    pub start_at: DateTime<Utc>,
    /// Duration in minutes
    pub duration_minutes: u32,
    /// Whether this slack has been used (overrun absorbed)
    pub used_minutes: u32,
    /// Associated task or deadline (if any)
    pub associated_task_id: Option<String>,
    /// Whether this slack can be reclaimed
    pub reclaimable: bool,
}

impl SlackBlock {
    /// Get remaining unused slack
    pub fn remaining_minutes(&self) -> u32 {
        self.duration_minutes - self.used_minutes
    }

    /// Check if slack is fully used
    pub fn is_fully_used(&self) -> bool {
        self.used_minutes >= self.duration_minutes
    }

    /// Use slack for overrun absorption
    pub fn absorb_overrun(&mut self, overrun_minutes: u32) -> u32 {
        let available = self.remaining_minutes();
        let absorbed = overrun_minutes.min(available);
        self.used_minutes += absorbed;
        overrun_minutes - absorbed // Return remaining overrun
    }

    /// Mark slack as reclaimable
    pub fn mark_reclaimable(&mut self) {
        self.reclaimable = true;
    }

    /// Create a deadline buffer slack block
    pub fn deadline_buffer(
        deadline: DateTime<Utc>,
        buffer_minutes: u32,
        task_id: Option<String>,
    ) -> Self {
        let start_at = deadline - Duration::minutes(buffer_minutes as i64);
        Self {
            id: format!("slack_deadline_{}", deadline.timestamp()),
            slack_type: SlackType::DeadlineBuffer,
            start_at,
            duration_minutes: buffer_minutes,
            used_minutes: 0,
            associated_task_id: task_id,
            reclaimable: false,
        }
    }

    /// Create volatility-based slack
    pub fn volatility_buffer(
        before_task_at: DateTime<Utc>,
        task_duration: u32,
        volatility: Volatility,
        task_id: String,
    ) -> Self {
        let slack_minutes = volatility.calculate_slack(task_duration);
        Self::volatility_buffer_with_minutes(before_task_at, slack_minutes, task_id)
    }

    /// Create volatility-based slack with pre-calculated minutes
    pub fn volatility_buffer_with_minutes(
        before_task_at: DateTime<Utc>,
        slack_minutes: u32,
        task_id: String,
    ) -> Self {
        let start_at = before_task_at - Duration::minutes(slack_minutes as i64);
        Self {
            id: format!("slack_vol_{}", task_id),
            slack_type: SlackType::VolatilityBuffer,
            start_at,
            duration_minutes: slack_minutes,
            used_minutes: 0,
            associated_task_id: Some(task_id),
            reclaimable: false,
        }
    }
}

/// Slack insertion policy for schedules
pub struct SlackInsertionPolicy {
    config: SlackConfig,
}

impl SlackInsertionPolicy {
    /// Create with default config
    pub fn new() -> Self {
        Self {
            config: SlackConfig::default(),
        }
    }

    /// Create with custom config
    pub fn with_config(config: SlackConfig) -> Self {
        Self { config }
    }

    /// Insert slack blocks before hard deadlines
    pub fn insert_deadline_slack(
        &self,
        deadlines: &[(DateTime<Utc>, String)], // (deadline, task_id)
    ) -> Vec<SlackBlock> {
        if !self.config.enabled {
            return vec![];
        }

        deadlines
            .iter()
            .map(|(deadline, task_id)| {
                SlackBlock::deadline_buffer(
                    *deadline,
                    self.config.deadline_buffer_minutes,
                    Some(task_id.clone()),
                )
            })
            .collect()
    }

    /// Insert volatility-based slack for tasks
    pub fn insert_volatility_slack(
        &self,
        tasks: &[(DateTime<Utc>, u32, Volatility, String)], // (start, duration, volatility, task_id)
    ) -> Vec<SlackBlock> {
        if !self.config.enabled {
            return vec![];
        }

        tasks
            .iter()
            .map(|(start, duration, volatility, task_id)| {
                let slack_minutes = volatility
                    .calculate_slack(*duration)
                    .min(self.config.max_slack_per_task);
                SlackBlock::volatility_buffer_with_minutes(*start, slack_minutes, task_id.clone())
            })
            .collect()
    }

    /// Simulate overrun absorption
    ///
    /// Returns (absorbed_minutes, remaining_overrun, updated_slack_blocks)
    pub fn simulate_overrun(
        &self,
        slack_blocks: &mut [SlackBlock],
        overrun_at: DateTime<Utc>,
        overrun_minutes: u32,
    ) -> (u32, u32) {
        let mut total_absorbed = 0u32;
        let mut remaining = overrun_minutes;

        // Sort slack blocks by proximity to overrun time
        let mut blocks: Vec<&mut SlackBlock> = slack_blocks.iter_mut().collect();
        blocks.sort_by_key(|b| {
            let diff = (b.start_at - overrun_at).num_seconds().abs();
            diff as u64
        });

        for block in blocks.iter_mut() {
            if remaining == 0 {
                break;
            }
            remaining = block.absorb_overrun(remaining);
            total_absorbed = overrun_minutes - remaining;
        }

        (total_absorbed, remaining)
    }

    /// Reclaim unused slack for low-risk tasks
    pub fn reclaim_unused_slack(&self, slack_blocks: &mut [SlackBlock]) -> Vec<SlackBlock> {
        if !self.config.enable_reclamation {
            return vec![];
        }

        let mut reclaimed = Vec::new();

        for block in slack_blocks.iter_mut() {
            if block.is_fully_used() || !block.reclaimable {
                continue;
            }

            let remaining = block.remaining_minutes();
            if remaining > 0 {
                // Create new reclaimable slack block
                reclaimed.push(SlackBlock {
                    id: format!("{}_reclaimed", block.id),
                    slack_type: SlackType::Reclaimable,
                    start_at: Utc::now(), // Will be rescheduled
                    duration_minutes: remaining,
                    used_minutes: 0,
                    associated_task_id: None,
                    reclaimable: true,
                });
                block.used_minutes = block.duration_minutes; // Mark original as used
            }
        }

        reclaimed
    }

    /// Get config reference
    pub fn config(&self) -> &SlackConfig {
        &self.config
    }

    /// Calculate total slack time in minutes
    pub fn total_slack_time(&self, slack_blocks: &[SlackBlock]) -> u32 {
        slack_blocks.iter().map(|b| b.duration_minutes).sum()
    }

    /// Calculate used slack time
    pub fn used_slack_time(&self, slack_blocks: &[SlackBlock]) -> u32 {
        slack_blocks.iter().map(|b| b.used_minutes).sum()
    }
}

impl Default for SlackInsertionPolicy {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volatility_slack_calculation() {
        assert_eq!(Volatility::Low.calculate_slack(60), 6); // 10% of 60
        assert_eq!(Volatility::Medium.calculate_slack(60), 12); // 20% of 60
        assert_eq!(Volatility::High.calculate_slack(60), 21); // 35% of 60 (rounded up)
    }

    #[test]
    fn test_deadline_buffer_creation() {
        let deadline = Utc::now() + Duration::hours(2);
        let buffer = SlackBlock::deadline_buffer(deadline, 15, Some("task-1".to_string()));

        assert_eq!(buffer.slack_type, SlackType::DeadlineBuffer);
        assert_eq!(buffer.duration_minutes, 15);
        assert_eq!(buffer.remaining_minutes(), 15);
        assert!(!buffer.is_fully_used());
    }

    #[test]
    fn test_slack_absorb_overrun() {
        let deadline = Utc::now() + Duration::hours(2);
        let mut buffer = SlackBlock::deadline_buffer(deadline, 15, None);

        let remaining = buffer.absorb_overrun(10);
        assert_eq!(remaining, 0);
        assert_eq!(buffer.used_minutes, 10);
        assert_eq!(buffer.remaining_minutes(), 5);

        let remaining = buffer.absorb_overrun(10);
        assert_eq!(remaining, 5); // Only 5 minutes left
        assert_eq!(buffer.used_minutes, 15);
        assert!(buffer.is_fully_used());
    }

    #[test]
    fn test_insert_deadline_slack() {
        let policy = SlackInsertionPolicy::new();
        let deadline1 = Utc::now() + Duration::hours(1);
        let deadline2 = Utc::now() + Duration::hours(2);

        let deadlines = vec![
            (deadline1, "task-1".to_string()),
            (deadline2, "task-2".to_string()),
        ];

        let slack = policy.insert_deadline_slack(&deadlines);
        assert_eq!(slack.len(), 2);
        assert_eq!(slack[0].duration_minutes, 15); // Default buffer
    }

    #[test]
    fn test_insert_volatility_slack() {
        let policy = SlackInsertionPolicy::new();
        let task_start = Utc::now() + Duration::hours(1);

        let tasks = vec![
            (task_start, 60, Volatility::Low, "low-risk".to_string()),
            (task_start, 60, Volatility::High, "high-risk".to_string()),
        ];

        let slack = policy.insert_volatility_slack(&tasks);
        assert_eq!(slack.len(), 2);
        assert_eq!(slack[0].duration_minutes, 6); // 10% of 60
        assert_eq!(slack[1].duration_minutes, 21); // 35% of 60
    }

    #[test]
    fn test_simulate_overrun_absorption() {
        let policy = SlackInsertionPolicy::new();
        let deadline = Utc::now() + Duration::hours(1);

        let mut slack = vec![SlackBlock::deadline_buffer(
            deadline,
            15,
            Some("task-1".to_string()),
        )];

        let (absorbed, remaining) =
            policy.simulate_overrun(&mut slack, deadline - Duration::minutes(10), 10);

        assert_eq!(absorbed, 10);
        assert_eq!(remaining, 0);
        assert_eq!(slack[0].used_minutes, 10);
    }

    #[test]
    fn test_simulate_overrun_exceeds_slack() {
        let policy = SlackInsertionPolicy::new();
        let deadline = Utc::now() + Duration::hours(1);

        let mut slack = vec![SlackBlock::deadline_buffer(deadline, 15, None)];

        let (absorbed, remaining) = policy.simulate_overrun(
            &mut slack,
            deadline - Duration::minutes(10),
            25, // More than available slack
        );

        assert_eq!(absorbed, 15);
        assert_eq!(remaining, 10);
        assert!(slack[0].is_fully_used());
    }

    #[test]
    fn test_reclaim_unused_slack() {
        let policy = SlackInsertionPolicy::new();
        let deadline = Utc::now() + Duration::hours(1);

        let mut slack = vec![SlackBlock {
            id: "slack-1".to_string(),
            slack_type: SlackType::Reclaimable,
            start_at: deadline,
            duration_minutes: 15,
            used_minutes: 5, // Partially used
            associated_task_id: None,
            reclaimable: true,
        }];

        let reclaimed = policy.reclaim_unused_slack(&mut slack);

        assert_eq!(reclaimed.len(), 1);
        assert_eq!(reclaimed[0].duration_minutes, 10); // 15 - 5
        assert_eq!(slack[0].used_minutes, 15); // Original marked as used
    }

    #[test]
    fn test_slack_type_properties() {
        assert!(!SlackType::DeadlineBuffer.is_reclaimable());
        assert!(!SlackType::VolatilityBuffer.is_reclaimable());
        assert!(!SlackType::RecoveryBuffer.is_reclaimable());
        assert!(SlackType::Reclaimable.is_reclaimable());
    }

    #[test]
    fn test_disabled_slack_insertion() {
        let config = SlackConfig {
            enabled: false,
            ..Default::default()
        };
        let policy = SlackInsertionPolicy::with_config(config);

        let deadlines = vec![(Utc::now(), "task-1".to_string())];
        let slack = policy.insert_deadline_slack(&deadlines);

        assert!(slack.is_empty());
    }

    #[test]
    fn test_max_slack_per_task_limit() {
        let config = SlackConfig {
            max_slack_per_task: 10,
            ..Default::default()
        };
        let policy = SlackInsertionPolicy::with_config(config);

        let task_start = Utc::now() + Duration::hours(1);
        let tasks = vec![(task_start, 120, Volatility::High, "big-task".to_string())];

        let slack = policy.insert_volatility_slack(&tasks);
        assert_eq!(slack[0].duration_minutes, 10); // Limited to max
    }
}
