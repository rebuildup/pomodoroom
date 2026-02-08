pub mod traits;
pub mod oauth;
pub mod google;
pub mod notion;
pub mod linear;
pub mod github;
pub mod discord;
pub mod slack;

pub use traits::Integration;

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
