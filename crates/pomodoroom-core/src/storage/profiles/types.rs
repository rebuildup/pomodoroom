//! Profile pack types for curated policy presets.
//!
//! Provides built-in profiles for common work styles:
//! - Deep Work: Long focus sessions, minimal breaks
//! - Admin: Short tasks, frequent breaks
//! - Creative: Balanced sessions with flexibility

use serde::{Deserialize, Serialize};

use crate::storage::{
    Config, NotificationsConfig, ScheduleConfig, ShortcutsConfig, UiConfig, YouTubeConfig,
};

/// Unique identifier for a profile pack.
pub type ProfilePackId = String;

/// A curated profile pack with documented rationale.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilePack {
    /// Unique identifier (e.g., "deep-work", "admin", "creative").
    pub id: ProfilePackId,
    /// Human-readable display name.
    pub name: String,
    /// Brief description of the intended use case.
    pub description: String,
    /// Detailed rationale explaining why these settings work.
    pub rationale: String,
    /// The configuration values this pack applies.
    pub config: ProfileConfig,
    /// Category for grouping (e.g., "focus", "balanced", "flexible").
    #[serde(default)]
    pub category: String,
    /// Icon identifier for UI display.
    #[serde(default)]
    pub icon: String,
}

/// Configuration subset that a profile can override.
/// Missing fields mean "use current value" (partial application).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileConfig {
    #[serde(default)]
    pub schedule: Option<ScheduleConfig>,
    #[serde(default)]
    pub notifications: Option<NotificationsConfig>,
    #[serde(default)]
    pub ui: Option<UiConfig>,
    #[serde(default)]
    pub youtube: Option<YouTubeConfig>,
    #[serde(default)]
    pub shortcuts: Option<ShortcutsConfig>,
    #[serde(default)]
    pub window_pinned: Option<bool>,
    #[serde(default)]
    pub window_float: Option<bool>,
    #[serde(default)]
    pub tray_enabled: Option<bool>,
    #[serde(default)]
    pub auto_advance: Option<bool>,
}

impl ProfilePack {
    /// Create a new profile pack with the given settings.
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        description: impl Into<String>,
        rationale: impl Into<String>,
        config: ProfileConfig,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            rationale: rationale.into(),
            config,
            category: String::new(),
            icon: String::new(),
        }
    }

    /// Apply this profile's configuration to the given config.
    /// Returns a backup of the original values for rollback.
    pub fn apply_to(&self, config: &mut Config) -> ProfileBackup {
        let backup = ProfileBackup::capture(config);

        if let Some(ref schedule) = self.config.schedule {
            config.schedule = schedule.clone();
        }
        if let Some(ref notifications) = self.config.notifications {
            config.notifications = notifications.clone();
        }
        if let Some(ref ui) = self.config.ui {
            config.ui = ui.clone();
        }
        if let Some(ref youtube) = self.config.youtube {
            config.youtube = youtube.clone();
        }
        if let Some(ref shortcuts) = self.config.shortcuts {
            config.shortcuts = shortcuts.clone();
        }
        if let Some(pinned) = self.config.window_pinned {
            config.window_pinned = pinned;
        }
        if let Some(float) = self.config.window_float {
            config.window_float = float;
        }
        if let Some(tray) = self.config.tray_enabled {
            config.tray_enabled = tray;
        }
        if let Some(advance) = self.config.auto_advance {
            config.auto_advance = advance;
        }

        backup
    }
}

/// Snapshot of config values before a profile was applied.
/// Used for rollback functionality.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileBackup {
    /// The pack that was applied (for reference).
    pub pack_id: ProfilePackId,
    /// Timestamp when the backup was created.
    pub created_at: String,
    /// The configuration state before applying.
    pub config: Config,
}

impl ProfileBackup {
    /// Capture the current config state for later rollback.
    pub fn capture(config: &Config) -> Self {
        Self {
            pack_id: String::new(),
            created_at: chrono_like_timestamp(),
            config: config.clone(),
        }
    }

    /// Create a backup with the pack ID.
    pub fn for_pack(pack_id: impl Into<String>, config: &Config) -> Self {
        Self {
            pack_id: pack_id.into(),
            created_at: chrono_like_timestamp(),
            config: config.clone(),
        }
    }

    /// Restore the backed-up configuration.
    pub fn restore(&self, config: &mut Config) {
        *config = self.config.clone();
    }
}

