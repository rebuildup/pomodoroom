//! JIT context tracking.
//!
//! This module provides the current execution context for JIT suggestions,
//! including energy level, recent tasks, and drift time.

use chrono::{DateTime, Utc, Timelike};
use serde::{Deserialize, Serialize};

/// Energy level (0-100)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Energy {
    /// Current energy level
    pub level: EnergyLevel,
    /// Accumulated fatigue (break debt)
    pub drift_debt: u32, // minutes of accumulated overwork
}

impl Energy {
    /// Create a new energy state.
    pub fn new(level: EnergyLevel, drift_debt: u32) -> Self {
        Self { level, drift_debt }
    }

    /// Get energy as a numeric value (0-100).
    pub fn as_value(&self) -> u32 {
        let base: u32 = match self.level {
            EnergyLevel::High => 80,
            EnergyLevel::Medium => 50,
            EnergyLevel::Low => 20,
        };
        // Reduce by drift debt (1 minute debt = 1 point reduction)
        base.saturating_sub(self.drift_debt)
    }

    /// Apply energy recovery (reduce drift debt).
    pub fn recover(&mut self, duration_minutes: u32) {
        self.drift_debt = self.drift_debt.saturating_sub(duration_minutes);
    }

    /// Apply energy drain (increase drift debt).
    pub fn drain(&mut self, duration_minutes: u32) {
        self.drift_debt += duration_minutes;
        // Reduce level if drift debt exceeds threshold
        if self.drift_debt > 30 && self.level == EnergyLevel::High {
            self.level = EnergyLevel::Medium;
        } else if self.drift_debt > 60 && self.level == EnergyLevel::Medium {
            self.level = EnergyLevel::Low;
        }
    }
}

/// Energy level classification
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum EnergyLevel {
    Low,
    Medium,
    High,
}

impl EnergyLevel {
    /// Parse from energy value (0-100).
    pub fn from_value(value: u32) -> Self {
        if value >= 70 {
            EnergyLevel::High
        } else if value >= 40 {
            EnergyLevel::Medium
        } else {
            EnergyLevel::Low
        }
    }

    /// Get display name.
    pub fn name(&self) -> &str {
        match self {
            EnergyLevel::Low => "low",
            EnergyLevel::Medium => "medium",
            EnergyLevel::High => "high",
        }
    }
}

/// Record of a completed task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCompletion {
    /// Task ID
    pub task_id: String,
    /// Task title
    pub title: String,
    /// Completed at
    pub completed_at: DateTime<Utc>,
    /// Duration taken (minutes)
    pub duration_minutes: u32,
    /// Primary tag (if any)
    pub tag: Option<String>,
}

/// Hour of day (0-23)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Hour(pub u8);

impl Hour {
    /// Get current hour.
    pub fn now() -> Self {
        Self(Utc::now().hour() as u8)
    }

    /// Check if this is morning (6-12).
    pub fn is_morning(&self) -> bool {
        (6..=12).contains(&self.0)
    }

    /// Check if this is afternoon (12-18).
    pub fn is_afternoon(&self) -> bool {
        (12..=18).contains(&self.0)
    }

    /// Check if this is evening (18-24).
    pub fn is_evening(&self) -> bool {
        (18..24).contains(&self.0) || self.0 == 0
    }
}

/// Current execution context for JIT suggestions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    /// Current energy state
    pub current_energy: Energy,
    /// Recently completed tasks (last 10)
    pub recent_tasks: Vec<TaskCompletion>,
    /// Time since last active work (drift time in minutes)
    pub drift_time: u32,
    /// Current time of day
    pub time_of_day: Hour,
    /// Active tags (from recent tasks)
    pub active_tags: Vec<String>,
    /// Active projects (from recent tasks)
    pub active_projects: Vec<String>,
}

impl Context {
    /// Create a new default context.
    pub fn new() -> Self {
        Self {
            current_energy: Energy::new(EnergyLevel::Medium, 0),
            recent_tasks: Vec::new(),
            drift_time: 0,
            time_of_day: Hour::now(),
            active_tags: Vec::new(),
            active_projects: Vec::new(),
        }
    }

    /// Get context from database state.
    pub fn from_db(
        recent_tasks: Vec<TaskCompletion>,
        drift_time_minutes: u32,
    ) -> Self {
        let mut active_tags = Vec::new();
        let active_projects = Vec::new();

        // Extract tags and projects from recent completions
        for task in &recent_tasks {
            if let Some(ref tag) = task.tag {
                if !active_tags.contains(tag) {
                    active_tags.push(tag.clone());
                }
            }
            // TODO: Extract projects when task has project_ids
        }

        Self {
            current_energy: Energy::new(EnergyLevel::Medium, drift_time_minutes),
            recent_tasks,
            drift_time: drift_time_minutes,
            time_of_day: Hour::now(),
            active_tags,
            active_projects,
        }
    }

