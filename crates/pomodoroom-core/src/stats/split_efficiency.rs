//! Auto-split efficiency analysis and reporting.
//!
//! This module provides analytics for comparing split vs non-split task
//! completion outcomes to measure whether splitting improves completion quality.
//!
//! # Features
//! - Compare split vs non-split completion outcomes
//! - Track average overrun and interruption rate
//! - Show per-template performance
//! - Distinguish auto and manual splits
//! - Provide recommendations based on best-performing templates
//!
//! # Usage
//! ```rust,ignore
//! use pomodoroom_core::stats::split_efficiency::*;
//!
//! let analyzer = SplitEfficiencyAnalyzer::new();
//!
//! // Generate efficiency report
//! let report = analyzer.generate_report(&tasks, &sessions)?;
//!
//! // Get recommendations
//! let recommendations = analyzer.get_recommendations(&report);
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::task::Task;

/// Type of split (automatic or manual)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SplitType {
    /// Task was not split
    NotSplit,
    /// Task was auto-split by the system
    AutoSplit,
    /// Task was manually split by the user
    ManualSplit,
}

/// Outcome metrics for a single task completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskOutcome {
    /// Task ID
    pub task_id: String,
    /// Whether task was split and how
    pub split_type: SplitType,
    /// Template used (if any)
    pub template: Option<String>,
    /// Estimated pomodoros
    pub estimated_pomodoros: i32,
    /// Actual pomodoros completed
    pub actual_pomodoros: i32,
    /// Estimated minutes
    pub estimated_minutes: i32,
    /// Actual minutes elapsed
    pub actual_minutes: i32,
    /// Number of interruptions
    pub interruption_count: u32,
    /// Whether task was completed
    pub completed: bool,
    /// Completion time
    pub completed_at: Option<DateTime<Utc>>,
}

/// Efficiency metrics aggregated by split type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitEfficiencyMetrics {
    /// Split type
    pub split_type: SplitType,
    /// Number of tasks analyzed
    pub task_count: usize,
    /// Number of completed tasks
    pub completed_count: usize,
    /// Completion rate (0.0 - 1.0)
    pub completion_rate: f64,
    /// Average overrun in minutes (positive = over estimate)
    pub avg_overrun_min: f64,
    /// Average overrun as percentage (positive = over estimate)
    pub avg_overrun_pct: f64,
    /// Average interruptions per task
    pub avg_interruptions: f64,
    /// Tasks that exceeded estimate by more than 50%
    pub severe_overrun_count: usize,
}

/// Per-template performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplatePerformance {
    /// Template name or identifier
    pub template: String,
    /// Number of tasks using this template
    pub task_count: usize,
    /// Metrics for split tasks
    pub split_metrics: Option<SplitEfficiencyMetrics>,
    /// Metrics for non-split tasks
    pub non_split_metrics: Option<SplitEfficiencyMetrics>,
    /// Efficiency score (higher is better)
    pub efficiency_score: f64,
}

/// Recommendation based on analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitRecommendation {
    /// Type of recommendation
    pub recommendation_type: RecommendationType,
    /// Template or category this applies to
    pub target: Option<String>,
    /// Explanation for the recommendation
    pub explanation: String,
    /// Expected improvement if followed
    pub expected_improvement: Option<String>,
}

/// Type of recommendation
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecommendationType {
    /// Recommend splitting for this category
    RecommendSplit,
    /// Recommend not splitting for this category
    RecommendNoSplit,
    /// Adjust split parameters (segments, duration)
    AdjustSplitParameters,
    /// No clear recommendation
    Neutral,
}

/// Complete efficiency report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitEfficiencyReport {
    /// Report generation time
    pub generated_at: DateTime<Utc>,
    /// Number of tasks analyzed
    pub total_tasks: usize,
    /// Date range of analysis
    pub date_range: (DateTime<Utc>, DateTime<Utc>),
    /// Metrics by split type
    pub metrics_by_split_type: HashMap<String, SplitEfficiencyMetrics>,
    /// Per-template performance
    pub template_performance: Vec<TemplatePerformance>,
    /// Overall recommendations
    pub recommendations: Vec<SplitRecommendation>,
}

/// Analyzer for split efficiency
pub struct SplitEfficiencyAnalyzer;

impl SplitEfficiencyAnalyzer {
    /// Create a new analyzer
    pub fn new() -> Self {
        Self
    }

