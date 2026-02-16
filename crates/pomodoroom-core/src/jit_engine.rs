//! Just-In-Time (JIT) Task Engine
//!
//! This module replaces the Gantt-style scheduler with an event-driven engine
//! that calculates optimal next tasks on demand rather than pre-computing schedules.
//!
//! ## Design Philosophy
//!
//! - No future prediction: Calculate based on current state only
//! - Event-driven: React to task completion, interruptions, etc.
//! - Energy-aware: Consider current energy level and task requirements
//! - Context-aware: Use recent history to inform decisions
//!
//! ## Usage
//!
//! ```ignore
//! let engine = JitEngine::new();
//! let suggestions = engine.suggest_next_tasks(&context, &tasks);
//! let break_duration = engine.suggest_break_duration(&context);
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::task::{EnergyLevel, Task, TaskCategory, TaskState};

/// Current context for JIT calculations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitContext {
    /// Current energy level (0-100)
    pub energy: u8,
    /// Time since last break (minutes)
    pub time_since_last_break_min: u64,
    /// Currently running task (if any)
    pub current_task: Option<TaskSummary>,
    /// Number of completed focus sessions today
    pub completed_sessions: u32,
    /// Current timestamp for context
    pub now: DateTime<Utc>,
}

/// Summary of a task for suggestion purposes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSummary {
    pub id: String,
    pub title: String,
    pub required_minutes: Option<u32>,
    pub energy: EnergyLevel,
    pub priority: i32,
}

impl Task {
    /// Convert to TaskSummary for JIT engine
    pub fn to_summary(&self) -> TaskSummary {
        TaskSummary {
            id: self.id.clone(),
            title: self.title.clone(),
            required_minutes: self.required_minutes,
            energy: self.energy,
            priority: self.priority.unwrap_or(50),
        }
    }
}

/// Suggested task with priority score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSuggestion {
    pub task: TaskSummary,
    /// Higher is better (0-100)
    pub score: u8,
    /// Reason for this suggestion
    pub reason: SuggestionReason,
}

/// Why this task was suggested
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionReason {
    /// Highest priority ready task
    HighPriority,
    /// Matches current energy level
    EnergyMatch,
    /// Quick win (short duration)
    QuickWin,
    /// Most recently deferred
    RecentlyDeferred,
    /// Part of active project
    ActiveProject,
}

/// JIT Engine for calculating next tasks on demand
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitEngine {
    /// Focus duration for Pomodoro (minutes)
    pub focus_duration: u32,
    /// Short break duration (minutes)
    pub short_break: u32,
    /// Long break duration (minutes)
    pub long_break: u32,
    /// Pomodoros before long break
    pub pomodoros_before_long_break: u32,
}

impl Default for JitEngine {
    fn default() -> Self {
        Self {
            focus_duration: 25,
            short_break: 5,
            long_break: 15,
            pomodoros_before_long_break: 4,
        }
    }
}

impl JitEngine {
    /// Create a new JIT engine with default settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Create with custom settings
    pub fn with_settings(
        focus_duration: u32,
        short_break: u32,
        long_break: u32,
        pomodoros_before_long_break: u32,
    ) -> Self {
        Self {
            focus_duration,
            short_break,
            long_break,
            pomodoros_before_long_break,
        }
    }

    /// Calculate next 3 tasks based on current context
    ///
    /// # Arguments
    /// * `context` - Current execution context
    /// * `tasks` - All available tasks
    ///
    /// # Returns
    /// Up to 3 task suggestions, sorted by score
    pub fn suggest_next_tasks(
        &self,
        context: &JitContext,
        tasks: &[Task],
    ) -> Vec<TaskSuggestion> {
        // Filter to READY tasks only (active category, not done)
        let ready_tasks: Vec<_> = tasks
            .iter()
            .filter(|t| t.state == TaskState::Ready && t.category == TaskCategory::Active)
            .collect();

        if ready_tasks.is_empty() {
            return Vec::new();
        }

        // Score each task based on multiple factors
        let mut suggestions: Vec<TaskSuggestion> = ready_tasks
            .iter()
            .map(|task| self.score_task(context, task))
            .collect();

        // Sort by score (descending)
        suggestions.sort_by(|a, b| b.score.cmp(&a.score));

        // Return top 3
        suggestions.truncate(3);
        suggestions
    }