    /// Update energy based on completed work.
    pub fn apply_work(&mut self, duration_minutes: u32) {
        self.current_energy.drain(duration_minutes);
    }

    /// Update energy based on break taken.
    pub fn apply_break(&mut self, duration_minutes: u32) {
        self.current_energy.recover(duration_minutes);
        // Reset drift time on break
        self.drift_time = 0;
    }

    /// Add a completed task to the context.
    pub fn add_completion(&mut self, completion: TaskCompletion) {
        self.recent_tasks.insert(0, completion);
        // Keep only last 10
        if self.recent_tasks.len() > 10 {
            self.recent_tasks.truncate(10);
        }
        // Update active tags/projects
        self.update_active_context();
    }

    /// Update active tags and projects from recent tasks.
    fn update_active_context(&mut self) {
        let mut active_tags = Vec::new();
        let active_projects = Vec::new();

        // Use last 5 tasks for active context
        for task in self.recent_tasks.iter().take(5) {
            if let Some(ref tag) = task.tag {
                if !active_tags.contains(tag) {
                    active_tags.push(tag.clone());
                }
            }
            // TODO: Extract projects
        }

        self.active_tags = active_tags;
        self.active_projects = active_projects;
    }
}

impl Default for Context {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_energy_new() {
        let energy = Energy::new(EnergyLevel::High, 0);
        assert_eq!(energy.level, EnergyLevel::High);
        assert_eq!(energy.drift_debt, 0);
    }

    #[test]
    fn test_energy_drain() {
        let mut energy = Energy::new(EnergyLevel::High, 0);
        energy.drain(10);
        assert_eq!(energy.drift_debt, 10);
        assert_eq!(energy.level, EnergyLevel::High); // Still high at 10 debt

        energy.drain(30);
        assert_eq!(energy.drift_debt, 40);
        assert_eq!(energy.level, EnergyLevel::Medium); // Drops to medium
    }

    #[test]
    fn test_energy_recover() {
        let mut energy = Energy::new(EnergyLevel::Medium, 30);
        energy.recover(10);
        assert_eq!(energy.drift_debt, 20);
    }

    #[test]
 fn test_energy_from_value() {
        assert_eq!(EnergyLevel::from_value(80), EnergyLevel::High);
        assert_eq!(EnergyLevel::from_value(50), EnergyLevel::Medium);
        assert_eq!(EnergyLevel::from_value(20), EnergyLevel::Low);
    }

    #[test]
    fn test_hour_now() {
        let hour = Hour::now();
        assert!(hour.0 < 24);
    }

    #[test]
    fn test_hour_time_of_day() {
        let hour_morning = Hour(8);
        let hour_afternoon = Hour(14);
        let hour_evening = Hour(20);

        assert!(hour_morning.is_morning());
        assert!(hour_afternoon.is_afternoon());
        assert!(hour_evening.is_evening());
    }

    #[test]
    fn test_context_new() {
        let ctx = Context::new();
        assert_eq!(ctx.recent_tasks.len(), 0);
        assert_eq!(ctx.drift_time, 0);
        assert_eq!(ctx.active_tags.len(), 0);
    }

    #[test]
    fn test_context_apply_work() {
        let mut ctx = Context::new();
        ctx.apply_work(25);
        assert_eq!(ctx.current_energy.drift_debt, 25);
        assert_eq!(ctx.drift_time, 0);
    }

    #[test]
    fn test_context_apply_break() {
        let mut ctx = Context::new();
        ctx.current_energy = Energy::new(EnergyLevel::Medium, 30);
        ctx.apply_break(10);
        assert_eq!(ctx.current_energy.drift_debt, 20);
        assert_eq!(ctx.drift_time, 0); // Reset
    }

    #[test]
    fn test_context_add_completion() {
        let mut ctx = Context::new();
        let completion = TaskCompletion {
            task_id: "task-1".to_string(),
            title: "Test task".to_string(),
            completed_at: Utc::now(),
            duration_minutes: 25,
            tag: Some("work".to_string()),
        };

        ctx.add_completion(completion);
        assert_eq!(ctx.recent_tasks.len(), 1);
        assert_eq!(ctx.active_tags, vec!["work"]);
    }

    #[test]
    fn test_context_max_recent_tasks() {
        let mut ctx = Context::new();
        for i in 0..15 {
            ctx.add_completion(TaskCompletion {
                task_id: format!("task-{}", i),
                title: format!("Task {}", i),
                completed_at: Utc::now(),
                duration_minutes: 25,
                tag: Some("test".to_string()),
            });
        }
        assert_eq!(ctx.recent_tasks.len(), 10); // Max 10
    }
}
