//! Timer engine implementation.
//!
//! The timer engine is a wall-clock-based state machine. It does not use
//! internal threads - the caller is responsible for calling `tick()` periodically.
//!
//! ## State Transitions
//!
//! ```text
//! Idle -> Running -> (Paused | Drifting) -> Idle
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    Idle,
    Running,
    Paused,
    Completed,
    /// Timer finished but user hasn't taken action yet.
    /// Tracks how long the user has been "drifting" without acting.
    Drifting,
}

/// Metadata for the Drifting state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftingState {
    /// When the drifting state began (epoch milliseconds).
    pub since_epoch_ms: u64,
    /// Accumulated break debt in milliseconds (drift duration).
    pub break_debt_ms: u64,
    /// Current escalation level for Gatekeeper Protocol (0-3).
    pub escalation_level: u8,
}

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
    /// Metadata for the Drifting state (only valid when state is Drifting).
    #[serde(default)]
    drifting: Option<DriftingState>,
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
            drifting: None,
        }
    }

    // ── Queries ──────────────────────────────────────────────────────

    pub fn state(&self) -> TimerState {
        self.state
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
            state: self.state,
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
        match self.state {
            TimerState::Idle | TimerState::Paused | TimerState::Completed => {
                if self.state == TimerState::Completed {
                    // Auto-advance to next step.
                    self.advance();
                }
                self.state = TimerState::Running;
                self.last_tick_epoch_ms = Some(now_ms());
                let step = self.current_step()?;
                Some(Event::TimerStarted {
                    step_index: self.step_index,
                    step_type: step.step_type,
                    duration_secs: step.duration_secs(),
                    at: Utc::now(),
                })
            }
            TimerState::Running => None, // Already running.
            TimerState::Drifting => {
                // Exit drifting and start fresh
                let _drift = self.exit_drifting();
                self.state = TimerState::Idle;
                // Now start normally
                self.start()
            }
        }
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
            TimerState::Drifting => {
                // Pause from drifting - returns accumulated break debt
                let drift = self.exit_drifting()?;
                self.state = TimerState::Paused;
                Some(Event::TimerPaused {
                    remaining_ms: 0, // No remaining time after drifting
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
                Some(Event::TimerResumed {
                    remaining_ms: self.remaining_ms,
                    at: Utc::now(),
                })
            }
            TimerState::Drifting => {
                // Resume from drifting - exit drifting first
                let _drift = self.exit_drifting()?;
                // Then resume as if from paused (will start fresh or continue)
                self.state = TimerState::Running;
                self.last_tick_epoch_ms = Some(now_ms());
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
        self.drifting = None;
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
        self.drifting = None;
        self.remaining_ms = self
            .schedule
            .steps
            .first()
            .map(|s| s.duration_ms())
            .unwrap_or(0);
        Some(Event::TimerReset { at: Utc::now() })
    }

    /// Call periodically. Returns `Some(Event::TimerCompleted)` when step finishes.
    pub fn tick(&mut self) -> Option<Event> {
        match self.state {
            TimerState::Running => {
                self.flush_elapsed();
                if self.remaining_ms == 0 {
                    // Enter DRIFTING state instead of COMPLETED
                    self.enter_drifting();
                    let step = self.current_step()?;
                    return Some(Event::TimerCompleted {
                        step_index: self.step_index,
                        step_type: step.step_type,
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
            _ => None,
        }
    }

    /// Enter the DRIFTING state when timer completes without user action.
    fn enter_drifting(&mut self) {
        self.state = TimerState::Drifting;
        self.last_tick_epoch_ms = None;
        self.drifting = Some(DriftingState {
            since_epoch_ms: now_ms(),
            break_debt_ms: 0,
            escalation_level: 0,
        });
    }

    /// Exit the DRIFTING state when user takes an action.
    /// Returns the break debt accumulated while drifting.
    pub fn exit_drifting(&mut self) -> Option<DriftingState> {
        if self.state != TimerState::Drifting {
            return None;
        }
        self.state = TimerState::Idle;
        self.drifting.take()
    }

    /// Get the current drifting state if in DRIFTING.
    pub fn drifting_state(&self) -> Option<&DriftingState> {
        self.drifting.as_ref()
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
