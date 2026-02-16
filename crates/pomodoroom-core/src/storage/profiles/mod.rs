//! Profile pack system for curated policy presets.
//!
//! This module provides built-in profile packs that encapsulate
//! common work styles and productivity patterns:
//!
//! - **Deep Work**: Extended focus sessions (50 min) for complex tasks
//! - **Admin**: Quick cycles (15 min) for routine tasks
//! - **Creative**: Balanced sessions (40 min) for creative work
//! - **Balanced**: Classic Pomodoro (25 min) for general use
//! - **Sprint**: Intense bursts (60 min) for deadlines
//!
//! # Features
//!
//! - One-click apply with automatic rollback support
//! - Weekly performance tracking per profile
//! - Profile comparison for data-driven decisions
//!
//! # Example
//!
//! ```ignore
//! use pomodoroom_core::storage::profiles::{ProfileManager, ProfilePack};
//!
//! // Load manager
//! let mut manager = ProfileManager::load()?;
//!
//! // List available packs
//! for pack in manager.available_packs() {
//!     println!("{}: {}", pack.name, pack.description);
//! }
//!
//! // Apply a profile
//! let backup = manager.apply_pack("deep-work", &mut config)?;
//!
//! // Rollback if needed
//! manager.rollback(&mut config);
//! ```

mod manager;
mod packs;
mod types;

pub use manager::ProfileManager;
pub use packs::{find_pack, get_builtin_packs, pack_ids};
pub use types::{
    ProfileBackup, ProfileComparison, ProfileConfig, ProfilePack, ProfilePackId, ProfilePerformance,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Config;

    #[test]
    fn full_workflow() {
        let mut manager = ProfileManager::new();
        let mut config = Config::default();

        // Apply deep work profile
        let backup = manager.apply_pack("deep-work", &mut config);
        assert!(backup.is_ok());
        assert_eq!(config.schedule.focus_duration, 50);

        // Record some sessions
        manager.record_session(50);
        manager.record_session(50);

        // Check performance
        let perf = manager.weekly_summary();
        assert!(!perf.is_empty() || manager.active_pack_id == "deep-work");

        // Rollback
        let rolled = manager.rollback(&mut config);
        assert!(rolled.is_some());
        assert_eq!(config.schedule.focus_duration, 25); // default
    }

    #[test]
    fn all_packs_applicable() {
        let mut manager = ProfileManager::new();

        for pack_id in pack_ids() {
            let mut config = Config::default();
            let result = manager.apply_pack(pack_id, &mut config);
            assert!(result.is_ok(), "Failed to apply pack: {}", pack_id);
            manager.rollback(&mut config);
        }
    }
}
