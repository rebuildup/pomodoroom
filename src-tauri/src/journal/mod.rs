//! Crash-safe transition journal for task state.
//!
//! This module provides an append-only journal for recording state transitions,
//! enabling recovery from crashes by replaying uncommitted changes.
//!
//! ## Purpose
//! When the application crashes during a state transition, the database may be
//! left in an inconsistent state. This journal records all transitions before
//! they're applied, allowing recovery on startup.
//!
//! ## Usage
//! ```rust,ignore
//! use journal::{TransitionJournal, JournalEntry};
//!
//! let journal = TransitionJournal::open()?;
//!
//! // Record a transition before applying
//! journal.append(&JournalEntry::task_transition("task-123", TaskState::Running, TaskState::Paused))?;
//!
//! // Mark checkpoint after successful apply
//! journal.checkpoint("task-123")?;
//!
//! // On startup, replay uncommitted entries
//! let pending = journal.get_pending_entries()?;
//! for entry in pending {
//!     // Replay the transition...
//! }
//! ```

mod entry;
mod recovery;
mod storage;

#[allow(unused_imports)]
pub use entry::{EntryId, EntryStatus, JournalEntry, JournalError, TransitionType};
#[allow(unused_imports)]
pub use recovery::{RecoveryAction, RecoveryEngine, RecoveryImpact, RecoveryPlan, RecoveryResult};
#[allow(unused_imports)]
pub use storage::{JournalConfig, JournalStats, JournalStorage};
