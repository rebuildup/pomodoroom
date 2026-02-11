pub mod database;
pub mod schedule_db;
pub mod migrations;
mod config;

pub use database::{Database, SessionRecord, Stats};
pub use schedule_db::ScheduleDb;
pub use config::Config;

use std::path::PathBuf;

/// Returns `~/.config/pomodoroom/`, creating it if it doesn't exist.
///
/// # Errors
/// Returns an error if the home directory cannot be determined or if
/// creating the config directory fails.
pub fn data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("pomodoroom");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
