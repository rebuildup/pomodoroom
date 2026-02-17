//! Diagnostics bundle generation for troubleshooting and bug reports
//!
//! This module provides functionality to generate anonymized diagnostics
//! bundles that can be safely shared when reporting issues. All sensitive
//! data is either anonymized or redacted before inclusion.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Current version of the diagnostics bundle format
pub const BUNDLE_VERSION: &str = "1.0.0";

/// Complete diagnostics bundle for troubleshooting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsBundle {
    /// Version of the bundle format
    pub version: String,
    /// When this bundle was generated
    pub created_at: DateTime<Utc>,
    /// Application version that generated the bundle
    pub app_version: String,
    /// SHA-256 hash of the bundle contents for integrity
    pub hash: String,
    /// Redacted configuration
    pub config: RedactedConfig,
    /// Anonymized session timeline
    pub timeline: AnonymizedTimeline,
    /// Scheduling events
    pub events: Vec<SchedulingEvent>,
}

/// Configuration with sensitive fields redacted
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedactedConfig {
    /// Schedule configuration (redacted)
    pub schedule_config: serde_json::Value,
    /// Scheduler configuration (redacted)
    pub scheduler_config: serde_json::Value,
    /// List of field names that were redacted
    pub redacted_fields: Vec<String>,
}

/// Anonymized timeline of sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymizedTimeline {
    /// Anonymized sessions
    pub sessions: Vec<AnonymizedSession>,
    /// Date range covered (start, end)
    pub date_range: (String, String),
    /// Total number of sessions
    pub total_sessions: usize,
}

/// Single anonymized session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnonymizedSession {
    /// Type of session (focus/break)
    pub session_type: String,
    /// Duration in minutes
    pub duration_min: u64,
    /// When the session started
    pub started_at: DateTime<Utc>,
    /// When the session completed
    pub completed_at: DateTime<Utc>,
    /// Anonymized task ID (hashed)
    pub task_id: Option<String>,
    /// Anonymized project ID (hashed)
    pub project_id: Option<String>,
}

/// Scheduling event for diagnostics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulingEvent {
    /// When the event occurred
    pub timestamp: DateTime<Utc>,
    /// Type of event
    pub event_type: String,
    /// Event details
    pub details: serde_json::Value,
}

/// Generator for diagnostics bundles
#[derive(Debug, Clone)]
pub struct DiagnosticsGenerator {
    /// Fields to redact from config
    redact_patterns: Vec<String>,
    /// Salt for anonymization hashing
    anonymization_salt: String,
}

impl Default for DiagnosticsGenerator {
    fn default() -> Self {
        Self {
            redact_patterns: vec![
                "token".to_string(),
                "secret".to_string(),
                "password".to_string(),
                "api_key".to_string(),
                "access_token".to_string(),
                "refresh_token".to_string(),
                "auth_token".to_string(),
                "private_key".to_string(),
                "secret_key".to_string(),
            ],
            anonymization_salt: uuid::Uuid::new_v4().to_string(),
        }
    }
}

impl DiagnosticsGenerator {
    /// Create a new diagnostics generator
    pub fn new() -> Self {
        Self::default()
       }

    /// Create a generator with custom redaction patterns
    pub fn with_redaction_patterns(patterns: Vec<String>) -> Self {
        Self {
            redact_patterns: patterns,
            ..Self::default()
        }
    }

    /// Anonymize a task ID by hashing it
    pub fn anonymize_task(&self, task_id: &str) -> String {
        self.hash_value(&format!("task:{}", task_id))
    }

    /// Anonymize a project ID by hashing it
    pub fn anonymize_project(&self, project_id: &str) -> String {
        self.hash_value(&format!("project:{}", project_id))
    }

    /// Check if a field name should be redacted
    pub fn should_redact(&self, field_name: &str) -> bool {
        let field_lower = field_name.to_lowercase();
        self.redact_patterns
            .iter()
            .any(|pattern| field_lower.contains(&pattern.to_lowercase()))
    }

    /// Redact a value, returning "[REDACTED]"
    pub fn redact_value(&self) -> String {
        "[REDACTED]".to_string()
    }

