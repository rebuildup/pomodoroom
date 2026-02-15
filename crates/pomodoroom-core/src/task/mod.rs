//! Task types for v2 redesign with Anchor/Ambient model.
//!
//! This module extends the original schedule.Task with additional properties
//! for state transitions, energy levels, and time tracking.

pub mod micro_merge;
pub mod split_templates;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Task state enumeration.
///
/// States follow strict transitions as defined in docs/ui-redesign-strategy.md:
///
///   READY ─────────> RUNNING ─────────> DONE
///     ^     先送り      |    延長(タイマーリセット)
///     |   (優先度下げ)  |       ↓
///     |                 +───> RUNNING
///     |     中断
///     |      |
///     |      v       再開
///     |   PAUSED ─────────> RUNNING
///     |
///     +----- (初期状態 / タスク作成時)
///
/// Valid transitions:
/// - READY → RUNNING (開始/start)
/// - READY → READY (先送り/defer - priority down)
/// - RUNNING → DONE (完了/complete)
/// - RUNNING → RUNNING (延長/extend - timer reset)
/// - RUNNING → PAUSED (中断/pause)
/// - PAUSED → RUNNING (再開/resume)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum TaskState {
    /// Task is ready to start (initial state / task creation)
    Ready,
    /// Task is currently running
    Running,
    /// Task is paused (temporarily stopped)
    Paused,
    /// Task is completed (terminal state)
    Done,
}

impl TaskState {
    /// Check if a transition is valid.
    pub fn can_transition_to(&self, to: &TaskState) -> bool {
        match self {
            TaskState::Ready => matches!(to, TaskState::Running | TaskState::Ready),
            TaskState::Running => matches!(
                to,
                TaskState::Done | TaskState::Running | TaskState::Paused | TaskState::Ready
            ),
            TaskState::Paused => matches!(to, TaskState::Running),
            TaskState::Done => false, // Terminal state
        }
    }

    /// Get valid next states for this state.
    pub fn valid_transitions(&self) -> &[TaskState] {
        match self {
            TaskState::Ready => &[TaskState::Running, TaskState::Ready],
            TaskState::Running => &[
                TaskState::Done,
                TaskState::Running,
                TaskState::Paused,
                TaskState::Ready,
            ],
            TaskState::Paused => &[TaskState::Running],
            TaskState::Done => &[],
        }
    }
}

impl Default for TaskState {
    fn default() -> Self {
        TaskState::Ready
    }
}

/// Energy level for task scheduling.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnergyLevel {
    /// Low energy (e.g., end of day)
    Low,
    /// Medium energy (default)
    Medium,
    /// High energy (e.g., morning)
    High,
}

impl Default for EnergyLevel {
    fn default() -> Self {
        EnergyLevel::Medium
    }
}

/// Kind of task scheduling semantics.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    /// Absolute-time event with fixed start/end.
    FixedEvent,
    /// Task with flexible execution window and required duration.
    FlexWindow,
    /// Duration-only task without explicit time bounds.
    DurationOnly,
    /// Break task counted as a task item.
    Break,
}

impl Default for TaskKind {
    fn default() -> Self {
        TaskKind::DurationOnly
    }
}

/// Category of task for organizing work.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskCategory {
    /// Active tasks that should be scheduled now.
    Active,
    /// Someday/maybe tasks for future consideration.
    Someday,
}

impl Default for TaskCategory {
    fn default() -> Self {
        TaskCategory::Active
    }
}

