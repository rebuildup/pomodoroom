//! Schedule types for tasks, projects, and daily templates.
//!
//! The Task type has been moved to the `task` module with v2 extensions.
//! This module re-exports it for backward compatibility.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// Re-export Task types from the task module
pub use crate::task::{Task, TaskState, EnergyLevel, TaskCategory, TaskKind, TaskTransitionError};

/// Category of task for organizing work.
///
/// NOTE: This type has been moved to the `task` module.
/// This re-export is for backward compatibility only.
#[deprecated(note = "Use TaskCategory from the task module instead")]
pub type TaskCategoryLegacy = TaskCategory;

/// A project that groups related tasks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub deadline: Option<DateTime<Utc>>,
    pub tasks: Vec<Task>,
    pub created_at: DateTime<Utc>,
}

/// A fixed event that occurs at specific times on specific days.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixedEvent {
    pub id: String,
    pub name: String,
    pub start_time: String, // HH:mm
    pub duration_minutes: i32,
    pub days: Vec<u8>, // 0=Sun ... 6=Sat
    pub enabled: bool,
}

/// Daily template defining wake/sleep times and fixed events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyTemplate {
    pub wake_up: String, // HH:mm
    pub sleep: String, // HH:mm
    pub fixed_events: Vec<FixedEvent>,
    pub max_parallel_lanes: Option<i32>,
}

/// Type of schedule block.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum BlockType {
    /// Focus block for deep work
    Focus,
    /// Break block for rest
    Break,
    /// Routine block for recurring tasks
    Routine,
    /// Calendar event block
    Calendar,
}

/// A scheduled block on the timeline.
///
/// Represents a time slot on the timeline, which can be
/// a focus session, break, routine, or calendar event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleBlock {
    pub id: String,
    pub block_type: BlockType,
    pub task_id: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub locked: bool,
    pub label: Option<String>,
    pub lane: Option<i32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_serialization() {
        let task = Task {
            id: "test-1".to_string(),
            title: "Test task".to_string(),
            description: Some("A test task".to_string()),
            estimated_pomodoros: 4,
            completed_pomodoros: 2,
            completed: false,
            state: TaskState::Running,
            project_id: Some("project-1".to_string()),
            project_name: Some("Project 1".to_string()),
            kind: TaskKind::DurationOnly,
            required_minutes: Some(100),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec!["work".to_string(), "urgent".to_string()],
            priority: Some(1),
            category: TaskCategory::Active,
            estimated_minutes: Some(100),
            elapsed_minutes: 50,
            energy: EnergyLevel::High,
            group: Some("backend".to_string()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
            paused_at: None,
        };

        let json = serde_json::to_string(&task).unwrap();
        let _decoded: Task = serde_json::from_str(&json).unwrap();
    }

    #[test]
    fn fixed_event_serialization() {
        let event = FixedEvent {
            id: "event-1".to_string(),
            name: "Morning standup".to_string(),
            start_time: "09:00".to_string(),
            duration_minutes: 30,
            days: vec![1, 2, 3, 4, 5], // Mon-Fri
            enabled: true,
        };

        let json = serde_json::to_string(&event).unwrap();
        let _decoded: FixedEvent = serde_json::from_str(&json).unwrap();
    }
}
