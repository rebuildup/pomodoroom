//! Google Calendar synchronization layer.
//!
//! Provides bidirectional sync between local SQLite and Google Calendar.
//! All data is stored as calendar events in a dedicated "Pomodoroom" calendar.

pub mod calendar_client;
pub mod device_id;
pub mod event_codec;
pub mod types;

#[cfg(test)]
mod calendar_client_tests;
#[cfg(test)]
mod event_codec_tests;

pub use calendar_client::{CalendarClient, find_pomodoroom_calendar_in_list, to_gcal_event};
pub use device_id::{get_or_create_device_id, get_or_create_device_id_at, DeviceIdError};
pub use types::{SyncEvent, SyncEventType, SyncStatus, SyncError};