/// Task for v2 redesign with Anchor/Ambient support.
///
/// Extends the original schedule.Task with:
/// - state (TaskState)
/// - estimated_minutes / elapsed_minutes (time tracking)
/// - energy (for scheduling)
/// - group (for task grouping)
/// - updated_at / completed_at / paused_at (timestamps)
/// - project_name (vs project_id)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    /// Unique identifier
    pub id: String,
    /// Task title
    pub title: String,
    /// Optional description
    pub description: Option<String>,
    /// Estimated number of pomodoros (1 pomodoro = 25 min)
    pub estimated_pomodoros: i32,
    /// Number of completed pomodoros
    pub completed_pomodoros: i32,
    /// Whether the task is completed
    pub completed: bool,
    /// Task state for state transition management
    pub state: TaskState,
    /// Optional project ID
    pub project_id: Option<String>,
    /// Optional project name (for display)
    pub project_name: Option<String>,
    /// Multiple projects to which the task belongs
    #[serde(default)]
    pub project_ids: Vec<String>,
    /// Immutable task kind selected at creation.
    pub kind: TaskKind,
    /// Required duration in minutes for scheduling.
    pub required_minutes: Option<u32>,
    /// Fixed start timestamp for absolute-time events.
    pub fixed_start_at: Option<DateTime<Utc>>,
    /// Fixed end timestamp for absolute-time events.
    pub fixed_end_at: Option<DateTime<Utc>>,
    /// Flexible window start bound.
    pub window_start_at: Option<DateTime<Utc>>,
    /// Flexible window end bound.
    pub window_end_at: Option<DateTime<Utc>>,
    /// Tags for categorization
    pub tags: Vec<String>,
    /// Priority value (0-100, null for default priority of 50, negative for deferred)
    pub priority: Option<i32>,
    /// Task category (active/someday)
    pub category: TaskCategory,
    /// Estimated duration in minutes (null if not set)
    pub estimated_minutes: Option<u32>,
    /// Estimated start timestamp (ISO/RFC3339)
    pub estimated_start_at: Option<DateTime<Utc>>,
    /// Elapsed time in minutes
    pub elapsed_minutes: u32,
    /// Energy level for scheduling
    pub energy: EnergyLevel,
    /// Optional group name for task grouping
    pub group: Option<String>,
    /// Multiple groups for the task
    #[serde(default)]
    pub group_ids: Vec<String>,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
    /// Completion timestamp (null if not completed)
    pub completed_at: Option<DateTime<Utc>>,
    /// Pause timestamp (null if not paused) - for ambient display
    pub paused_at: Option<DateTime<Utc>>,
    /// Integration service name (e.g., "google_tasks", "notion", "linear")
    pub source_service: Option<String>,
    /// External task ID from the integration service (for deduplication)
    pub source_external_id: Option<String>,
    /// Parent task ID when this task is a split segment.
    pub parent_task_id: Option<String>,
    /// Sequence index for split segments under the same parent.
    pub segment_order: Option<i32>,
}

impl Task {
    /// Create a new task with default values.
    pub fn new(title: impl Into<String>) -> Self {
        let now = Utc::now();
        Task {
            id: format!("task-{}-{}", now.timestamp(), uuid::Uuid::new_v4()),
            title: title.into(),
            description: None,
            estimated_pomodoros: 1,
            completed_pomodoros: 0,
            completed: false,
            state: TaskState::Ready,
            project_id: None,
            project_name: None,
            project_ids: Vec::new(),
            kind: TaskKind::DurationOnly,
            required_minutes: None,
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: Vec::new(),
            priority: None,
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: EnergyLevel::Medium,
            group: None,
            group_ids: Vec::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
        }
    }

    /// Transition to a new state.
    ///
    /// Returns an error if the transition is invalid.
    pub fn transition_to(&mut self, new_state: TaskState) -> Result<(), TaskTransitionError> {
        if !self.state.can_transition_to(&new_state) {
            return Err(TaskTransitionError {
                from: self.state,
                to: new_state,
            });
        }

        let now = Utc::now();

        // Update timestamps based on state
        match new_state {
            TaskState::Done => {
                self.completed = true;
                self.completed_at = Some(now);
                self.paused_at = None;
            }
            TaskState::Paused => {
                self.paused_at = Some(now);
            }
            TaskState::Running => {
                self.paused_at = None;
            }
            TaskState::Ready => {
                // Reset pause timestamp when deferring
                self.paused_at = None;
            }
        }

        self.state = new_state;
        self.updated_at = now;
        Ok(())
    }

    /// Update elapsed minutes.
    pub fn add_elapsed_minutes(&mut self, minutes: u32) {
        self.elapsed_minutes += minutes;
        self.updated_at = Utc::now();
    }

    /// Calculate completion percentage (0.0 to 1.0).
    pub fn completion_percentage(&self) -> f64 {
        if self.estimated_pomodoros == 0 {
            0.0
        } else {
            (self.completed_pomodoros as f64 / self.estimated_pomodoros as f64).min(1.0)
        }
    }
}

impl Default for Task {
    fn default() -> Self {
        Task::new("")
    }
}

