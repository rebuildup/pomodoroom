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
fn default_focus_duration() -> u32 { 25 }
fn default_short_break() -> u32 { 5 }
fn default_long_break() -> u32 { 30 }
fn default_pomodoros_before_long_break() -> u32 { 4 }
fn default_dark_mode() -> bool { true }
fn default_accent_color() -> String { "#3b82f6".into() }
fn default_true() -> bool { true }
fn default_50() -> u32 { 50 }
fn default_sticky_widget_size() -> u32 { 220 }
fn default_youtube_widget_width() -> u32 { 400 }

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
        let val = json.get(key)?;
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
        let obj = json.as_object_mut().ok_or("config is not an object")?;
        if !obj.contains_key(key) {
            return Err(format!("unknown config key: {key}").into());
        }

        // Try to parse as the existing type.
        let existing = &obj[key];
        let new_value = match existing {
            serde_json::Value::Bool(_) => {
                serde_json::Value::Bool(value.parse::<bool>()?)
            }
            serde_json::Value::Number(_) => {
                if let Ok(n) = value.parse::<u64>() {
                    serde_json::Value::Number(n.into())
                } else if let Ok(n) = value.parse::<f64>() {
                    serde_json::Number::from_f64(n)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::String(value.into()))
                } else {
                    return Err(format!("cannot parse '{value}' as number").into());
                }
            }
            _ => serde_json::Value::String(value.into()),
        };

        obj.insert(key.to_string(), new_value);
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
                    duration_min: if is_long_break { long_break } else { short_break } as u64,
                    label: if is_long_break { "Long Break".to_string() } else { "Short Break".to_string() },
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
}
