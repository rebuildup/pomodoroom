mod config;
pub mod database;
pub mod migrations;
pub mod profiles;
pub mod schedule_db;

pub use config::{Config, NotificationsConfig, ScheduleConfig, ShortcutsConfig, UiConfig, YouTubeConfig};
pub use database::{AccuracyDataRow, Database, EnergyCurveRow, SessionRecord, Stats};
pub use profiles::{
    find_pack, get_builtin_packs, pack_ids, ProfileBackup, ProfileComparison, ProfileConfig,
    ProfileManager, ProfilePack, ProfilePackId, ProfilePerformance,
};
pub use schedule_db::{DataResetOptions, DataResetSummary, ScheduleDb};

use std::path::PathBuf;

/// Returns `~/.config/pomodoroom[-dev]/` based on POMODOROOM_ENV.
///
/// Set POMODOROOM_ENV=dev to use development data directory.
///
/// # Errors
/// Returns an error if the home directory cannot be determined or if
/// creating the config directory fails.
pub fn data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let base_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config");

    let env = std::env::var("POMODOROOM_ENV").unwrap_or_else(|_| "production".to_string());

    let dir = if env == "dev" {
        base_dir.join("pomodoroom-dev")
    } else {
        base_dir.join("pomodoroom")
    };

    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