/// Error returned when an invalid state transition is attempted.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskTransitionError {
    pub from: TaskState,
    pub to: TaskState,
}

impl std::fmt::Display for TaskTransitionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Invalid state transition: {:?} → {:?}",
            self.from, self.to
        )
    }
}

impl std::error::Error for TaskTransitionError {}

/// Action that can be applied to transition task state.
///
/// Each action represents a user-facing operation that may cause
/// state changes with side effects (e.g., priority adjustment, timestamps).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransitionAction {
    /// Start a task: READY → RUNNING
    Start,
    /// Pause a running task: RUNNING → PAUSED
    Pause,
    /// Resume a paused task: PAUSED → RUNNING
    Resume,
    /// Mark task as complete: RUNNING → DONE
    Complete,
    /// Postpone task: RUNNING → READY (priority -= 20)
    Postpone,
    /// Extend current work period: RUNNING → RUNNING (add minutes)
    Extend { minutes: u32 },
}

impl fmt::Display for TransitionAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TransitionAction::Start => write!(f, "start"),
            TransitionAction::Pause => write!(f, "pause"),
            TransitionAction::Resume => write!(f, "resume"),
            TransitionAction::Complete => write!(f, "complete"),
            TransitionAction::Postpone => write!(f, "postpone"),
            TransitionAction::Extend { minutes } => write!(f, "extend({}m)", minutes),
        }
    }
}

/// Entry in state transition history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateTransitionEntry {
    /// State before transition
    pub from: TaskState,
    /// State after transition
    pub to: TaskState,
    /// When the transition occurred
    pub at: DateTime<Utc>,
    /// Operation that caused the transition
    pub operation: String,
}

impl StateTransitionEntry {
    /// Create a new transition entry.
    pub fn new(from: TaskState, to: TaskState, operation: impl Into<String>) -> Self {
        StateTransitionEntry {
            from,
            to,
            at: Utc::now(),
            operation: operation.into(),
        }
    }
}

/// Task state machine wrapper with transition history.
///
/// Wraps a Task and provides action-based transitions with history tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStateMachine {
    /// The underlying task
    pub task: Task,
    /// History of state transitions
    #[serde(default)]
    pub transition_history: Vec<StateTransitionEntry>,
}

impl TaskStateMachine {
    /// Create a new state machine from a task.
    pub fn new(task: Task) -> Self {
        TaskStateMachine {
            task,
            transition_history: Vec::new(),
        }
    }

    /// Create a new state machine with a task created from title.
    pub fn from_title(title: impl Into<String>) -> Self {
        Self::new(Task::new(title))
    }

    /// Get the current state.
    pub fn current_state(&self) -> TaskState {
        self.task.state
    }

    /// Get available actions for the current state.
    pub fn available_actions(&self) -> Vec<TransitionAction> {
        match self.task.state {
            TaskState::Ready => vec![TransitionAction::Start],
            TaskState::Running => vec![
                TransitionAction::Complete,
                TransitionAction::Pause,
                TransitionAction::Postpone,
                TransitionAction::Extend { minutes: 5 },
                TransitionAction::Extend { minutes: 15 },
                TransitionAction::Extend { minutes: 25 },
            ],
            TaskState::Paused => vec![TransitionAction::Resume],
            TaskState::Done => vec![],
        }
    }

    /// Check if an action can be applied.
    pub fn can_apply_action(&self, action: &TransitionAction) -> bool {
        let target_state = match action {
            TransitionAction::Start => TaskState::Running,
            TransitionAction::Pause => TaskState::Paused,
            TransitionAction::Resume => TaskState::Running,
            TransitionAction::Complete => TaskState::Done,
            TransitionAction::Postpone => TaskState::Ready,
            TransitionAction::Extend { .. } => TaskState::Running,
        };
        self.task.state.can_transition_to(&target_state)
    }

