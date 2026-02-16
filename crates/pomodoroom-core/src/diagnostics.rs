//! Diagnostics bundle export for reproducible debugging.
//!
//! This module provides functionality to export a complete diagnostics bundle
//! that can be used to reproduce issues across different environments.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::error::CoreError;

/// Metadata about the diagnostics bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleMetadata {
    /// Bundle format version
    pub version: String,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Application version
    pub app_version: String,
    /// Platform information
    pub platform: PlatformInfo,
    /// User-provided description
    pub description: Option<String>,
    /// Issue ID or reference
    pub issue_reference: Option<String>,
}

impl BundleMetadata {
    /// Create new metadata
    pub fn new(app_version: impl Into<String>) -> Self {
        Self {
            version: "1.0".to_string(),
            created_at: Utc::now(),
            app_version: app_version.into(),
            platform: PlatformInfo::current(),
            description: None,
            issue_reference: None,
        }
    }

    /// Add description
    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.description = Some(desc.into());
        self
    }

    /// Add issue reference
    pub fn with_issue_reference(mut self, ref_id: impl Into<String>) -> Self {
        self.issue_reference = Some(ref_id.into());
        self
    }
}

/// Platform information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    /// OS name
    pub os: String,
    /// OS version
    pub os_version: String,
    /// Architecture
    pub arch: String,
    /// Rust version used to compile
    pub rust_version: String,
}

impl PlatformInfo {
    /// Get current platform info
    pub fn current() -> Self {
        Self {
            os: std::env::consts::OS.to_string(),
            os_version: "unknown".to_string(), // Would need platform-specific code
            arch: std::env::consts::ARCH.to_string(),
            rust_version: env!("CARGO_PKG_RUST_VERSION").to_string(),
        }
    }
}

/// Diagnostics data types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum DiagnosticsData {
    /// Application configuration
    Config(HashMap<String, serde_json::Value>),
    /// Task data
    Tasks(Vec<serde_json::Value>),
    /// Schedule data
    Schedule(ScheduleData),
    /// Timer state
    TimerState(TimerStateData),
    /// Log entries
    Logs(Vec<LogEntry>),
    /// Integration status
    IntegrationStatus(HashMap<String, IntegrationInfo>),
    /// System metrics
    SystemMetrics(SystemMetrics),
}

/// Schedule data snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleData {
    /// Current schedule blocks
    pub blocks: Vec<serde_json::Value>,
    /// Daily template
    pub template: serde_json::Value,
    /// Calendar events
    pub calendar_events: Vec<serde_json::Value>,
}

/// Timer state snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerStateData {
    /// Current step
    pub current_step: i32,
    /// Total steps
    pub total_steps: i32,
    /// Is timer running
    pub is_running: bool,
    /// Elapsed time in current step
    pub elapsed_seconds: i64,
}

/// Log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    /// Timestamp
    pub timestamp: DateTime<Utc>,
    /// Log level
    pub level: LogLevel,
    /// Message
    pub message: String,
    /// Module/source
    pub source: String,
}

/// Log level
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

/// Integration information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegrationInfo {
    /// Service name
    pub name: String,
    /// Is authenticated
    pub is_authenticated: bool,
    /// Last error (if any)
    pub last_error: Option<String>,
    /// Last sync timestamp
    pub last_sync: Option<DateTime<Utc>>,
}

/// System metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    /// Memory usage in bytes
    pub memory_usage_bytes: u64,
    /// CPU usage percentage
    pub cpu_usage_percent: f64,
    /// Uptime in seconds
    pub uptime_seconds: u64,
    /// Database size in bytes
    pub database_size_bytes: u64,
}

/// Complete diagnostics bundle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsBundle {
    /// Bundle metadata
    pub metadata: BundleMetadata,
    /// Bundle contents
    pub data: Vec<DiagnosticsData>,
    /// Redacted fields (for privacy)
    pub redacted_fields: Vec<String>,
}

impl DiagnosticsBundle {
    /// Create a new empty bundle
    pub fn new(metadata: BundleMetadata) -> Self {
        Self {
            metadata,
            data: Vec::new(),
            redacted_fields: Vec::new(),
        }
    }

    /// Add data to the bundle
    pub fn add_data(&mut self, data: DiagnosticsData) {
        self.data.push(data);
    }

    /// Mark a field as redacted
    pub fn redact(&mut self, field: impl Into<String>) {
        self.redacted_fields.push(field.into());
    }