    /// Generate an efficiency report from tasks and sessions
    ///
    /// # Arguments
    /// * `tasks` - All tasks to analyze
    /// * `sessions` - Session records linked to tasks
    ///
    /// # Returns
    /// Complete efficiency report with metrics and recommendations
    pub fn generate_report(
        &self,
        tasks: &[Task],
        sessions: &[TaskSession],
    ) -> Result<SplitEfficiencyReport, String> {
        if tasks.is_empty() {
            return Err("No tasks to analyze".to_string());
        }

        // Map sessions to tasks
        let mut task_sessions: HashMap<String, Vec<TaskSession>> = HashMap::new();
        for session in sessions {
            if let Some(task_id) = &session.task_id {
                task_sessions
                    .entry(task_id.clone())
                    .or_insert_with(Vec::new)
                    .push(session.clone());
            }
        }

        // Build task outcomes
        let mut outcomes = Vec::new();
        for task in tasks {
            let outcome = self.build_task_outcome(task, &task_sessions);
            outcomes.push(outcome);
        }

        // Determine date range
        let date_range = self.get_date_range(&outcomes);

        // Calculate metrics by split type
        let metrics_by_split_type = self.calculate_metrics_by_split_type(&outcomes);

        // Calculate per-template performance
        let template_performance = self.calculate_template_performance(&outcomes);

        // Generate recommendations
        let recommendations = self.generate_recommendations(
            &metrics_by_split_type,
            &template_performance,
        );

        Ok(SplitEfficiencyReport {
            generated_at: Utc::now(),
            total_tasks: outcomes.len(),
            date_range,
            metrics_by_split_type,
            template_performance,
            recommendations,
        })
    }

    /// Build task outcome from task and sessions
    fn build_task_outcome(
        &self,
        task: &Task,
        task_sessions: &HashMap<String, Vec<TaskSession>>,
    ) -> TaskOutcome {
        let sessions = task_sessions.get(&task.id).cloned().unwrap_or_default();

        let split_type = if task.parent_task_id.is_some() {
            // This is a segment - check if parent was auto-split
            SplitType::AutoSplit
        } else if task.segment_order.is_some() || self.has_child_segments(task) {
            // This is a parent task or has been manually split
            SplitType::ManualSplit
        } else {
            SplitType::NotSplit
        };

        let interruption_count = sessions
            .iter()
            .filter(|s| s.interrupted)
            .count() as u32;

        let actual_pomodoros = sessions.len() as i32;
        let actual_minutes = sessions.iter().map(|s| s.duration_min).sum();

        TaskOutcome {
            task_id: task.id.clone(),
            split_type,
            template: task.tags.first().cloned(), // Use first tag as template proxy
            estimated_pomodoros: task.estimated_pomodoros,
            actual_pomodoros,
            estimated_minutes: task.required_minutes.unwrap_or(0) as i32,
            actual_minutes,
            interruption_count,
            completed: task.completed,
            completed_at: task.completed_at,
        }
    }

    /// Check if task has child segments (was split)
    fn has_child_segments(&self, _task: &Task) -> bool {
        // In a real implementation, this would check for child tasks
        // For now, we assume tasks with segment_order are split
        false
    }

    /// Get date range from outcomes
    fn get_date_range(&self, outcomes: &[TaskOutcome]) -> (DateTime<Utc>, DateTime<Utc>) {
        let start = outcomes
            .iter()
            .filter_map(|o| o.completed_at)
            .min()
            .unwrap_or_else(Utc::now);

        let end = outcomes
            .iter()
            .filter_map(|o| o.completed_at)
            .max()
            .unwrap_or_else(Utc::now);

        (start, end)
    }

