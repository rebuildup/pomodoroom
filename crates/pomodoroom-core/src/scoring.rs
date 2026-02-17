//! Multi-objective scheduler scoring engine.
//!
//! This module provides a weighted objective scoring system for task scheduling,
//! replacing heuristic-only ordering with configurable, explainable scoring.

use serde::{Deserialize, Serialize};

use crate::task::{EnergyLevel, Task};

/// Individual objective term with weight and score
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveTerm {
    /// Term name
    pub name: String,
    /// Weight for this term (0.0 to 1.0)
    pub weight: f64,
    /// Raw score (0.0 to 1.0, higher is better)
    pub score: f64,
    /// Normalized weighted contribution
    pub contribution: f64,
}

impl ObjectiveTerm {
    /// Create a new objective term
    pub fn new(name: impl Into<String>, weight: f64, score: f64) -> Self {
        let contribution = weight * score;
        Self {
            name: name.into(),
            weight: weight.clamp(0.0, 1.0),
            score: score.clamp(0.0, 1.0),
            contribution,
        }
    }

    /// Update the score and recalculate contribution
    pub fn with_score(mut self, score: f64) -> Self {
        self.score = score.clamp(0.0, 1.0);
        self.contribution = self.weight * self.score;
        self
    }
}

/// Complete scoring breakdown for explainability
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    /// Individual objective terms
    pub terms: Vec<ObjectiveTerm>,
    /// Total weighted score (0.0 to 1.0)
    pub total_score: f64,
    /// Timestamp when scored
    pub scored_at: chrono::DateTime<chrono::Utc>,
}

impl ScoreBreakdown {
    /// Create a new empty breakdown
    pub fn new() -> Self {
        Self {
            terms: Vec::new(),
            total_score: 0.0,
            scored_at: chrono::Utc::now(),
        }
    }

    /// Add a term to the breakdown
    pub fn add_term(&mut self, term: ObjectiveTerm) {
        self.total_score += term.contribution;
        self.terms.push(term);
    }

    /// Get the top contributing term
    pub fn top_term(&self) -> Option<&ObjectiveTerm> {
        self.terms
            .iter()
            .max_by(|a, b| a.contribution.partial_cmp(&b.contribution).unwrap())
    }

    /// Get terms sorted by contribution (descending)
    pub fn terms_by_contribution(&self) -> Vec<&ObjectiveTerm> {
        let mut sorted: Vec<_> = self.terms.iter().collect();
        sorted.sort_by(|a, b| b.contribution.partial_cmp(&a.contribution).unwrap());
        sorted
    }
}

impl Default for ScoreBreakdown {
    fn default() -> Self {
        Self::new()
    }
}

/// Weights for each objective term
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveWeights {
    /// Weight for due date risk (higher = prioritize tasks with approaching deadlines)
    pub due_date_risk: f64,
    /// Weight for context switch cost (higher = prefer fewer context switches)
    pub context_switch: f64,
    /// Weight for energy fit (higher = match task energy to time of day)
    pub energy_fit: f64,
    /// Weight for break compliance (higher = ensure breaks are taken)
    pub break_compliance: f64,
    /// Weight for priority (higher = respect task priority values)
    pub priority: f64,
}

impl ObjectiveWeights {
    /// Default balanced weights
    pub fn balanced() -> Self {
        Self {
            due_date_risk: 0.25,
            context_switch: 0.20,
            energy_fit: 0.20,
            break_compliance: 0.15,
            priority: 0.20,
        }
    }

    /// Focus on meeting deadlines
    pub fn deadline_focused() -> Self {
        Self {
            due_date_risk: 0.40,
            context_switch: 0.15,
            energy_fit: 0.15,
            break_compliance: 0.10,
            priority: 0.20,
        }
    }

    /// Focus on deep work (minimize context switches)
    pub fn deep_work() -> Self {
        Self {
            due_date_risk: 0.15,
            context_switch: 0.35,
            energy_fit: 0.25,
            break_compliance: 0.15,
            priority: 0.10,
        }
    }

    /// Focus on sustainable pace (energy and breaks)
    pub fn sustainable() -> Self {
        Self {
            due_date_risk: 0.15,
            context_switch: 0.15,
            energy_fit: 0.30,
            break_compliance: 0.30,
            priority: 0.10,
        }
    }

