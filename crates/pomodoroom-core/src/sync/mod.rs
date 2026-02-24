//! Google Calendar synchronization layer.
//!
//! Provides bidirectional sync between local SQLite and Google Calendar.
//! All data is stored as calendar events in a dedicated "Pomodoroom" calendar.

pub mod device_id;
pub mod types;

pub use device_id::{get_or_create_device_id, get_or_create_device_id_at, DeviceIdError};
pub use types::{SyncEvent, SyncEventType, SyncStatus, SyncError};
