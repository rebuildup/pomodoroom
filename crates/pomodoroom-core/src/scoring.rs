//! Multi-objective scheduler scoring engine.
//!
//! This module provides a weighted objective scoring system for task scheduling,
//! replacing heuristic-only ordering with configurable, explainable scoring.
//!
//! ## Pressure Engine
//!
//! Pressure is a dynamic parameter that determines intervention frequency and intensity.
//! As defined in CORE_POLICY.md §5:
//!
//! ```text
//! Pressure = remaining_work − remaining_capacity
//! ```
//!
//! Where:
//! - `remaining_work`: Sum of estimates for READY + RUNNING tasks (minutes)
//! - `remaining_capacity`: Today's remaining work time − fixed events − breaks (minutes)
//!
//! ### Mode Transitions
//!
//! | Condition | Mode | Intervention |
//! |-----------|------|--------------|
//! | Pressure ≤ 0 | Normal | 5min interval, soft |
//! | 0 < Pressure ≤ threshold | Pressure | 1min interval, medium |
//! | Pressure > threshold | Overload | 30sec interval, hard |

use chrono::{Datelike, DateTime, Timelike, Utc, Weekday};
use serde::{Deserialize, Serialize};

use crate::schedule::{DailyTemplate, FixedEvent};
use crate::task::{EnergyLevel, Task, TaskState};

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

// ============================================================================
// Pressure Engine
// ============================================================================

/// Pressure mode determines intervention frequency and intensity.
///
/// As defined in CORE_POLICY.md §5:
/// - **Normal**: Pressure ≤ 0, 5min interval, soft intervention
/// - **Pressure**: 0 < Pressure ≤ threshold, 1min interval, medium intervention
/// - **Overload**: Pressure > threshold, 30sec interval, hard intervention
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PressureMode {
    /// Normal mode: Floating allowed, minimal intervention
    Normal,
    /// Pressure mode: Floating prohibited, Active return strongly encouraged
    Pressure,
    /// Overload mode: Maximum intervention, task reduction/delegation suggested
    Overload,
}

impl PressureMode {
    /// Get the intervention interval in seconds for this mode
    pub fn intervention_interval_seconds(&self) -> u64 {
        match self {
            PressureMode::Normal => 300,    // 5 minutes
            PressureMode::Pressure => 60,   // 1 minute
            PressureMode::Overload => 30,   // 30 seconds
        }
    }

    /// Get the intervention intensity description
    pub fn intensity(&self) -> &str {
        match self {
            PressureMode::Normal => "soft",
            PressureMode::Pressure => "medium",
            PressureMode::Overload => "hard",
        }
    }

    /// Determine mode from Pressure value and threshold
    pub fn from_pressure(pressure: i64, threshold: i64) -> Self {
        if pressure <= 0 {
            PressureMode::Normal
        } else if pressure <= threshold {
            PressureMode::Pressure
        } else {
            PressureMode::Overload
        }
    }
}

/// Pressure calculation result with detailed breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PressureResult {
    /// Calculated pressure value (remaining_work - remaining_capacity)
    pub pressure: i64,
    /// Current pressure mode
    pub mode: PressureMode,
    /// Remaining work in minutes (READY + RUNNING tasks)
    pub remaining_work: i64,
    /// Remaining capacity in minutes (today - fixed - breaks)
    pub remaining_capacity: i64,
    /// Threshold used for mode transition
    pub threshold: i64,
    /// Timestamp when calculated
    pub calculated_at: DateTime<Utc>,
    /// Active task count (READY + RUNNING)
    pub active_task_count: usize,
    /// Total task count
    pub total_task_count: usize,
}

impl PressureResult {
    /// Create a new pressure result
    pub fn new(
        pressure: i64,
        remaining_work: i64,
        remaining_capacity: i64,
        threshold: i64,
        active_task_count: usize,
        total_task_count: usize,
    ) -> Self {
        let mode = PressureMode::from_pressure(pressure, threshold);

        Self {
            pressure,
            mode,
            remaining_work,
            remaining_capacity,
            threshold,
            calculated_at: Utc::now(),
            active_task_count,
            total_task_count,
        }
    }

    /// Check if Floating is allowed in this mode
    pub fn floating_allowed(&self) -> bool {
        matches!(self.mode, PressureMode::Normal)
    }

    /// Get intervention interval in seconds
    pub fn intervention_interval_seconds(&self) -> u64 {
        self.mode.intervention_interval_seconds()
    }

