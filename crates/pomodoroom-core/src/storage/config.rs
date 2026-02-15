//! TOML-based application configuration.
//!
//! Stores user preferences including:
//! - Theme and appearance settings
//! - Notification preferences
//! - Window behavior (pinned, float modes)
//! - Custom Pomodoro schedules
//! - YouTube integration settings
//! - Keyboard shortcuts
//!
//! Configuration is stored at `~/.config/pomodoroom/config.toml`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use super::data_dir;
use crate::timer::Schedule;

/// Schedule-specific configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConfig {
    #[serde(default = "default_focus_duration")]
    pub focus_duration: u32,
    #[serde(default = "default_short_break")]
    pub short_break: u32,
    #[serde(default = "default_long_break")]
    pub long_break: u32,
    #[serde(default = "default_pomodoros_before_long_break")]
    pub pomodoros_before_long_break: u32,
}

/// Notification configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationsConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_50")]
    pub volume: u32,
    #[serde(default = "default_true")]
    pub vibration: bool,
    /// Path to custom notification sound file (optional).
    /// If set, this file will be played instead of the default electronic sound.
    #[serde(default)]
    pub custom_sound: Option<String>,
}

/// UI configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    #[serde(default = "default_dark_mode")]
    pub dark_mode: bool,
    #[serde(default = "default_accent_color")]
    pub highlight_color: String,
    #[serde(default = "default_sticky_widget_size")]
    pub sticky_widget_size: u32,
    #[serde(default = "default_youtube_widget_width")]
    pub youtube_widget_width: u32,
}

/// YouTube integration configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeConfig {
    #[serde(default = "default_true")]
    pub autoplay_on_focus: bool,
    #[serde(default = "default_true")]
    pub pause_on_break: bool,
    #[serde(default = "default_50")]
    pub default_volume: u32,
    #[serde(default = "default_true")]
    pub loop_enabled: bool,
}

/// Keyboard shortcuts configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutsConfig {
    #[serde(default)]
    pub bindings: HashMap<String, String>,
}

/// Application configuration.
///
/// Serialized to/from TOML at `~/.config/pomodoroom/config.toml`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub schedule: ScheduleConfig,
    #[serde(default)]
    pub notifications: NotificationsConfig,
    #[serde(default)]
    pub ui: UiConfig,
    #[serde(default)]
    pub youtube: YouTubeConfig,
    #[serde(default)]
    pub shortcuts: ShortcutsConfig,
    /// Custom schedule override (progressive or custom).
    #[serde(default)]
    pub custom_schedule: Option<Schedule>,
    /// Window: always on top.
    #[serde(default)]
    pub window_pinned: bool,
    /// Window: transparent float mode.
    #[serde(default)]
    pub window_float: bool,
    /// System tray enabled.
    #[serde(default)]
    pub tray_enabled: bool,
    #[serde(default = "default_true")]
    pub auto_advance: bool,
}

// Default functions
fn default_focus_duration() -> u32 {
    25
}
fn default_short_break() -> u32 {
    5
}
fn default_long_break() -> u32 {
    15
}
fn default_pomodoros_before_long_break() -> u32 {
    4
}
fn default_dark_mode() -> bool {
    true
}
fn default_accent_color() -> String {
    "#3b82f6".into()
}
fn default_true() -> bool {
    true
}
fn default_50() -> u32 {
    50
}
fn default_sticky_widget_size() -> u32 {
    220
}
fn default_youtube_widget_width() -> u32 {
    400
}

impl Default for ScheduleConfig {
    fn default() -> Self {
        Self {
            focus_duration: default_focus_duration(),
            short_break: default_short_break(),
            long_break: default_long_break(),
            pomodoros_before_long_break: default_pomodoros_before_long_break(),
        }
    }
}

impl Default for NotificationsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            volume: 50,
            vibration: true,
            custom_sound: None,
        }
    }
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            dark_mode: true,
            highlight_color: default_accent_color(),
            sticky_widget_size: 220,
            youtube_widget_width: 400,
        }
    }
}

impl Default for YouTubeConfig {
    fn default() -> Self {
        Self {
            autoplay_on_focus: true,
            pause_on_break: true,
            default_volume: 50,
            loop_enabled: true,
        }
    }
}

impl Default for ShortcutsConfig {
    fn default() -> Self {
        Self {
            bindings: HashMap::new(),
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            schedule: ScheduleConfig::default(),
            notifications: NotificationsConfig::default(),
            ui: UiConfig::default(),
            youtube: YouTubeConfig::default(),
            shortcuts: ShortcutsConfig::default(),
            custom_schedule: None,
            window_pinned: false,
            window_float: false,
            tray_enabled: false,
            auto_advance: true,
        }
    }
}