    /// Generate a diagnostics bundle from the given data
    pub fn generate(
        &self,
        sessions: Vec<crate::storage::SessionRecord>,
        config_json: serde_json::Value,
        events: Vec<SchedulingEvent>,
        app_version: &str,
    ) -> DiagnosticsBundle {
        let created_at = Utc::now();

        // Anonymize sessions
        let anonymized_sessions: Vec<AnonymizedSession> = sessions
            .into_iter()
            .map(|s| self.anonymize_session(s))
            .collect();

        // Calculate date range
        let date_range = self.calculate_date_range(&anonymized_sessions);

        // Redact config
        let (redacted_config, redacted_fields) = self.redact_config(config_json);

        // Build timeline
        let timeline = AnonymizedTimeline {
            total_sessions: anonymized_sessions.len(),
            sessions: anonymized_sessions,
            date_range,
        };

        // Create bundle without hash first
        let mut bundle = DiagnosticsBundle {
            version: BUNDLE_VERSION.to_string(),
            created_at,
            app_version: app_version.to_string(),
            hash: String::new(), // Will be computed
            config: RedactedConfig {
                schedule_config: redacted_config,
                scheduler_config: serde_json::Value::Null,
                redacted_fields,
            },
            timeline,
            events,
        };

        // Compute hash
        bundle.hash = self.compute_hash(&bundle);

        bundle
    }

