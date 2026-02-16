//! Timer engine implementation.
//!
//! The timer engine is a wall-clock-based state machine. It does not use
//! internal threads - the caller is responsible for calling `tick()` periodically.
//!
//! ## State Transitions
//!
//! ```text
//! Idle -> Running -> (Paused | Completed) -> Idle
//! ```
//!
//! ## Usage
//!
//! ```ignore
//! let mut engine = TimerEngine::new(schedule);
//! engine.start();
//! // In a loop:
//! engine.tick(); // Returns Some(Event) when step completes
//! ```

use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::schedule::{Schedule, StepType};
use crate::events::Event;

/// Timer state with optional metadata for Drifting/Waiting states.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum TimerState {
    Idle,
    Running,
    Paused,
    Completed,
    /// Drifting state: timer has completed but user has not taken action.
    /// Tracks break debt (time spent drifting = debt to pay back).
    Drifting {
        /// Unix timestamp (ms) when drifting started.
        since_ms: u64,
        /// Accumulated break debt in milliseconds.
        break_debt_ms: u64,
        /// Current escalation level (0-3) for Gatekeeper protocol.
        escalation_level: u8,
    },
    /// Waiting state: waiting for external async operation (e.g., AI task, webhook).
    Waiting {
        /// Unix timestamp (ms) when waiting started.
        since_ms: u64,
        /// Optional webhook/task identifier.
        webhook_id: Option<String>,
    },
}

impl Eq for TimerState {}

/// Core timer engine.
///
/// Operates on wall-clock deltas -- no internal thread.
/// The caller is responsible for calling `tick()` periodically.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerEngine {
    schedule: Schedule,
    state: TimerState,
    step_index: usize,
    /// Remaining time in milliseconds for the current step.
    remaining_ms: u64,
    /// Timestamp (ms since epoch) when the timer was last resumed/started.
    /// Used to compute elapsed time between ticks.
    #[serde(default)]
    last_tick_epoch_ms: Option<u64>,
    /// Timestamp (ms) when the current step started (for Drifting detection).
    #[serde(default)]
    step_start_ms: Option<u64>,
}

impl TimerEngine {
    /// Create a new timer engine with the given schedule.
    ///
    /// Starts in the `Idle` state with the first step ready.
    pub fn new(schedule: Schedule) -> Self {
        let remaining_ms = schedule.steps.first().map(|s| s.duration_ms()).unwrap_or(0);
        Self {
            schedule,
            state: TimerState::Idle,
            step_index: 0,
            remaining_ms,
            last_tick_epoch_ms: None,
            step_start_ms: None,
        }
    }

    // ── Queries ──────────────────────────────────────────────────────

    pub fn state(&self) -> TimerState {
        self.state.clone()
    }

    pub fn step_index(&self) -> usize {
        self.step_index
    }

    pub fn remaining_ms(&self) -> u64 {
        self.remaining_ms
    }

    pub fn current_step(&self) -> Option<&super::schedule::Step> {
        self.schedule.steps.get(self.step_index)
    }

    pub fn schedule(&self) -> &Schedule {
        &self.schedule
    }

    pub fn total_ms(&self) -> u64 {
        self.current_step().map(|s| s.duration_ms()).unwrap_or(0)
    }

    /// 0.0 .. 1.0 progress within current step.
    pub fn step_progress(&self) -> f64 {
        let total = self.total_ms();
        if total == 0 {
            return 0.0;
        }
        1.0 - (self.remaining_ms as f64 / total as f64)
    }

    /// 0.0 .. 100.0 progress across the entire schedule.
    pub fn schedule_progress_pct(&self) -> f64 {
        let total_min = self.schedule.total_duration_min() as f64;
        if total_min == 0.0 {
            return 0.0;
        }
        let completed_min = self.schedule.cumulative_min(self.step_index) as f64;
        let current_step_min = self
            .current_step()
            .map(|s| s.duration_min as f64)
            .unwrap_or(0.0);
        let current_elapsed_min = current_step_min * self.step_progress();
        ((completed_min + current_elapsed_min) / total_min * 100.0).min(100.0)
    }

