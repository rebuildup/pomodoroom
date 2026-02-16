//! Estimate accuracy tracking module.
//!
//! This module provides estimate accuracy metrics to track planned vs actual
//! duration accuracy by tag/project.

use serde::{Deserialize, Serialize};

/// Accuracy metrics for a single estimate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EstimateAccuracy {
    /// Planned duration in minutes
    pub planned_duration: u32,
    /// Actual duration in minutes
    pub actual_duration: u32,
    /// Error (actual - planned), positive = underestimation
    pub error: f64,
    /// Absolute error |actual - planned|
    pub absolute_error: f64,
    /// Relative error (error / planned)
    pub relative_error: f64,
}

impl EstimateAccuracy {
    /// Create accuracy metrics from planned and actual durations.
    pub fn new(planned_duration: u32, actual_duration: u32) -> Self {
        let error = actual_duration as f64 - planned_duration as f64;
        let absolute_error = error.abs();
        let relative_error = if planned_duration > 0 {
            error / planned_duration as f64
        } else {
            0.0
        };

        Self {
            planned_duration,
            actual_duration,
            error,
            absolute_error,
            relative_error,
        }
    }

    /// Check if this was an underestimation (task took longer than expected).
    pub fn is_underestimation(&self) -> bool {
        self.error > 0.0
    }

    /// Check if this was an overestimation (task finished faster than expected).
    pub fn is_overestimation(&self) -> bool {
        self.error < 0.0
    }

    /// Get accuracy percentage (0.0-1.0, higher is better).
    pub fn accuracy(&self) -> f64 {
        if self.planned_duration == 0 {
            return 1.0;
        }
        (1.0 - self.relative_error.abs()).max(0.0)
    }
}

/// Aggregated accuracy statistics for a group.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccuracyStats {
    /// Grouping key (tag or project name)
    pub key: String,
    /// Number of sessions in this group
    pub session_count: u64,
    /// Mean planned duration
    pub mean_planned: f64,
    /// Mean actual duration
    pub mean_actual: f64,
    /// Mean Absolute Error (MAE)
    pub mean_absolute_error: f64,
    /// Mean bias (positive = underestimation, negative = overestimation)
    pub mean_bias: f64,
    /// Overall accuracy percentage (0.0-1.0)
    pub accuracy_percentage: f64,
    /// Corrective factor (multiply estimates by this)
    pub corrective_factor: f64,
    /// Confidence level based on sample count
    pub confidence: f64,
}

impl AccuracyStats {
    /// Calculate confidence from sample count.
    pub fn calculate_confidence(count: u64, min_samples: u64) -> f64 {
        if count == 0 {
            return 0.0;
        }
        if count < min_samples {
            return (count as f64 / min_samples as f64) * 0.5;
        }
        // Confidence approaches 1.0 with more samples
        (0.5 + 0.5 * (1.0 - (-(count as f64 - min_samples as f64) / 10.0).exp())).min(1.0)
    }

    /// Get a human-readable description of the bias.
    pub fn bias_description(&self) -> &'static str {
        if self.mean_bias.abs() < 2.0 {
            "Accurate estimates"
        } else if self.mean_bias > 10.0 {
            "Severe underestimation"
        } else if self.mean_bias > 2.0 {
            "Moderate underestimation"
        } else if self.mean_bias < -10.0 {
            "Severe overestimation"
        } else {
            "Moderate overestimation"
        }
    }

    /// Get suggested correction message.
    pub fn correction_suggestion(&self) -> String {
        if self.corrective_factor.abs() < 0.05 {
            format!("{}: Estimates are accurate (factor: {:.2}x)", self.key, self.corrective_factor)
        } else if self.corrective_factor > 1.0 {
            format!(
                "{}: Multiply estimates by {:.2}x (tasks take ~{:.0}% longer)",
                self.key,
                self.corrective_factor,
                (self.corrective_factor - 1.0) * 100.0
            )
        } else {
            format!(
                "{}: Multiply estimates by {:.2}x (tasks finish ~{:.0}% faster)",
                self.key,
                self.corrective_factor,
                (1.0 - self.corrective_factor) * 100.0
            )
        }
    }
}

/// Group accuracy metrics by.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum GroupBy {
    Tag,
    Project,
}

/// Session data for accuracy computation.
#[derive(Debug, Clone)]
pub struct AccuracySessionData {
    /// Planned/expected duration in minutes
    pub planned_duration: u32,
    /// Actual duration in minutes
    pub actual_duration: u32,
    /// Tag for grouping (optional)
    pub tag: Option<String>,
    /// Project for grouping (optional)
    pub project: Option<String>,
}

/// Tracker for computing estimate accuracy.
#[derive(Debug, Clone)]
pub struct EstimateAccuracyTracker {
    /// Minimum sessions needed for high confidence
    pub min_sessions_for_confidence: u64,
}

