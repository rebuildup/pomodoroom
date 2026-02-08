use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::data_dir;
use crate::timer::Schedule;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_true")]
    pub notification_sound: bool,
    #[serde(default = "default_50")]
    pub notification_volume: u32,
    #[serde(default = "default_true")]
    pub vibration: bool,
    #[serde(default)]
    pub schedule: Option<Schedule>,
    #[serde(default = "default_true")]
    pub auto_advance: bool,
    /// Window: always on top.
    #[serde(default)]
    pub window_pinned: bool,
    /// Window: transparent float mode.
    #[serde(default)]
    pub window_float: bool,
    /// System tray enabled.
    #[serde(default)]
    pub tray_enabled: bool,
}

fn default_theme() -> String {
    "dark".into()
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

impl Default for Config {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            accent_color: default_accent_color(),
            notification_sound: true,
            notification_volume: 50,
            vibration: true,
            schedule: None,
            auto_advance: true,
            window_pinned: false,
            window_float: false,
            tray_enabled: false,
        }
    }
}

impl Config {
    fn path() -> PathBuf {
        data_dir().join("config.toml")
    }

    /// Load from disk or return default.
    pub fn load() -> Self {
        let path = Self::path();
        match std::fs::read_to_string(&path) {
            Ok(content) => toml::from_str(&content).unwrap_or_default(),
            Err(_) => {
                let cfg = Self::default();
                cfg.save().ok();
                cfg
            }
        }
    }

    /// Persist to disk.
    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let content = toml::to_string_pretty(self)?;
        std::fs::write(Self::path(), content)?;
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
    pub fn set(&mut self, key: &str, value: &str) -> Result<(), String> {
        let mut json = serde_json::to_value(&*self).map_err(|e| e.to_string())?;
        let obj = json.as_object_mut().ok_or("config is not an object")?;
        if !obj.contains_key(key) {
            return Err(format!("unknown config key: {key}"));
        }

        // Try to parse as the existing type.
        let existing = &obj[key];
        let new_value = match existing {
            serde_json::Value::Bool(_) => {
                serde_json::Value::Bool(value.parse::<bool>().map_err(|e| e.to_string())?)
            }
            serde_json::Value::Number(_) => {
                if let Ok(n) = value.parse::<u64>() {
                    serde_json::Value::Number(n.into())
                } else if let Ok(n) = value.parse::<f64>() {
                    serde_json::Number::from_f64(n)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::String(value.into()))
                } else {
                    return Err(format!("cannot parse '{value}' as number"));
                }
            }
            _ => serde_json::Value::String(value.into()),
        };

        obj.insert(key.to_string(), new_value);
        *self = serde_json::from_value(json).map_err(|e| e.to_string())?;
        self.save().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn schedule(&self) -> Schedule {
        self.schedule.clone().unwrap_or_default()
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
        assert_eq!(parsed.theme, "dark");
        assert_eq!(parsed.notification_volume, 50);
    }
}