    /// Export to JSON string
    pub fn to_json(&self) -> Result<String, CoreError> {
        serde_json::to_string_pretty(self).map_err(CoreError::from)
    }

    /// Export to JSON bytes
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, CoreError> {
        serde_json::to_vec_pretty(self).map_err(CoreError::from)
    }

    /// Save to file
    pub fn save_to_file(&self, path: &std::path::Path) -> Result<(), CoreError> {
        let json = self.to_json()?;
        std::fs::write(path, json).map_err(CoreError::from)
    }

    /// Load from file
    pub fn load_from_file(path: &std::path::Path) -> Result<Self, CoreError> {
        let content = std::fs::read_to_string(path).map_err(CoreError::from)?;
        Self::from_json(&content)
    }

    /// Parse from JSON string
    pub fn from_json(json: &str) -> Result<Self, CoreError> {
        serde_json::from_str(json).map_err(CoreError::from)
    }

    /// Get specific data type
    pub fn get_data(&self, data_type: &str) -> Option<&DiagnosticsData> {
        self.data.iter().find(|d| {
            let type_str = match d {
                DiagnosticsData::Config(_) => "Config",
                DiagnosticsData::Tasks(_) => "Tasks",
                DiagnosticsData::Schedule(_) => "Schedule",
                DiagnosticsData::TimerState(_) => "TimerState",
                DiagnosticsData::Logs(_) => "Logs",
                DiagnosticsData::IntegrationStatus(_) => "IntegrationStatus",
                DiagnosticsData::SystemMetrics(_) => "SystemMetrics",
            };
            type_str == data_type
        })
    }
}

/// Builder for creating diagnostics bundles
pub struct BundleBuilder {
    metadata: BundleMetadata,
    include_config: bool,
    include_tasks: bool,
    include_schedule: bool,
    include_timer: bool,
    include_logs: bool,
    include_integrations: bool,
    include_metrics: bool,
    max_log_entries: usize,
}

impl BundleBuilder {
    /// Create a new builder
    pub fn new(app_version: impl Into<String>) -> Self {
        Self {
            metadata: BundleMetadata::new(app_version),
            include_config: true,
            include_tasks: true,
            include_schedule: true,
            include_timer: true,
            include_logs: true,
            include_integrations: true,
            include_metrics: true,
            max_log_entries: 1000,
        }
    }

    /// Set metadata description
    pub fn with_description(mut self, desc: impl Into<String>) -> Self {
        self.metadata = self.metadata.with_description(desc);
        self
    }

    /// Set issue reference
    pub fn with_issue_reference(mut self, ref_id: impl Into<String>) -> Self {
        self.metadata = self.metadata.with_issue_reference(ref_id);
        self
    }

    /// Exclude config
    pub fn exclude_config(mut self) -> Self {
        self.include_config = false;
        self
    }

    /// Exclude tasks
    pub fn exclude_tasks(mut self) -> Self {
        self.include_tasks = false;
        self
    }

    /// Exclude schedule
    pub fn exclude_schedule(mut self) -> Self {
        self.include_schedule = false;
        self
    }

    /// Exclude timer
    pub fn exclude_timer(mut self) -> Self {
        self.include_timer = false;
        self
    }

    /// Exclude logs
    pub fn exclude_logs(mut self) -> Self {
        self.include_logs = false;
        self
    }

    /// Set max log entries
    pub fn max_log_entries(mut self, count: usize) -> Self {
        self.max_log_entries = count;
        self
    }

