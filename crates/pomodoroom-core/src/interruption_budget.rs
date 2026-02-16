//! Team interruption budget dashboard and tracking.
//!
//! This module aggregates interruption data to make interruption costs visible
//! at team level, enabling data-driven policy adjustments.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A single interruption record.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionRecord {
    /// Unique ID for this interruption
    pub id: String,

    /// Task ID that was interrupted
    pub task_id: String,

    /// Team/project context
    pub team: Option<String>,

    /// Interruption type
    pub interruption_type: InterruptionType,

    /// When the interruption occurred
    pub timestamp: DateTime<Utc>,

    /// Duration of the interruption (minutes)
    pub duration_minutes: i64,

    /// Whether the interruption was internal (self-initiated) or external
    pub is_internal: bool,

    /// Cost score (computed from duration and context switch overhead)
    pub cost_score: f32,
}

/// Types of interruptions.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum InterruptionType {
    /// External notification (Slack, email, etc.)
    Notification,

    /// Meeting or call
    Meeting,

    /// Colleague interruption
    Colleague,

    /// Self-initiated distraction
    SelfDistraction,

    /// Tool or system interruption
    System,

    /// Unknown or other
    Other,
}

/// Configuration for interruption budget tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionBudgetConfig {
    /// Daily interruption budget per person (minutes)
    pub daily_budget_minutes: i64,

    /// Week-over-week comparison window (days)
    pub comparison_window_days: i64,

    /// Threshold for "high interruption" warning (interruptions per day)
    pub high_interruption_threshold: f32,

    /// Enable anonymization in reports
    pub anonymize_reports: bool,

    /// Minimum samples before making recommendations
    pub min_samples_for_recommendation: usize,
}

impl Default for InterruptionBudgetConfig {
    fn default() -> Self {
        Self {
            daily_budget_minutes: 60,
            comparison_window_days: 7,
            high_interruption_threshold: 5.0,
            anonymize_reports: true,
            min_samples_for_recommendation: 10,
        }
    }
}

/// Aggregated interruption statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionStats {
    /// Total interruption count
    pub total_count: usize,

    /// Total lost focus time (minutes)
    pub total_lost_minutes: i64,

    /// Average interruption duration (minutes)
    pub avg_duration_minutes: f32,

    /// Internal vs external ratio (0.0 = all external, 1.0 = all internal)
    pub internal_ratio: f32,

    /// Breakdown by interruption type
    pub by_type: HashMap<InterruptionType, TypeStats>,

    /// Breakdown by team/project
    pub by_team: HashMap<String, TeamStats>,

    /// Period start
    pub period_start: DateTime<Utc>,

    /// Period end
    pub period_end: DateTime<Utc>,
}

/// Statistics for an interruption type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeStats {
    pub count: usize,
    pub total_minutes: i64,
    pub avg_cost_score: f32,
}

/// Statistics for a team/project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamStats {
    /// Team identifier (may be anonymized)
    pub team_id: String,

    /// Total interruptions
    pub interruption_count: usize,

    /// Total lost focus time
    pub lost_focus_minutes: i64,

    /// Budget utilization percentage
    pub budget_utilization: f32,

    /// Trend direction (positive = getting worse)
    pub trend_direction: f32,

    /// Risk level
    pub risk_level: InterruptionRisk,
}

/// Risk level for interruption budget.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InterruptionRisk {
    /// Well within budget
    Low,

    /// Approaching budget limit
    Medium,

    /// Over budget
    High,

    /// Significantly over budget
    Critical,
}

impl From<f32> for InterruptionRisk {
    fn from(utilization: f32) -> Self {
        if utilization < 0.6 {
            InterruptionRisk::Low
        } else if utilization < 0.9 {
            InterruptionRisk::Medium
        } else if utilization < 1.2 {
            InterruptionRisk::High
        } else {
            InterruptionRisk::Critical
        }
    }
}

/// Trend analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendAnalysis {
    /// Current period stats
    pub current: InterruptionStats,

    /// Previous period stats (for comparison)
    pub previous: Option<InterruptionStats>,

    /// Week-over-week change percentage
    pub wow_change_percent: f32,

    /// Trend direction description
    pub trend_description: String,
}

