pub mod database;
mod config;

pub use database::{Database, SessionRecord, Stats};
pub use config::Config;

use std::path::PathBuf;

/// Returns `~/.pomodoroom/`, creating it if it doesn't exist.
pub fn data_dir() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".pomodoroom");
    std::fs::create_dir_all(&dir).ok();
    dir
}
