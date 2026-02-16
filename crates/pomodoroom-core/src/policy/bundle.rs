//! Policy bundle for import/export functionality.
//!
//! A policy bundle contains timer configuration that can be exported to JSON
//! and imported with semantic versioning compatibility checks.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::storage::Config;
use crate::timer::Schedule;

/// Current policy format version (semver).
/// Changes when the policy structure is modified in a way that affects compatibility.
pub const POLICY_VERSION: &str = "1.0.0";

/// Metadata describing the origin and intent of a policy.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PolicyMetadata {
    /// Human-readable name for this policy (e.g., "Deep Work Marathon").
    pub name: String,
    /// Author or source of the policy.
    #[serde(default)]
    pub author: String,
    /// Brief description of the policy's intent.
    #[serde(default)]
    pub intent: String,
    /// Additional notes or usage instructions.
    #[serde(default)]
    pub notes: String,
    /// When this policy was created.
    pub created_at: DateTime<Utc>,
}

impl Default for PolicyMetadata {
    fn default() -> Self {
        Self {
            name: "Unnamed Policy".to_string(),
            author: String::new(),
            intent: String::new(),
            notes: String::new(),
            created_at: Utc::now(),
        }
    }
}

/// Core timer policy data extracted from configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PolicyData {
    /// Focus duration in minutes.
    pub focus_duration: u32,
    /// Short break duration in minutes.
    pub short_break: u32,
    /// Long break duration in minutes.
    pub long_break: u32,
    /// Number of pomodoros before a long break.
    pub pomodoros_before_long_break: u32,
    /// Custom schedule override (if using progressive or custom schedules).
    #[serde(default)]
    pub custom_schedule: Option<Schedule>,
}

impl Default for PolicyData {
    fn default() -> Self {
        Self {
            focus_duration: 25,
            short_break: 5,
            long_break: 15,
            pomodoros_before_long_break: 4,
            custom_schedule: None,
        }
    }
}

/// A complete policy bundle ready for export/import.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PolicyBundle {
    /// Policy format version (semver).
    pub version: String,
    /// Metadata about this policy.
    pub metadata: PolicyMetadata,
    /// The actual policy settings.
    pub policy: PolicyData,
}

impl PolicyBundle {
    /// Create a new policy bundle from config values.
    pub fn new(
        name: String,
        focus_duration: u32,
        short_break: u32,
        long_break: u32,
        pomodoros_before_long_break: u32,
        custom_schedule: Option<Schedule>,
    ) -> Self {
        Self {
            version: POLICY_VERSION.to_string(),
            metadata: PolicyMetadata {
                name,
                ..Default::default()
            },
            policy: PolicyData {
                focus_duration,
                short_break,
                long_break,
                pomodoros_before_long_break,
                custom_schedule,
            },
        }
    }

    /// Create a policy bundle with custom metadata.
    pub fn with_metadata(
        metadata: PolicyMetadata,
        focus_duration: u32,
        short_break: u32,
        long_break: u32,
        pomodoros_before_long_break: u32,
        custom_schedule: Option<Schedule>,
    ) -> Self {
        Self {
            version: POLICY_VERSION.to_string(),
            metadata,
            policy: PolicyData {
                focus_duration,
                short_break,
                long_break,
                pomodoros_before_long_break,
                custom_schedule,
            },
        }
    }

    /// Serialize the bundle to a JSON string.
    ///
    /// # Errors
    /// Returns an error if serialization fails.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Deserialize a bundle from a JSON string.
    ///
    /// # Errors
    /// Returns an error if deserialization fails or the JSON is invalid.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Apply this policy to a config, overwriting schedule settings.
    pub fn apply_to_config(&self, config: &mut Config) {
        config.schedule.focus_duration = self.policy.focus_duration;
        config.schedule.short_break = self.policy.short_break;
        config.schedule.long_break = self.policy.long_break;
        config.schedule.pomodoros_before_long_break = self.policy.pomodoros_before_long_break;
        config.custom_schedule = self.policy.custom_schedule.clone();
    }
}

