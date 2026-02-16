//! Break adherence tracking and analytics
//!
//! This module provides types and analysis for tracking how well users
//! adhere to break schedules. It categorizes break behavior into:
//! - **Taken**: Break started within the expected threshold (default 5 min)
//! - **Skipped**: No break taken for an extended period (default 30+ min)
//! - **Deferred**: Break delayed but eventually taken (5-30 min delay)

use chrono::{DateTime, Utc, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Status of a break following a focus session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BreakStatus {
    /// Break was taken within expected threshold (≤ defer_threshold_min)
    Taken,
    /// No break was taken; next focus started after skip_threshold_min
    Skipped,
    /// Break was delayed but eventually taken (defer_threshold_min to skip_threshold_min)
    Deferred,
}

/// Statistics for break adherence across sessions
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BreakAdherenceStats {
    /// Total number of focus sessions completed
    pub total_focus_sessions: u32,
    /// Number of breaks taken on time
    pub breaks_taken: u32,
    /// Number of breaks skipped entirely
    pub breaks_skipped: u32,
    /// Number of breaks deferred but eventually taken
    pub breaks_deferred: u32,
    /// Ratio of breaks taken on time (0.0 to 1.0)
    pub adherence_rate: f64,
    /// Average delay in minutes for deferred breaks
    pub avg_delay_min: f64,
}

/// Hourly breakdown of break adherence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HourlyAdherence {
    /// Hour of day (0-23)
    pub hour: u32,
    /// Total focus sessions in this hour
    pub total: u32,
    /// Breaks taken on time
    pub taken: u32,
    /// Breaks skipped
    pub skipped: u32,
    /// Breaks deferred
    pub deferred: u32,
    /// Ratio of skipped breaks (0.0 to 1.0)
    pub skip_rate: f64,
    /// Ratio of deferred breaks (0.0 to 1.0)
    pub defer_rate: f64,
    /// Risk score (0.0 to 1.0, higher = more likely to skip)
    pub risk_score: f64,
}

/// Break adherence statistics per project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAdherence {
    /// Name of the project
    pub project_name: String,
    /// Adherence statistics for this project
    pub stats: BreakAdherenceStats,
}

/// High-risk time window identified by analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighRiskWindow {
    /// Hour of day (0-23)
    pub hour: u32,
    /// Ratio of skipped breaks in this window
    pub skip_rate: f64,
    /// Ratio of deferred breaks in this window
    pub defer_rate: f64,
}

/// Complete break adherence report
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BreakAdherenceReport {
    /// Overall statistics
    pub stats: BreakAdherenceStats,
    /// Breakdown by hour of day
    pub by_hour: Vec<HourlyAdherence>,
    /// Breakdown by project
    pub by_project: Vec<ProjectAdherence>,
    /// Identified high-risk windows
    pub high_risk_windows: Vec<HighRiskWindow>,
}

/// Analyzer for break adherence patterns
#[derive(Debug, Clone)]
pub struct BreakAdherenceAnalyzer {
    /// Minutes without a break before considered "skipped"
    pub skip_threshold_min: i64,
    /// Minutes of delay before a break is considered "deferred" (vs just late)
    pub defer_threshold_min: i64,
}

impl Default for BreakAdherenceAnalyzer {
    fn default() -> Self {
        Self {
            skip_threshold_min: 30,
            defer_threshold_min: 5,
        }
    }
}

impl BreakAdherenceAnalyzer {
    /// Create a new analyzer with default thresholds
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a new analyzer with custom thresholds
    pub fn with_thresholds(skip_threshold_min: i64, defer_threshold_min: i64) -> Self {
        Self {
            skip_threshold_min,
            defer_threshold_min,
        }
    }

    /// Infer break status from the time gap between focus end and break start
    ///
    /// # Arguments
    /// * `focus_end` - When the focus session ended
    /// * `break_start` - When the break (or next focus session) started
    ///
    /// # Returns
    /// * `BreakStatus::Taken` if break started within defer_threshold_min
    /// * `BreakStatus::Deferred` if break started between defer_threshold_min and skip_threshold_min
    /// * `BreakStatus::Skipped` if gap exceeds skip_threshold_min (or no break data)
    pub fn infer_break_status(
        &self,
        focus_end: DateTime<Utc>,
        break_start: Option<DateTime<Utc>>,
    ) -> BreakStatus {
        match break_start {
            None => BreakStatus::Skipped,
            Some(start) => {
                let gap_minutes = (start - focus_end).num_minutes();

                if gap_minutes <= self.defer_threshold_min {
                    BreakStatus::Taken
                } else if gap_minutes <= self.skip_threshold_min {
                    BreakStatus::Deferred
                } else {
                    BreakStatus::Skipped
                }
            }
        }
    }

