pub mod calendar_db;
pub mod calendar_db_client;
pub mod discord;
pub mod github;
pub mod google;
pub mod linear;
pub mod notion;
pub mod oauth;
pub mod slack;
pub mod traits;

pub use traits::Integration;
pub use calendar_db::{
    CalendarCheckpoint, CalendarDbConfig, CalendarEventPayload, CalendarEventType,
    CalendarLogEntry, CalendarLogStats,
};
pub use calendar_db_client::CalendarDbClient;

/// Thin wrapper around the OS keyring for credential storage.
pub mod keyring_store {
    const SERVICE: &str = "pomodoroom";

    pub fn get(key: &str) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let entry = keyring::Entry::new(SERVICE, key)?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn set(key: &str, value: &str) -> Result<(), Box<dyn std::error::Error>> {
        let entry = keyring::Entry::new(SERVICE, key)?;
        entry.set_password(value)?;
        Ok(())
    }

    pub fn delete(key: &str) -> Result<(), Box<dyn std::error::Error>> {
        let entry = keyring::Entry::new(SERVICE, key)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
