//! Command latency and failure observability module.
//!
//! This module provides instrumentation for Tauri command paths:
//! - Capture p50/p95 latency by command
//! - Classify recoverable vs fatal failures
//! - Correlate with window label/context
//!
//! ## Usage
//! ```rust,ignore
//! use metrics::{MetricsCollector, CommandMetrics};
//!
//! let collector = MetricsCollector::new();
//!
//! // Record command execution
//! collector.record_command("cmd_timer_start", Duration::from_millis(15), Ok(()));
//!
//! // Query metrics
//! let summary = collector.get_command_summary("cmd_timer_start");
//! println!("p50: {:?}, p95: {:?}", summary.p50, summary.p95);
//! ```

mod command;

pub use command::{
    CommandMetrics, CommandRecord, FailureClassification, MetricsCollector, MetricsConfig,
    MetricsSummary, SlowCommandAlert,
};
