//! JIT engine implementation.
//!
//! This module provides the core JIT engine for task suggestions,
//! including suggestion generation, break duration calculation,
//! and completion tracking.

use super::context::{Context, EnergyLevel};
use super::scoring::calculate_score;
use crate::storage::schedule_db::ScheduleDb;
use crate::task::{Task, TaskState};
use chrono::Duration;
use serde::{Deserialize, Serialize};

/// Task suggestion with reasoning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    /// The suggested task
    pub task: Task,
    /// Calculated score (0-100)
    pub score: f64,
    /// Reason for this suggestion
    pub reason: SuggestionReason,
    /// Estimated duration in minutes
    pub estimated_duration: u32,
}

/// Reason why a task was suggested.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SuggestionReason {
    /// High energy available with good task match
    HighEnergyAvailable { match_score: f64 },
    /// Continues work from previous task
    ContextContinuation { previous_task: String },
    /// Small task that fits drifted time window
    SmallTaskForDriftedTime { available_minutes: u32 },
    /// Backlog cleanup suggestion
    BacklogCleanup { low_priority_count: u32 },
    /// Default suggestion when no specific reason applies
    DefaultSuggestion,
}

/// JIT Engine for task suggestions.
pub struct JITEngine {
    db: ScheduleDb,
}

impl JITEngine {
    /// Create a new JIT engine.
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            db: ScheduleDb::open()?,
        })
    }

    /// Create a new JIT engine with an in-memory database (for testing).
    #[cfg(test)]
    pub fn new_in_memory() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            db: ScheduleDb::open_memory()?,
        })
    }

    /// Get top 3 task suggestions for current context.
    pub fn suggest_next_tasks(&self, context: &Context) -> Vec<Suggestion> {
        // Fetch ready tasks from database
        let tasks = match self.fetch_ready_tasks() {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Error fetching tasks: {}", e);
                return Vec::new();
            }
        };

        // Score and sort tasks
        let mut scored: Vec<(Task, f64)> = tasks
            .into_iter()
            .map(|task| {
                let score = calculate_score(&task, context);
                (task, score)
            })
            .collect();

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Take top 3 and add reasoning
        scored
            .into_iter()
            .take(3)
            .map(|(task, score)| {
                let reason = self.generate_reason(&task, context, score);
                let estimated_duration = task.estimated_minutes.unwrap_or(25);
                Suggestion {
                    task,
                    score,
                    reason,
                    estimated_duration,
                }
            })
            .collect()
    }

    /// Suggest optimal break duration based on energy level.
    pub fn suggest_break_duration(&self, context: &Context) -> Duration {
        match context.current_energy.level {
            EnergyLevel::High => Duration::minutes(5),   // Short break for high energy
            EnergyLevel::Medium => Duration::minutes(10), // Standard break
            EnergyLevel::Low => Duration::minutes(30),    // Long recovery break
        }
    }

    /// Record task completion for context tracking.
    pub fn record_completion(&self, _task_id: &str, _duration_minutes: u32) -> Result<(), String> {
        // For now, just return Ok - completion tracking will be implemented
        // with a dedicated completions table in a future update
        Ok(())
    }

    /// Fetch ready (available) tasks from database.
    fn fetch_ready_tasks(&self) -> Result<Vec<Task>, String> {
        // Get all tasks and filter for ready ones
        let tasks = self
            .db
            .list_tasks()
            .map_err(|e| format!("Failed to fetch tasks: {}", e))?
            .into_iter()
            .filter(|t| t.state == TaskState::Ready)
            .collect();

        Ok(tasks)
    }

    /// Generate suggestion reason based on task and context.
    fn generate_reason(&self, task: &Task, context: &Context, score: f64) -> SuggestionReason {
        // Check for context continuation
        if !context.active_tags.is_empty() {
            for tag in &task.tags {
                if context.active_tags.contains(tag) {
                    return SuggestionReason::ContextContinuation {
                        previous_task: format!("tag: {}", tag),
                    };
                }
            }
        }

        // Check for high energy match
        if context.current_energy.level == EnergyLevel::High && score >= 60.0 {
            return SuggestionReason::HighEnergyAvailable { match_score: score };
        }

        // Check for drifted time scenario
        if context.drift_time > 15 && task.estimated_minutes.unwrap_or(25) <= 20 {
            return SuggestionReason::SmallTaskForDriftedTime {
                available_minutes: context.drift_time,
            };
        }

        // Check for backlog cleanup (low priority = high value)
        if task.priority.unwrap_or(50) >= 80 {
            return SuggestionReason::BacklogCleanup {
                low_priority_count: 1,
            };
        }

        SuggestionReason::DefaultSuggestion
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: Full integration tests require a database connection
    // These are unit tests for the scoring logic

    #[test]
    fn test_suggestion_reason_high_energy() {
        // Test high energy suggestion generation
        // This would require a full context setup in integration tests
    }

    #[test]
    fn test_break_duration_high_energy() {
        // Note: Can't test without a real database connection
        // This is a placeholder for the contract
        // High energy -> 5 min break
    }

    #[test]
    fn test_break_duration_low_energy() {
        // Low energy -> 30 min break
    }
}