    /// Calculate metrics grouped by split type
    fn calculate_metrics_by_split_type(
        &self,
        outcomes: &[TaskOutcome],
    ) -> HashMap<String, SplitEfficiencyMetrics> {
        let mut grouped: HashMap<SplitType, Vec<&TaskOutcome>> = HashMap::new();

        for outcome in outcomes {
            grouped
                .entry(outcome.split_type)
                .or_insert_with(Vec::new)
                .push(outcome);
        }

        let mut metrics = HashMap::new();

        for (split_type, group_outcomes) in grouped {
            let task_count = group_outcomes.len();
            let completed_count = group_outcomes.iter().filter(|o| o.completed).count();
            let completion_rate = if task_count > 0 {
                completed_count as f64 / task_count as f64
            } else {
                0.0
            };

            let total_overrun_min: i32 = group_outcomes
                .iter()
                .map(|o| o.actual_minutes - o.estimated_minutes)
                .sum();

            let total_estimated: i32 = group_outcomes.iter().map(|o| o.estimated_minutes).sum();

            let avg_overrun_min = if task_count > 0 {
                total_overrun_min as f64 / task_count as f64
            } else {
                0.0
            };

            let avg_overrun_pct = if total_estimated > 0 {
                (total_overrun_min as f64 / total_estimated as f64) * 100.0
            } else {
                0.0
            };

            let total_interruptions: u32 = group_outcomes.iter().map(|o| o.interruption_count).sum();
            let avg_interruptions = if task_count > 0 {
                total_interruptions as f64 / task_count as f64
            } else {
                0.0
            };

            let severe_overrun_count = group_outcomes
                .iter()
                .filter(|o| {
                    let overrun_pct = if o.estimated_minutes > 0 {
                        (o.actual_minutes - o.estimated_minutes) as f64 / o.estimated_minutes as f64
                    } else {
                        0.0
                    };
                    overrun_pct > 0.5
                })
                .count();

            let split_type_key = format!("{:?}", split_type);

            metrics.insert(
                split_type_key,
                SplitEfficiencyMetrics {
                    split_type,
                    task_count,
                    completed_count,
                    completion_rate,
                    avg_overrun_min,
                    avg_overrun_pct,
                    avg_interruptions,
                    severe_overrun_count,
                },
            );
        }

        metrics
    }