    /// Build a full state snapshot event.
    pub fn snapshot(&self) -> Event {
        let step = self.current_step();
        Event::StateSnapshot {
            state: self.state.clone(),
            step_index: self.step_index,
            step_type: step.map(|s| s.step_type).unwrap_or(StepType::Focus),
            step_label: step.map(|s| s.label.clone()).unwrap_or_default(),
            remaining_ms: self.remaining_ms,
            total_ms: self.total_ms(),
            schedule_progress_pct: self.schedule_progress_pct(),
            at: Utc::now(),
        }
    }

    // ── Commands ─────────────────────────────────────────────────────

    pub fn start(&mut self) -> Option<Event> {
        match &self.state {
            TimerState::Idle | TimerState::Paused | TimerState::Completed => {
                if matches!(self.state, TimerState::Completed) {
                    // Auto-advance to next step.
                    self.advance();
                }
                self.state = TimerState::Running;
                self.last_tick_epoch_ms = Some(now_ms());
                self.step_start_ms = Some(now_ms());
                let step = self.current_step()?;
                Some(Event::TimerStarted {
                    step_index: self.step_index,
                    step_type: step.step_type,
                    duration_secs: step.duration_secs(),
                    at: Utc::now(),
                })
            }
            TimerState::Running => None, // Already running.
            TimerState::Drifting { .. } => {
                // Exit drifting and complete the step.
                self.complete_drifting()
            }
            TimerState::Waiting { .. } => {
                // Waiting cannot be manually started - must complete the async operation.
                None
            }
        }
    }

    /// Complete drifting state and transition to Completed.
    fn complete_drifting(&mut self) -> Option<Event> {
        let now = now_ms();
        let (since_ms, break_debt_ms, _escalation_level) = match &self.state {
            TimerState::Drifting {
                since_ms,
                break_debt_ms,
                escalation_level,
            } => (*since_ms, *break_debt_ms, *escalation_level),
            _ => return None,
        };

        // Calculate final drift duration and add to break debt
        let final_drift_ms = now.saturating_sub(since_ms);
        let total_break_debt = break_debt_ms + final_drift_ms;

        self.state = TimerState::Completed;
        self.last_tick_epoch_ms = None;
        self.step_start_ms = None;

        let step = self.current_step()?;

        // Return event with break debt information
        Some(Event::TimerDriftingEnded {
            step_index: self.step_index,
            step_type: step.step_type,
            break_debt_ms: total_break_debt,
            at: Utc::now(),
        })
    }

    pub fn pause(&mut self) -> Option<Event> {
        match self.state {
            TimerState::Running => {
                // Flush elapsed time first.
                self.flush_elapsed();
                self.state = TimerState::Paused;
                self.last_tick_epoch_ms = None;
                Some(Event::TimerPaused {
                    remaining_ms: self.remaining_ms,
                    at: Utc::now(),
                })
            }
            TimerState::Drifting { .. } => {
                // Pause accumulates break debt and transitions to Paused.
                let break_debt_ms = self.accumulate_break_debt();
                self.state = TimerState::Paused;
                self.last_tick_epoch_ms = None;
                self.step_start_ms = None;
                Some(Event::TimerPaused {
                    remaining_ms: 0, // Drifting means time is up
                    at: Utc::now(),
                })
            }
            _ => None,
        }
    }

    pub fn resume(&mut self) -> Option<Event> {
        match self.state {
            TimerState::Paused => {
                self.state = TimerState::Running;
                self.last_tick_epoch_ms = Some(now_ms());
                self.step_start_ms = Some(now_ms());
                Some(Event::TimerResumed {
                    remaining_ms: self.remaining_ms,
                    at: Utc::now(),
                })
            }
            _ => None,
        }
    }

    pub fn skip(&mut self) -> Option<Event> {
        let from = self.step_index;
        self.state = TimerState::Idle;
        self.last_tick_epoch_ms = None;
        self.step_start_ms = None;
        self.advance();
        Some(Event::TimerSkipped {
            from_step: from,
            to_step: self.step_index,
            at: Utc::now(),
        })
    }

