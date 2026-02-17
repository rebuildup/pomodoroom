//! Command metrics collection and analysis.
//!
//! Provides latency tracking, failure classification, and slow command alerts.

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Duration;

/// Maximum number of records to keep per command.
const MAX_RECORDS_PER_COMMAND: usize = 1000;

/// Default threshold for slow command alerts (in milliseconds).
const DEFAULT_SLOW_THRESHOLD_MS: u64 = 1000;

/// Configuration for metrics collection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsConfig {
    /// Maximum number of records to keep per command.
    pub max_records_per_command: usize,

    /// Threshold in milliseconds for slow command alerts.
    pub slow_threshold_ms: u64,

    /// Whether to enable metrics collection.
    pub enabled: bool,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            max_records_per_command: MAX_RECORDS_PER_COMMAND,
            slow_threshold_ms: DEFAULT_SLOW_THRESHOLD_MS,
            enabled: true,
        }
    }
}

/// Classification of command failures.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FailureClassification {
    /// Transient error that may succeed on retry.
    Recoverable,
    /// Permanent error that requires user intervention.
    Fatal,
    /// Error from external service (API, network).
    External,
    /// Validation error (invalid input).
    Validation,
    /// Unknown/unclassified error.
    Unknown,
}

impl FailureClassification {
    /// Classify an error message.
    pub fn from_error_message(msg: &str) -> Self {
        let msg_lower = msg.to_lowercase();

        // Network/external service errors
        if msg_lower.contains("network")
            || msg_lower.contains("timeout")
            || msg_lower.contains("connection")
            || msg_lower.contains("api")
            || msg_lower.contains("http")
        {
            return FailureClassification::External;
        }

        // Validation errors
        if msg_lower.contains("invalid")
            || msg_lower.contains("missing")
            || msg_lower.contains("required")
            || msg_lower.contains("not found")
        {
            return FailureClassification::Validation;
        }

        // Recoverable errors
        if msg_lower.contains("temporarily")
            || msg_lower.contains("busy")
            || msg_lower.contains("locked")
        {
            return FailureClassification::Recoverable;
        }

        // Fatal errors
        if msg_lower.contains("corrupt")
            || msg_lower.contains("fatal")
            || msg_lower.contains("permission denied")
        {
            return FailureClassification::Fatal;
        }

        FailureClassification::Unknown
    }
}

/// Record of a single command execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRecord {
    /// Command name.
    pub command: String,
    /// Execution duration in milliseconds.
    pub duration_ms: u64,
    /// Whether the command succeeded.
    pub success: bool,
    /// Error message if failed.
    pub error: Option<String>,
    /// Failure classification if failed.
    pub failure_classification: Option<FailureClassification>,
    /// Window label context.
    pub window_label: Option<String>,
    /// Timestamp of execution.
    pub timestamp: DateTime<Utc>,
}

/// Summary statistics for a command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMetrics {
    /// Command name.
    pub command: String,
    /// Total number of invocations.
    pub total_count: u64,
    /// Number of successful invocations.
    pub success_count: u64,
    /// Number of failed invocations.
    pub failure_count: u64,
    /// p50 latency in milliseconds.
    pub p50: u64,
    /// p95 latency in milliseconds.
    pub p95: u64,
    /// p99 latency in milliseconds.
    pub p99: u64,
    /// Minimum latency in milliseconds.
    pub min_ms: u64,
    /// Maximum latency in milliseconds.
    pub max_ms: u64,
    /// Average latency in milliseconds.
    pub avg_ms: u64,
    /// Failure breakdown by classification.
    pub failure_breakdown: std::collections::HashMap<String, u64>,
    /// Last execution timestamp.
    pub last_executed_at: Option<DateTime<Utc>>,
}

/// Alert for a slow command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlowCommandAlert {
    /// Command name.
    pub command: String,
    /// Duration in milliseconds.
    pub duration_ms: u64,
    /// Threshold that was exceeded.
    pub threshold_ms: u64,
    /// Timestamp of the alert.
    pub timestamp: DateTime<Utc>,
    /// Window label context.
    pub window_label: Option<String>,
}

/// Overall metrics summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSummary {
    /// Per-command metrics.
    pub commands: std::collections::HashMap<String, CommandMetrics>,
    /// Recent slow command alerts.
    pub slow_alerts: Vec<SlowCommandAlert>,
    /// Total commands tracked.
    pub total_commands: u64,
    /// Total failures.
    pub total_failures: u64,
    /// Time range of collected data.
    pub oldest_record: Option<DateTime<Utc>>,
    pub newest_record: Option<DateTime<Utc>>,
}

/// Thread-safe metrics collector.
pub struct MetricsCollector {
    config: MetricsConfig,
    records: Mutex<std::collections::HashMap<String, VecDeque<CommandRecord>>>,
    slow_alerts: Mutex<Vec<SlowCommandAlert>>,
}

impl MetricsCollector {
    /// Create a new metrics collector with default config.
    pub fn new() -> Self {
        Self::with_config(MetricsConfig::default())
    }