    /// Calculate per-template performance
    fn calculate_template_performance(
        &self,
        outcomes: &[TaskOutcome],
    ) -> Vec<TemplatePerformance> {
        let mut by_template: HashMap<Option<String>, Vec<&TaskOutcome>> = HashMap::new();

        for outcome in outcomes {
            by_template
                .entry(outcome.template.clone())
                .or_insert_with(Vec::new)
                .push(outcome);
        }

        let mut performances = Vec::new();

        for (template, template_outcomes) in by_template {
            let split_outcomes: Vec<_> = template_outcomes
                .iter()
                .filter(|o| o.split_type == SplitType::AutoSplit)
                .cloned()
                .collect();

            let non_split_outcomes: Vec<_> = template_outcomes
                .iter()
                .filter(|o| o.split_type == SplitType::NotSplit)
                .cloned()
                .collect();

            let split_metrics = if split_outcomes.is_empty() {
                None
            } else {
                Some(self.calculate_metrics_for_outcomes(&split_outcomes, SplitType::AutoSplit))
            };

            let non_split_metrics = if non_split_outcomes.is_empty() {
                None
            } else {
                Some(self.calculate_metrics_for_outcomes(
                    &non_split_outcomes,
                    SplitType::NotSplit,
                ))
            };

            // Calculate efficiency score (higher is better)
            // Based on: completion rate - overrun penalty - interruption penalty
            let efficiency_score = self.calculate_efficiency_score(
                split_metrics.as_ref(),
                non_split_metrics.as_ref(),
            );

            performances.push(TemplatePerformance {
                template: template.unwrap_or_else(|| "uncategorized".to_string()),
                task_count: template_outcomes.len(),
                split_metrics,
                non_split_metrics,
                efficiency_score,
            });
        }

        // Sort by efficiency score descending
        performances.sort_by(|a, b| {
            b.efficiency_score
                .partial_cmp(&a.efficiency_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        performances
    }

    /// Calculate metrics for a subset of outcomes
    fn calculate_metrics_for_outcomes(
        &self,
        outcomes: &[&TaskOutcome],
        split_type: SplitType,
    ) -> SplitEfficiencyMetrics {
        let task_count = outcomes.len();
        let completed_count = outcomes.iter().filter(|o| o.completed).count();
        let completion_rate = if task_count > 0 {
            completed_count as f64 / task_count as f64
        } else {
            0.0
        };

        let total_overrun_min: i32 = outcomes
            .iter()
            .map(|o| o.actual_minutes - o.estimated_minutes)
            .sum();

        let total_estimated: i32 = outcomes.iter().map(|o| o.estimated_minutes).sum();

        let avg_overrun_min = if task_count > 0 {
            total_overrun_min as f64 / task_count as f64
        } else {
            0.0
        };

        let avg_overrun_pct = if total_estimated > 0 {
            (total_overrun_min as f64 / total_estimated as f64) * 100.0
        } else {
            0.0
        };

        let total_interruptions: u32 = outcomes.iter().map(|o| o.interruption_count).sum();
        let avg_interruptions = if task_count > 0 {
            total_interruptions as f64 / task_count as f64
        } else {
            0.0
        };

        let severe_overrun_count = outcomes
            .iter()
            .filter(|o| {
                let overrun_pct = if o.estimated_minutes > 0 {
                    (o.actual_minutes - o.estimated_minutes) as f64 / o.estimated_minutes as f64
                } else {
                    0.0
                };
                overrun_pct > 0.5
            })
            .count();

        SplitEfficiencyMetrics {
            split_type,
            task_count,
            completed_count,
            completion_rate,
            avg_overrun_min,
            avg_overrun_pct,
            avg_interruptions,
            severe_overrun_count,
        }
    }

    /// Calculate efficiency score for a template
    fn calculate_efficiency_score(
        &self,
        split_metrics: Option<&SplitEfficiencyMetrics>,
        non_split_metrics: Option<&SplitEfficiencyMetrics>,
    ) -> f64 {
        let mut score = 0.0;

        // Base score from completion rates
        if let Some(m) = non_split_metrics {
            score += m.completion_rate * 50.0;
        }

        if let Some(m) = split_metrics {
            score += m.completion_rate * 50.0;

            // Penalty for high overrun
            score -= m.avg_overrun_pct.abs().min(100.0) * 0.2;

            // Penalty for interruptions
            score -= m.avg_interruptions * 2.0;
        }

        score.max(0.0).min(100.0)
    }

    /// Generate recommendations based on metrics
    fn generate_recommendations(
        &self,
        metrics_by_split_type: &HashMap<String, SplitEfficiencyMetrics>,
        template_performance: &[TemplatePerformance],
    ) -> Vec<SplitRecommendation> {
        let mut recommendations = Vec::new();

        // Get overall metrics
        let not_split_metrics = metrics_by_split_type.get("NotSplit");
        let auto_split_metrics = metrics_by_split_type.get("AutoSplit");

        // Overall split recommendation
        if let (Some(non_split), Some(auto_split)) = (not_split_metrics, auto_split_metrics) {
            if auto_split.completion_rate > non_split.completion_rate + 0.1
                && auto_split.avg_overrun_pct < non_split.avg_overrun_pct
            {
                recommendations.push(SplitRecommendation {
                    recommendation_type: RecommendationType::RecommendSplit,
                    target: None,
                    explanation: format!(
                        "Auto-split tasks show {:.1}% higher completion rate ({:.1}% vs {:.1}%) and {:.1}% lower overrun",
                        (auto_split.completion_rate - non_split.completion_rate) * 100.0,
                        auto_split.completion_rate * 100.0,
                        non_split.completion_rate * 100.0,
                        (non_split.avg_overrun_pct - auto_split.avg_overrun_pct).abs()
                    ),
                    expected_improvement: Some(format!(
                        "~{:.0}% improvement in completion rate",
                        (auto_split.completion_rate - non_split.completion_rate) * 100.0
                    )),
                });
            } else if non_split.completion_rate > auto_split.completion_rate + 0.1 {
                recommendations.push(SplitRecommendation {
                    recommendation_type: RecommendationType::RecommendNoSplit,
                    target: None,
                    explanation: format!(
                        "Non-split tasks show {:.1}% higher completion rate ({:.1}% vs {:.1}%)",
                        (non_split.completion_rate - auto_split.completion_rate) * 100.0,
                        non_split.completion_rate * 100.0,
                        auto_split.completion_rate * 100.0
                    ),
                    expected_improvement: Some("Avoid splitting for better outcomes".to_string()),
                });
            }
        }

        // Per-template recommendations
        for perf in template_performance.iter().take(5) {
            // Top 5 templates
            if let (Some(split), Some(non_split)) = (&perf.split_metrics, &perf.non_split_metrics) {
                if split.completion_rate > non_split.completion_rate + 0.15 {
                    recommendations.push(SplitRecommendation {
                        recommendation_type: RecommendationType::RecommendSplit,
                        target: Some(perf.template.clone()),
                        explanation: format!(
                            "Tasks with '{}' template benefit from splitting ({:.1}% vs {:.1}% completion)",
                            perf.template,
                            split.completion_rate * 100.0,
                            non_split.completion_rate * 100.0
                        ),
                        expected_improvement: Some(format!(
                            "{:.0}% higher completion with split",
                            (split.completion_rate - non_split.completion_rate) * 100.0
                        )),
                    });
                }
            }
        }

        // High interruption warning
        if let Some(auto_split) = auto_split_metrics {
            if auto_split.avg_interruptions > 2.0 {
                recommendations.push(SplitRecommendation {
                    recommendation_type: RecommendationType::AdjustSplitParameters,
                    target: None,
                    explanation: format!(
                        "Split tasks show high interruption rate ({:.1} per task). Consider longer segment durations.",
                        auto_split.avg_interruptions
                    ),
                    expected_improvement: Some("Reduce context switching".to_string()),
                });
            }
        }

        recommendations
    }
}

impl Default for SplitEfficiencyAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

/// Task session data (linked to SessionRecord)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSession {
    /// Session ID or timestamp
    pub id: String,
    /// Associated task ID
    pub task_id: Option<String>,
    /// Duration in minutes
    pub duration_min: i32,
    /// Whether session was interrupted
    pub interrupted: bool,
    /// Session completion time
    pub completed_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_task(
        id: &str,
        completed: bool,
        estimated_pomodoros: i32,
        required_minutes: i32,
    ) -> Task {
        Task {
            id: id.to_string(),
            title: "Test Task".to_string(),
            description: None,
            estimated_pomodoros,
            completed_pomodoros: if completed { estimated_pomodoros } else { 0 },
            completed,
            state: if completed {
                crate::task::TaskState::Done
            } else {
                crate::task::TaskState::Ready
            },
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: crate::task::TaskKind::DurationOnly,
            required_minutes: Some(required_minutes as u32),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec!["work".to_string()],
            priority: Some(50),
            category: crate::task::TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: crate::task::EnergyLevel::Medium,
            group: None,
            group_ids: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: if completed { Some(Utc::now()) } else { None },
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
            allow_split: true,
            suggested_tags: vec![],
            approved_tags: vec![],
        }
    }

    fn make_test_session(task_id: &str, duration_min: i32, interrupted: bool) -> TaskSession {
        TaskSession {
            id: format!("session-{}", task_id),
            task_id: Some(task_id.to_string()),
            duration_min,
            interrupted,
            completed_at: Utc::now(),
        }
    }

    #[test]
    fn test_analyzer_empty_tasks() {
        let analyzer = SplitEfficiencyAnalyzer::new();
        let result = analyzer.generate_report(&[], &[]);
        assert!(result.is_err());
    }

    #[test]
    fn test_metrics_by_split_type() {
        let analyzer = SplitEfficiencyAnalyzer::new();

        let tasks = vec![
            make_test_task("task-1", true, 2, 120),
            make_test_task("task-2", false, 2, 120),
        ];

        let sessions = vec![
            make_test_session("task-1", 60, false),
            make_test_session("task-1", 60, false),
            make_test_session("task-2", 30, true),
        ];

        let report = analyzer.generate_report(&tasks, &sessions).unwrap();

        assert!(!report.metrics_by_split_type.is_empty());
    }

    #[test]
    fn test_template_performance() {
        let analyzer = SplitEfficiencyAnalyzer::new();

        let mut tasks = vec![
            make_test_task("task-1", true, 2, 120),
            make_test_task("task-2", true, 2, 120),
        ];

        // Add different templates
        tasks[0].tags = vec!["work".to_string()];
        tasks[1].tags = vec!["personal".to_string()];

        let sessions = vec![
            make_test_session("task-1", 60, false),
            make_test_session("task-1", 60, false),
            make_test_session("task-2", 50, false),
            make_test_session("task-2", 50, false),
        ];

        let report = analyzer.generate_report(&tasks, &sessions).unwrap();

        assert!(!report.template_performance.is_empty());
    }

    #[test]
    fn test_recommendations_generated() {
        let analyzer = SplitEfficiencyAnalyzer::new();

        let tasks = vec![
            make_test_task("task-1", true, 2, 120),
            make_test_task("task-2", false, 2, 120),
        ];

        let sessions = vec![
            make_test_session("task-1", 60, false),
            make_test_session("task-1", 60, false),
        ];

        let report = analyzer.generate_report(&tasks, &sessions).unwrap();

        // Should generate at least some analysis
        assert_eq!(report.total_tasks, 2);
    }
}