/// A policy recommendation based on interruption data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRecommendation {
    /// Recommendation type
    pub recommendation_type: RecommendationType,

    /// Human-readable title
    pub title: String,

    /// Detailed description
    pub description: String,

    /// Expected impact (percentage improvement)
    pub expected_impact_percent: f32,

    /// Supporting metrics
    pub supporting_metrics: Vec<String>,

    /// Priority (1-5, 1 being highest)
    pub priority: u8,
}

/// Types of policy recommendations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecommendationType {
    /// Adjust daily interruption budget
    BudgetAdjustment,

    /// Implement focus time blocks
    FocusBlocks,

    /// Reduce notification noise
    NotificationReduction,

    /// Team coordination improvement
    TeamCoordination,

    /// Tool or process change
    ProcessChange,
}

/// Dashboard data for visualization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionDashboard {
    /// Current period statistics
    pub stats: InterruptionStats,

    /// Trend analysis
    pub trend: TrendAnalysis,

    /// Team breakdown
    pub teams: Vec<TeamStats>,

    /// Policy recommendations
    pub recommendations: Vec<PolicyRecommendation>,

    /// Dashboard generation timestamp
    pub generated_at: DateTime<Utc>,

    /// Whether data is anonymized
    pub is_anonymized: bool,
}

/// Tracker for interruption budget at team level.
pub struct InterruptionBudgetTracker {
    config: InterruptionBudgetConfig,
    records: Vec<InterruptionRecord>,
}

impl InterruptionBudgetTracker {
    /// Create a new tracker with default config.
    pub fn new() -> Self {
        Self {
            config: InterruptionBudgetConfig::default(),
            records: Vec::new(),
        }
    }

    /// Create a tracker with custom config.
    pub fn with_config(config: InterruptionBudgetConfig) -> Self {
        Self {
            config,
            records: Vec::new(),
        }
    }

    /// Record an interruption.
    pub fn record(&mut self, record: InterruptionRecord) {
        self.records.push(record);
    }

    /// Record multiple interruptions.
    pub fn record_batch(&mut self, records: Vec<InterruptionRecord>) {
        self.records.extend(records);
    }

    /// Clear all records.
    pub fn clear(&mut self) {
        self.records.clear();
    }