    /// Normalize weights to sum to 1.0
    pub fn normalize(&mut self) {
        let sum = self.due_date_risk
            + self.context_switch
            + self.energy_fit
            + self.break_compliance
            + self.priority;
        if sum > 0.0 {
            self.due_date_risk /= sum;
            self.context_switch /= sum;
            self.energy_fit /= sum;
            self.break_compliance /= sum;
            self.priority /= sum;
        }
    }

    /// Validate that all weights are in [0.0, 1.0]
    pub fn validate(&self) -> Result<(), String> {
        let weights = [
            ("due_date_risk", self.due_date_risk),
            ("context_switch", self.context_switch),
            ("energy_fit", self.energy_fit),
            ("break_compliance", self.break_compliance),
            ("priority", self.priority),
        ];

        for (name, weight) in weights {
            if weight < 0.0 || weight > 1.0 {
                return Err(format!(
                    "Weight '{}' must be in [0.0, 1.0], got {}",
                    name, weight
                ));
            }
        }

        Ok(())
    }
}

impl Default for ObjectiveWeights {
    fn default() -> Self {
        Self::balanced()
    }
}

/// Context for scoring a task at a specific time
#[derive(Debug, Clone)]
pub struct ScoringContext<'a> {
    /// The task being scored
    pub task: &'a Task,
    /// Proposed start time
    pub start_time: chrono::DateTime<chrono::Utc>,
    /// Proposed end time
    pub end_time: chrono::DateTime<chrono::Utc>,
    /// Previously scheduled task (for context switch calculation)
    pub previous_task: Option<&'a Task>,
    /// Hour of day (0-23) for energy matching
    pub hour_of_day: u32,
    /// Number of consecutive tasks without break
    pub streak_without_break: i32,
    /// Objective weights
    pub weights: ObjectiveWeights,
}

/// Multi-objective scoring engine
pub struct ScoringEngine {
    weights: ObjectiveWeights,
}

impl ScoringEngine {
    /// Create a new engine with default weights
    pub fn new() -> Self {
        Self {
            weights: ObjectiveWeights::default(),
        }
    }

    /// Create with custom weights
    pub fn with_weights(weights: ObjectiveWeights) -> Self {
        Self { weights }
    }

    /// Update weights
    pub fn set_weights(&mut self, weights: ObjectiveWeights) {
        self.weights = weights;
    }

    /// Get current weights
    pub fn weights(&self) -> &ObjectiveWeights {
        &self.weights
    }

    /// Score a single task in context
    pub fn score_task(&self, ctx: &ScoringContext) -> ScoreBreakdown {
        let mut breakdown = ScoreBreakdown::new();

        // Due date risk
        let due_date_score = self.calculate_due_date_risk(ctx);
        breakdown.add_term(ObjectiveTerm::new(
            "due_date_risk",
            ctx.weights.due_date_risk,
            due_date_score,
        ));

        // Context switch cost
        let context_switch_score = self.calculate_context_switch_score(ctx);
        breakdown.add_term(ObjectiveTerm::new(
            "context_switch",
            ctx.weights.context_switch,
            context_switch_score,
        ));

        // Energy fit
        let energy_score = self.calculate_energy_fit(ctx);
        breakdown.add_term(ObjectiveTerm::new(
            "energy_fit",
            ctx.weights.energy_fit,
            energy_score,
        ));

        // Break compliance
        let break_score = self.calculate_break_compliance(ctx);
        breakdown.add_term(ObjectiveTerm::new(
            "break_compliance",
            ctx.weights.break_compliance,
            break_score,
        ));

        // Priority
        let priority_score = self.calculate_priority_score(ctx);
        breakdown.add_term(ObjectiveTerm::new(
            "priority",
            ctx.weights.priority,
            priority_score,
        ));

        breakdown
    }

    /// Calculate due date risk score
    /// Higher score = less risk = more comfortable deadline
    fn calculate_due_date_risk(&self, ctx: &ScoringContext) -> f64 {
        let Some(due_date) = ctx.task.window_end_at else {
            return 0.5; // Neutral if no due date
        };

        let remaining_hours = (due_date - ctx.end_time).num_hours() as f64;
        let task_duration_hours = ctx.task.estimated_pomodoros as f64 * 25.0 / 60.0;

        if remaining_hours <= 0.0 {
            return 0.0; // Overdue
        }

        // Score based on buffer time (remaining hours vs task duration)
        let buffer_ratio = remaining_hours / task_duration_hours.max(1.0);
        let score = (buffer_ratio / (buffer_ratio + 1.0)).min(1.0);

        score
    }