    /// Analyze a collection of focus sessions and generate an adherence report
    ///
    /// # Arguments
    /// * `sessions` - Iterator of (focus_end, break_start, project_name) tuples
    ///
    /// # Returns
    /// A complete adherence report with overall stats, hourly breakdown,
    /// project breakdown, and high-risk windows
    pub fn analyze<'a, I>(&self, sessions: I) -> BreakAdherenceReport
    where
        I: Iterator<Item = (DateTime<Utc>, Option<DateTime<Utc>>, Option<&'a str>)>,
    {
        let mut stats = BreakAdherenceStats::default();
        let mut hourly_map: HashMap<u32, HourlyBuilder> = HashMap::new();
        let mut project_map: HashMap<String, StatsBuilder> = HashMap::new();
        let mut delay_times: Vec<i64> = Vec::new();

        for (focus_end, break_start, project_name) in sessions {
            stats.total_focus_sessions += 1;

            let status = self.infer_break_status(focus_end, break_start);

            match status {
                BreakStatus::Taken => {
                    stats.breaks_taken += 1;
                }
                BreakStatus::Skipped => {
                    stats.breaks_skipped += 1;
                }
                BreakStatus::Deferred => {
                    stats.breaks_deferred += 1;
                    if let Some(start) = break_start {
                        delay_times.push((start - focus_end).num_minutes());
                    }
                }
            }

            // Update hourly stats
            let hour = focus_end.hour();
            hourly_map
                .entry(hour)
                .or_insert_with(HourlyBuilder::new)
                .record(status);

            // Update project stats
            if let Some(project) = project_name {
                let project_key = project.to_string();
                project_map
                    .entry(project_key)
                    .or_insert_with(StatsBuilder::new)
                    .record(status);
            }
        }

        // Calculate adherence rate
        if stats.total_focus_sessions > 0 {
            stats.adherence_rate = stats.breaks_taken as f64 / stats.total_focus_sessions as f64;
        }

        // Calculate average delay for deferred breaks
        if !delay_times.is_empty() {
            stats.avg_delay_min = delay_times.iter().sum::<i64>() as f64 / delay_times.len() as f64;
        }

        // Build hourly adherence
        let by_hour: Vec<HourlyAdherence> = hourly_map
            .into_iter()
            .map(|(hour, builder)| builder.build(hour))
            .collect();

        // Build project adherence
        let by_project: Vec<ProjectAdherence> = project_map
            .into_iter()
            .map(|(project_name, builder)| ProjectAdherence {
                project_name,
                stats: builder.build(),
            })
            .collect();

        // Identify high-risk windows (hours with skip_rate > 0.3 or defer_rate > 0.5)
        let high_risk_windows: Vec<HighRiskWindow> = by_hour
            .iter()
            .filter(|h| h.skip_rate > 0.3 || h.defer_rate > 0.5)
            .map(|h| HighRiskWindow {
                hour: h.hour,
                skip_rate: h.skip_rate,
                defer_rate: h.defer_rate,
            })
            .collect();

        BreakAdherenceReport {
            stats,
            by_hour,
            by_project,
            high_risk_windows,
        }
    }
}

/// Helper struct for building hourly adherence stats
struct HourlyBuilder {
    total: u32,
    taken: u32,
    skipped: u32,
    deferred: u32,
}

impl HourlyBuilder {
    fn new() -> Self {
        Self {
            total: 0,
            taken: 0,
            skipped: 0,
            deferred: 0,
        }
    }

    fn record(&mut self, status: BreakStatus) {
        self.total += 1;
        match status {
            BreakStatus::Taken => self.taken += 1,
            BreakStatus::Skipped => self.skipped += 1,
            BreakStatus::Deferred => self.deferred += 1,
        }
    }