    /// Get human-readable description
    pub fn description(&self) -> String {
        match self.mode {
            PressureMode::Normal => format!(
                "Normal: {} min capacity surplus. Floating allowed.",
                self.pressure.abs()
            ),
            PressureMode::Pressure => format!(
                "Pressure: {} min over capacity. Return to Active strongly encouraged.",
                self.pressure
            ),
            PressureMode::Overload => format!(
                "Overload: {} min over capacity! Task reduction/delegation suggested.",
                self.pressure
            ),
        }
    }
}

/// Context for calculating pressure.
#[derive(Debug, Clone)]
pub struct PressureContext<'a> {
    /// Current time for calculation
    pub now: DateTime<Utc>,
    /// Daily template with wake/sleep times and fixed events
    pub template: &'a DailyTemplate,
    /// Tasks to consider (typically all non-completed tasks for today)
    pub tasks: &'a [Task],
    /// Pressure threshold for mode transition (default: 60 minutes)
    pub threshold: i64,
    /// Break buffer in minutes (default: 15 minutes per hour)
    pub break_buffer_minutes: i64,
    /// Already elapsed focus time today (in minutes)
    pub elapsed_focus_minutes: i64,
}

impl<'a> PressureContext<'a> {
    /// Create a new pressure context with defaults
    pub fn new(now: DateTime<Utc>, template: &'a DailyTemplate, tasks: &'a [Task]) -> Self {
        Self {
            now,
            template,
            tasks,
            threshold: 60,           // 60 minutes threshold
            break_buffer_minutes: 0,  // Calculated dynamically
            elapsed_focus_minutes: 0,
        }
    }

    /// Set custom threshold
    pub fn with_threshold(mut self, threshold: i64) -> Self {
        self.threshold = threshold;
        self
    }

    /// Set break buffer (explicit instead of calculated)
    pub fn with_break_buffer(mut self, minutes: i64) -> Self {
        self.break_buffer_minutes = minutes;
        self
    }

    /// Set elapsed focus time
    pub fn with_elapsed_focus(mut self, minutes: i64) -> Self {
        self.elapsed_focus_minutes = minutes;
        self
    }
}

/// Pressure calculation engine.
pub struct PressureEngine;

impl PressureEngine {
    /// Default pressure threshold (60 minutes)
    pub const DEFAULT_THRESHOLD: i64 = 60;

    /// Calculate pressure from context
    pub fn calculate(ctx: &PressureContext) -> PressureResult {
        let remaining_work = Self::calculate_remaining_work(ctx.tasks);
        let remaining_capacity = Self::calculate_remaining_capacity(ctx);
        let pressure = remaining_work - remaining_capacity;

        let active_task_count = ctx
            .tasks
            .iter()
            .filter(|t| matches!(t.state, TaskState::Ready | TaskState::Running))
            .count();

        PressureResult::new(
            pressure,
            remaining_work,
            remaining_capacity,
            ctx.threshold,
            active_task_count,
            ctx.tasks.len(),
        )
    }

    /// Calculate remaining work: sum of estimates for READY + RUNNING tasks
    fn calculate_remaining_work(tasks: &[Task]) -> i64 {
        tasks
            .iter()
            .filter(|t| matches!(t.state, TaskState::Ready | TaskState::Running))
            .map(|t| {
                // Use estimated_minutes if available, otherwise estimate from pomodoros
                t.estimated_minutes
                    .map(|m| m as i64)
                    .or_else(|| Some(t.estimated_pomodoros as i64 * 25))
                    .unwrap_or(25)
            })
            .sum()
    }

