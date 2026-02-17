//! Session event webhooks for external pipelines.
//!
//! This module provides webhook delivery for session lifecycle changes,
//! enabling integration with external services and automation pipelines.
//!
//! ## Features
//! - Structured events: focus_started, break_started, segment_completed, interruption
//! - Signed payloads with HMAC signatures
//! - Retry policy with exponential backoff
//! - Local queue for offline resilience
//! - Versioned payload schema

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Mutex;

/// Webhook event types for session lifecycle.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WebhookEventType {
    /// Focus session started.
    FocusStarted,
    /// Break started.
    BreakStarted,
    /// Task segment completed.
    SegmentCompleted,
    /// Interruption recorded.
    Interruption,
    /// Session paused.
    SessionPaused,
    /// Session resumed.
    SessionResumed,
    /// Session completed.
    SessionCompleted,
}

/// Versioned webhook payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookPayload {
    /// Schema version for backwards compatibility.
    pub version: String,
    /// Event type.
    pub event_type: WebhookEventType,
    /// Unique event ID for idempotency.
    pub event_id: String,
    /// Timestamp when event occurred.
    pub timestamp: DateTime<Utc>,
    /// Session ID (if applicable).
    pub session_id: Option<String>,
    /// Task ID (if applicable).
    pub task_id: Option<String>,
    /// Event-specific data.
    pub data: serde_json::Value,
}

impl WebhookPayload {
    /// Create a new webhook payload with version 1.0.
    pub fn new(event_type: WebhookEventType, data: serde_json::Value) -> Self {
        Self {
            version: "1.0".to_string(),
            event_type,
            event_id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            session_id: None,
            task_id: None,
            data,
        }
    }

    /// Set session ID.
    pub fn with_session_id(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    /// Set task ID.
    pub fn with_task_id(mut self, task_id: impl Into<String>) -> Self {
        self.task_id = Some(task_id.into());
        self
    }

    /// Serialize payload to JSON bytes.
    pub fn to_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        serde_json::to_vec(self)
    }

    /// Create HMAC signature for payload.
    pub fn sign(&self, secret: &[u8]) -> String {
        let bytes = self.to_bytes().unwrap_or_default();
        let signature =
            hmac_sha256::HMAC::mac(bytes.as_slice(), secret);
        hex::encode(signature)
    }
}

/// Webhook endpoint configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEndpoint {
    /// Endpoint URL.
    pub url: String,
    /// Secret for HMAC signing.
    pub secret: String,
    /// Whether endpoint is enabled.
    pub enabled: bool,
    /// Custom headers to include.
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    /// Maximum retry attempts.
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    /// Initial retry delay in milliseconds.
    #[serde(default = "default_retry_delay")]
    pub retry_delay_ms: u64,
}

fn default_max_retries() -> u32 {
    3
}

fn default_retry_delay() -> u64 {
    1000
}

impl WebhookEndpoint {
    /// Create a new webhook endpoint.
    pub fn new(url: impl Into<String>, secret: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            secret: secret.into(),
            enabled: true,
            headers: std::collections::HashMap::new(),
            max_retries: default_max_retries(),
            retry_delay_ms: default_retry_delay(),
        }
    }

    /// Set enabled status.
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Add a custom header.
    pub fn with_header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }
}

/// Delivery status for a webhook event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryStatus {
    /// Pending delivery.
    Pending,
    /// Successfully delivered.
    Delivered,
    /// Delivery failed, will retry.
    RetryPending,
    /// Delivery failed permanently.
    Failed,
}

/// Queued webhook event with delivery tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedEvent {
    /// The webhook payload.
    pub payload: WebhookPayload,
    /// Target endpoint URL.
    pub endpoint_url: String,
    /// Delivery status.
    pub status: DeliveryStatus,
    /// Number of delivery attempts.
    pub attempt_count: u32,
    /// Last attempt timestamp.
    pub last_attempt: Option<DateTime<Utc>>,
    /// Next retry timestamp.
    pub next_retry: Option<DateTime<Utc>>,
    /// Error message if failed.
    pub error_message: Option<String>,
}

impl QueuedEvent {
    /// Create a new queued event.
    pub fn new(payload: WebhookPayload, endpoint_url: String) -> Self {
        Self {
            payload,
            endpoint_url,
            status: DeliveryStatus::Pending,
            attempt_count: 0,
            last_attempt: None,
            next_retry: None,
            error_message: None,
        }
    }