    pub fn reset(&mut self) -> Option<Event> {
        self.state = TimerState::Idle;
        self.step_index = 0;
        self.last_tick_epoch_ms = None;
        self.step_start_ms = None;
        self.remaining_ms = self
            .schedule
            .steps
            .first()
            .map(|s| s.duration_ms())
            .unwrap_or(0);
        Some(Event::TimerReset { at: Utc::now() })
    }

    /// Call periodically. Returns events based on state transitions.
    ///
    /// - When running and timer expires: enters DRIFTING state
    /// - When drifting: updates break debt and escalation level
    /// - When waiting: no-op (must complete via async callback)
    pub fn tick(&mut self) -> Option<Event> {
        match self.state {
            TimerState::Running => {
                self.flush_elapsed();
                if self.remaining_ms == 0 {
                    // Timer completed - enter DRIFTING state instead of Completed
                    let now = now_ms();
                    self.state = TimerState::Drifting {
                        since_ms: now,
                        break_debt_ms: 0,
                        escalation_level: 0,
                    };
                    self.last_tick_epoch_ms = None;
                    let step = self.current_step()?;
                    return Some(Event::TimerDrifting {
                        step_index: self.step_index,
                        step_type: step.step_type,
                        at: Utc::now(),
                    });
                }
                None
            }
            TimerState::Drifting {
                since_ms,
                break_debt_ms,
                escalation_level,
            } => {
                // Update break debt and check escalation level
                let now = now_ms();
                let drift_duration_ms = now.saturating_sub(since_ms);
                let updated_break_debt = break_debt_ms + drift_duration_ms;

                // Calculate escalation level based on drift duration
                // Level 0: 0-30s, Level 1: 30-60s, Level 2: 60-120s, Level 3: 120s+
                let new_level = if drift_duration_ms < 30_000 {
                    0
                } else if drift_duration_ms < 60_000 {
                    1
                } else if drift_duration_ms < 120_000 {
                    2
                } else {
                    3
                };

                self.state = TimerState::Drifting {
                    since_ms,
                    break_debt_ms: updated_break_debt,
                    escalation_level: new_level,
                };

                // Return event if escalation level changed
                if new_level != escalation_level {
                    Some(Event::DriftingEscalated {
                        escalation_level: new_level,
                        break_debt_ms: updated_break_debt,
                        at: Utc::now(),
                    })
                } else {
                    None
                }
            }
            TimerState::Waiting { .. } => {
                // Waiting state doesn't change on tick - must complete via async callback
                None
            }
            _ => None,
        }
    }

