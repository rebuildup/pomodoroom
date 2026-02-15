use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::timer::{StepType, TimerState};

/// Every state change in the system produces an Event.
/// The GUI polls for events; integrations subscribe to them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Event {
    TimerStarted {
        step_index: usize,
        step_type: StepType,
        duration_secs: u64,
        at: DateTime<Utc>,
    },
    TimerPaused {
        remaining_ms: u64,
        at: DateTime<Utc>,
    },
    TimerResumed {
        remaining_ms: u64,
        at: DateTime<Utc>,
    },
    TimerCompleted {
        step_index: usize,
        step_type: StepType,
        at: DateTime<Utc>,
    },
    TimerSkipped {
        from_step: usize,
        to_step: usize,
        at: DateTime<Utc>,
    },
    TimerReset {
        at: DateTime<Utc>,
    },
    StepAdvanced {
        step_index: usize,
        step_type: StepType,
        duration_secs: u64,
        at: DateTime<Utc>,
    },
    StateSnapshot {
        state: TimerState,
        step_index: usize,
        step_type: StepType,
        step_label: String,
        remaining_ms: u64,
        total_ms: u64,
        schedule_progress_pct: f64,
        at: DateTime<Utc>,
    },
    /// Monthly checkpoint for fast replay - stores the complete system state
    /// at a point in time to avoid replaying all historical events
    Checkpoint {
        checkpoint_id: String,
        at: DateTime<Utc>,
    },
}
