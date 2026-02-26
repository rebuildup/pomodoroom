//! Task-based timer engine implementation.
//!
//! The timer engine tracks remaining time for the currently RUNNING task.
//! It continuously counts down toward the next deadline without start/stop concepts.
//!
//! ## State Transitions
//!
//! ```text
//! Idle (no running task) -> Running (task active) -> Drifting (time's up) -> Idle/Done
//! ```

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::events::Event;

/// Timer state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    /// No task is currently running.
    Idle,
    /// A task is active and counting down.
    Running,
    /// Task time has expired, waiting for user action.
    Drifting,
}

impl Eq for TimerState {}

/// Metadata for the Drifting state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftingState {
    /// When the drifting state began (epoch milliseconds).
    pub since_epoch_ms: u64,
    /// Accumulated break debt in milliseconds (drift duration).
    pub break_debt_ms: u64,
    /// Current escalation level for Gatekeeper Protocol (0-3).
    pub escalation_level: u8,
    /// The task ID that triggered the drift.
    pub task_id: String,
    /// The task title for display.
    pub task_title: String,
}

/// Active session tracking for the current task.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActiveSession {
    /// Task ID being tracked.
    pub task_id: Option<String>,
    /// Task title for display.
    pub task_title: Option<String>,
    /// Required minutes for the task.
    pub required_minutes: u32,
    /// Elapsed minutes at session start (from database).
    pub initial_elapsed_minutes: u32,
    /// When this session started (epoch ms).
    pub started_at_ms: Option<u64>,
}

/// Core timer engine - task-based.
///
/// Tracks remaining time for the active task. No internal thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerEngine {
    state: TimerState,
    /// Current active session (task being tracked).
    session: ActiveSession,
    /// Calculated remaining milliseconds for current task.
    remaining_ms: u64,
    /// Total milliseconds for current task (required - initial_elapsed).
    total_ms: u64,
    /// Timestamp when last tick occurred.
    #[serde(default)]
    last_tick_epoch_ms: Option<u64>,
    /// Metadata for Drifting state.
    #[serde(default)]
    drifting: Option<DriftingState>,
}

impl TimerEngine {
    /// Create a new timer engine in Idle state.
    pub fn new() -> Self {
        Self {
            state: TimerState::Idle,
            session: ActiveSession::default(),
            remaining_ms: 0,
            total_ms: 0,
            last_tick_epoch_ms: None,
            drifting: None,
        }
    }

    // ── Queries ──────────────────────────────────────────────────────

    pub fn state(&self) -> TimerState {
        self.state.clone()
    }

    pub fn remaining_ms(&self) -> u64 {
        self.remaining_ms
    }

    pub fn total_ms(&self) -> u64 {
        self.total_ms
    }

    pub fn current_task_id(&self) -> Option<&str> {
        self.session.task_id.as_deref()
    }

    pub fn current_task_title(&self) -> Option<&str> {
        self.session.task_title.as_deref()
    }

    /// Progress percentage (0.0 to 1.0) within current task.
    pub fn progress(&self) -> f64 {
        if self.total_ms == 0 {
            return 0.0;
        }
        1.0 - (self.remaining_ms as f64 / self.total_ms as f64)
    }

    /// Get the current drifting state if in DRIFTING.
    pub fn drifting_state(&self) -> Option<&DriftingState> {
        self.drifting.as_ref()
    }

    // ── Commands ─────────────────────────────────────────────────────

    /// Update the active session with new task information.
    /// Called when a task starts, completes, or changes.
    pub fn update_session(
        &mut self,
        task_id: Option<String>,
        task_title: Option<String>,
        required_minutes: u32,
        elapsed_minutes: u32,
    ) -> Option<Event> {
        let had_drifting = self.state == TimerState::Drifting;
        let _previous_task_id = self.session.task_id.clone();

        // Calculate remaining time
        let total_required_ms = required_minutes as u64 * 60_000;
        let already_elapsed_ms = elapsed_minutes as u64 * 60_000;
        let remaining_ms = total_required_ms.saturating_sub(already_elapsed_ms);

        // Update session
        self.session = ActiveSession {
            task_id: task_id.clone(),
            task_title: task_title.clone(),
            required_minutes,
            initial_elapsed_minutes: elapsed_minutes,
            started_at_ms: if task_id.is_some() { Some(now_ms()) } else { None },
        };

        self.total_ms = total_required_ms;
        self.remaining_ms = remaining_ms;
        self.last_tick_epoch_ms = Some(now_ms());

        // State transition
        if task_id.is_none() {
            // No running task
            self.state = TimerState::Idle;
            self.drifting = None;
            None
        } else if remaining_ms == 0 && !had_drifting {
            // Time already expired - enter drifting immediately
            self.enter_drifting(task_id.unwrap(), task_title.unwrap_or_default());
            Some(Event::TimerCompleted {
                step_index: 0,
                step_type: crate::timer::StepType::Focus,
                at: Utc::now(),
            })
        } else if remaining_ms == 0 && had_drifting {
            // Still drifting, new task with no time
            self.state = TimerState::Drifting;
            None
        } else {
            // Normal running state
            self.state = TimerState::Running;
            self.drifting = None;
            None
        }
    }