impl Default for PolicyBundle {
    fn default() -> Self {
        Self {
            version: POLICY_VERSION.to_string(),
            metadata: PolicyMetadata::default(),
            policy: PolicyData::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timer::{Step, StepType};

    fn create_test_schedule() -> Schedule {
        Schedule::new(vec![
            Step {
                step_type: StepType::Focus,
                duration_min: 30,
                label: "Focus".to_string(),
                description: String::new(),
            },
            Step {
                step_type: StepType::Break,
                duration_min: 10,
                label: "Break".to_string(),
                description: String::new(),
            },
        ])
        .expect("valid schedule")
    }

    #[test]
    fn policy_version_is_semver() {
        // POLICY_VERSION should be valid semver (major.minor.patch)
        let parts: Vec<&str> = POLICY_VERSION.split('.').collect();
        assert_eq!(parts.len(), 3, "Version should have 3 parts");
        assert!(parts[0].parse::<u32>().is_ok(), "Major should be numeric");
        assert!(parts[1].parse::<u32>().is_ok(), "Minor should be numeric");
        assert!(parts[2].parse::<u32>().is_ok(), "Patch should be numeric");
    }

    #[test]
    fn policy_metadata_default() {
        let meta = PolicyMetadata::default();
        assert_eq!(meta.name, "Unnamed Policy");
        assert_eq!(meta.author, "");
        assert_eq!(meta.intent, "");
        assert_eq!(meta.notes, "");
        assert!(meta.created_at <= Utc::now());
    }

    #[test]
    fn policy_data_default() {
        let data = PolicyData::default();
        assert_eq!(data.focus_duration, 25);
        assert_eq!(data.short_break, 5);
        assert_eq!(data.long_break, 15);
        assert_eq!(data.pomodoros_before_long_break, 4);
        assert!(data.custom_schedule.is_none());
    }

    #[test]
    fn policy_bundle_default() {
        let bundle = PolicyBundle::default();
        assert_eq!(bundle.version, POLICY_VERSION);
        assert_eq!(bundle.metadata.name, "Unnamed Policy");
        assert_eq!(bundle.policy.focus_duration, 25);
    }

    #[test]
    fn policy_bundle_new() {
        let bundle = PolicyBundle::new(
            "Test Policy".to_string(),
            50,
            10,
            30,
            3,
            None,
        );
        assert_eq!(bundle.version, POLICY_VERSION);
        assert_eq!(bundle.metadata.name, "Test Policy");
        assert_eq!(bundle.policy.focus_duration, 50);
        assert_eq!(bundle.policy.short_break, 10);
        assert_eq!(bundle.policy.long_break, 30);
        assert_eq!(bundle.policy.pomodoros_before_long_break, 3);
        assert!(bundle.policy.custom_schedule.is_none());
    }

    #[test]
    fn policy_bundle_with_custom_schedule() {
        let schedule = create_test_schedule();
        let bundle = PolicyBundle::new(
            "Custom Schedule Policy".to_string(),
            25,
            5,
            15,
            4,
            Some(schedule.clone()),
        );
        assert!(bundle.policy.custom_schedule.is_some());
        let custom = bundle.policy.custom_schedule.unwrap();
        assert_eq!(custom.steps.len(), 2);
    }

    #[test]
    fn policy_bundle_serialization_to_json() {
        let bundle = PolicyBundle::new(
            "JSON Test".to_string(),
            45,
            10,
            20,
            2,
            None,
        );
        let json = bundle.to_json().expect("serialization should succeed");
        assert!(json.contains("\"version\""));
        assert!(json.contains("\"metadata\""));
        assert!(json.contains("\"policy\""));
        assert!(json.contains("JSON Test"));
        assert!(json.contains("45"));
    }

    #[test]
    fn policy_bundle_deserialization_from_json() {
        let json = r#"{
            "version": "1.0.0",
            "metadata": {
                "name": "Imported Policy",
                "author": "Test Author",
                "intent": "Testing",
                "notes": "Some notes",
                "created_at": "2024-01-15T10:30:00Z"
            },
            "policy": {
                "focus_duration": 40,
                "short_break": 8,
                "long_break": 25,
                "pomodoros_before_long_break": 3,
                "custom_schedule": null
            }
        }"#;

        let bundle = PolicyBundle::from_json(json).expect("deserialization should succeed");
        assert_eq!(bundle.version, "1.0.0");
        assert_eq!(bundle.metadata.name, "Imported Policy");
        assert_eq!(bundle.metadata.author, "Test Author");
        assert_eq!(bundle.policy.focus_duration, 40);
        assert_eq!(bundle.policy.short_break, 8);
        assert_eq!(bundle.policy.long_break, 25);
        assert_eq!(bundle.policy.pomodoros_before_long_break, 3);
    }

    #[test]
    fn policy_bundle_roundtrip() {
        let original = PolicyBundle::new(
            "Roundtrip Test".to_string(),
            60,
            15,
            30,
            2,
            None,
        );

        let json = original.to_json().expect("serialization should succeed");
        let restored = PolicyBundle::from_json(&json).expect("deserialization should succeed");

        assert_eq!(restored.version, original.version);
        assert_eq!(restored.metadata.name, original.metadata.name);
        assert_eq!(restored.policy.focus_duration, original.policy.focus_duration);
        assert_eq!(restored.policy.short_break, original.policy.short_break);
        assert_eq!(restored.policy.long_break, original.policy.long_break);
        assert_eq!(
            restored.policy.pomodoros_before_long_break,
            original.policy.pomodoros_before_long_break
        );
    }

    #[test]
    fn policy_bundle_roundtrip_with_custom_schedule() {
        let schedule = create_test_schedule();
        let original = PolicyBundle::new(
            "Schedule Roundtrip".to_string(),
            30,
            5,
            15,
            4,
            Some(schedule),
        );

        let json = original.to_json().expect("serialization should succeed");
        let restored = PolicyBundle::from_json(&json).expect("deserialization should succeed");

        assert!(restored.policy.custom_schedule.is_some());
        let restored_schedule = restored.policy.custom_schedule.unwrap();
        assert_eq!(restored_schedule.steps.len(), 2);
        assert_eq!(restored_schedule.steps[0].duration_min, 30);
        assert_eq!(restored_schedule.steps[1].duration_min, 10);
    }

    #[test]
    fn policy_bundle_with_metadata() {
        let metadata = PolicyMetadata {
            name: "Custom Named Policy".to_string(),
            author: "John Doe".to_string(),
            intent: "Maximize deep work sessions".to_string(),
            notes: "Best used in the morning".to_string(),
            created_at: "2024-06-01T08:00:00Z".parse().unwrap(),
        };

        let bundle = PolicyBundle::with_metadata(
            metadata.clone(),
            90,
            20,
            60,
            2,
            None,
        );

        assert_eq!(bundle.metadata.name, "Custom Named Policy");
        assert_eq!(bundle.metadata.author, "John Doe");
        assert_eq!(bundle.metadata.intent, "Maximize deep work sessions");
        assert_eq!(bundle.metadata.notes, "Best used in the morning");
        assert_eq!(bundle.policy.focus_duration, 90);
    }

    #[test]
    fn policy_bundle_invalid_json_returns_error() {
        let invalid_json = "{ not valid json }";
        let result = PolicyBundle::from_json(invalid_json);
        assert!(result.is_err());
    }

    #[test]
    fn policy_bundle_missing_required_field_returns_error() {
        let incomplete_json = r#"{
            "version": "1.0.0",
            "metadata": {
                "name": "Incomplete",
                "created_at": "2024-01-15T10:30:00Z"
            }
        }"#;
        let result = PolicyBundle::from_json(incomplete_json);
        assert!(result.is_err());
    }

    #[test]
    fn test_apply_to_config() {
        let bundle = PolicyBundle {
            version: "1.0.0".to_string(),
            metadata: PolicyMetadata::default(),
            policy: PolicyData {
                focus_duration: 50,
                short_break: 10,
                long_break: 30,
                pomodoros_before_long_break: 2,
                custom_schedule: None,
            },
        };

        let mut config = Config::default();
        bundle.apply_to_config(&mut config);

        assert_eq!(config.schedule.focus_duration, 50);
        assert_eq!(config.schedule.short_break, 10);
        assert_eq!(config.schedule.long_break, 30);
        assert_eq!(config.schedule.pomodoros_before_long_break, 2);
    }
}