    fn build(self, hour: u32) -> HourlyAdherence {
        let skip_rate = if self.total > 0 {
            self.skipped as f64 / self.total as f64
        } else {
            0.0
        };

        let defer_rate = if self.total > 0 {
            self.deferred as f64 / self.total as f64
        } else {
            0.0
        };

        let risk_score = if self.total > 0 {
            (self.skipped as f64 * 1.0 + self.deferred as f64 * 0.5) / self.total as f64
        } else {
            0.0
        };

        HourlyAdherence {
            hour,
            total: self.total,
            taken: self.taken,
            skipped: self.skipped,
            deferred: self.deferred,
            skip_rate,
            defer_rate,
            risk_score,
        }
    }
}

/// Helper struct for building project stats
struct StatsBuilder {
    total_focus_sessions: u32,
    breaks_taken: u32,
    breaks_skipped: u32,
    breaks_deferred: u32,
}

impl StatsBuilder {
    fn new() -> Self {
        Self {
            total_focus_sessions: 0,
            breaks_taken: 0,
            breaks_skipped: 0,
            breaks_deferred: 0,
        }
    }

    fn record(&mut self, status: BreakStatus) {
        self.total_focus_sessions += 1;
        match status {
            BreakStatus::Taken => self.breaks_taken += 1,
            BreakStatus::Skipped => self.breaks_skipped += 1,
            BreakStatus::Deferred => self.breaks_deferred += 1,
        }
    }

    fn build(self) -> BreakAdherenceStats {
        let adherence_rate = if self.total_focus_sessions > 0 {
            self.breaks_taken as f64 / self.total_focus_sessions as f64
        } else {
            0.0
        };

        BreakAdherenceStats {
            total_focus_sessions: self.total_focus_sessions,
            breaks_taken: self.breaks_taken,
            breaks_skipped: self.breaks_skipped,
            breaks_deferred: self.breaks_deferred,
            adherence_rate,
            avg_delay_min: 0.0, // Not tracked per-project in this builder
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc_datetime(year: i32, month: u32, day: u32, hour: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, min, 0).unwrap()
    }

    #[test]
    fn test_break_status_taken_within_threshold() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 28)); // 3 min gap