    /// Apply a transition action to the task.
    ///
    /// Returns an error if the action cannot be applied from the current state.
    pub fn apply_action(&mut self, action: TransitionAction) -> Result<(), TaskTransitionError> {
        let from_state = self.task.state;
        let to_state = match action {
            TransitionAction::Start => TaskState::Running,
            TransitionAction::Pause => TaskState::Paused,
            TransitionAction::Resume => TaskState::Running,
            TransitionAction::Complete => TaskState::Done,
            TransitionAction::Postpone => TaskState::Ready,
            TransitionAction::Extend { minutes } => {
                // Extend doesn't change state, just adds time
                self.task.estimated_minutes =
                    Some(self.task.estimated_minutes.unwrap_or(0) + minutes);
                self.task.updated_at = Utc::now();

                // Record the "transition" even though state doesn't change
                let entry = StateTransitionEntry::new(from_state, from_state, action.to_string());
                self.transition_history.push(entry);
                return Ok(());
            }
        };

        // Validate transition
        if !from_state.can_transition_to(&to_state) {
            return Err(TaskTransitionError {
                from: from_state,
                to: to_state,
            });
        }

        // Apply action-specific side effects
        let now = Utc::now();
        match action {
            TransitionAction::Start => {
                self.task.paused_at = None;
            }
            TransitionAction::Pause => {
                self.task.paused_at = Some(now);
            }
            TransitionAction::Resume => {
                self.task.paused_at = None;
            }
            TransitionAction::Complete => {
                self.task.completed = true;
                self.task.completed_at = Some(now);
                self.task.paused_at = None;
            }
            TransitionAction::Postpone => {
                self.task.paused_at = None;
                // Decrease priority by 20 (minimum -100)
                let current = self.task.priority.unwrap_or(50);
                self.task.priority = Some((current - 20).max(-100));
            }
            TransitionAction::Extend { .. } => {
                // Handled above
            }
        }

        // Update state and timestamp
        self.task.state = to_state;
        self.task.updated_at = now;

        // Record transition
        let entry = StateTransitionEntry::new(from_state, to_state, action.to_string());
        self.transition_history.push(entry);

        Ok(())
    }

    /// Get reference to the underlying task.
    pub fn task(&self) -> &Task {
        &self.task
    }

    /// Get mutable reference to the underlying task.
    pub fn task_mut(&mut self) -> &mut Task {
        &mut self.task
    }

    /// Clear transition history.
    pub fn clear_history(&mut self) {
        self.transition_history.clear();
    }

    /// Get the number of state transitions that have occurred.
    pub fn transition_count(&self) -> usize {
        self.transition_history.len()
    }
}

impl From<Task> for TaskStateMachine {
    fn from(task: Task) -> Self {
        Self::new(task)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_state_default() {
        assert_eq!(TaskState::default(), TaskState::Ready);
    }

    #[test]
    fn task_state_valid_transitions() {
        assert!(TaskState::Ready.can_transition_to(&TaskState::Running));
        assert!(TaskState::Ready.can_transition_to(&TaskState::Ready)); // defer
        assert!(!TaskState::Ready.can_transition_to(&TaskState::Done));
        assert!(!TaskState::Ready.can_transition_to(&TaskState::Paused));

        assert!(TaskState::Running.can_transition_to(&TaskState::Done));
        assert!(TaskState::Running.can_transition_to(&TaskState::Running)); // extend
        assert!(TaskState::Running.can_transition_to(&TaskState::Paused));
        assert!(TaskState::Running.can_transition_to(&TaskState::Ready)); // postpone

        assert!(TaskState::Paused.can_transition_to(&TaskState::Running));
        assert!(!TaskState::Paused.can_transition_to(&TaskState::Done));

        assert!(!TaskState::Done.can_transition_to(&TaskState::Running)); // terminal
    }

    #[test]
    fn task_creation() {
        let task = Task::new("Test task");
        assert_eq!(task.title, "Test task");
        assert_eq!(task.state, TaskState::Ready);
        assert_eq!(task.elapsed_minutes, 0);
        assert_eq!(task.energy, EnergyLevel::Medium);
        assert!(!task.completed);
        assert!(task.completed_at.is_none());
        assert!(task.paused_at.is_none());
    }

    #[test]
    fn task_transition_ready_to_running() {
        let mut task = Task::new("Test");
        assert!(task.transition_to(TaskState::Running).is_ok());
        assert_eq!(task.state, TaskState::Running);
        assert!(task.paused_at.is_none());
        assert!(task.completed_at.is_none());
    }

    #[test]
    fn task_transition_running_to_paused() {
        let mut task = Task::new("Test");
        task.state = TaskState::Running;
        assert!(task.transition_to(TaskState::Paused).is_ok());
        assert_eq!(task.state, TaskState::Paused);
        assert!(task.paused_at.is_some());
        assert!(task.completed_at.is_none());
    }

    #[test]
    fn task_transition_paused_to_running() {
        let mut task = Task::new("Test");
        task.state = TaskState::Paused;
        task.paused_at = Some(Utc::now());
        assert!(task.transition_to(TaskState::Running).is_ok());
        assert_eq!(task.state, TaskState::Running);
        assert!(task.paused_at.is_none());
    }

    #[test]
    fn task_transition_running_to_done() {
        let mut task = Task::new("Test");
        task.state = TaskState::Running;
        assert!(task.transition_to(TaskState::Done).is_ok());
        assert_eq!(task.state, TaskState::Done);
        assert!(task.completed);
        assert!(task.completed_at.is_some());
        assert!(task.paused_at.is_none());
    }

    #[test]
    fn task_invalid_transition() {
        let mut task = Task::new("Test");
        assert_eq!(task.state, TaskState::Ready);

        // Ready → Done is invalid
        let result = task.transition_to(TaskState::Done);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to, TaskState::Done);

        // State should not change
        assert_eq!(task.state, TaskState::Ready);
    }