impl Config {
    fn get_json_value_by_path<'a>(
        root: &'a serde_json::Value,
        key: &str,
    ) -> Option<&'a serde_json::Value> {
        if key.is_empty() {
            return None;
        }

        let mut current = root;
        for part in key.split('.') {
            current = current.get(part)?;
        }
        Some(current)
    }

    fn set_json_value_by_path(
        root: &mut serde_json::Value,
        key: &str,
        value: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut parts = key.split('.').peekable();
        if parts.peek().is_none() {
            return Err("config key is empty".into());
        }

        let mut current = root;
        while let Some(part) = parts.next() {
            let is_leaf = parts.peek().is_none();
            if is_leaf {
                let obj = current
                    .as_object_mut()
                    .ok_or_else(|| format!("unknown config key: {key}"))?;
                let existing = obj
                    .get(part)
                    .ok_or_else(|| format!("unknown config key: {key}"))?;

                let new_value = match existing {
                    serde_json::Value::Bool(_) => serde_json::Value::Bool(value.parse::<bool>()?),
                    serde_json::Value::Number(_) => {
                        if let Ok(n) = value.parse::<u64>() {
                            serde_json::Value::Number(n.into())
                        } else if let Ok(n) = value.parse::<f64>() {
                            serde_json::Number::from_f64(n)
                                .map(serde_json::Value::Number)
                                .ok_or_else(|| format!("cannot parse '{value}' as number"))?
                        } else {
                            return Err(format!("cannot parse '{value}' as number").into());
                        }
                    }
                    serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                        serde_json::from_str(value)?
                    }
                    _ => serde_json::Value::String(value.into()),
                };

                obj.insert(part.to_string(), new_value);
                return Ok(());
            }

            current = current
                .get_mut(part)
                .ok_or_else(|| format!("unknown config key: {key}"))?;
        }

        Err(format!("unknown config key: {key}").into())
    }

    fn path() -> Result<PathBuf, Box<dyn std::error::Error>> {
        Ok(data_dir()?.join("config.toml"))
    }

    /// Load from disk or return default.
    ///
    /// # Errors
    ///
    /// Returns an error if the config file exists but cannot be parsed,
    /// or if the default config cannot be written to disk.
    pub fn load() -> Result<Self, Box<dyn std::error::Error>> {
        let path = Self::path()?;
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                let cfg: Config = toml::from_str(&content)?;
                Ok(cfg)
            }
            Err(_) => {
                let cfg = Self::default();
                cfg.save()?;
                Ok(cfg)
            }
        }
    }

    /// Persist to disk.
    ///
    /// # Errors
    ///
    /// Returns an error if the config cannot be serialized or written to disk.
    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let content = toml::to_string_pretty(self)?;
        std::fs::write(Self::path()?, content)?;
        Ok(())
    }

    /// Get a config value as string by dot-separated key.
    pub fn get(&self, key: &str) -> Option<String> {
        let json = serde_json::to_value(self).ok()?;
        let val = Self::get_json_value_by_path(&json, key)?;
        match val {
            serde_json::Value::String(s) => Some(s.clone()),
            other => Some(other.to_string()),
        }
    }

    /// Set a config value by key. Returns error if key is unknown.
    ///
    /// # Errors
    ///
    /// Returns an error if the key is unknown, the value cannot be parsed,
    /// or the config cannot be saved.
    pub fn set(&mut self, key: &str, value: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut json = serde_json::to_value(&*self)?;
        Self::set_json_value_by_path(&mut json, key, value)?;
        *self = serde_json::from_value(json)?;
        self.save()?;
        Ok(())
    }

    pub fn schedule(&self) -> Schedule {
        // Use custom_schedule if set, otherwise generate from ScheduleConfig
        if let Some(ref custom) = self.custom_schedule {
            custom.clone()
        } else {
            // Create a simple pomodoro schedule from config
            let focus = self.schedule.focus_duration;
            let short_break = self.schedule.short_break;
            let long_break = self.schedule.long_break;
            let pomodoros = self.schedule.pomodoros_before_long_break;

            let mut steps = Vec::new();
            for i in 0..pomodoros {
                steps.push(crate::timer::Step {
                    step_type: crate::timer::StepType::Focus,
                    duration_min: focus as u64,
                    label: format!("Focus {}", i + 1),
                    description: String::new(),
                });
                let is_long_break = (i + 1) as u32 % pomodoros == 0;
                steps.push(crate::timer::Step {
                    step_type: crate::timer::StepType::Break,
                    duration_min: if is_long_break {
                        long_break
                    } else {
                        short_break
                    } as u64,
                    label: if is_long_break {
                        "Long Break".to_string()
                    } else {
                        "Short Break".to_string()
                    },
                    description: String::new(),
                });
            }
            Schedule::new(steps).unwrap_or_else(|_| Schedule::default_progressive())
        }
    }

    /// Load from disk, returning default on error.
    /// This is a convenience method that never fails.
    pub fn load_or_default() -> Self {
        Self::load().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_roundtrip() {
        let cfg = Config::default();
        let toml_str = toml::to_string_pretty(&cfg).unwrap();
        let parsed: Config = toml::from_str(&toml_str).unwrap();
        assert_eq!(parsed.ui.dark_mode, true);
        assert_eq!(parsed.notifications.volume, 50);
    }

    #[test]
    fn get_supports_dot_path_keys() {
        let cfg = Config::default();
        assert_eq!(cfg.get("ui.dark_mode").as_deref(), Some("true"));
        assert_eq!(cfg.get("schedule.focus_duration").as_deref(), Some("25"));
        assert!(cfg.get("ui.missing_key").is_none());
    }

    #[test]
    fn set_json_value_by_path_updates_nested_bool() {
        let mut json = serde_json::to_value(Config::default()).unwrap();
        Config::set_json_value_by_path(&mut json, "ui.dark_mode", "false").unwrap();
        assert_eq!(
            Config::get_json_value_by_path(&json, "ui.dark_mode").unwrap(),
            &serde_json::Value::Bool(false)
        );
    }

    #[test]
    fn set_json_value_by_path_updates_nested_number() {
        let mut json = serde_json::to_value(Config::default()).unwrap();
        Config::set_json_value_by_path(&mut json, "notifications.volume", "75").unwrap();
        assert_eq!(
            Config::get_json_value_by_path(&json, "notifications.volume").unwrap(),
            &serde_json::Value::Number(75.into())
        );
    }

    #[test]
    fn set_json_value_by_path_updates_nested_string() {
        let mut json = serde_json::to_value(Config::default()).unwrap();
        Config::set_json_value_by_path(&mut json, "ui.highlight_color", "#FF5733").unwrap();
        assert_eq!(
            Config::get_json_value_by_path(&json, "ui.highlight_color").unwrap(),
            &serde_json::Value::String("#FF5733".to_string())
        );
    }

    #[test]
    fn set_json_value_by_path_rejects_unknown_key() {
        let mut json = serde_json::to_value(Config::default()).unwrap();
        let result = Config::set_json_value_by_path(&mut json, "ui.nonexistent_key", "value");
        assert!(result.is_err());
    }

    #[test]
    fn set_json_value_by_path_rejects_invalid_type() {
        let mut json = serde_json::to_value(Config::default()).unwrap();
        // Try to set a bool field to a non-bool value
        let result = Config::set_json_value_by_path(&mut json, "ui.dark_mode", "not_a_bool");
        assert!(result.is_err());
    }

    #[test]
    fn config_get_returns_string_for_all_types() {
        let cfg = Config::default();
        // Bool
        assert_eq!(cfg.get("ui.dark_mode"), Some("true".to_string()));
        // Number
        assert_eq!(cfg.get("notifications.volume"), Some("50".to_string()));
        // String
        assert!(cfg.get("ui.highlight_color").is_some());
    }

    #[test]
    fn config_default_values() {
        let cfg = Config::default();
        assert_eq!(cfg.ui.dark_mode, true);
        assert_eq!(cfg.ui.highlight_color, "#3b82f6");
        assert_eq!(cfg.ui.sticky_widget_size, 220);
        assert_eq!(cfg.ui.youtube_widget_width, 400);
        assert_eq!(cfg.notifications.enabled, true);
        assert_eq!(cfg.notifications.volume, 50);
        assert_eq!(cfg.schedule.focus_duration, 25);
        assert_eq!(cfg.schedule.short_break, 5);
        assert_eq!(cfg.schedule.long_break, 15);
    }

    #[test]
    fn config_serialization_preserves_all_fields() {
        let cfg = Config::default();
        let toml_str = toml::to_string_pretty(&cfg).unwrap();

        // Parse back and verify
        let parsed: Config = toml::from_str(&toml_str).unwrap();

        // Verify all major sections are preserved
        assert_eq!(parsed.ui.dark_mode, cfg.ui.dark_mode);
        assert_eq!(parsed.notifications.enabled, cfg.notifications.enabled);
        assert_eq!(parsed.schedule.focus_duration, cfg.schedule.focus_duration);
    }
}