    /// Create a metrics collector with custom config.
    pub fn with_config(config: MetricsConfig) -> Self {
        Self {
            config,
            records: Mutex::new(std::collections::HashMap::new()),
            slow_alerts: Mutex::new(Vec::new()),
        }
    }

    /// Record a command execution.
    pub fn record(
        &self,
        command: impl Into<String>,
        duration: Duration,
        result: Result<(), &str>,
        window_label: Option<String>,
    ) {
        if !self.config.enabled {
            return;
        }

        let command = command.into();
        let duration_ms = duration.as_millis() as u64;
        let success = result.is_ok();
        let error = result.err().map(|s| s.to_string());
        let failure_classification = error
            .as_ref()
            .map(|e| FailureClassification::from_error_message(e));

        let record = CommandRecord {
            command: command.clone(),
            duration_ms,
            success,
            error,
            failure_classification,
            window_label,
            timestamp: Utc::now(),
        };

        // Check for slow command
        if duration_ms > self.config.slow_threshold_ms {
            let alert = SlowCommandAlert {
                command: command.clone(),
                duration_ms,
                threshold_ms: self.config.slow_threshold_ms,
                timestamp: Utc::now(),
                window_label: record.window_label.clone(),
            };

            if let Ok(mut alerts) = self.slow_alerts.lock() {
                alerts.push(alert);
                // Keep only last 100 alerts
                if alerts.len() > 100 {
                    alerts.remove(0);
                }
            }
        }

        // Add record
        if let Ok(mut records) = self.records.lock() {
            let entry = records.entry(command).or_default();
            entry.push_back(record);

            // Trim old records
            while entry.len() > self.config.max_records_per_command {
                entry.pop_front();
            }
        }
    }

    /// Get metrics for a specific command.
    pub fn get_command_metrics(&self, command: &str) -> Option<CommandMetrics> {
        let records = self.records.lock().ok()?;
        let command_records = records.get(command)?;

        if command_records.is_empty() {
            return None;
        }

        Some(self.compute_metrics(command, command_records))
    }

    /// Get metrics for all commands.
    pub fn get_all_metrics(&self) -> std::collections::HashMap<String, CommandMetrics> {
        let records = match self.records.lock() {
            Ok(r) => r,
            Err(_) => return std::collections::HashMap::new(),
        };

        records
            .iter()
            .filter(|(_, r)| !r.is_empty())
            .map(|(cmd, recs)| (cmd.clone(), self.compute_metrics(cmd, recs)))
            .collect()
    }

    /// Get slow command alerts.
    pub fn get_slow_alerts(&self) -> Vec<SlowCommandAlert> {
        self.slow_alerts
            .lock()
            .map(|alerts| alerts.clone())
            .unwrap_or_default()
    }

    /// Get overall metrics summary.
    pub fn get_summary(&self) -> MetricsSummary {
        let commands = self.get_all_metrics();
        let slow_alerts = self.get_slow_alerts();

        let total_commands: u64 = commands.values().map(|m| m.total_count).sum();
        let total_failures: u64 = commands.values().map(|m| m.failure_count).sum();

        let (oldest, newest) = {
            let records = self.records.lock();
            match records {
                Ok(r) => {
                    let all_records: Vec<_> = r.values().flatten().collect();
                    let oldest = all_records.iter().map(|r| r.timestamp).min();
                    let newest = all_records.iter().map(|r| r.timestamp).max();
                    (oldest, newest)
                }
                Err(_) => (None, None),
            }
        };

        MetricsSummary {
            commands,
            slow_alerts,
            total_commands,
            total_failures,
            oldest_record: oldest,
            newest_record: newest,
        }
    }

    /// Clear all metrics.
    pub fn clear(&self) {
        if let Ok(mut records) = self.records.lock() {
            records.clear();
        }
        if let Ok(mut alerts) = self.slow_alerts.lock() {
            alerts.clear();
        }
    }

    /// Clear metrics for a specific command.
    pub fn clear_command(&self, command: &str) {
        if let Ok(mut records) = self.records.lock() {
            records.remove(command);
        }
    }