/// Weekly performance metrics for a profile.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfilePerformance {
    /// Profile pack ID.
    pub pack_id: ProfilePackId,
    /// Week identifier (ISO week format, e.g., "2024-W03").
    pub week: String,
    /// Total focus minutes achieved.
    pub focus_minutes: u64,
    /// Number of completed pomodoros.
    pub pomodoros_completed: u64,
    /// Average session length in minutes.
    pub avg_session_length: f64,
    /// Number of times the user switched away from this profile.
    pub switches: u64,
    /// User satisfaction rating (1-5, if provided).
    pub rating: Option<u8>,
}

impl ProfilePerformance {
    /// Create a new performance record for the current week.
    pub fn new(pack_id: impl Into<String>) -> Self {
        Self {
            pack_id: pack_id.into(),
            week: current_iso_week(),
            ..Default::default()
        }
    }

    /// Record a completed focus session.
    pub fn record_session(&mut self, duration_min: u64) {
        self.focus_minutes += duration_min;
        self.pomodoros_completed += 1;
        // Update running average
        let total = self.avg_session_length * (self.pomodoros_completed - 1) as f64;
        self.avg_session_length = (total + duration_min as f64) / self.pomodoros_completed as f64;
    }

    /// Record a profile switch.
    pub fn record_switch(&mut self) {
        self.switches += 1;
    }
}

/// Comparison results between two profile performances.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileComparison {
    pub pack_a: ProfilePackId,
    pub pack_b: ProfilePackId,
    pub focus_minutes_diff: i64,
    pub pomodoros_diff: i64,
    pub avg_session_diff: f64,
    pub recommendation: String,
}

impl ProfileComparison {
    /// Compare two profile performances.
    pub fn compare(a: &ProfilePerformance, b: &ProfilePerformance) -> Self {
        let focus_diff = a.focus_minutes as i64 - b.focus_minutes as i64;
        let pom_diff = a.pomodoros_completed as i64 - b.pomodoros_completed as i64;
        let avg_diff = a.avg_session_length - b.avg_session_length;

        let better = if focus_diff > 0 { &a.pack_id } else { &b.pack_id };
        let recommendation = if focus_diff.abs() < 10 {
            "Both profiles show similar performance.".to_string()
        } else {
            format!("{} shows better focus results.", better)
        };

        Self {
            pack_a: a.pack_id.clone(),
            pack_b: b.pack_id.clone(),
            focus_minutes_diff: focus_diff,
            pomodoros_diff: pom_diff,
            avg_session_diff: avg_diff,
            recommendation,
        }
    }
}

/// Helper to get ISO week string without chrono dependency.
fn current_iso_week() -> String {
    // Simple approximation using current date
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let days = now.as_secs() / 86400;
    let year = 1970 + days / 365;
    let day_of_year = days % 365;
    let week = day_of_year / 7 + 1;
    format!("{}-W{:02}", year, week)
}

/// Helper to get timestamp string.
fn chrono_like_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_secs())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_pack_apply_partial() {
        let mut config = Config::default();
        let original_focus = config.schedule.focus_duration;

        let pack = ProfilePack::new(
            "test",
            "Test",
            "Test pack",
            "Testing",
            ProfileConfig {
                schedule: Some(ScheduleConfig {
                    focus_duration: 50,
                    short_break: 10,
                    long_break: 20,
                    pomodoros_before_long_break: 3,
                }),
                ..Default::default()
            },
        );

        let backup = pack.apply_to(&mut config);

        assert_eq!(config.schedule.focus_duration, 50);
        assert_ne!(config.schedule.focus_duration, original_focus);
        // Other fields should remain default
        assert_eq!(backup.config.schedule.focus_duration, original_focus);
    }

    #[test]
    fn profile_backup_restore() {
        let mut config = Config::default();
        config.schedule.focus_duration = 30;

        let backup = ProfileBackup::for_pack("test", &config);

        config.schedule.focus_duration = 50;
        assert_eq!(config.schedule.focus_duration, 50);

        backup.restore(&mut config);
        assert_eq!(config.schedule.focus_duration, 30);
    }

    #[test]
    fn profile_performance_tracking() {
        let mut perf = ProfilePerformance::new("deep-work");
        perf.record_session(25);
        perf.record_session(25);
        perf.record_session(30);

        assert_eq!(perf.focus_minutes, 80);
        assert_eq!(perf.pomodoros_completed, 3);
        assert!((perf.avg_session_length - 26.666).abs() < 0.1);
    }

    #[test]
    fn profile_comparison() {
        let mut a = ProfilePerformance::new("deep-work");
        a.record_session(50);
        a.record_session(50);

        let mut b = ProfilePerformance::new("admin");
        b.record_session(15);
        b.record_session(15);
        b.record_session(15);

        let comp = ProfileComparison::compare(&a, &b);
        assert_eq!(comp.focus_minutes_diff, 55);
        assert!(comp.recommendation.contains("deep-work"));
    }
}
