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
    /// Timer finished and entered DRIFTING state (user hasn't acted).
    TimerDrifting {
        step_index: usize,
        step_type: StepType,
        at: DateTime<Utc>,
    },
    /// Drifting state escalation level increased.
    DriftingEscalated {
        escalation_level: u8,
        break_debt_ms: u64,
        at: DateTime<Utc>,
    },
    /// User exited drifting state (break debt accumulated).
    TimerDriftingEnded {
        step_index: usize,
        step_type: StepType,
        break_debt_ms: u64,
        at: DateTime<Utc>,
    },
    /// Entered WAITING state for async operation.
    WaitingStarted {
        webhook_id: Option<String>,
        at: DateTime<Utc>,
    },
    /// Async operation completed successfully.
    WaitingCompleted {
        step_index: usize,
        step_type: StepType,
        wait_duration_ms: u64,
        at: DateTime<Utc>,
    },
    /// Async operation failed (timer resumed).
    WaitingFailed {
        step_index: usize,
        step_type: StepType,
        wait_duration_ms: u64,
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
    /// Operation log entry for CRDT-style conflict-free merge
    /// Each operation is causally ordered and can be merged deterministically
    OperationLog {
        operation_id: String,
        operation_type: String,
        data: serde_json::Value,
        causal_metadata: CausalMetadata,
        at: DateTime<Utc>,
    },
}

/// Causal metadata for operation ordering and conflict detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CausalMetadata {
    /// Lamport timestamp for causal ordering
    pub lamport_ts: u64,
    /// Device/node identifier that generated this operation
    pub device_id: String,
    /// Vector clock for precise causal ordering (optional)
    pub vector_clock: Option<std::collections::HashMap<String, u64>>,
}
