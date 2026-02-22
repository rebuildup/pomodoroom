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

/// Returns `~/.config/pomodoroom[-dev]/` based on build mode or POMODOROOM_ENV.
///
/// Priority:
/// 1. POMODOROOM_ENV=dev → pomodoroom-dev
/// 2. POMODOROOM_ENV=production → pomodoroom
/// 3. Debug build (cfg(debug_assertions)) → pomodoroom-dev
/// 4. Release build → pomodoroom
///
/// This ensures development and production data are always separated.
///
/// # Errors
/// Returns an error if the home directory cannot be determined or if
/// creating the config directory fails.
pub fn data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let base_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config");

    // Check environment variable first (allows override)
    let use_dev = match std::env::var("POMODOROOM_ENV").as_deref() {
        Ok("dev") => true,
        Ok("production") => false,
        // No env var set: use debug build mode as default
        _ => cfg!(debug_assertions),
    };

    let dir = if use_dev {
        base_dir.join("pomodoroom-dev")
    } else {
        base_dir.join("pomodoroom")
    };

    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