    /// Calculate optimal break duration based on context
    ///
    /// # Arguments
    /// * `context` - Current execution context
    ///
    /// # Returns
    /// Suggested break duration in minutes
    pub fn suggest_break_duration(&self, context: &JitContext) -> u32 {
        // Determine if long break is needed
        let needs_long_break = context.completed_sessions % self.pomodoros_before_long_break == 0
            && context.completed_sessions > 0;

        if needs_long_break {
            self.long_break
        } else {
            self.short_break
        }
    }

    /// Calculate whether user should take a break now
    ///
    /// # Arguments
    /// * `context` - Current execution context
    ///
    /// # Returns
    /// true if break is recommended
    pub fn should_take_break(&self, context: &JitContext) -> bool {
        // Suggest break if:
        // - Energy is low (< 30)
        // - Been working for > 2 hours without break
        // - Just completed 4 pomodoros (long break cycle)
        let energy_low = context.energy < 30;
        let long_work_session = context.time_since_last_break_min > 120;
        let long_break_cycle = context.completed_sessions % self.pomodoros_before_long_break == 0
            && context.completed_sessions > 0;

        energy_low || long_work_session || long_break_cycle
    }

    /// Score a single task based on context
    fn score_task(&self, context: &JitContext, task: &Task) -> TaskSuggestion {
        let mut score: u8 = 50; // Base score
        let mut reason = SuggestionReason::HighPriority;

        // Energy match: +20 if task energy matches current energy level
        let energy_match = match context.energy {
            0..=30 => task.energy == EnergyLevel::Low,
            31..=70 => task.energy == EnergyLevel::Medium,
            71..=100 => task.energy == EnergyLevel::High,
            _ => task.energy == EnergyLevel::Medium, // default
        };
        if energy_match {
            score = score.saturating_add(20);
            reason = SuggestionReason::EnergyMatch;
        }

        // Priority influence: +30 for high priority tasks (>70)
        let priority = task.priority.unwrap_or(50);
        if priority > 70 {
            score = score.saturating_add(30);
            reason = SuggestionReason::HighPriority;
        } else if priority < 30 {
            score = score.saturating_sub(20);
        }

        // Quick win: +15 for tasks < 15 minutes
        if let Some(req) = task.required_minutes {
            if req < 15 {
                score = score.saturating_add(15);
                reason = SuggestionReason::QuickWin;
            } else if req > 60 {
                score = score.saturating_sub(10);
            }
        }

        // Round up to multiple of 5 for cleaner scores
        score = ((score + 2) / 5) * 5;

        TaskSuggestion {
            task: task.to_summary(),
            score,
            reason,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jit_engine_creation() {
        let engine = JitEngine::new();
        assert_eq!(engine.focus_duration, 25);
        assert_eq!(engine.short_break, 5);
    }

    #[test]
    fn test_suggest_break_duration() {
        let engine = JitEngine::new();
        let context = JitContext {
            energy: 50,
            time_since_last_break_min: 30,
            current_task: None,
            completed_sessions: 2,
            now: Utc::now(),
        };

        // After 2 sessions, still need short break
        assert_eq!(engine.suggest_break_duration(&context), 5);

        // After 4 sessions, need long break
        let context_long = JitContext {
            completed_sessions: 4,
            ..context
        };
        assert_eq!(engine.suggest_break_duration(&context_long), 15);
    }

    #[test]
    fn test_should_take_break() {
        let engine = JitEngine::new();
        let context = JitContext {
            energy: 20, // Low energy
            time_since_last_break_min: 30,
            current_task: None,
            completed_sessions: 1,
            now: Utc::now(),
        };

        assert!(engine.should_take_break(&context));
    }
}
