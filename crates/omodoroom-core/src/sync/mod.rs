// Sync module for Google Calendar integration
//
// This module handles multi-device synchronization via Google Calendar.

pub mod device_id;

pub use device_id::{get_or_create_device_id, get_or_create_device_id_at, DeviceIdError};
