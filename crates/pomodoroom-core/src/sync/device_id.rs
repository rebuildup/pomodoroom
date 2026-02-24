// Device ID management for multi-device sync
// Format: "pomodoro-<uuid>"

use std::path::Path;
use std::fs;
use std::io::Write;
use uuid::Uuid;

const DEVICE_ID_FILE: &str = "device_id.txt";
const DEVICE_ID_PREFIX: &str = "pomodoro-";

/// Error type for device ID operations
#[derive(Debug, thiserror::Error)]
pub enum DeviceIdError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid device ID format: {0}")]
    InvalidFormat(String),
}

/// Get or create device ID at the specified path.
/// Creates a new device ID file if it doesn't exist.
///
/// # Arguments
/// * `path` - Directory path where device_id.txt is stored
///
/// # Returns
/// Device ID string in format "pomodoro-<uuid>"
pub fn get_or_create_device_id_at(path: &Path) -> Result<String, DeviceIdError> {
    let device_id_path = path.join(DEVICE_ID_FILE);

    // Try to read existing device ID
    if device_id_path.exists() {
        let content = fs::read_to_string(&device_id_path)?;
        let device_id = content.trim().to_string();

        // Validate format
        if device_id.starts_with(DEVICE_ID_PREFIX) {
            return Ok(device_id);
        } else {
            return Err(DeviceIdError::InvalidFormat(device_id));
        }
    }

    // Generate new device ID
    let uuid = Uuid::new_v4().to_string();
    let device_id = format!("{}{}", DEVICE_ID_PREFIX, uuid);

    // Ensure directory exists
    if !path.exists() {
        fs::create_dir_all(path)?;
    }

    // Write device ID to file
    let mut file = fs::File::create(&device_id_path)?;
    writeln!(file, "{}", device_id)?;

    Ok(device_id)
}

/// Get or create device ID using the default data directory.
/// Uses `~/.pomodoroom/` as the default path.
///
/// # Returns
/// Device ID string in format "pomodoro-<uuid>"
pub fn get_or_create_device_id() -> Result<String, DeviceIdError> {
    let data_dir = dirs::data_local_dir()
        .map(|p| p.join("pomodoroom"))
        .ok_or_else(|| DeviceIdError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Could not determine data directory",
        )))?;

    get_or_create_device_id_at(&data_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_device_id_format() {
        let temp_dir = TempDir::new().unwrap();
        let device_id = get_or_create_device_id_at(temp_dir.path()).unwrap();

        assert!(device_id.starts_with(DEVICE_ID_PREFIX));
        // Format: pomodoro-<uuid> (36 chars for UUID + prefix)
        assert_eq!(device_id.len(), DEVICE_ID_PREFIX.len() + 36);
    }

    #[test]
    fn test_device_id_persistence() {
        let temp_dir = TempDir::new().unwrap();

        // First call creates device ID
        let device_id1 = get_or_create_device_id_at(temp_dir.path()).unwrap();

        // Second call reads the same device ID
        let device_id2 = get_or_create_device_id_at(temp_dir.path()).unwrap();

        assert_eq!(device_id1, device_id2);
    }

    #[test]
    fn test_device_id_creates_directory() {
        let temp_dir = TempDir::new().unwrap();
        let nested_path = temp_dir.path().join("nested/path");

        assert!(!nested_path.exists());

        let device_id = get_or_create_device_id_at(&nested_path).unwrap();

        assert!(nested_path.exists());
        assert!(device_id.starts_with(DEVICE_ID_PREFIX));
    }

    #[test]
    fn test_device_id_invalid_format_rejected() {
        let temp_dir = TempDir::new().unwrap();
        let device_id_path = temp_dir.path().join(DEVICE_ID_FILE);

        // Write invalid device ID (missing prefix)
        let mut file = fs::File::create(&device_id_path).unwrap();
        writeln!(file, "invalid-id-123").unwrap();

        let result = get_or_create_device_id_at(temp_dir.path());
        assert!(matches!(result, Err(DeviceIdError::InvalidFormat(_))));
    }

    #[test]
    fn test_device_id_valid_format_accepted() {
        let temp_dir = TempDir::new().unwrap();
        let device_id_path = temp_dir.path().join(DEVICE_ID_FILE);

        // Write valid device ID
        let mut file = fs::File::create(&device_id_path).unwrap();
        writeln!(file, "pomodoro-123e4567-e89b-12d3-a456-426614174000").unwrap();

        let device_id = get_or_create_device_id_at(temp_dir.path()).unwrap();
        assert_eq!(device_id, "pomodoro-123e4567-e89b-12d3-a456-426614174000");
    }

    #[test]
    fn test_device_id_uuid_uniqueness() {
        let temp_dir1 = TempDir::new().unwrap();
        let temp_dir2 = TempDir::new().unwrap();

        let device_id1 = get_or_create_device_id_at(temp_dir1.path()).unwrap();
        let device_id2 = get_or_create_device_id_at(temp_dir2.path()).unwrap();

        // Device IDs should be unique (different UUIDs)
        assert_ne!(device_id1, device_id2);
    }
}