    /// Get records within a time range.
    pub fn get_records_in_range(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Vec<&InterruptionRecord> {
        self.records
            .iter()
            .filter(|r| r.timestamp >= start && r.timestamp <= end)
            .collect()
    }

    /// Compute statistics for a time range.
    pub fn compute_stats(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> InterruptionStats {
        let records: Vec<_> = self.get_records_in_range(start, end);

        if records.is_empty() {
            return InterruptionStats {
                total_count: 0,
                total_lost_minutes: 0,
                avg_duration_minutes: 0.0,
                internal_ratio: 0.0,
                by_type: HashMap::new(),
                by_team: HashMap::new(),
                period_start: start,
                period_end: end,
            };
        }

        let total_count = records.len();
        let total_lost_minutes: i64 = records.iter().map(|r| r.duration_minutes).sum();
        let avg_duration_minutes = total_lost_minutes as f32 / total_count as f32;

        let internal_count = records.iter().filter(|r| r.is_internal).count();
        let internal_ratio = internal_count as f32 / total_count as f32;

        // Group by type
        let mut by_type: HashMap<InterruptionType, TypeStats> = HashMap::new();
        for record in &records {
            let entry = by_type.entry(record.interruption_type).or_insert(TypeStats {
                count: 0,
                total_minutes: 0,
                avg_cost_score: 0.0,
            });
            entry.count += 1;
            entry.total_minutes += record.duration_minutes;
        }

        // Calculate average cost score for each type
        let mut type_scores: HashMap<InterruptionType, Vec<f32>> = HashMap::new();
        for record in &records {
            type_scores
                .entry(record.interruption_type)
                .or_default()
                .push(record.cost_score);
        }
        for (itype, scores) in type_scores {
            if let Some(stats) = by_type.get_mut(&itype) {
                if !scores.is_empty() {
                    stats.avg_cost_score = scores.iter().sum::<f32>() / scores.len() as f32;
                }
            }
        }

        // Group by team
        let mut by_team: HashMap<String, TeamStats> = HashMap::new();
        let teams: Vec<_> = records.iter().filter_map(|r| r.team.as_ref()).collect();
        let unique_teams: std::collections::HashSet<_> = teams.into_iter().collect();

        for team in unique_teams {
            let team_records: Vec<_> = records
                .iter()
                .filter(|r| r.team.as_ref() == Some(team))
                .collect();

            let interruption_count = team_records.len();
            let lost_focus_minutes: i64 = team_records.iter().map(|r| r.duration_minutes).sum();

            // Calculate days in period
            let days = (end - start).num_days().max(1);
            let daily_budget = self.config.daily_budget_minutes * days;
            let budget_utilization = (lost_focus_minutes as f32 / daily_budget as f32).min(2.0);

            let team_id = if self.config.anonymize_reports {
                anonymize_team(team)
            } else {
                team.clone()
            };

            by_team.insert(
                team.clone(),
                TeamStats {
                    team_id,
                    interruption_count,
                    lost_focus_minutes,
                    budget_utilization: budget_utilization * 100.0,
                    trend_direction: 0.0, // Computed in trend analysis
                    risk_level: InterruptionRisk::from(budget_utilization),
                },
            );
        }

        InterruptionStats {
            total_count,
            total_lost_minutes,
            avg_duration_minutes,
            internal_ratio,
            by_type,
            by_team,
            period_start: start,
            period_end: end,
        }
    }

    /// Analyze trends comparing current and previous periods.
    pub fn analyze_trends(&self, current_start: DateTime<Utc>, current_end: DateTime<Utc>) -> TrendAnalysis {
        let current = self.compute_stats(current_start, current_end);

        let window = Duration::days(self.config.comparison_window_days);
        let prev_start = current_start - window;
        let prev_end = current_end - window;

        let previous = if self.get_records_in_range(prev_start, prev_end).is_empty() {
            None
        } else {
            Some(self.compute_stats(prev_start, prev_end))
        };

        let wow_change_percent = if let Some(ref prev) = previous {
            if prev.total_lost_minutes > 0 {
                ((current.total_lost_minutes as f32 - prev.total_lost_minutes as f32)
                    / prev.total_lost_minutes as f32)
                    * 100.0
            } else {
                0.0
            }
        } else {
            0.0
        };

        let trend_description = if wow_change_percent > 20.0 {
            "Significant increase in interruptions".to_string()
        } else if wow_change_percent > 5.0 {
            "Slight increase in interruptions".to_string()
        } else if wow_change_percent < -20.0 {
            "Significant decrease in interruptions".to_string()
        } else if wow_change_percent < -5.0 {
            "Slight decrease in interruptions".to_string()
        } else {
            "Interruptions stable".to_string()
        };

        TrendAnalysis {
            current,
            previous,
            wow_change_percent,
            trend_description,
        }
    }

    /// Generate policy recommendations based on data.
    pub fn generate_recommendations(&self, stats: &InterruptionStats) -> Vec<PolicyRecommendation> {
        let mut recommendations = Vec::new();

        if stats.total_count < self.config.min_samples_for_recommendation {
            return recommendations;
        }

        // Check for high overall interruption count
        let days = (stats.period_end - stats.period_start).num_days().max(1);
        let daily_avg = stats.total_count as f32 / days as f32;

        if daily_avg > self.config.high_interruption_threshold {
            recommendations.push(PolicyRecommendation {
                recommendation_type: RecommendationType::BudgetAdjustment,
                title: "Review Interruption Budget".to_string(),
                description: format!(
                    "Daily interruption average ({:.1}) exceeds threshold ({}). Consider adjusting policies.",
                    daily_avg, self.config.high_interruption_threshold
                ),
                expected_impact_percent: 15.0,
                supporting_metrics: vec![
                    format!("Daily average: {:.1} interruptions", daily_avg),
                    format!("Threshold: {}", self.config.high_interruption_threshold),
                ],
                priority: 1,
            });
        }

        // Check for notification-heavy patterns
        if let Some(notif_stats) = stats.by_type.get(&InterruptionType::Notification) {
            let notif_ratio = notif_stats.count as f32 / stats.total_count as f32;
            if notif_ratio > 0.4 {
                recommendations.push(PolicyRecommendation {
                    recommendation_type: RecommendationType::NotificationReduction,
                    title: "Reduce Notification Noise".to_string(),
                    description: format!(
                        "Notifications account for {:.0}% of interruptions. Consider implementing notification batching.",
                        notif_ratio * 100.0
                    ),
                    expected_impact_percent: 25.0,
                    supporting_metrics: vec![
                        format!("Notification interruptions: {}", notif_stats.count),
                        format!("Percentage of total: {:.0}%", notif_ratio * 100.0),
                    ],
                    priority: 2,
                });
            }
        }

        // Check for high internal interruption ratio
        if stats.internal_ratio > 0.5 {
            recommendations.push(PolicyRecommendation {
                recommendation_type: RecommendationType::FocusBlocks,
                title: "Implement Focus Time Blocks".to_string(),
                description: format!(
                    "{:.0}% of interruptions are self-initiated. Consider protected focus blocks.",
                    stats.internal_ratio * 100.0
                ),
                expected_impact_percent: 20.0,
                supporting_metrics: vec![
                    format!("Internal interruption ratio: {:.0}%", stats.internal_ratio * 100.0),
                ],
                priority: 2,
            });
        }

        // Check for teams with high budget utilization
        for (team_name, team_stats) in &stats.by_team {
            if team_stats.risk_level == InterruptionRisk::Critical {
                recommendations.push(PolicyRecommendation {
                    recommendation_type: RecommendationType::TeamCoordination,
                    title: format!("Urgent: {} Team Support", team_name),
                    description: format!(
                        "Team {} is at {:.0}% of interruption budget. Immediate intervention recommended.",
                        team_name, team_stats.budget_utilization
                    ),
                    expected_impact_percent: 30.0,
                    supporting_metrics: vec![
                        format!("Budget utilization: {:.0}%", team_stats.budget_utilization),
                        format!("Lost focus time: {} minutes", team_stats.lost_focus_minutes),
                    ],
                    priority: 1,
                });
            }
        }

        // Sort by priority
        recommendations.sort_by_key(|r| r.priority);

        recommendations
    }

    /// Generate complete dashboard data.
    pub fn generate_dashboard(
        &self,
        period_start: DateTime<Utc>,
        period_end: DateTime<Utc>,
    ) -> InterruptionDashboard {
        let trend = self.analyze_trends(period_start, period_end);
        let recommendations = self.generate_recommendations(&trend.current);

        let teams: Vec<TeamStats> = trend
            .current
            .by_team
            .values()
            .cloned()
            .collect();

        InterruptionDashboard {
            stats: trend.current.clone(),
            trend,
            teams,
            recommendations,
            generated_at: Utc::now(),
            is_anonymized: self.config.anonymize_reports,
        }
    }

    /// Export records for external analysis.
    pub fn export_records(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> Vec<InterruptionRecord> {
        let records = self.get_records_in_range(start, end);
        if self.config.anonymize_reports {
            records
                .into_iter()
                .map(|r| InterruptionRecord {
                    id: anonymize_id(&r.id),
                    task_id: anonymize_id(&r.task_id),
                    team: r.team.as_ref().map(|t| anonymize_team(t)),
                    ..(*r).clone()
                })
                .collect()
        } else {
            records.into_iter().cloned().collect()
        }
    }
}

impl Default for InterruptionBudgetTracker {
    fn default() -> Self {
        Self::new()
    }
}

/// Anonymize a team name.
fn anonymize_team(team: &str) -> String {
    // Simple hash-based anonymization
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    team.hash(&mut hasher);
    let hash = hasher.finish();
    format!("Team-{:04x}", hash % 0x10000)
}

/// Anonymize an ID.
fn anonymize_id(id: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    id.hash(&mut hasher);
    let hash = hasher.finish();
    format!("ID-{:08x}", hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(
        id: &str,
        task_id: &str,
        team: Option<&str>,
        itype: InterruptionType,
        duration_min: i64,
        is_internal: bool,
    ) -> InterruptionRecord {
        InterruptionRecord {
            id: id.to_string(),
            task_id: task_id.to_string(),
            team: team.map(|s| s.to_string()),
            interruption_type: itype,
            timestamp: Utc::now(),
            duration_minutes: duration_min,
            is_internal,
            cost_score: duration_min as f32 * 0.1,
        }
    }

    #[test]
    fn test_empty_tracker_returns_zero_stats() {
        let tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();
        let stats = tracker.compute_stats(now - Duration::hours(24), now);

        assert_eq!(stats.total_count, 0);
        assert_eq!(stats.total_lost_minutes, 0);
    }

    #[test]
    fn test_records_in_range() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        // Record in range
        tracker.record(make_record("1", "t1", None, InterruptionType::Notification, 5, false));

        // Record out of range (old)
        let mut old_record = make_record("2", "t2", None, InterruptionType::Meeting, 30, false);
        old_record.timestamp = now - Duration::days(10);
        tracker.record(old_record);

        // Use wider range to account for time drift during test execution
        let records = tracker.get_records_in_range(now - Duration::hours(25), now + Duration::hours(1));
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, "1");
    }

    #[test]
    fn test_compute_stats_aggregates_correctly() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        tracker.record_batch(vec![
            make_record("1", "t1", Some("Engineering"), InterruptionType::Notification, 5, false),
            make_record("2", "t2", Some("Engineering"), InterruptionType::Meeting, 30, false),
            make_record("3", "t3", Some("Design"), InterruptionType::SelfDistraction, 10, true),
        ]);

        let stats = tracker.compute_stats(now - Duration::hours(25), now + Duration::hours(1));

        assert_eq!(stats.total_count, 3);
        assert_eq!(stats.total_lost_minutes, 45);
        assert!((stats.avg_duration_minutes - 15.0).abs() < 0.1);
        assert!((stats.internal_ratio - 0.333).abs() < 0.1);
    }

    #[test]
    fn test_group_by_type() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        tracker.record_batch(vec![
            make_record("1", "t1", None, InterruptionType::Notification, 5, false),
            make_record("2", "t2", None, InterruptionType::Notification, 10, false),
            make_record("3", "t3", None, InterruptionType::Meeting, 30, false),
        ]);

        let stats = tracker.compute_stats(now - Duration::hours(25), now + Duration::hours(1));

        assert_eq!(stats.by_type.get(&InterruptionType::Notification).unwrap().count, 2);
        assert_eq!(stats.by_type.get(&InterruptionType::Meeting).unwrap().count, 1);
    }