    #[test]
    fn task_defer() {
        let mut task = Task::new("Test");
        let _original_priority = task.priority;

        // Defer: READY → READY (priority down)
        assert!(task.transition_to(TaskState::Ready).is_ok());
        assert_eq!(task.state, TaskState::Ready);
        assert!(task.paused_at.is_none());
    }

    #[test]
    fn task_extend() {
        let mut task = Task::new("Test");
        task.state = TaskState::Running;
        let original_updated_at = task.updated_at;

        // Extend: RUNNING → RUNNING (timer reset)
        assert!(task.transition_to(TaskState::Running).is_ok());
        assert_eq!(task.state, TaskState::Running);
        assert!(task.updated_at > original_updated_at);
    }

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
            project_ids: vec![],
            kind: TaskKind::DurationOnly,
            required_minutes: Some(100),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: vec!["work".to_string(), "urgent".to_string()],
            priority: Some(75),
            category: TaskCategory::Active,
            estimated_minutes: Some(100),
            estimated_start_at: None,
            elapsed_minutes: 50,
            energy: EnergyLevel::High,
            group: Some("backend".to_string()),
            group_ids: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
        };

        let json = serde_json::to_string(&task).unwrap();
        let decoded: Task = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.id, task.id);
        assert_eq!(decoded.title, task.title);
        assert_eq!(decoded.state, TaskState::Running);
        assert_eq!(decoded.energy, EnergyLevel::High);
    }

    #[test]
    fn energy_level_default() {
        assert_eq!(EnergyLevel::default(), EnergyLevel::Medium);
    }

    #[test]
    fn task_completion_percentage() {
        let mut task = Task::new("Test");
        task.estimated_pomodoros = 4;
        task.completed_pomodoros = 2;

        assert_eq!(task.completion_percentage(), 0.5);

        task.completed_pomodoros = 4;
        assert_eq!(task.completion_percentage(), 1.0);

        task.estimated_pomodoros = 0;
        assert_eq!(task.completion_percentage(), 0.0);
    }

    #[test]
    fn task_add_elapsed_minutes() {
        let mut task = Task::new("Test");
        assert_eq!(task.elapsed_minutes, 0);

        task.add_elapsed_minutes(25);
        assert_eq!(task.elapsed_minutes, 25);

        task.add_elapsed_minutes(5);
        assert_eq!(task.elapsed_minutes, 30);
    }

    #[test]
    fn task_done_terminal_state() {
        let mut task = Task::new("Test");
        task.state = TaskState::Done;

        // Cannot transition from Done
        assert!(!task.state.can_transition_to(&TaskState::Running));
        assert!(task.state.valid_transitions().is_empty());
    }

    // State machine tests
    #[test]
    fn state_machine_from_title() {
        let machine = TaskStateMachine::from_title("Test task");
        assert_eq!(machine.task.title, "Test task");
        assert_eq!(machine.current_state(), TaskState::Ready);
        assert_eq!(machine.transition_count(), 0);
    }

    #[test]
    fn state_machine_available_actions_ready() {
        let machine = TaskStateMachine::from_title("Test");
        let actions = machine.available_actions();
        assert_eq!(actions, vec![TransitionAction::Start]);
    }

    #[test]
    fn state_machine_available_actions_running() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        let actions = machine.available_actions();

        // Should include Complete, Pause, Postpone, and multiple Extend options
        assert!(actions.contains(&TransitionAction::Complete));
        assert!(actions.contains(&TransitionAction::Pause));
        assert!(actions.contains(&TransitionAction::Postpone));
        assert!(actions.contains(&TransitionAction::Extend { minutes: 5 }));
        assert!(actions.contains(&TransitionAction::Extend { minutes: 15 }));
        assert!(actions.contains(&TransitionAction::Extend { minutes: 25 }));
    }

    #[test]
    fn state_machine_available_actions_paused() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Paused;
        let actions = machine.available_actions();
        assert_eq!(actions, vec![TransitionAction::Resume]);
    }

    #[test]
    fn state_machine_available_actions_done() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Done;
        let actions = machine.available_actions();
        assert!(actions.is_empty());
    }

    #[test]
    fn state_machine_apply_start() {
        let mut machine = TaskStateMachine::from_title("Test");
        assert!(machine.apply_action(TransitionAction::Start).is_ok());
        assert_eq!(machine.current_state(), TaskState::Running);
        assert_eq!(machine.transition_count(), 1);
        assert!(machine.task.paused_at.is_none());
    }

    #[test]
    fn state_machine_apply_pause() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        assert!(machine.apply_action(TransitionAction::Pause).is_ok());
        assert_eq!(machine.current_state(), TaskState::Paused);
        assert!(machine.task.paused_at.is_some());
    }

    #[test]
    fn state_machine_apply_resume() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Paused;
        machine.task.paused_at = Some(Utc::now());
        assert!(machine.apply_action(TransitionAction::Resume).is_ok());
        assert_eq!(machine.current_state(), TaskState::Running);
        assert!(machine.task.paused_at.is_none());
    }

    #[test]
    fn state_machine_apply_complete() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        assert!(machine.apply_action(TransitionAction::Complete).is_ok());
        assert_eq!(machine.current_state(), TaskState::Done);
        assert!(machine.task.completed);
        assert!(machine.task.completed_at.is_some());
        assert!(machine.task.paused_at.is_none());
    }

    #[test]
    fn state_machine_apply_postpone() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        machine.task.priority = Some(50);
        assert!(machine.apply_action(TransitionAction::Postpone).is_ok());
        assert_eq!(machine.current_state(), TaskState::Ready);
        assert_eq!(machine.task.priority, Some(30)); // 50 - 20
        assert!(machine.task.paused_at.is_none());
    }

    #[test]
    fn state_machine_apply_postpone_clamps_priority() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        machine.task.priority = Some(-90);
        assert!(machine.apply_action(TransitionAction::Postpone).is_ok());
        assert_eq!(machine.current_state(), TaskState::Ready);
        assert_eq!(machine.task.priority, Some(-100)); // Clamped to -100
    }

    #[test]
    fn state_machine_apply_extend() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        machine.task.estimated_minutes = Some(25);
        assert!(machine
            .apply_action(TransitionAction::Extend { minutes: 15 })
            .is_ok());
        // State remains RUNNING
        assert_eq!(machine.current_state(), TaskState::Running);
        assert_eq!(machine.task.estimated_minutes, Some(40)); // 25 + 15
        assert_eq!(machine.transition_count(), 1);
    }

    #[test]
    fn state_machine_extend_with_no_estimate() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Running;
        machine.task.estimated_minutes = None;
        assert!(machine
            .apply_action(TransitionAction::Extend { minutes: 25 })
            .is_ok());
        assert_eq!(machine.task.estimated_minutes, Some(25));
    }

    #[test]
    fn state_machine_invalid_action_ready_to_paused() {
        let mut machine = TaskStateMachine::from_title("Test");
        // Cannot pause a ready task
        assert!(machine.apply_action(TransitionAction::Pause).is_err());
        assert_eq!(machine.current_state(), TaskState::Ready);
        assert_eq!(machine.transition_count(), 0);
    }

    #[test]
    fn state_machine_invalid_action_ready_to_done() {
        let mut machine = TaskStateMachine::from_title("Test");
        // Cannot complete a ready task
        assert!(machine.apply_action(TransitionAction::Complete).is_err());
        assert_eq!(machine.current_state(), TaskState::Ready);
    }

    #[test]
    fn state_machine_invalid_action_done_to_running() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.state = TaskState::Done;
        // Cannot start from done state
        assert!(machine.apply_action(TransitionAction::Start).is_err());
        assert_eq!(machine.current_state(), TaskState::Done);
    }

    #[test]
    fn state_machine_can_apply_action() {
        let machine = TaskStateMachine::from_title("Test");
        assert!(machine.can_apply_action(&TransitionAction::Start));
        assert!(!machine.can_apply_action(&TransitionAction::Pause));
        assert!(!machine.can_apply_action(&TransitionAction::Complete));
    }

    #[test]
    fn state_machine_history_tracking() {
        let mut machine = TaskStateMachine::from_title("Test");

        machine.apply_action(TransitionAction::Start).unwrap();
        machine.apply_action(TransitionAction::Pause).unwrap();
        machine.apply_action(TransitionAction::Resume).unwrap();
        machine.apply_action(TransitionAction::Complete).unwrap();

        assert_eq!(machine.transition_count(), 4);

        let history = &machine.transition_history;
        assert_eq!(history[0].from, TaskState::Ready);
        assert_eq!(history[0].to, TaskState::Running);
        assert_eq!(history[0].operation, "start");

        assert_eq!(history[1].from, TaskState::Running);
        assert_eq!(history[1].to, TaskState::Paused);
        assert_eq!(history[1].operation, "pause");

        assert_eq!(history[2].from, TaskState::Paused);
        assert_eq!(history[2].to, TaskState::Running);
        assert_eq!(history[2].operation, "resume");

        assert_eq!(history[3].from, TaskState::Running);
        assert_eq!(history[3].to, TaskState::Done);
        assert_eq!(history[3].operation, "complete");
    }

    #[test]
    fn state_machine_clear_history() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.apply_action(TransitionAction::Start).unwrap();
        machine.apply_action(TransitionAction::Pause).unwrap();

        assert_eq!(machine.transition_count(), 2);
        machine.clear_history();
        assert_eq!(machine.transition_count(), 0);
    }

    #[test]
    fn state_machine_from_task() {
        let task = Task::new("Test task");
        let machine = TaskStateMachine::new(task);
        assert_eq!(machine.task.title, "Test task");
    }

    #[test]
    fn state_machine_from_trait() {
        let task = Task::new("Test task");
        let machine: TaskStateMachine = task.into();
        assert_eq!(machine.task.title, "Test task");
    }

    #[test]
    fn state_machine_serialization() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.apply_action(TransitionAction::Start).unwrap();
        machine.apply_action(TransitionAction::Pause).unwrap();

        let json = serde_json::to_string(&machine).unwrap();
        let decoded: TaskStateMachine = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.task.title, "Test");
        assert_eq!(decoded.current_state(), TaskState::Paused);
        assert_eq!(decoded.transition_count(), 2);
    }

    #[test]
    fn state_machine_postpone_workflow() {
        let mut machine = TaskStateMachine::from_title("Test");
        machine.task.priority = Some(80);

        // Start
        machine.apply_action(TransitionAction::Start).unwrap();
        assert_eq!(machine.current_state(), TaskState::Running);

        // Postpone (priority goes down)
        machine.apply_action(TransitionAction::Postpone).unwrap();
        assert_eq!(machine.current_state(), TaskState::Ready);
        assert_eq!(machine.task.priority, Some(60));

        // Start again
        machine.apply_action(TransitionAction::Start).unwrap();
        assert_eq!(machine.current_state(), TaskState::Running);

        // Complete
        machine.apply_action(TransitionAction::Complete).unwrap();
        assert_eq!(machine.current_state(), TaskState::Done);
        assert!(machine.task.completed);

        // Verify full history
        assert_eq!(machine.transition_count(), 4);
    }

    #[test]
    fn transition_action_display() {
        assert_eq!(format!("{}", TransitionAction::Start), "start");
        assert_eq!(format!("{}", TransitionAction::Pause), "pause");
        assert_eq!(format!("{}", TransitionAction::Resume), "resume");
        assert_eq!(format!("{}", TransitionAction::Complete), "complete");
        assert_eq!(format!("{}", TransitionAction::Postpone), "postpone");
        assert_eq!(
            format!("{}", TransitionAction::Extend { minutes: 25 }),
            "extend(25m)"
        );
    }
}