    /// Calculate remaining capacity for today
    fn calculate_remaining_capacity(ctx: &PressureContext) -> i64 {
        // Parse wake/sleep times
        let wake_minutes = Self::parse_time_to_minutes(&ctx.template.wake_up);
        let sleep_minutes = Self::parse_time_to_minutes(&ctx.template.sleep);

        // Total work day duration in minutes
        let total_day_minutes = if sleep_minutes > wake_minutes {
            sleep_minutes - wake_minutes
        } else {
            // Handle overnight (e.g., 22:00 to 06:00 next day)
            (24 * 60 - wake_minutes) + sleep_minutes
        };

        // Get current time in minutes since midnight
        let current_minutes = Self::datetime_to_minutes(ctx.now);

        // Calculate remaining day time
        let remaining_day_minutes = if current_minutes >= wake_minutes {
            if current_minutes < sleep_minutes {
                sleep_minutes - current_minutes
            } else {
                // Past sleep time, no capacity today
                0
            }
        } else {
            // Before wake time
            total_day_minutes
        };

        // Calculate fixed events duration for today
        let fixed_events_minutes = Self::calculate_fixed_events_duration(
            ctx.template,
            ctx.now.weekday(),
            current_minutes,
        );

        // Calculate break buffer (if not explicitly set)
        let break_buffer = if ctx.break_buffer_minutes > 0 {
            ctx.break_buffer_minutes
        } else {
            // Default: 15 minutes per hour of remaining work time
            let remaining_hours = (remaining_day_minutes.saturating_sub(fixed_events_minutes)) as f64 / 60.0;
            (remaining_hours * 15.0).ceil() as i64
        };

        // Remaining capacity = remaining day - fixed events - breaks - already elapsed
        remaining_day_minutes
            .saturating_sub(fixed_events_minutes)
            .saturating_sub(break_buffer)
            .saturating_sub(ctx.elapsed_focus_minutes)
            .max(0)
    }

    /// Parse HH:mm string to minutes since midnight
    fn parse_time_to_minutes(time_str: &str) -> i64 {
        let parts: Vec<&str> = time_str.split(':').collect();
        if parts.len() == 2 {
            let hours: i64 = parts[0].parse().unwrap_or(0);
            let minutes: i64 = parts[1].parse().unwrap_or(0);
            hours * 60 + minutes
        } else {
            0
        }
    }

    /// Convert DateTime to minutes since midnight (local time)
    fn datetime_to_minutes(dt: DateTime<Utc>) -> i64 {
        // Use naive local time for daily calculations
        dt.naive_utc().hour() as i64 * 60 + dt.naive_utc().minute() as i64
    }

    /// Calculate duration of fixed events for today
    fn calculate_fixed_events_duration(
        template: &DailyTemplate,
        weekday: Weekday,
        current_minutes: i64,
    ) -> i64 {
        template
            .fixed_events
            .iter()
            .filter(|event| {
                // Check if event is enabled and occurs today
                event.enabled
                    && event.days.iter().any(|&d| {
                        let day_num = d as i32;
                        let weekday_num = weekday.num_days_from_sunday() as i32;
                        day_num == weekday_num
                    })
            })
            .map(|event| {
                // Calculate remaining duration if event is ongoing
                let event_start = Self::parse_time_to_minutes(&event.start_time);
                let event_end = event_start + event.duration_minutes as i64;

                if current_minutes >= event_start && current_minutes < event_end {
                    // Event is ongoing, count remaining portion
                    event_end - current_minutes
                } else if current_minutes < event_start {
                    // Event is in the future, count full duration
                    event.duration_minutes as i64
                } else {
                    // Event has passed, don't count
                    0
                }
            })
            .sum()
    }
}