    #[test]
    fn test_group_by_team() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        tracker.record_batch(vec![
            make_record("1", "t1", Some("Engineering"), InterruptionType::Notification, 10, false),
            make_record("2", "t2", Some("Engineering"), InterruptionType::Meeting, 20, false),
            make_record("3", "t3", Some("Design"), InterruptionType::Notification, 5, false),
        ]);

        let stats = tracker.compute_stats(now - Duration::hours(25), now + Duration::hours(1));

        // With anonymization, team names will be different
        assert_eq!(stats.by_team.len(), 2);
    }

    #[test]
    fn test_risk_level_classification() {
        assert_eq!(InterruptionRisk::from(0.3), InterruptionRisk::Low);
        assert_eq!(InterruptionRisk::from(0.6), InterruptionRisk::Medium);
        assert_eq!(InterruptionRisk::from(0.9), InterruptionRisk::High);
        assert_eq!(InterruptionRisk::from(1.5), InterruptionRisk::Critical);
    }

    #[test]
    fn test_trend_analysis() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        // Current period records
        tracker.record_batch(vec![
            make_record("1", "t1", None, InterruptionType::Notification, 10, false),
            make_record("2", "t2", None, InterruptionType::Notification, 15, false),
        ]);

        // Previous period record
        let mut old_record = make_record("3", "t3", None, InterruptionType::Notification, 5, false);
        old_record.timestamp = now - Duration::days(10);
        tracker.record(old_record);

        let trend = tracker.analyze_trends(now - Duration::hours(24), now);

        assert!(trend.previous.is_none()); // No records in the exact previous period
    }

    #[test]
    fn test_recommendations_for_high_notifications() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        // 10 notification interruptions out of 15 total (> 40%)
        for i in 0..10 {
            tracker.record(make_record(
                &format!("n{}", i),
                &format!("t{}", i),
                None,
                InterruptionType::Notification,
                5,
                false,
            ));
        }
        for i in 0..5 {
            tracker.record(make_record(
                &format!("m{}", i),
                &format!("t{}", i),
                None,
                InterruptionType::Meeting,
                30,
                false,
            ));
        }

        let stats = tracker.compute_stats(now - Duration::hours(25), now + Duration::hours(1));
        let recommendations = tracker.generate_recommendations(&stats);

        // Should recommend notification reduction
        assert!(recommendations.iter().any(|r| matches!(
            r.recommendation_type,
            RecommendationType::NotificationReduction
        )));
    }

    #[test]
    fn test_recommendations_for_high_internal_ratio() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        // 8 internal interruptions out of 10 (> 50%)
        for i in 0..8 {
            tracker.record(make_record(
                &format!("s{}", i),
                &format!("t{}", i),
                None,
                InterruptionType::SelfDistraction,
                10,
                true,
            ));
        }
        for i in 0..2 {
            tracker.record(make_record(
                &format!("e{}", i),
                &format!("t{}", i),
                None,
                InterruptionType::Colleague,
                5,
                false,
            ));
        }

        let stats = tracker.compute_stats(now - Duration::hours(25), now + Duration::hours(1));
        let recommendations = tracker.generate_recommendations(&stats);

        // Should recommend focus blocks
        assert!(recommendations.iter().any(|r| matches!(
            r.recommendation_type,
            RecommendationType::FocusBlocks
        )));
    }

    #[test]
    fn test_anonymization() {
        let team1 = "Engineering";
        let team2 = "Design";

        let anon1 = anonymize_team(team1);
        let anon2 = anonymize_team(team2);

        // Same input should produce same output
        assert_eq!(anon1, anonymize_team(team1));

        // Different inputs should produce different outputs
        assert_ne!(anon1, anon2);

        // Should start with "Team-"
        assert!(anon1.starts_with("Team-"));
    }

    #[test]
    fn test_dashboard_generation() {
        let mut tracker = InterruptionBudgetTracker::new();
        let now = Utc::now();

        tracker.record_batch(vec![
            make_record("1", "t1", Some("Engineering"), InterruptionType::Notification, 10, false),
            make_record("2", "t2", Some("Design"), InterruptionType::Meeting, 30, false),
        ]);

        let dashboard = tracker.generate_dashboard(now - Duration::hours(25), now + Duration::hours(1));

        assert_eq!(dashboard.stats.total_count, 2);
        assert!(dashboard.generated_at <= Utc::now());
        assert!(dashboard.is_anonymized);
    }

    #[test]
    fn test_export_with_anonymization() {
        let config = InterruptionBudgetConfig {
            anonymize_reports: true,
            ..Default::default()
        };
        let mut tracker = InterruptionBudgetTracker::with_config(config);
        let now = Utc::now();

        tracker.record(make_record(
            "original-id",
            "original-task",
            Some("SecretTeam"),
            InterruptionType::Notification,
            10,
            false,
        ));

        let exported = tracker.export_records(now - Duration::hours(25), now + Duration::hours(1));

        assert_eq!(exported.len(), 1);
        assert_ne!(exported[0].id, "original-id");
        assert_ne!(exported[0].task_id, "original-task");
        assert_ne!(exported[0].team, Some("SecretTeam".to_string()));
    }
}