impl Default for EstimateAccuracyTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl EstimateAccuracyTracker {
    /// Create a new tracker with default settings.
    pub fn new() -> Self {
        Self {
            min_sessions_for_confidence: 5,
        }
    }

    /// Create tracker with custom settings.
    pub fn with_settings(min_sessions: u64) -> Self {
        Self {
            min_sessions_for_confidence: min_sessions,
        }
    }

    /// Compute accuracy metrics for a list of sessions.
    pub fn compute_accuracy(&self, sessions: &[AccuracySessionData]) -> Vec<AccuracyStats> {
        // Group sessions
        let mut groups: std::collections::HashMap<String, Vec<&AccuracySessionData>> =
            std::collections::HashMap::new();

        for session in sessions {
            let key = session.tag.clone().unwrap_or_else(|| {
                session.project.clone().unwrap_or_else(|| "unknown".to_string())
            });
            groups.entry(key).or_default().push(session);
        }

        // Compute stats for each group
        groups
            .into_iter()
            .map(|(key, group_sessions)| self.compute_group_stats(key, group_sessions))
            .collect()
    }

    /// Compute accuracy stats grouped by tag or project.
    pub fn compute_grouped(
        &self,
        sessions: &[AccuracySessionData],
        group_by: GroupBy,
    ) -> Vec<AccuracyStats> {
        let mut groups: std::collections::HashMap<String, Vec<&AccuracySessionData>> =
            std::collections::HashMap::new();

        for session in sessions {
            let key = match group_by {
                GroupBy::Tag => session.tag.clone().unwrap_or_else(|| "untagged".to_string()),
                GroupBy::Project => session.project.clone().unwrap_or_else(|| "no-project".to_string()),
            };
            groups.entry(key).or_default().push(session);
        }

        let mut stats: Vec<_> = groups
            .into_iter()
            .map(|(key, group_sessions)| self.compute_group_stats(key, group_sessions))
            .collect();

        // Sort by session count descending
        stats.sort_by(|a, b| b.session_count.cmp(&a.session_count));
        stats
    }

    /// Compute stats for a single group.
    fn compute_group_stats(
        &self,
        key: String,
        sessions: Vec<&AccuracySessionData>,
    ) -> AccuracyStats {
        let count = sessions.len() as u64;
        if count == 0 {
            return AccuracyStats {
                key,
                session_count: 0,
                mean_planned: 0.0,
                mean_actual: 0.0,
                mean_absolute_error: 0.0,
                mean_bias: 0.0,
                accuracy_percentage: 1.0,
                corrective_factor: 1.0,
                confidence: 0.0,
            };
        }

        let accuracies: Vec<EstimateAccuracy> = sessions
            .iter()
            .map(|s| EstimateAccuracy::new(s.planned_duration, s.actual_duration))
            .collect();

        let total_planned: f64 = accuracies.iter().map(|a| a.planned_duration as f64).sum();
        let total_actual: f64 = accuracies.iter().map(|a| a.actual_duration as f64).sum();
        let mean_planned = total_planned / count as f64;
        let mean_actual = total_actual / count as f64;

        let mean_absolute_error: f64 =
            accuracies.iter().map(|a| a.absolute_error).sum::<f64>() / count as f64;
        let mean_bias: f64 = accuracies.iter().map(|a| a.error).sum::<f64>() / count as f64;

        // Accuracy percentage: 1 - MAE/mean_planned
        let accuracy_percentage = if mean_planned > 0.0 {
            (1.0 - mean_absolute_error / mean_planned).max(0.0)
        } else {
            1.0
        };

        // Corrective factor: mean_actual / mean_planned
        let corrective_factor = if mean_planned > 0.0 {
            mean_actual / mean_planned
        } else {
            1.0
        };

        let confidence = AccuracyStats::calculate_confidence(count, self.min_sessions_for_confidence);

        AccuracyStats {
            key,
            session_count: count,
            mean_planned,
            mean_actual,
            mean_absolute_error,
            mean_bias,
            accuracy_percentage,
            corrective_factor,
            confidence,
        }
    }