    /// Export the bundle to a JSON string
    pub fn export(bundle: &DiagnosticsBundle) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(bundle)
    }

    /// Anonymize a single session
    fn anonymize_session(&self, session: crate::storage::SessionRecord) -> AnonymizedSession {
        AnonymizedSession {
            session_type: session.step_type,
            duration_min: session.duration_min,
            started_at: session.started_at,
            completed_at: session.completed_at,
            task_id: session.task_id.as_ref().map(|t| self.anonymize_task(t)),
            project_id: session.project_id.as_ref().map(|p| self.anonymize_project(p)),
        }
    }

    /// Calculate the date range from sessions
    fn calculate_date_range(&self, sessions: &[AnonymizedSession]) -> (String, String) {
        if sessions.is_empty() {
            return (
                Utc::now().format("%Y-%m-%d").to_string(),
                Utc::now().format("%Y-%m-%d").to_string(),
            );
        }

        let min_date = sessions
            .iter()
            .map(|s| s.started_at)
            .min()
            .unwrap()
            .format("%Y-%m-%d")
            .to_string();

        let max_date = sessions
            .iter()
            .map(|s| s.completed_at)
            .max()
            .unwrap()
            .format("%Y-%m-%d")
            .to_string();

        (min_date, max_date)
    }

    /// Redact sensitive fields from config JSON
    fn redact_config(
        &self,
        config: serde_json::Value,
    ) -> (serde_json::Value, Vec<String>) {
        let mut redacted_fields = Vec::new();
        let redacted = self.redact_json_recursive(config, &mut redacted_fields);
        (redacted, redacted_fields)
    }

    /// Recursively redact sensitive fields from JSON
    fn redact_json_recursive(
        &self,
        value: serde_json::Value,
        redacted_fields: &mut Vec<String>,
    ) -> serde_json::Value {
        match value {
            serde_json::Value::Object(map) => {
                let mut new_map = serde_json::Map::new();
                for (key, val) in map {
                    if self.should_redact(&key) {
                        redacted_fields.push(key.clone());
                        new_map.insert(key, serde_json::Value::String(self.redact_value()));
                    } else {
                        new_map.insert(key, self.redact_json_recursive(val, redacted_fields));
                    }
                }
                serde_json::Value::Object(new_map)
            }
            serde_json::Value::Array(arr) => {
                serde_json::Value::Array(
                    arr.into_iter()
                        .map(|v| self.redact_json_recursive(v, redacted_fields))
                        .collect(),
                )
            }
            other => other,
        }
    }

    /// Compute a hash of the bundle contents
    fn compute_hash(&self, bundle: &DiagnosticsBundle) -> String {
        let mut hasher = Sha256::new();

        // Hash version
        hasher.update(bundle.version.as_bytes());

        // Hash app version
        hasher.update(bundle.app_version.as_bytes());

        // Hash timeline summary (not full sessions to avoid size issues)
        hasher.update(bundle.timeline.total_sessions.to_string().as_bytes());
        hasher.update(bundle.timeline.date_range.0.as_bytes());
        hasher.update(bundle.timeline.date_range.1.as_bytes());

        // Hash redacted fields list
        for field in &bundle.config.redacted_fields {
            hasher.update(field.as_bytes());
        }

        // Hash event count
        hasher.update(bundle.events.len().to_string().as_bytes());

        format!("{:x}", hasher.finalize())
    }

    /// Hash a value with salt using SHA-256
    fn hash_value(&self, value: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.anonymization_salt.as_bytes());
        hasher.update(value.as_bytes());
        format!("{:x}", hasher.finalize())[..16].to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::SessionRecord;

    fn create_test_session(
        step_type: &str,
        duration_min: u64,
        task_id: Option<&str>,
        project_id: Option<&str>,
    ) -> SessionRecord {
        let now = Utc::now();
        SessionRecord {
            id: 1,
            step_type: step_type.to_string(),
            step_label: "Test".to_string(),
            duration_min,
            started_at: now,
            completed_at: now + chrono::Duration::minutes(duration_min as i64),
            task_id: task_id.map(|s| s.to_string()),
            project_id: project_id.map(|s| s.to_string()),
        }
    }

    #[test]
    fn test_anonymize_task() {
        let gen = DiagnosticsGenerator::new();
        let hash1 = gen.anonymize_task("task-123");
        let hash2 = gen.anonymize_task("task-123");
        let hash3 = gen.anonymize_task("task-456");

        // Same input should produce same hash
        assert_eq!(hash1, hash2);
        // Different input should produce different hash
        assert_ne!(hash1, hash3);
        // Hash should be 16 characters (truncated)
        assert_eq!(hash1.len(), 16);
    }

    #[test]
    fn test_anonymize_project() {
        let gen = DiagnosticsGenerator::new();
        let hash1 = gen.anonymize_project("project-abc");
        let hash2 = gen.anonymize_project("project-abc");

        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 16);
    }

    #[test]
    fn test_should_redact() {
        let gen = DiagnosticsGenerator::new();

        // Should redact
        assert!(gen.should_redact("api_key"));
        assert!(gen.should_redact("access_token"));
        assert!(gen.should_redact("password"));
        assert!(gen.should_redact("secret_key"));
        assert!(gen.should_redact("API_KEY"));
        assert!(gen.should_redact("MySecretToken"));

        // Should not redact
        assert!(!gen.should_redact("name"));
        assert!(!gen.should_redact("duration"));
        assert!(!gen.should_redact("count"));
    }

    #[test]
    fn test_redact_value() {
        let gen = DiagnosticsGenerator::new();
        assert_eq!(gen.redact_value(), "[REDACTED]");
    }

    #[test]
    fn test_redact_config_simple() {
        let gen = DiagnosticsGenerator::new();
        let config = serde_json::json!({
            "name": "test",
            "api_key": "secret123",
            "count": 42
        });

        let (redacted, fields) = gen.redact_config(config);

        assert_eq!(redacted["name"], "test");
        assert_eq!(redacted["api_key"], "[REDACTED]");
        assert_eq!(redacted["count"], 42);
        assert!(fields.contains(&"api_key".to_string()));
    }

    #[test]
    fn test_redact_config_nested() {
        let gen = DiagnosticsGenerator::new();
        let config = serde_json::json!({
            "settings": {
                "name": "test",
                "credentials": {
                    "token": "abc123",
                    "password": "secret"
                }
            },
            "api_key": "xyz"
        });

        let (redacted, fields) = gen.redact_config(config);

        assert_eq!(redacted["settings"]["name"], "test");
        assert_eq!(redacted["settings"]["credentials"]["token"], "[REDACTED]");
        assert_eq!(redacted["settings"]["credentials"]["password"], "[REDACTED]");
        assert_eq!(redacted["api_key"], "[REDACTED]");
        assert!(fields.contains(&"token".to_string()));
        assert!(fields.contains(&"password".to_string()));
        assert!(fields.contains(&"api_key".to_string()));
    }

    #[test]
    fn test_redact_config_array() {
        let gen = DiagnosticsGenerator::new();
        let config = serde_json::json!({
            "items": [
                {"name": "a", "secret": "x"},
                {"name": "b", "secret": "y"}
            ]
        });

        let (redacted, fields) = gen.redact_config(config);

        assert_eq!(redacted["items"][0]["name"], "a");
        assert_eq!(redacted["items"][0]["secret"], "[REDACTED]");
        assert_eq!(redacted["items"][1]["secret"], "[REDACTED]");
        assert!(fields.contains(&"secret".to_string()));
    }

    #[test]
    fn test_generate_bundle_empty() {
        let gen = DiagnosticsGenerator::new();
        let config = serde_json::json!({"name": "test"});
        let events = vec![];

        let bundle = gen.generate(vec![], config, events, "0.1.0");

        assert_eq!(bundle.version, BUNDLE_VERSION);
        assert_eq!(bundle.app_version, "0.1.0");
        assert!(!bundle.hash.is_empty());
        assert_eq!(bundle.timeline.total_sessions, 0);
    }

    #[test]
    fn test_generate_bundle_with_sessions() {
        let gen = DiagnosticsGenerator::new();
        let sessions = vec![
            create_test_session("focus", 25, Some("task-1"), Some("project-a")),
            create_test_session("break", 5, None, None),
        ];
        let config = serde_json::json!({"name": "test", "api_key": "secret"});
        let events = vec![];

        let bundle = gen.generate(sessions, config, events, "0.1.0");

        assert_eq!(bundle.timeline.total_sessions, 2);
        assert_eq!(bundle.timeline.sessions[0].session_type, "focus");
        assert_eq!(bundle.timeline.sessions[0].duration_min, 25);
        assert!(bundle.timeline.sessions[0].task_id.is_some());
        assert!(bundle.timeline.sessions[0].project_id.is_some());
        // Task and project IDs should be hashed (16 chars)
        assert_eq!(bundle.timeline.sessions[0].task_id.as_ref().unwrap().len(), 16);
        assert_eq!(bundle.timeline.sessions[0].project_id.as_ref().unwrap().len(), 16);
        // Config should be redacted
        assert!(bundle.config.redacted_fields.contains(&"api_key".to_string()));
    }

    #[test]
    fn test_generate_bundle_with_events() {
        let gen = DiagnosticsGenerator::new();
        let events = vec![
            SchedulingEvent {
                timestamp: Utc::now(),
                event_type: "schedule_start".to_string(),
                details: serde_json::json!({"block": "focus"}),
            },
            SchedulingEvent {
                timestamp: Utc::now(),
                event_type: "schedule_complete".to_string(),
                details: serde_json::json!({"block": "break"}),
            },
        ];

        let bundle = gen.generate(vec![], serde_json::Value::Null, events, "0.1.0");

        assert_eq!(bundle.events.len(), 2);
        assert_eq!(bundle.events[0].event_type, "schedule_start");
        assert_eq!(bundle.events[1].event_type, "schedule_complete");
    }

    #[test]
    fn test_export_bundle() {
        let gen = DiagnosticsGenerator::new();
        let bundle = gen.generate(
            vec![],
            serde_json::json!({"name": "test"}),
            vec![],
            "0.1.0",
        );

        let exported = DiagnosticsGenerator::export(&bundle).unwrap();

        assert!(exported.contains("\"version\""));
        assert!(exported.contains("\"app_version\""));
        assert!(exported.contains("\"hash\""));
        assert!(exported.contains("\"config\""));
        assert!(exported.contains("\"timeline\""));
    }

    #[test]
    fn test_compute_hash_consistency() {
        let gen = DiagnosticsGenerator::new();
        let sessions = vec![create_test_session("focus", 25, None, None)];
        let config = serde_json::json!({"name": "test"});

        let bundle1 = gen.generate(sessions.clone(), config.clone(), vec![], "0.1.0");
        let bundle2 = gen.generate(sessions, config, vec![], "0.1.0");

        // Same inputs should produce same hash
        assert_eq!(bundle1.hash, bundle2.hash);
    }

    #[test]
    fn test_compute_hash_different_for_different_inputs() {
        let gen = DiagnosticsGenerator::new();
        let sessions1 = vec![create_test_session("focus", 25, None, None)];
        let sessions2 = vec![
            create_test_session("focus", 25, None, None),
            create_test_session("break", 5, None, None),
        ];

        let bundle1 = gen.generate(sessions1, serde_json::Value::Null, vec![], "0.1.0");
        let bundle2 = gen.generate(sessions2, serde_json::Value::Null, vec![], "0.1.0");

        // Different session counts should produce different hashes
        assert_ne!(bundle1.hash, bundle2.hash);
    }

    #[test]
    fn test_date_range_calculation() {
        let gen = DiagnosticsGenerator::new();

        let now = Utc::now();
        let earlier = now - chrono::Duration::days(5);
        let later = now + chrono::Duration::days(2);

        let sessions = vec![
            AnonymizedSession {
                session_type: "focus".to_string(),
                duration_min: 25,
                started_at: earlier,
                completed_at: earlier + chrono::Duration::minutes(25),
                task_id: None,
                project_id: None,
            },
            AnonymizedSession {
                session_type: "focus".to_string(),
                duration_min: 25,
                started_at: later,
                completed_at: later + chrono::Duration::minutes(25),
                task_id: None,
                project_id: None,
            },
        ];

        let (start, end) = gen.calculate_date_range(&sessions);

        assert_eq!(start, earlier.format("%Y-%m-%d").to_string());
        assert_eq!(end, later.format("%Y-%m-%d").to_string());
    }

    #[test]
    fn test_with_custom_redaction_patterns() {
        let gen = DiagnosticsGenerator::with_redaction_patterns(vec![
            "custom_secret".to_string(),
        ]);

        assert!(gen.should_redact("custom_secret_value"));
        assert!(!gen.should_redact("api_key")); // Default pattern not included
    }
}