    /// Build the bundle
    pub fn build(self) -> DiagnosticsBundle {
        let mut bundle = DiagnosticsBundle::new(self.metadata);

        // This is a skeleton implementation
        // In a real implementation, these would collect actual data
        if self.include_config {
            bundle.add_data(DiagnosticsData::Config(HashMap::new()));
        }

        if self.include_tasks {
            bundle.add_data(DiagnosticsData::Tasks(Vec::new()));
        }

        if self.include_schedule {
            bundle.add_data(DiagnosticsData::Schedule(ScheduleData {
                blocks: Vec::new(),
                template: serde_json::Value::Null,
                calendar_events: Vec::new(),
            }));
        }

        if self.include_timer {
            bundle.add_data(DiagnosticsData::TimerState(TimerStateData {
                current_step: 0,
                total_steps: 0,
                is_running: false,
                elapsed_seconds: 0,
            }));
        }

        if self.include_logs {
            bundle.add_data(DiagnosticsData::Logs(Vec::new()));
        }

        if self.include_integrations {
            bundle.add_data(DiagnosticsData::IntegrationStatus(HashMap::new()));
        }

        if self.include_metrics {
            bundle.add_data(DiagnosticsData::SystemMetrics(SystemMetrics {
                memory_usage_bytes: 0,
                cpu_usage_percent: 0.0,
                uptime_seconds: 0,
                database_size_bytes: 0,
            }));
        }

        bundle
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bundle_metadata_creation() {
        let metadata = BundleMetadata::new("1.0.0");

        assert_eq!(metadata.version, "1.0");
        assert_eq!(metadata.app_version, "1.0.0");
        assert!(metadata.description.is_none());
    }

    #[test]
    fn test_bundle_metadata_with_description() {
        let metadata = BundleMetadata::new("1.0.0")
            .with_description("Test bundle")
            .with_issue_reference("#123");

        assert_eq!(metadata.description, Some("Test bundle".to_string()));
        assert_eq!(metadata.issue_reference, Some("#123".to_string()));
    }

    #[test]
    fn test_diagnostics_bundle_creation() {
        let metadata = BundleMetadata::new("1.0.0");
        let bundle = DiagnosticsBundle::new(metadata);

        assert!(bundle.data.is_empty());
        assert!(bundle.redacted_fields.is_empty());
    }

    #[test]
    fn test_bundle_add_data() {
        let metadata = BundleMetadata::new("1.0.0");
        let mut bundle = DiagnosticsBundle::new(metadata);

        bundle.add_data(DiagnosticsData::Config(HashMap::new()));
        bundle.add_data(DiagnosticsData::Tasks(Vec::new()));

        assert_eq!(bundle.data.len(), 2);
    }

    #[test]
    fn test_bundle_redaction() {
        let metadata = BundleMetadata::new("1.0.0");
        let mut bundle = DiagnosticsBundle::new(metadata);

        bundle.redact("api_key");
        bundle.redact("password");

        assert_eq!(bundle.redacted_fields.len(), 2);
        assert!(bundle.redacted_fields.contains(&"api_key".to_string()));
    }

    #[test]
    fn test_bundle_serialization() {
        let metadata = BundleMetadata::new("1.0.0");
        let mut bundle = DiagnosticsBundle::new(metadata);
        bundle.add_data(DiagnosticsData::Config(HashMap::new()));

        let json = bundle.to_json().unwrap();
        assert!(json.contains("1.0.0"));
        assert!(json.contains("Config"));

        // Deserialize
        let deserialized = DiagnosticsBundle::from_json(&json).unwrap();
        assert_eq!(deserialized.metadata.app_version, "1.0.0");
    }

    #[test]
    fn test_bundle_builder() {
        let bundle = BundleBuilder::new("1.0.0")
            .with_description("Test bundle")
            .with_issue_reference("#456")
            .exclude_tasks()
            .build();

        assert_eq!(bundle.metadata.description, Some("Test bundle".to_string()));
        assert_eq!(bundle.metadata.issue_reference, Some("#456".to_string()));

        // Should not have Tasks data
        assert!(bundle.get_data("Tasks").is_none());
        // Should have Config data
        assert!(bundle.get_data("Config").is_some());
    }

    #[test]
    fn test_bundle_get_data() {
        let metadata = BundleMetadata::new("1.0.0");
        let mut bundle = DiagnosticsBundle::new(metadata);

        bundle.add_data(DiagnosticsData::Config(HashMap::new()));
        bundle.add_data(DiagnosticsData::Tasks(Vec::new()));

        assert!(bundle.get_data("Config").is_some());
        assert!(bundle.get_data("Tasks").is_some());
        assert!(bundle.get_data("Schedule").is_none());
    }

    #[test]
    fn test_platform_info() {
        let info = PlatformInfo::current();

        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }

    #[test]
    fn test_bundle_save_and_load() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join("test_diagnostics_bundle.json");

        let metadata = BundleMetadata::new("1.0.0");
        let mut bundle = DiagnosticsBundle::new(metadata);
        bundle.add_data(DiagnosticsData::Config(HashMap::new()));

        // Save
        bundle.save_to_file(&file_path).unwrap();

        // Load
        let loaded = DiagnosticsBundle::load_from_file(&file_path).unwrap();
        assert_eq!(loaded.metadata.app_version, "1.0.0");

        // Cleanup
        std::fs::remove_file(&file_path).unwrap();
    }
}