    /// Compute metrics from records.
    fn compute_metrics(
        &self,
        command: &str,
        records: &VecDeque<CommandRecord>,
    ) -> CommandMetrics {
        let total_count = records.len() as u64;
        let success_count = records.iter().filter(|r| r.success).count() as u64;
        let failure_count = total_count - success_count;

        // Collect durations for percentile calculation
        let mut durations: Vec<u64> = records.iter().map(|r| r.duration_ms).collect();
        durations.sort_unstable();

        let p50 = percentile(&durations, 50);
        let p95 = percentile(&durations, 95);
        let p99 = percentile(&durations, 99);
        let min_ms = durations.first().copied().unwrap_or(0);
        let max_ms = durations.last().copied().unwrap_or(0);
        let avg_ms = if !durations.is_empty() {
            durations.iter().sum::<u64>() / durations.len() as u64
        } else {
            0
        };

        // Failure breakdown
        let mut failure_breakdown = std::collections::HashMap::new();
        for record in records.iter().filter(|r| !r.success) {
            if let Some(classification) = &record.failure_classification {
                let key = format!("{:?}", classification);
                *failure_breakdown.entry(key).or_insert(0) += 1;
            }
        }

        let last_executed_at = records.back().map(|r| r.timestamp);

        CommandMetrics {
            command: command.to_string(),
            total_count,
            success_count,
            failure_count,
            p50,
            p95,
            p99,
            min_ms,
            max_ms,
            avg_ms,
            failure_breakdown,
            last_executed_at,
        }
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

/// Calculate percentile from sorted data.
fn percentile(sorted_data: &[u64], p: u64) -> u64 {
    if sorted_data.is_empty() {
        return 0;
    }

    let idx = ((sorted_data.len() as u64) * p / 100) as usize;
    sorted_data[idx.min(sorted_data.len() - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failure_classification_network_errors() {
        assert_eq!(
            FailureClassification::from_error_message("network timeout"),
            FailureClassification::External
        );
        assert_eq!(
            FailureClassification::from_error_message("connection refused"),
            FailureClassification::External
        );
        assert_eq!(
            FailureClassification::from_error_message("API error"),
            FailureClassification::External
        );
    }

    #[test]
    fn failure_classification_validation_errors() {
        assert_eq!(
            FailureClassification::from_error_message("invalid input"),
            FailureClassification::Validation
        );
        assert_eq!(
            FailureClassification::from_error_message("missing required field"),
            FailureClassification::Validation
        );
        assert_eq!(
            FailureClassification::from_error_message("user not found"),
            FailureClassification::Validation
        );
    }

    #[test]
    fn failure_classification_recoverable_errors() {
        assert_eq!(
            FailureClassification::from_error_message("resource temporarily unavailable"),
            FailureClassification::Recoverable
        );
        assert_eq!(
            FailureClassification::from_error_message("database is locked"),
            FailureClassification::Recoverable
        );
    }

    #[test]
    fn failure_classification_fatal_errors() {
        assert_eq!(
            FailureClassification::from_error_message("database corrupt"),
            FailureClassification::Fatal
        );
        assert_eq!(
            FailureClassification::from_error_message("fatal error"),
            FailureClassification::Fatal
        );
    }

    #[test]
    fn metrics_collector_records_commands() {
        let collector = MetricsCollector::new();

        collector.record(
            "cmd_test",
            Duration::from_millis(100),
            Ok(()),
            Some("main".to_string()),
        );
        collector.record(
            "cmd_test",
            Duration::from_millis(200),
            Err("error"),
            None,
        );

        let metrics = collector.get_command_metrics("cmd_test").unwrap();
        assert_eq!(metrics.total_count, 2);
        assert_eq!(metrics.success_count, 1);
        assert_eq!(metrics.failure_count, 1);
    }

    #[test]
    fn metrics_collector_calculates_percentiles() {
        let collector = MetricsCollector::new();

        // Add 100 records with increasing durations
        for i in 0..100 {
            collector.record(
                "cmd_test",
                Duration::from_millis(i),
                Ok(()),
                None,
            );
        }

        let metrics = collector.get_command_metrics("cmd_test").unwrap();
        assert_eq!(metrics.min_ms, 0);
        assert_eq!(metrics.max_ms, 99);
        // p50 should be around 50
        assert!(metrics.p50 >= 45 && metrics.p50 <= 55);
        // p95 should be around 95
        assert!(metrics.p95 >= 90 && metrics.p95 <= 99);
    }

    #[test]
    fn metrics_collector_detects_slow_commands() {
        let config = MetricsConfig {
            slow_threshold_ms: 100,
            ..Default::default()
        };
        let collector = MetricsCollector::with_config(config);

        collector.record(
            "cmd_slow",
            Duration::from_millis(200),
            Ok(()),
            None,
        );

        let alerts = collector.get_slow_alerts();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].command, "cmd_slow");
        assert_eq!(alerts[0].duration_ms, 200);
    }

    #[test]
    fn metrics_collector_clear() {
        let collector = MetricsCollector::new();

        collector.record("cmd_test", Duration::from_millis(100), Ok(()), None);
        assert!(collector.get_command_metrics("cmd_test").is_some());

        collector.clear();
        assert!(collector.get_command_metrics("cmd_test").is_none());
    }

    #[test]
    fn metrics_summary() {
        let collector = MetricsCollector::new();

        collector.record("cmd_a", Duration::from_millis(100), Ok(()), None);
        collector.record("cmd_b", Duration::from_millis(200), Err("error"), None);

        let summary = collector.get_summary();
        assert_eq!(summary.total_commands, 2);
        assert_eq!(summary.total_failures, 1);
        assert_eq!(summary.commands.len(), 2);
    }

    #[test]
    fn percentile_empty_data() {
        assert_eq!(percentile(&[], 50), 0);
    }

    #[test]
    fn percentile_single_value() {
        assert_eq!(percentile(&[42], 50), 42);
    }

    #[test]
    fn percentile_halfway() {
        let data: Vec<u64> = (0..100).collect();
        assert_eq!(percentile(&data, 50), 50);
    }
}