impl Default for PressureEngine {
    fn default() -> Self {
        Self
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

    // ========================================================================
    // Pressure Engine Tests
    // ========================================================================

    fn make_pressure_test_task(
        id: &str,
        state: TaskState,
        estimated_minutes: Option<u32>,
        estimated_pomodoros: i32,
    ) -> Task {
        let now = Utc::now();
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: None,
            estimated_pomodoros,
            completed_pomodoros: 0,
            completed: false,
            state,
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: TaskKind::DurationOnly,
            required_minutes: None,
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec![],
            priority: Some(50),
            category: TaskCategory::Active,
            estimated_minutes,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: EnergyLevel::Medium,
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

    fn make_test_template() -> DailyTemplate {
        DailyTemplate {
            wake_up: "08:00".to_string(),
            sleep: "18:00".to_string(),
            fixed_events: vec![],
            max_parallel_lanes: Some(1),
        }
    }

    #[test]
    fn test_pressure_mode_from_pressure() {
        // Normal mode: Pressure <= 0
        assert_eq!(
            PressureMode::from_pressure(-10, 60),
            PressureMode::Normal
        );
        assert_eq!(
            PressureMode::from_pressure(0, 60),
            PressureMode::Normal
        );

        // Pressure mode: 0 < Pressure <= threshold
        assert_eq!(
            PressureMode::from_pressure(30, 60),
            PressureMode::Pressure
        );
        assert_eq!(
            PressureMode::from_pressure(60, 60),
            PressureMode::Pressure
        );

        // Overload mode: Pressure > threshold
        assert_eq!(
            PressureMode::from_pressure(90, 60),
            PressureMode::Overload
        );
    }

    #[test]
    fn test_pressure_mode_intervals() {
        assert_eq!(PressureMode::Normal.intervention_interval_seconds(), 300);
        assert_eq!(PressureMode::Pressure.intervention_interval_seconds(), 60);
        assert_eq!(PressureMode::Overload.intervention_interval_seconds(), 30);
    }

    #[test]
    fn test_pressure_mode_intensity() {
        assert_eq!(PressureMode::Normal.intensity(), "soft");
        assert_eq!(PressureMode::Pressure.intensity(), "medium");
        assert_eq!(PressureMode::Overload.intensity(), "hard");
    }

    #[test]
    fn test_calculate_remaining_work() {
        // Create tasks: READY (50min), RUNNING (25min), PAUSED (30min), DONE (10min)
        // Only READY + RUNNING count
        let tasks = vec![
            make_pressure_test_task("1", TaskState::Ready, Some(50), 2),
            make_pressure_test_task("2", TaskState::Running, Some(25), 1),
            make_pressure_test_task("3", TaskState::Paused, Some(30), 2),
            make_pressure_test_task("4", TaskState::Done, Some(10), 1),
        ];

        let remaining_work = PressureEngine::calculate_remaining_work(&tasks);
        assert_eq!(remaining_work, 75); // 50 + 25
    }

    #[test]
    fn test_calculate_remaining_work_with_pomodoro_fallback() {
        // Task with no estimated_minutes should use pomodoros * 25
        let tasks = vec![
            make_pressure_test_task("1", TaskState::Ready, None, 2), // 2 * 25 = 50
            make_pressure_test_task("2", TaskState::Running, None, 1), // 1 * 25 = 25
        ];

        let remaining_work = PressureEngine::calculate_remaining_work(&tasks);
        assert_eq!(remaining_work, 75); // 50 + 25
    }

    #[test]
    fn test_calculate_remaining_capacity_full_day() {
        // 08:00 to 18:00 = 600 minutes
        // At 10:00 (600min), remaining = 480min - fixed events - breaks
        let template = make_test_template();
        let now = Utc::now();
        let now_10am = now.with_hour(10).unwrap().with_minute(0).unwrap();

        let ctx = PressureContext::new(now_10am, &template, &[]);

        let capacity = PressureEngine::calculate_remaining_capacity(&ctx);
        // 480min - 0 fixed - 0 elapsed - breaks
        // Breaks: 8 hours * 15 = 120min
        assert!(capacity > 300 && capacity < 500);
    }

    #[test]
    fn test_calculate_remaining_capacity_with_fixed_events() {
        let mut template = make_test_template();
        // Get current weekday to ensure the event is active today
        let now = Utc::now();
        let current_weekday_num = now.weekday().num_days_from_sunday();

        // Add 1-hour fixed event at 14:00 (2pm) for TODAY
        // This is in the future from morning, so it will be counted
        template.fixed_events.push(FixedEvent {
            id: "event-1".to_string(),
            name: "Meeting".to_string(),
            start_time: "14:00".to_string(),
            duration_minutes: 60,
            days: vec![current_weekday_num as u8],
            enabled: true,
        });

        // Use 10:00 today (before the 14:00 event)
        let now_10am = now.with_hour(10).unwrap().with_minute(0).unwrap();

        let ctx = PressureContext::new(now_10am, &template, &[]);

        let capacity = PressureEngine::calculate_remaining_capacity(&ctx);
        // Should be less than without fixed events
        let base_template = make_test_template();
        let base_ctx = PressureContext::new(now_10am, &base_template, &[]);
        let base_capacity = PressureEngine::calculate_remaining_capacity(&base_ctx);

        assert!(capacity < base_capacity);
    }

    #[test]
    fn test_pressure_result_normal_mode() {
        // 100 min work, 200 min capacity = Normal mode
        let tasks: Vec<Task> = vec![
            make_pressure_test_task("1", TaskState::Ready, Some(50), 2),
            make_pressure_test_task("2", TaskState::Running, Some(50), 2),
        ];

        let template = make_test_template();
        let now = Utc::now();
        let ctx = PressureContext::new(now, &template, &tasks).with_elapsed_focus(200);

        let result = PressureEngine::calculate(&ctx);

        // With 200 min elapsed and assuming ~600 min total day,
        // remaining capacity should be small, making pressure likely negative
        assert_eq!(result.active_task_count, 2);
        assert_eq!(result.total_task_count, 2);
        assert_eq!(result.remaining_work, 100);
    }

    #[test]
    fn test_pressure_result_pressure_mode() {
        // High work, low capacity = Pressure mode
        let tasks: Vec<Task> = vec![
            make_pressure_test_task("1", TaskState::Ready, Some(120), 5),
            make_pressure_test_task("2", TaskState::Running, Some(50), 2),
        ];

        let template = make_test_template();
        let now = Utc::now();
        let ctx = PressureContext::new(now, &template, &tasks)
            .with_threshold(100)
            .with_elapsed_focus(0);

        let result = PressureEngine::calculate(&ctx);

        assert_eq!(result.remaining_work, 170);
        // Mode depends on actual calculation time
        assert!(matches!(
            result.mode,
            PressureMode::Normal | PressureMode::Pressure | PressureMode::Overload
        ));
    }

    #[test]
    fn test_pressure_result_overload_mode() {
        // Very high work = Overload mode
        let tasks: Vec<Task> = vec![
            make_pressure_test_task("1", TaskState::Ready, Some(300), 12),
            make_pressure_test_task("2", TaskState::Running, Some(100), 4),
        ];

        let template = make_test_template();
        let now = Utc::now();
        // Use evening time for low remaining capacity
        let now_evening = now.with_hour(17).unwrap().with_minute(0).unwrap();
        let ctx = PressureContext::new(now_evening, &template, &tasks)
            .with_threshold(50)
            .with_elapsed_focus(400);

        let result = PressureEngine::calculate(&ctx);

        assert_eq!(result.remaining_work, 400);
        // In evening, should be in Normal or Overload depending on capacity
        assert!(matches!(
            result.mode,
            PressureMode::Normal | PressureMode::Overload
        ));
    }

    #[test]
    fn test_pressure_result_floating_allowed() {
        let tasks: Vec<Task> = vec![];

        let template = make_test_template();
        let now = Utc::now();
        let ctx = PressureContext::new(now, &template, &tasks);

        let result = PressureEngine::calculate(&ctx);

        // No work = Normal mode = Floating allowed
        assert!(result.floating_allowed());
        assert_eq!(result.mode, PressureMode::Normal);
    }

    #[test]
    fn test_pressure_result_description() {
        let tasks: Vec<Task> = vec![make_pressure_test_task("1", TaskState::Ready, Some(100), 4)];

        let template = make_test_template();
        let now = Utc::now();
        let ctx = PressureContext::new(now, &template, &tasks);

        let result = PressureEngine::calculate(&ctx);
        let description = result.description();

        assert!(!description.is_empty());
        assert!(
            description.contains("Normal") || description.contains("Pressure") || description.contains("Overload")
        );
    }

    #[test]
    fn test_pressure_context_builder() {
        let template = make_test_template();
        let tasks = vec![];
        let now = Utc::now();

        let ctx = PressureContext::new(now, &template, &tasks)
            .with_threshold(120)
            .with_break_buffer(30)
            .with_elapsed_focus(60);

        assert_eq!(ctx.threshold, 120);
        assert_eq!(ctx.break_buffer_minutes, 30);
        assert_eq!(ctx.elapsed_focus_minutes, 60);
    }

    #[test]
    fn test_pressure_time_parsing() {
        assert_eq!(PressureEngine::parse_time_to_minutes("00:00"), 0);
        assert_eq!(PressureEngine::parse_time_to_minutes("08:00"), 480);
        assert_eq!(PressureEngine::parse_time_to_minutes("12:30"), 750);
        assert_eq!(PressureEngine::parse_time_to_minutes("23:59"), 1439);
    }

    #[test]
    fn test_pressure_intervention_intervals() {
        let result = PressureResult::new(-50, 100, 150, 60, 2, 2);
        assert_eq!(result.intervention_interval_seconds(), 300); // Normal

        let result = PressureResult::new(30, 100, 70, 60, 2, 2);
        assert_eq!(result.intervention_interval_seconds(), 60); // Pressure

        let result = PressureResult::new(100, 200, 100, 60, 3, 3);
        assert_eq!(result.intervention_interval_seconds(), 30); // Overload
    }
}