    pub fn set_schedule(&mut self, schedule: Schedule) {
        self.schedule = schedule;
        self.reset();
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

    fn advance(&mut self) {
        let next = if self.step_index + 1 < self.schedule.steps.len() {
            self.step_index + 1
        } else {
            0 // Wrap around.
        };
        self.step_index = next;
        self.remaining_ms = self
            .schedule
            .steps
            .get(next)
            .map(|s| s.duration_ms())
            .unwrap_or(0);
    }

    /// Accumulate break debt from current drifting state.
    /// Returns the total break debt accumulated so far.
    fn accumulate_break_debt(&mut self) -> u64 {
        let now = now_ms();
        if let TimerState::Drifting {
            since_ms,
            break_debt_ms,
            ..
        } = self.state
        {
            let drift_duration_ms = now.saturating_sub(since_ms);
            let updated_break_debt = break_debt_ms + drift_duration_ms;
            updated_break_debt
        } else {
            0
        }
    }

    // ── Public API for Drifting/Waiting states ───────────────────────

    /// Manually enter drifting state (for testing or direct control).
    pub fn enter_drifting(&mut self) -> Option<Event> {
        if self.state != TimerState::Running {
            return None;
        }
        let now = now_ms();
        self.state = TimerState::Drifting {
            since_ms: now,
            break_debt_ms: 0,
            escalation_level: 0,
        };
        self.last_tick_epoch_ms = None;
        let step = self.current_step()?;
        Some(Event::TimerDrifting {
            step_index: self.step_index,
            step_type: step.step_type,
            at: Utc::now(),
        })
    }

    /// Enter waiting state for async operations (e.g., AI tasks, webhooks).
    pub fn enter_waiting(&mut self, webhook_id: Option<String>) -> Option<Event> {
        if self.state != TimerState::Running {
            return None;
        }
        let now = now_ms();
        let webhook_id_clone = webhook_id.clone();
        self.state = TimerState::Waiting {
            since_ms: now,
            webhook_id,
        };
        self.last_tick_epoch_ms = None;
        Some(Event::WaitingStarted {
            webhook_id: webhook_id_clone,
            at: Utc::now(),
        })
    }

    /// Complete waiting state and resume/complete the step.
    pub fn complete_waiting(&mut self, success: bool) -> Option<Event> {
        if !matches!(self.state, TimerState::Waiting { .. }) {
            return None;
        }

        let now = now_ms();
        let (since_ms, webhook_id) = match &self.state {
            TimerState::Waiting {
                since_ms,
                webhook_id,
            } => (*since_ms, webhook_id.clone()),
            _ => return None,
        };

        let wait_duration_ms = now.saturating_sub(since_ms);

        if success {
            // Success: complete the step
            self.state = TimerState::Completed;
            self.last_tick_epoch_ms = None;
            let step = self.current_step()?;
            Some(Event::WaitingCompleted {
                step_index: self.step_index,
                step_type: step.step_type,
                wait_duration_ms,
                at: Utc::now(),
            })
        } else {
            // Failure: resume from where we left off
            self.state = TimerState::Running;
            self.last_tick_epoch_ms = Some(now);
            let step = self.current_step()?;
            Some(Event::WaitingFailed {
                step_index: self.step_index,
                step_type: step.step_type,
                wait_duration_ms,
                at: Utc::now(),
            })
        }
    }

    /// Get current break debt if in drifting state.
    pub fn break_debt_ms(&self) -> u64 {
        match &self.state {
            TimerState::Drifting { break_debt_ms, .. } => *break_debt_ms,
            _ => 0,
        }
    }

    /// Get current escalation level if in drifting state.
    pub fn escalation_level(&self) -> u8 {
        match &self.state {
            TimerState::Drifting { escalation_level, .. } => *escalation_level,
            _ => 0,
        }
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
    use crate::timer::schedule::Schedule;

    #[test]
    fn start_pause_resume() {
        let mut engine = TimerEngine::new(Schedule::default());
        assert_eq!(engine.state(), TimerState::Idle);

        assert!(engine.start().is_some());
        assert_eq!(engine.state(), TimerState::Running);

        assert!(engine.pause().is_some());
        assert_eq!(engine.state(), TimerState::Paused);

        assert!(engine.resume().is_some());
        assert_eq!(engine.state(), TimerState::Running);
    }

    #[test]
    fn skip_advances_step() {
        let mut engine = TimerEngine::new(Schedule::default());
        assert_eq!(engine.step_index(), 0);
        engine.skip();
        assert_eq!(engine.step_index(), 1);
    }

    #[test]
    fn reset_goes_to_beginning() {
        let mut engine = TimerEngine::new(Schedule::default());
        engine.skip();
        engine.skip();
        assert_eq!(engine.step_index(), 2);
        engine.reset();
        assert_eq!(engine.step_index(), 0);
        assert_eq!(engine.state(), TimerState::Idle);
    }

    #[test]
    fn snapshot_returns_valid_event() {
        let engine = TimerEngine::new(Schedule::default());
        let snap = engine.snapshot();
        match snap {
            Event::StateSnapshot {
                state,
                step_index,
                remaining_ms,
                ..
            } => {
                assert_eq!(state, TimerState::Idle);
                assert_eq!(step_index, 0);
                assert_eq!(remaining_ms, 15 * 60 * 1000);
            }
            _ => panic!("Expected StateSnapshot"),
        }
    }
}