    /// Calculate context switch score
    /// Higher score = less context switching needed
    fn calculate_context_switch_score(&self, ctx: &ScoringContext) -> f64 {
        let Some(prev) = ctx.previous_task else {
            return 1.0; // No previous task = no context switch
        };

        // Same project = low context switch cost
        if prev.project_id == ctx.task.project_id && ctx.task.project_id.is_some() {
            return 1.0;
        }

        // Same energy level = medium context switch cost
        if prev.energy == ctx.task.energy {
            return 0.7;
        }

        // Different project and energy = high context switch cost
        0.4
    }

    /// Calculate energy fit score
    /// Higher score = better match between task energy and time of day
    fn calculate_energy_fit(&self, ctx: &ScoringContext) -> f64 {
        let preferred_energy = match ctx.hour_of_day {
            6..=11 => EnergyLevel::High,    // Morning: high energy
            12..=16 => EnergyLevel::Medium, // Afternoon: medium energy
            _ => EnergyLevel::Low,          // Evening: low energy
        };

        match (ctx.task.energy, preferred_energy) {
            (a, b) if a == b => 1.0, // Perfect match
            (EnergyLevel::High, EnergyLevel::Medium)
            | (EnergyLevel::Medium, EnergyLevel::High)
            | (EnergyLevel::Medium, EnergyLevel::Low)
            | (EnergyLevel::Low, EnergyLevel::Medium) => 0.6, // One level off
            _ => 0.2,                // Opposite (High vs Low)
        }
    }

    /// Calculate break compliance score
    /// Higher score = better break compliance
    fn calculate_break_compliance(&self, ctx: &ScoringContext) -> f64 {
        if ctx.streak_without_break < 3 {
            return 1.0; // No break needed yet
        }

        // Score decreases as streak increases
        let penalty = (ctx.streak_without_break - 2) as f64 * 0.2;
        (1.0 - penalty).max(0.0)
    }

    /// Calculate priority score
    /// Higher score = higher priority task
    fn calculate_priority_score(&self, ctx: &ScoringContext) -> f64 {
        let priority = ctx.task.priority.unwrap_or(50) as f64;
        priority / 100.0
    }

    /// Compare two tasks and return the better one with explanation
    pub fn compare_tasks(
        &self,
        ctx_a: &ScoringContext,
        ctx_b: &ScoringContext,
    ) -> (Ordering, ScoreBreakdown, ScoreBreakdown) {
        let score_a = self.score_task(ctx_a);
        let score_b = self.score_task(ctx_b);

        let ordering = if score_a.total_score > score_b.total_score {
            Ordering::Better
        } else if score_a.total_score < score_b.total_score {
            Ordering::Worse
        } else {
            Ordering::Equal
        };

        (ordering, score_a, score_b)
    }
}

impl Default for ScoringEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Comparison result for task ranking
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ordering {
    /// First task is better
    Better,
    /// Tasks are equal
    Equal,
    /// First task is worse
    Worse,
}