        let status = analyzer.infer_break_status(focus_end, break_start);
        assert_eq!(status, BreakStatus::Taken);
    }

    #[test]
    fn test_break_status_taken_at_exactly_threshold() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 30)); // exactly 5 min gap

        let status = analyzer.infer_break_status(focus_end, break_start);
        assert_eq!(status, BreakStatus::Taken);
    }

    #[test]
    fn test_break_status_deferred() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 40)); // 15 min gap

        let status = analyzer.infer_break_status(focus_end, break_start);
        assert_eq!(status, BreakStatus::Deferred);
    }

    #[test]
    fn test_break_status_deferred_at_boundary() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 55)); // 30 min gap (at boundary)

        let status = analyzer.infer_break_status(focus_end, break_start);
        assert_eq!(status, BreakStatus::Deferred);
    }

    #[test]
    fn test_break_status_skipped_exceeds_threshold() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);
        let break_start = Some(utc_datetime(2024, 1, 15, 11, 0)); // 35 min gap

        let status = analyzer.infer_break_status(focus_end, break_start);
        assert_eq!(status, BreakStatus::Skipped);
    }

    #[test]
    fn test_break_status_skipped_no_break() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);

        let status = analyzer.infer_break_status(focus_end, None);
        assert_eq!(status, BreakStatus::Skipped);
    }

    #[test]
    fn test_custom_thresholds() {
        let analyzer = BreakAdherenceAnalyzer::with_thresholds(60, 10);
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);

        // 8 min gap - should be Taken (defer threshold is 10)
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 33));
        assert_eq!(analyzer.infer_break_status(focus_end, break_start), BreakStatus::Taken);

        // 20 min gap - should be Deferred (between 10 and 60)
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 45));
        assert_eq!(analyzer.infer_break_status(focus_end, break_start), BreakStatus::Deferred);

        // 65 min gap - should be Skipped (> 60)
        let break_start = Some(utc_datetime(2024, 1, 15, 11, 30));
        assert_eq!(analyzer.infer_break_status(focus_end, break_start), BreakStatus::Skipped);
    }

    #[test]
    fn test_analyze_empty_sessions() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let report = analyzer.analyze(std::iter::empty());

        assert_eq!(report.stats.total_focus_sessions, 0);
        assert_eq!(report.stats.breaks_taken, 0);
        assert_eq!(report.stats.adherence_rate, 0.0);
        assert!(report.by_hour.is_empty());
        assert!(report.by_project.is_empty());
        assert!(report.high_risk_windows.is_empty());
    }

    #[test]
    fn test_analyze_single_session_taken() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);
        let break_start = Some(utc_datetime(2024, 1, 15, 10, 28));

        let sessions = vec![(focus_end, break_start, Some("Project A"))];
        let report = analyzer.analyze(sessions.into_iter());

        assert_eq!(report.stats.total_focus_sessions, 1);
        assert_eq!(report.stats.breaks_taken, 1);
        assert_eq!(report.stats.breaks_skipped, 0);
        assert_eq!(report.stats.breaks_deferred, 0);
        assert_eq!(report.stats.adherence_rate, 1.0);
    }

    #[test]
    fn test_analyze_single_session_skipped() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let focus_end = utc_datetime(2024, 1, 15, 10, 25);

        let sessions = vec![(focus_end, None, Some("Project A"))];
        let report = analyzer.analyze(sessions.into_iter());

        assert_eq!(report.stats.total_focus_sessions, 1);
        assert_eq!(report.stats.breaks_taken, 0);
        assert_eq!(report.stats.breaks_skipped, 1);
        assert_eq!(report.stats.adherence_rate, 0.0);
    }

    #[test]
    fn test_analyze_multiple_sessions() {
        let analyzer = BreakAdherenceAnalyzer::new();

        let sessions = vec![
            // Taken (3 min gap)
            (utc_datetime(2024, 1, 15, 9, 25), Some(utc_datetime(2024, 1, 15, 9, 28)), Some("Project A")),
            // Deferred (15 min gap)
            (utc_datetime(2024, 1, 15, 10, 0), Some(utc_datetime(2024, 1, 15, 10, 15)), Some("Project A")),
            // Skipped (no break)
            (utc_datetime(2024, 1, 15, 11, 0), None, Some("Project B")),
            // Taken (2 min gap)
            (utc_datetime(2024, 1, 15, 14, 0), Some(utc_datetime(2024, 1, 15, 14, 2)), Some("Project B")),
        ];

        let report = analyzer.analyze(sessions.into_iter());

        assert_eq!(report.stats.total_focus_sessions, 4);
        assert_eq!(report.stats.breaks_taken, 2);
        assert_eq!(report.stats.breaks_skipped, 1);
        assert_eq!(report.stats.breaks_deferred, 1);
        assert_eq!(report.stats.adherence_rate, 0.5);
        assert_eq!(report.stats.avg_delay_min, 15.0); // Only the deferred one

        // Check hourly breakdown
        assert_eq!(report.by_hour.len(), 4); // 4 different hours

        // Check project breakdown
        assert_eq!(report.by_project.len(), 2);
    }

    #[test]
    fn test_high_risk_window_detection() {
        let analyzer = BreakAdherenceAnalyzer::new();

        // Create sessions where hour 10 has high skip rate
        let mut sessions = Vec::new();

        // Hour 10: 4 sessions, 3 skipped (75% skip rate)
        for i in 0..4 {
            let focus_end = utc_datetime(2024, 1, 15, 10, i * 10);
            let break_start = if i == 0 { Some(utc_datetime(2024, 1, 15, 10, 3)) } else { None };
            sessions.push((focus_end, break_start, None::<&str>));
        }

        // Hour 14: 4 sessions, all taken (0% skip rate)
        for i in 0..4 {
            let focus_end = utc_datetime(2024, 1, 15, 14, i * 10);
            let break_start = Some(utc_datetime(2024, 1, 15, 14, i * 10 + 3));
            sessions.push((focus_end, break_start, None::<&str>));
        }

        let report = analyzer.analyze(sessions.into_iter());

        // Hour 10 should be a high-risk window
        assert_eq!(report.high_risk_windows.len(), 1);
        assert_eq!(report.high_risk_windows[0].hour, 10);
        assert!(report.high_risk_windows[0].skip_rate > 0.3);
    }

    #[test]
    fn test_serialization() {
        let analyzer = BreakAdherenceAnalyzer::new();
        let sessions = vec![
            (utc_datetime(2024, 1, 15, 10, 0), Some(utc_datetime(2024, 1, 15, 10, 3)), Some("Project A")),
        ];

        let report = analyzer.analyze(sessions.into_iter());

        // Should serialize without errors
        let json = serde_json::to_string(&report).unwrap();
        assert!(json.contains("total_focus_sessions"));

        // Should deserialize back
        let deserialized: BreakAdherenceReport = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.stats.total_focus_sessions, 1);
    }
}
