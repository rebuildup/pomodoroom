//! Google Calendar synchronization layer.
//!
//! Provides bidirectional sync between local SQLite and Google Calendar.
//! All data is stored as calendar events in a dedicated "Pomodoroom" calendar.

pub mod calendar_client;
pub mod conflict_resolver;
pub mod device_id;
pub mod event_codec;
pub mod sync_engine;
pub mod sync_queue;
pub mod types;

#[cfg(test)]
mod calendar_client_tests;
#[cfg(test)]
mod event_codec_tests;

pub use calendar_client::{CalendarClient, find_pomodoroom_calendar_in_list, to_gcal_event};
pub use conflict_resolver::{MergeDecision as ConflictMergeDecision, merge_task_fields, merge_task_state, resolve_conflict};
pub use device_id::{get_or_create_device_id, get_or_create_device_id_at, DeviceIdError};
pub use sync_engine::{MergeDecision, SyncEngine, decide_merge};
pub use sync_queue::SyncQueue;
pub use types::{SyncEvent, SyncEventType, SyncStatus, SyncError};