/// Benchmark result comparing scoring approaches
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    /// Baseline score (heuristic-only)
    pub baseline_score: f64,
    /// Multi-objective score
    pub multi_objective_score: f64,
    /// Improvement percentage
    pub improvement_pct: f64,
    /// Number of tasks evaluated
    pub task_count: usize,
    /// Timestamp
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl BenchmarkResult {
    /// Create a new benchmark result
    pub fn new(baseline_score: f64, multi_objective_score: f64, task_count: usize) -> Self {
        let improvement_pct = if baseline_score > 0.0 {
            ((multi_objective_score - baseline_score) / baseline_score) * 100.0
        } else {
            0.0
        };

        Self {
            baseline_score,
            multi_objective_score,
            improvement_pct,
            task_count,
            timestamp: chrono::Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::{TaskCategory, TaskKind, TaskState};
    use chrono::{Duration, Utc};

    fn make_test_task_with_due_date(
        id: &str,
        priority: i32,
        energy: EnergyLevel,
        hours_until_due: Option<i64>,
    ) -> Task {
        let now = Utc::now();
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: None,
            estimated_pomodoros: 2,
            completed_pomodoros: 0,
            completed: false,
            state: TaskState::Ready,
            project_id: Some(format!("project-{}", id)),
            project_name: None,
            project_ids: vec![format!("project-{}", id)],
            kind: TaskKind::DurationOnly,
            required_minutes: None,
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: hours_until_due.map(|h| now + Duration::hours(h)),
            tags: vec![],
            priority: Some(priority),
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy,
            group: None,
            group_ids: vec![],
            created_at: now,
            updated_at: now,
            completed_at: None,
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
            allow_split: true,
        }
    }

    fn make_test_task_with_project(
        id: &str,
        priority: i32,
        energy: EnergyLevel,
        project_id: Option<String>,
    ) -> Task {
        let now = Utc::now();
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: None,
            estimated_pomodoros: 2,
            completed_pomodoros: 0,
            completed: false,
            state: TaskState::Ready,
            project_id: project_id.clone(),
            project_name: None,
            project_ids: project_id.map(|p| vec![p]).unwrap_or_default(),
            kind: TaskKind::DurationOnly,
            required_minutes: None,
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec![],
            priority: Some(priority),
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy,
            group: None,
            group_ids: vec![],
            created_at: now,
            updated_at: now,
            completed_at: None,
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
            allow_split: true,
        }
    }

    #[test]
    fn test_score_breakdown_calculation() {
        let mut breakdown = ScoreBreakdown::new();

        breakdown.add_term(ObjectiveTerm::new("term1", 0.5, 0.8));
        breakdown.add_term(ObjectiveTerm::new("term2", 0.5, 0.6));

        assert!((breakdown.total_score - 0.7).abs() < 0.01);
        assert_eq!(breakdown.terms.len(), 2);
    }

    #[test]
    fn test_objective_term_creation() {
        let term = ObjectiveTerm::new("test", 0.5, 0.8);

        assert_eq!(term.name, "test");
        assert!((term.weight - 0.5).abs() < 0.01);
        assert!((term.score - 0.8).abs() < 0.01);
        assert!((term.contribution - 0.4).abs() < 0.01);
    }

    #[test]
    fn test_due_date_risk_scoring() {
        let engine = ScoringEngine::new();
        let now = Utc::now();

        // Task with comfortable deadline
        let task_far = make_test_task_with_due_date("1", 50, EnergyLevel::Medium, Some(48));
        let ctx_far = ScoringContext {
            task: &task_far,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 10,
            streak_without_break: 0,
            weights: ObjectiveWeights::default(),
        };

        // Task with tight deadline
        let task_tight = make_test_task_with_due_date("2", 50, EnergyLevel::Medium, Some(2));
        let ctx_tight = ScoringContext {
            task: &task_tight,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 10,
            streak_without_break: 0,
            weights: ObjectiveWeights::default(),
        };

        let score_far = engine.calculate_due_date_risk(&ctx_far);
        let score_tight = engine.calculate_due_date_risk(&ctx_tight);

        assert!(
            score_far > score_tight,
            "Far deadline should have lower risk"
        );
    }

    #[test]
    fn test_energy_fit_scoring() {
        let engine = ScoringEngine::new();
        let now = Utc::now();

        // High energy task in morning (should match)
        let task_high = make_test_task_with_due_date("1", 50, EnergyLevel::High, None);
        let ctx_morning = ScoringContext {
            task: &task_high,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 9,
            streak_without_break: 0,
            weights: ObjectiveWeights::default(),
        };

        // Low energy task in evening (should match)
        let task_low = make_test_task_with_due_date("2", 50, EnergyLevel::Low, None);
        let ctx_evening = ScoringContext {
            task: &task_low,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 20,
            streak_without_break: 0,
            weights: ObjectiveWeights::default(),
        };

        let score_morning = engine.calculate_energy_fit(&ctx_morning);
        let score_evening = engine.calculate_energy_fit(&ctx_evening);

        assert_eq!(
            score_morning, 1.0,
            "High energy in morning should be perfect"
        );
        assert_eq!(
            score_evening, 1.0,
            "Low energy in evening should be perfect"
        );
    }

    #[test]
    fn test_context_switch_scoring() {
        let engine = ScoringEngine::new();
        let now = Utc::now();

        // All tasks share the same project_id
        let prev_task = make_test_task_with_project(
            "prev",
            50,
            EnergyLevel::Medium,
            Some("project-1".to_string()),
        );
        let same_project_task = make_test_task_with_project(
            "same",
            50,
            EnergyLevel::Medium,
            Some("project-1".to_string()),
        );
        // Different project and different energy
        let diff_project_task = make_test_task_with_project(
            "diff",
            50,
            EnergyLevel::High,
            Some("project-2".to_string()),
        );

        let ctx_same = ScoringContext {
            task: &same_project_task,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: Some(&prev_task),
            hour_of_day: 10,
            streak_without_break: 0,
            weights: ObjectiveWeights::default(),
        };

        let ctx_diff = ScoringContext {
            task: &diff_project_task,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: Some(&prev_task),
            hour_of_day: 10,
            streak_without_break: 0,
            weights: ObjectiveWeights::default(),
        };

        let score_same = engine.calculate_context_switch_score(&ctx_same);
        let score_diff = engine.calculate_context_switch_score(&ctx_diff);

        assert_eq!(
            score_same, 1.0,
            "Same project should have no context switch cost"
        );
        assert!(
            score_diff < score_same,
            "Different project should have higher context switch cost"
        );
    }

    #[test]
    fn test_break_compliance_scoring() {
        let engine = ScoringEngine::new();
        let now = Utc::now();
        let task = make_test_task_with_due_date("1", 50, EnergyLevel::Medium, None);

        let ctx_low_streak = ScoringContext {
            task: &task,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 10,
            streak_without_break: 2,
            weights: ObjectiveWeights::default(),
        };

        let ctx_high_streak = ScoringContext {
            task: &task,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 10,
            streak_without_break: 6,
            weights: ObjectiveWeights::default(),
        };

        let score_low = engine.calculate_break_compliance(&ctx_low_streak);
        let score_high = engine.calculate_break_compliance(&ctx_high_streak);

        assert_eq!(score_low, 1.0, "Low streak should have no penalty");
        assert!(score_high < score_low, "High streak should have penalty");
    }

    #[test]
    fn test_weight_profiles() {
        let balanced = ObjectiveWeights::balanced();
        let deadline = ObjectiveWeights::deadline_focused();
        let deep_work = ObjectiveWeights::deep_work();
        let sustainable = ObjectiveWeights::sustainable();

        // Deadline focused should prioritize due_date_risk
        assert!(deadline.due_date_risk > balanced.due_date_risk);

        // Deep work should prioritize context_switch
        assert!(deep_work.context_switch > balanced.context_switch);

        // Sustainable should prioritize energy_fit and break_compliance
        assert!(sustainable.energy_fit > balanced.energy_fit);
        assert!(sustainable.break_compliance > balanced.break_compliance);
    }

    #[test]
    fn test_complete_scoring_workflow() {
        let engine = ScoringEngine::with_weights(ObjectiveWeights::balanced());
        let now = Utc::now();

        let task = make_test_task_with_due_date("1", 75, EnergyLevel::High, Some(24));
        let ctx = ScoringContext {
            task: &task,
            start_time: now,
            end_time: now + Duration::hours(1),
            previous_task: None,
            hour_of_day: 9,
            streak_without_break: 1,
            weights: ObjectiveWeights::balanced(),
        };

        let breakdown = engine.score_task(&ctx);

        assert_eq!(breakdown.terms.len(), 5);
        assert!(breakdown.total_score > 0.0);
        assert!(breakdown.total_score <= 1.0);

        // Check all terms are present
        let term_names: Vec<_> = breakdown.terms.iter().map(|t| t.name.clone()).collect();
        assert!(term_names.contains(&"due_date_risk".to_string()));
        assert!(term_names.contains(&"context_switch".to_string()));
        assert!(term_names.contains(&"energy_fit".to_string()));
        assert!(term_names.contains(&"break_compliance".to_string()));
        assert!(term_names.contains(&"priority".to_string()));
    }

    #[test]
    fn test_score_breakdown_top_term() {
        let mut breakdown = ScoreBreakdown::new();

        breakdown.add_term(ObjectiveTerm::new("low", 0.5, 0.2));
        breakdown.add_term(ObjectiveTerm::new("high", 0.5, 0.9));
        breakdown.add_term(ObjectiveTerm::new("medium", 0.5, 0.5));

        let top = breakdown.top_term().unwrap();
        assert_eq!(top.name, "high");
    }

    #[test]
    fn test_objective_weights_validation() {
        let valid = ObjectiveWeights::balanced();
        assert!(valid.validate().is_ok());

        let mut invalid = ObjectiveWeights::balanced();
        invalid.due_date_risk = -0.5;
        assert!(invalid.validate().is_err());

        let mut invalid2 = ObjectiveWeights::balanced();
        invalid2.context_switch = 1.5;
        assert!(invalid2.validate().is_err());
    }
}