    /// Render accuracy report as ASCII table.
    pub fn render_report(&self, stats: &[AccuracyStats]) -> String {
        let mut output = String::new();
        output.push_str("\nEstimate Accuracy Report\n");
        output.push_str(&"=".repeat(80));
        output.push_str("\n\n");

        if stats.is_empty() {
            output.push_str("No data available.\n");
            return output;
        }

        // Header
        output.push_str(&format!(
            "{:<20} {:>8} {:>8} {:>8} {:>10} {:>8}\n",
            "Group", "Count", "Planned", "Actual", "MAE", "Accuracy"
        ));
        output.push_str(&"-".repeat(80));
        output.push_str("\n");

        // Rows
        for stat in stats {
            output.push_str(&format!(
                "{:<20} {:>8} {:>7.0}m {:>7.0}m {:>9.1}m {:>7.0}%\n",
                truncate(&stat.key, 20),
                stat.session_count,
                stat.mean_planned,
                stat.mean_actual,
                stat.mean_absolute_error,
                stat.accuracy_percentage * 100.0
            ));
        }

        output.push_str(&"-".repeat(80));
        output.push_str("\n\n");

        // Corrective factors
        output.push_str("Corrective Factors:\n");
        for stat in stats {
            if stat.confidence >= 0.5 {
                output.push_str(&format!("  {}\n", stat.correction_suggestion()));
            }
        }

        output
    }
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_accuracy_new() {
        let acc = EstimateAccuracy::new(25, 30);
        assert_eq!(acc.planned_duration, 25);
        assert_eq!(acc.actual_duration, 30);
        assert_eq!(acc.error, 5.0);
        assert_eq!(acc.absolute_error, 5.0);
    }

    #[test]
    fn test_estimate_accuracy_underestimation() {
        let acc = EstimateAccuracy::new(25, 35);
        assert!(acc.is_underestimation());
        assert!(!acc.is_overestimation());
    }

    #[test]
    fn test_estimate_accuracy_overestimation() {
        let acc = EstimateAccuracy::new(25, 15);
        assert!(!acc.is_underestimation());
        assert!(acc.is_overestimation());
    }

    #[test]
    fn test_accuracy_stats_bias_description() {
        let mut stats = AccuracyStats {
            key: "test".to_string(),
            session_count: 10,
            mean_planned: 25.0,
            mean_actual: 25.0,
            mean_absolute_error: 2.0,
            mean_bias: 0.0,
            accuracy_percentage: 0.9,
            corrective_factor: 1.0,
            confidence: 0.8,
        };

        assert_eq!(stats.bias_description(), "Accurate estimates");

        stats.mean_bias = 5.0;
        assert_eq!(stats.bias_description(), "Moderate underestimation");

        stats.mean_bias = 15.0;
        assert_eq!(stats.bias_description(), "Severe underestimation");

        stats.mean_bias = -5.0;
        assert_eq!(stats.bias_description(), "Moderate overestimation");

        stats.mean_bias = -15.0;
        assert_eq!(stats.bias_description(), "Severe overestimation");
    }

    #[test]
    fn test_tracker_compute_accuracy() {
        let tracker = EstimateAccuracyTracker::new();
        let sessions = vec![
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 25,
                tag: Some("work".to_string()),
                project: Some("project-a".to_string()),
            },
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 30,
                tag: Some("work".to_string()),
                project: Some("project-a".to_string()),
            },
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 20,
                tag: Some("personal".to_string()),
                project: Some("project-b".to_string()),
            },
        ];

        let stats = tracker.compute_accuracy(&sessions);
        assert_eq!(stats.len(), 2); // work and personal

        // Find work stats
        let work_stats = stats.iter().find(|s| s.key == "work").unwrap();
        assert_eq!(work_stats.session_count, 2);
        assert!(work_stats.mean_bias > 0.0); // Underestimation
    }

    #[test]
    fn test_tracker_grouped_by_project() {
        let tracker = EstimateAccuracyTracker::new();
        let sessions = vec![
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 30,
                tag: Some("work".to_string()),
                project: Some("project-a".to_string()),
            },
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 20,
                tag: Some("work".to_string()),
                project: Some("project-b".to_string()),
            },
        ];

        let stats = tracker.compute_grouped(&sessions, GroupBy::Project);
        assert_eq!(stats.len(), 2);

        // Check project-a has underestimation
        let project_a = stats.iter().find(|s| s.key == "project-a").unwrap();
        assert!(project_a.mean_bias > 0.0);

        // Check project-b has overestimation
        let project_b = stats.iter().find(|s| s.key == "project-b").unwrap();
        assert!(project_b.mean_bias < 0.0);
    }

    #[test]
    fn test_corrective_factor() {
        let tracker = EstimateAccuracyTracker::new();
        let sessions = vec![
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 50, // Takes twice as long
                tag: Some("test".to_string()),
                project: None,
            },
            AccuracySessionData {
                planned_duration: 25,
                actual_duration: 50,
                tag: Some("test".to_string()),
                project: None,
            },
        ];

        let stats = tracker.compute_accuracy(&sessions);
        let test_stats = &stats[0];

        // Corrective factor should be ~2.0
        assert!((test_stats.corrective_factor - 2.0).abs() < 0.01);
        assert!(test_stats.correction_suggestion().contains("100% longer"));
    }
}