    /// Call periodically to update remaining time.
    /// Returns event when task time expires.
    pub fn tick(&mut self) -> Option<Event> {
        match self.state {
            TimerState::Running => {
                self.flush_elapsed();
                if self.remaining_ms == 0 {
                    // Time's up - enter drifting
                    let task_id = self.session.task_id.clone().unwrap_or_default();
                    let task_title = self.session.task_title.clone().unwrap_or_default();
                    self.enter_drifting(task_id, task_title);
                    return Some(Event::TimerCompleted {
                        step_index: 0,
                        step_type: crate::timer::StepType::Focus,
                        at: Utc::now(),
                    });
                }
                None
            }
            TimerState::Drifting => {
                // Update break debt while drifting
                if let Some(ref mut drift) = self.drifting {
                    let now = now_ms();
                    let elapsed = now.saturating_sub(drift.since_epoch_ms);
                    drift.break_debt_ms = elapsed;

                    // Calculate escalation level based on drift duration
                    // Level 0: 0-30s, Level 1: 30-60s, Level 2: 60-120s, Level 3: 120s+
                    const ESCALATION_THRESHOLDS: [u64; 4] = [0, 30_000, 60_000, 120_000];
                    for (i, &threshold) in ESCALATION_THRESHOLDS.iter().enumerate() {
                        if elapsed >= threshold {
                            drift.escalation_level = i as u8;
                        }
                    }
                }
                None
            }
            TimerState::Idle => None,
        }
    }

    /// Reset the engine to idle state.
    pub fn reset(&mut self) {
        self.state = TimerState::Idle;
        self.session = ActiveSession::default();
        self.remaining_ms = 0;
        self.total_ms = 0;
        self.last_tick_epoch_ms = None;
        self.drifting = None;
    }

    /// Extend the remaining time by the given minutes.
    pub fn extend(&mut self, minutes: u32) {
        let additional_ms = minutes as u64 * 60 * 1000;
        self.remaining_ms += additional_ms;
        self.total_ms += additional_ms;
    }

    // ── Internal ─────────────────────────────────────────────────────

    fn flush_elapsed(&mut self) {
        if let Some(last) = self.last_tick_epoch_ms {
            let now = now_ms();
            let elapsed = now.saturating_sub(last);
            self.remaining_ms = self.remaining_ms.saturating_sub(elapsed);
            self.last_tick_epoch_ms = Some(now);
        }
    }

    fn enter_drifting(&mut self, task_id: String, task_title: String) {
        self.state = TimerState::Drifting;
        self.last_tick_epoch_ms = None;
        self.drifting = Some(DriftingState {
            since_epoch_ms: now_ms(),
            break_debt_ms: 0,
            escalation_level: 0,
            task_id,
            task_title,
        });
    }

    /// Build a full state snapshot event.
    pub fn snapshot(&self) -> Event {
        Event::StateSnapshot {
            state: self.state.clone(),
            step_index: 0,
            step_type: crate::timer::StepType::Focus,
            step_label: self.session.task_title.clone().unwrap_or_default(),
            remaining_ms: self.remaining_ms,
            total_ms: self.total_ms,
            schedule_progress_pct: self.progress() * 100.0,
            at: Utc::now(),
        }
    }
}

impl Default for TimerEngine {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_engine_is_idle() {
        let engine = TimerEngine::new();
        assert_eq!(engine.state(), TimerState::Idle);
        assert_eq!(engine.remaining_ms(), 0);
    }

    #[test]
    fn update_session_with_task_starts_running() {
        let mut engine = TimerEngine::new();
        let event = engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            25, // required minutes
            0,  // elapsed minutes
        );
        assert_eq!(engine.state(), TimerState::Running);
        assert_eq!(engine.remaining_ms(), 25 * 60_000);
        assert_eq!(engine.total_ms(), 25 * 60_000);
        assert!(event.is_none());
    }

    #[test]
    fn update_session_with_elapsed_time() {
        let mut engine = TimerEngine::new();
        engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            25,
            10, // already elapsed 10 minutes
        );
        assert_eq!(engine.remaining_ms(), 15 * 60_000);
        assert_eq!(engine.total_ms(), 25 * 60_000);
    }

    #[test]
    fn tick_reduces_remaining_time() {
        let mut engine = TimerEngine::new();
        engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            25,
            0,
        );
        // Simulate time passing
        std::thread::sleep(std::time::Duration::from_millis(100));
        engine.tick();
        assert!(engine.remaining_ms() < 25 * 60_000);
    }

    #[test]
    fn time_expiry_enters_drifting() {
        let mut engine = TimerEngine::new();
        // Start with non-zero time first
        engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            25, // 25 minutes required
            0,
        );
        assert_eq!(engine.state(), TimerState::Running);

        // Then update to 0 minutes (simulating completion)
        let event = engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            0, // 0 minutes required - already elapsed
            0,
        );
        // Should immediately enter drifting and return TimerCompleted event
        assert_eq!(engine.state(), TimerState::Drifting);
        assert!(engine.drifting_state().is_some());
        assert!(event.is_some()); // TimerCompleted event
    }

    #[test]
    fn update_session_with_no_task_returns_to_idle() {
        let mut engine = TimerEngine::new();
        engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            25,
            0,
        );
        assert_eq!(engine.state(), TimerState::Running);

        // Clear task
        engine.update_session(None, None, 0, 0);
        assert_eq!(engine.state(), TimerState::Idle);
        assert_eq!(engine.remaining_ms(), 0);
    }

    #[test]
    fn drifting_accumulates_break_debt() {
        let mut engine = TimerEngine::new();
        engine.update_session(
            Some("task-1".to_string()),
            Some("Test Task".to_string()),
            0,
            0,
        );
        engine.tick(); // Enter drifting

        // Simulate time passing
        std::thread::sleep(std::time::Duration::from_millis(100));
        engine.tick();

        let drift = engine.drifting_state().unwrap();
        assert!(drift.break_debt_ms >= 100);
        assert_eq!(drift.task_id, "task-1");
    }
}