    /// Mark delivery attempt.
    pub fn mark_attempt(&mut self, success: bool, error: Option<String>) {
        self.attempt_count += 1;
        self.last_attempt = Some(Utc::now());

        if success {
            self.status = DeliveryStatus::Delivered;
            self.error_message = None;
        } else {
            self.error_message = error;
        }
    }

    /// Schedule next retry with exponential backoff.
    pub fn schedule_retry(&mut self, base_delay_ms: u64, max_retries: u32) {
        if self.attempt_count >= max_retries {
            self.status = DeliveryStatus::Failed;
            self.next_retry = None;
        } else {
            self.status = DeliveryStatus::RetryPending;
            // Exponential backoff: delay * 2^attempt
            let delay_ms = base_delay_ms * (1 << self.attempt_count.min(6));
            self.next_retry = Some(Utc::now() + chrono::Duration::milliseconds(delay_ms as i64));
        }
    }

    /// Check if event is ready for retry.
    pub fn is_ready_for_retry(&self) -> bool {
        matches!(self.status, DeliveryStatus::RetryPending)
            && self.next_retry.map_or(false, |t| t <= Utc::now())
    }
}

/// Webhook delivery result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryResult {
    /// Whether delivery was successful.
    pub success: bool,
    /// HTTP status code (if applicable).
    pub status_code: Option<u16>,
    /// Error message (if failed).
    pub error: Option<String>,
    /// Response body (if successful).
    pub response: Option<String>,
}

/// Webhook manager configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    /// Maximum queue size.
    #[serde(default = "default_queue_size")]
    pub max_queue_size: usize,
    /// Default retry delay in milliseconds.
    #[serde(default = "default_retry_delay")]
    pub default_retry_delay_ms: u64,
    /// Default max retries.
    #[serde(default = "default_max_retries")]
    pub default_max_retries: u32,
    /// Enable offline queue persistence.
    #[serde(default = "default_true")]
    pub enable_offline_queue: bool,
}

fn default_queue_size() -> usize {
    1000
}

fn default_true() -> bool {
    true
}

impl Default for WebhookConfig {
    fn default() -> Self {
        Self {
            max_queue_size: default_queue_size(),
            default_retry_delay_ms: default_retry_delay(),
            default_max_retries: default_max_retries(),
            enable_offline_queue: true,
        }
    }
}

/// Statistics for webhook delivery.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WebhookStats {
    /// Total events queued.
    pub total_queued: u64,
    /// Total events delivered successfully.
    pub total_delivered: u64,
    /// Total events failed permanently.
    pub total_failed: u64,
    /// Current queue size.
    pub queue_size: usize,
    /// Events by type.
    pub by_type: std::collections::HashMap<String, u64>,
}

/// Manager for webhook delivery.
pub struct WebhookManager {
    /// Configuration.
    config: WebhookConfig,
    /// Registered endpoints.
    endpoints: Mutex<Vec<WebhookEndpoint>>,
    /// Event queue for delivery.
    queue: Mutex<VecDeque<QueuedEvent>>,
    /// Delivery statistics.
    stats: Mutex<WebhookStats>,
}

impl WebhookManager {
    /// Create a new webhook manager with default configuration.
    pub fn new() -> Self {
        Self {
            config: WebhookConfig::default(),
            endpoints: Mutex::new(Vec::new()),
            queue: Mutex::new(VecDeque::new()),
            stats: Mutex::new(WebhookStats::default()),
        }
    }

    /// Create a new webhook manager with custom configuration.
    pub fn with_config(config: WebhookConfig) -> Self {
        Self {
            config,
            endpoints: Mutex::new(Vec::new()),
            queue: Mutex::new(VecDeque::new()),
            stats: Mutex::new(WebhookStats::default()),
        }
    }

    /// Get the current configuration.
    pub fn config(&self) -> &WebhookConfig {
        &self.config
    }

    /// Register a webhook endpoint.
    pub fn register_endpoint(&self, endpoint: WebhookEndpoint) {
        let mut endpoints = self.endpoints.lock().unwrap();
        // Remove existing endpoint with same URL
        endpoints.retain(|e| e.url != endpoint.url);
        endpoints.push(endpoint);
    }

    /// Remove a webhook endpoint by URL.
    pub fn remove_endpoint(&self, url: &str) -> bool {
        let mut endpoints = self.endpoints.lock().unwrap();
        let len_before = endpoints.len();
        endpoints.retain(|e| e.url != url);
        endpoints.len() != len_before
    }

    /// Get all registered endpoints.
    pub fn get_endpoints(&self) -> Vec<WebhookEndpoint> {
        self.endpoints.lock().unwrap().clone()
    }

    /// Emit an event to all registered endpoints.
    pub fn emit(&self, payload: WebhookPayload) -> Result<(), String> {
        let endpoints = self.endpoints.lock().unwrap();
        let mut queue = self.queue.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        // Track by type
        let type_key = format!("{:?}", payload.event_type);
        *stats.by_type.entry(type_key).or_insert(0) += 1;

        // Queue event for each enabled endpoint
        for endpoint in endpoints.iter() {
            if !endpoint.enabled {
                continue;
            }

            if queue.len() >= self.config.max_queue_size {
                // Drop oldest event if queue is full
                queue.pop_front();
            }

            let event = QueuedEvent::new(payload.clone(), endpoint.url.clone());
            queue.push_back(event);
            stats.total_queued += 1;
        }

        Ok(())
    }

    /// Get pending events from queue.
    pub fn get_pending_events(&self) -> Vec<QueuedEvent> {
        let queue = self.queue.lock().unwrap();
        queue
            .iter()
            .filter(|e| {
                matches!(
                    e.status,
                    DeliveryStatus::Pending | DeliveryStatus::RetryPending
                )
            })
            .cloned()
            .collect()
    }

    /// Get events ready for delivery (pending or retry due).
    pub fn get_ready_events(&self) -> Vec<QueuedEvent> {
        let queue = self.queue.lock().unwrap();
        queue
            .iter()
            .filter(|e| {
                matches!(e.status, DeliveryStatus::Pending)
                    || e.is_ready_for_retry()
            })
            .cloned()
            .collect()
    }

    /// Mark event as delivered.
    pub fn mark_delivered(&self, event_id: &str) {
        let mut queue = self.queue.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        if let Some(event) = queue.iter_mut().find(|e| e.payload.event_id == event_id) {
            event.mark_attempt(true, None);
            stats.total_delivered += 1;
        }
    }

    /// Mark event delivery failed and schedule retry.
    pub fn mark_failed(&self, event_id: &str, error: String) {
        let mut queue = self.queue.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        if let Some(event) = queue.iter_mut().find(|e| e.payload.event_id == event_id) {
            let previous_status = event.status.clone();
            event.mark_attempt(false, Some(error));
            event.schedule_retry(
                self.config.default_retry_delay_ms,
                self.config.default_max_retries,
            );

            // Only count if transitioning TO Failed state
            if previous_status != DeliveryStatus::Failed
                && event.status == DeliveryStatus::Failed
            {
                stats.total_failed += 1;
            }
        }
    }

    /// Remove delivered and failed events from queue.
    pub fn cleanup_queue(&self) {
        let mut queue = self.queue.lock().unwrap();
        let stats = self.stats.lock().unwrap();

        queue.retain(|e| {
            !matches!(e.status, DeliveryStatus::Delivered | DeliveryStatus::Failed)
        });

        // Update stats
        drop(stats);
        let mut stats = self.stats.lock().unwrap();
        stats.queue_size = queue.len();
    }

    /// Get delivery statistics.
    pub fn get_stats(&self) -> WebhookStats {
        let mut stats = self.stats.lock().unwrap().clone();
        stats.queue_size = self.queue.lock().unwrap().len();
        stats
    }

    /// Clear all statistics.
    pub fn clear_stats(&self) {
        let mut stats = self.stats.lock().unwrap();
        *stats = WebhookStats::default();
    }

    /// Simulate delivery (for testing without actual HTTP calls).
    pub fn simulate_delivery(&self, event_id: &str, success: bool, error: Option<String>) {
        if success {
            self.mark_delivered(event_id);
        } else {
            self.mark_failed(event_id, error.unwrap_or_else(|| "Simulated failure".to_string()));
        }
    }
}

impl Default for WebhookManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_manager() -> WebhookManager {
        WebhookManager::new()
    }

    fn create_payload() -> WebhookPayload {
        WebhookPayload::new(
            WebhookEventType::FocusStarted,
            serde_json::json!({ "duration": 25 }),
        )
    }

    #[test]
    fn manager_starts_empty() {
        let manager = create_manager();
        assert_eq!(manager.get_endpoints().len(), 0);
        assert_eq!(manager.get_pending_events().len(), 0);
    }

    #[test]
    fn register_endpoint() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        let endpoints = manager.get_endpoints();
        assert_eq!(endpoints.len(), 1);
        assert_eq!(endpoints[0].url, "https://example.com/webhook");
    }

    #[test]
    fn remove_endpoint() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        assert!(manager.remove_endpoint("https://example.com/webhook"));
        assert_eq!(manager.get_endpoints().len(), 0);
    }

    #[test]
    fn emit_queues_event() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        assert_eq!(pending.len(), 1);
    }

    #[test]
    fn emit_to_multiple_endpoints() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example1.com/webhook",
            "secret1",
        ));
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example2.com/webhook",
            "secret2",
        ));

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        assert_eq!(pending.len(), 2);
    }

    #[test]
    fn disabled_endpoint_not_queued() {
        let manager = create_manager();
        manager.register_endpoint(
            WebhookEndpoint::new("https://example.com/webhook", "secret123").with_enabled(false),
        );

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        assert_eq!(pending.len(), 0);
    }

    #[test]
    fn mark_delivered() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        let event_id = pending[0].payload.event_id.clone();
        manager.mark_delivered(&event_id);

        let stats = manager.get_stats();
        assert_eq!(stats.total_delivered, 1);
    }

    #[test]
    fn mark_failed_schedules_retry() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        let event_id = pending[0].payload.event_id.clone();
        manager.mark_failed(&event_id, "Connection refused".to_string());

        let events = manager.get_pending_events();
        let event = events.iter().find(|e| e.payload.event_id == event_id).unwrap();
        assert_eq!(event.status, DeliveryStatus::RetryPending);
        assert!(event.next_retry.is_some());
    }

    #[test]
    fn max_retries_exceeded() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        let event_id = pending[0].payload.event_id.clone();

        // Fail 4 times (default max_retries is 3)
        for _ in 0..4 {
            manager.mark_failed(&event_id, "Error".to_string());
        }

        let stats = manager.get_stats();
        assert_eq!(stats.total_failed, 1);
    }

    #[test]
    fn cleanup_queue() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        let payload = create_payload();
        manager.emit(payload).unwrap();

        let pending = manager.get_pending_events();
        let event_id = pending[0].payload.event_id.clone();
        manager.mark_delivered(&event_id);

        manager.cleanup_queue();
        assert_eq!(manager.get_pending_events().len(), 0);
    }

    #[test]
    fn payload_sign() {
        let payload = create_payload();
        let secret = b"test_secret";
        let signature = payload.sign(secret);

        assert!(!signature.is_empty());
        assert_eq!(signature.len(), 64); // SHA-256 hex
    }

    #[test]
    fn payload_with_ids() {
        let payload = create_payload()
            .with_session_id("session-123")
            .with_task_id("task-456");

        assert_eq!(payload.session_id, Some("session-123".to_string()));
        assert_eq!(payload.task_id, Some("task-456".to_string()));
    }

    #[test]
    fn queued_event_is_ready_for_retry() {
        let mut event = QueuedEvent::new(create_payload(), "https://example.com".to_string());
        event.status = DeliveryStatus::RetryPending;
        event.next_retry = Some(Utc::now() - chrono::Duration::seconds(1));

        assert!(event.is_ready_for_retry());
    }

    #[test]
    fn queued_event_not_ready_yet() {
        let mut event = QueuedEvent::new(create_payload(), "https://example.com".to_string());
        event.status = DeliveryStatus::RetryPending;
        event.next_retry = Some(Utc::now() + chrono::Duration::seconds(60));

        assert!(!event.is_ready_for_retry());
    }

    #[test]
    fn stats_by_type() {
        let manager = create_manager();
        manager.register_endpoint(WebhookEndpoint::new(
            "https://example.com/webhook",
            "secret123",
        ));

        manager
            .emit(WebhookPayload::new(
                WebhookEventType::FocusStarted,
                serde_json::json!({}),
            ))
            .unwrap();
        manager
            .emit(WebhookPayload::new(
                WebhookEventType::FocusStarted,
                serde_json::json!({}),
            ))
            .unwrap();
        manager
            .emit(WebhookPayload::new(
                WebhookEventType::BreakStarted,
                serde_json::json!({}),
            ))
            .unwrap();

        let stats = manager.get_stats();
        assert_eq!(stats.by_type.get("FocusStarted"), Some(&2u64));
        assert_eq!(stats.by_type.get("BreakStarted"), Some(&1u64));
    }

    #[test]
    fn endpoint_with_headers() {
        let endpoint = WebhookEndpoint::new("https://example.com/webhook", "secret123")
            .with_header("X-Custom-Header", "value");

        assert_eq!(endpoint.headers.get("X-Custom-Header"), Some(&"value".to_string()));
    }

    #[test]
    fn config_default() {
        let config = WebhookConfig::default();
        assert_eq!(config.max_queue_size, 1000);
        assert_eq!(config.default_retry_delay_ms, 1000);
        assert_eq!(config.default_max_retries, 3);
        assert!(config.enable_offline_queue);
    }
}
