//! Integration management commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for managing external service
//! integrations (Google, Notion, Linear, GitHub, Discord, Slack).
//!
//! These commands handle:
//! - Listing configured integrations
//! - Getting connection status for services
//! - Disconnecting integrations (clearing tokens)
//! - Triggering manual sync with services
//! - Calculating priority considering all connected integrations

use serde_json::{json, Value};

use std::sync::Mutex;
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use tauri::State;

/// Integration registry entry.
///
/// Tracks metadata about each supported integration.
#[derive(Debug, Clone)]
struct IntegrationEntry {
    /// Internal identifier (e.g., "google_calendar")
    service: String,
    /// Human-readable display name
    display_name: String,
    /// Supported features for this integration
    features: Vec<String>,
    /// Whether currently connected (has valid tokens)
    connected: bool,
    /// Last successful sync timestamp
    last_sync: Option<DateTime<Utc>>,
}

/// Integration registry state.
///
/// Tracks all available integrations and their connection status.
/// Uses IndexMap to preserve priority order: Google > Notion > Linear > GitHub > Discord > Slack
struct IntegrationRegistry {
    entries: IndexMap<String, IntegrationEntry>,
}

pub struct IntegrationState(Mutex<IntegrationRegistry>);

impl IntegrationState {
    pub fn new() -> Self {
        Self(Mutex::new(IntegrationRegistry::new()))
    }
}

impl IntegrationRegistry {
    /// Create a new integration registry with all supported services.
    /// Services are added in priority order: Google > Notion > Linear > GitHub > Discord > Slack
    fn new() -> Self {
        let mut entries = IndexMap::new();

        // Google Calendar integration (highest priority)
        entries.insert("google_calendar".to_string(), IntegrationEntry {
            service: "google_calendar".to_string(),
            display_name: "Google Calendar".to_string(),
            features: vec!["calendar_events".to_string(), "tasks".to_string()],
            connected: false,
            last_sync: None,
        });

        // Notion integration
        entries.insert("notion".to_string(), IntegrationEntry {
            service: "notion".to_string(),
            display_name: "Notion".to_string(),
            features: vec!["pages".to_string(), "databases".to_string()],
            connected: false,
            last_sync: None,
        });

        // Linear integration
        entries.insert("linear".to_string(), IntegrationEntry {
            service: "linear".to_string(),
            display_name: "Linear".to_string(),
            features: vec!["issues".to_string(), "projects".to_string()],
            connected: false,
            last_sync: None,
        });

        // GitHub integration
        entries.insert("github".to_string(), IntegrationEntry {
            service: "github".to_string(),
            display_name: "GitHub".to_string(),
            features: vec!["issues".to_string(), "pull_requests".to_string()],
            connected: false,
            last_sync: None,
        });

        // Discord integration
        entries.insert("discord".to_string(), IntegrationEntry {
            service: "discord".to_string(),
            display_name: "Discord".to_string(),
            features: vec!["messages".to_string(), "status".to_string()],
            connected: false,
            last_sync: None,
        });

        // Slack integration
        entries.insert("slack".to_string(), IntegrationEntry {
            service: "slack".to_string(),
            display_name: "Slack".to_string(),
            features: vec!["messages".to_string(), "status".to_string()],
            connected: false,
            last_sync: None,
        });

        Self { entries }
    }

    /// Check if tokens exist for a service using OS keyring.
    fn has_tokens(service_name: &str) -> bool {
        // Check if tokens exist in OS keyring
        match crate::bridge::cmd_load_oauth_tokens(service_name.to_string()) {
            Ok(Some(_)) => true,
            Ok(None) => false,
            Err(_) => false,
        }
    }

    /// Update connection status for all integrations.
    fn refresh_connections(&mut self) {
        // Collect service names first to avoid borrow issues
        let service_names: Vec<String> = self.entries.keys().cloned().collect();
        for i in 0..service_names.len() {
            let service_name = &service_names[i];
            let connected = Self::has_tokens(service_name.as_str());
            if let Some(entry) = self.entries.get_mut(service_name.as_str()) {
                entry.connected = connected;
            }
        }
    }

    /// Get integration status as JSON value.
    fn get_status_json(&self, service_name: &str) -> Result<Value, String> {
        let entry = self.entries.get(service_name)
            .ok_or_else(|| format!("Unknown service: {service_name}"))?;

        Ok(json!({
            "service": entry.service,
            "connected": entry.connected,
            "last_sync": entry.last_sync.map(|dt: DateTime<Utc>| dt.to_rfc3339()),
            "features": entry.features,
        }))
    }
}

// ── Integration Management Commands ───────────────────────────────────────

/// Lists all configured integrations.
///
/// Returns an array of integration statuses including connection state,
/// supported features, and last sync time.
///
/// # Returns
/// JSON array of integration status objects:
/// ```json
/// [
///   {
///     "service": "google_calendar",
///     "connected": true,
///     "last_sync": "2024-01-15T10:30:00Z",
///     "features": ["calendar_events", "tasks"]
///   }
/// ]
/// ```
#[tauri::command]
pub fn cmd_integration_list(state: State<'_, IntegrationState>) -> Result<Value, String> {
    let mut registry = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    registry.refresh_connections();

    let results: Vec<Value> = registry.entries.values()
        .map(|entry| {
            json!({
                "service": entry.service,
                "display_name": entry.display_name,
                "connected": entry.connected,
                "last_sync": entry.last_sync.map(|dt| dt.to_rfc3339()),
                "features": entry.features,
            })
        })
        .collect();

    Ok(json!(results))
}

/// Gets connection status for a specific service.
///
/// # Arguments
/// * `service_name` - The service identifier (e.g., "google_calendar", "notion")
///
/// # Returns
/// Integration status object with connection state, last sync, and features.
///
/// # Errors
/// Returns an error if the service name is unknown.
#[tauri::command]
pub fn cmd_integration_get_status(
    service_name: String,
    state: State<'_, IntegrationState>,
) -> Result<Value, String> {
    let mut registry = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    registry.refresh_connections();
    registry.get_status_json(&service_name)
}

/// Disconnects an integration by clearing its tokens.
///
/// # Arguments
/// * `service_name` - The service identifier to disconnect
///
/// # Errors
/// Returns an error if the service name is unknown or token clearing fails.
#[tauri::command]
pub fn cmd_integration_disconnect(
    service_name: String,
    state: State<'_, IntegrationState>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

    // Validate service name exists
    if !registry.entries.contains_key(&service_name) {
        return Err(format!("Unknown service: {service_name}"));
    }

    // Clear tokens using the bridge command
    crate::bridge::cmd_clear_oauth_tokens(service_name.clone())?;

    // Update registry state
    if let Some(entry) = registry.entries.get_mut(&service_name) {
        entry.connected = false;
        entry.last_sync = None;
    }

    Ok(())
}

/// Triggers a manual sync with the specified service.
///
/// # Arguments
/// * `service_name` - The service identifier to sync
///
/// # Returns
/// Sync result with updated timestamp and any fetched data count.
///
/// # Errors
/// Returns an error if the service is not connected or sync fails.
#[tauri::command]
pub fn cmd_integration_sync(
    service_name: String,
    state: State<'_, IntegrationState>,
) -> Result<Value, String> {
    let mut registry = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    registry.refresh_connections();

    if !registry.entries.contains_key(&service_name) {
        return Err(format!("Unknown service: {service_name}"));
    }
    if !registry.entries.get(&service_name).map(|entry| entry.connected).unwrap_or(false) {
        return Err(format!("Service not connected: {service_name}"));
    }

    // Perform sync (placeholder - actual implementation will call service-specific sync)
    let now = Utc::now();

    // Update last sync time
    if let Some(entry) = registry.entries.get_mut(&service_name) {
        entry.last_sync = Some(now);
    }

    // Return sync result
    Ok(json!({
        "service": service_name,
        "synced_at": now.to_rfc3339(),
        "status": "success",
        // Placeholder counts - actual implementation will return real data
        "items_fetched": match service_name.as_str() {
            "google_calendar" => 0,
            "notion" => 0,
            "linear" => 0,
            "github" => 0,
            "discord" => 0,
            "slack" => 0,
            _ => 0,
        }
    }))
}

/// Calculates priority for a task considering all connected integrations.
///
/// This command extends the basic priority calculation by incorporating
/// external factors from connected integrations:
/// - Google Calendar: Upcoming meetings, conflicts
/// - Notion: Linked database properties
/// - Linear: Issue priority, team velocity
/// - GitHub: PR review status, issue reactions
///
/// # Arguments
/// * `task_json` - Task object with at minimum: id, title, due_date, pressure
///
/// # Returns
/// Enhanced priority score (0-100) with breakdown of contributing factors.
///
/// # Example
/// ```json
/// {
///   "task_id": "task-123",
///   "base_priority": 75,
///   "final_priority": 82,
///   "factors": {
///     "calendar_pressure": 5,
///     "notion_urgency": 0,
///     "linear_team_weight": 2
///   }
/// }
/// ```
#[tauri::command]
pub fn cmd_integration_calculate_priority(
    task_json: Value,
    state: State<'_, IntegrationState>,
) -> Result<Value, String> {
    let mut registry = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    registry.refresh_connections();

    // Extract basic task info
    let task_id = task_json.get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing task.id".to_string())?;

    let base_priority = task_json.get("pressure")
        .and_then(|v| v.as_u64())
        .or_else(|| task_json.get("priority").and_then(|v| v.as_u64()))
        .unwrap_or(50) as i64;

    // Initialize factor breakdown
    let mut factors = serde_json::Map::new();

    // Google Calendar: Check for upcoming meetings/conflicts
    if registry.entries.get("google_calendar").map_or(false, |e| e.connected) {
        // Placeholder: Check for calendar conflicts
        let calendar_pressure = 0; // Will be calculated from actual calendar data
        factors.insert("calendar_pressure".to_string(), json!(calendar_pressure));
    }

    // Notion: Check database properties for urgency tags
    if registry.entries.get("notion").map_or(false, |e| e.connected) {
        let notion_urgency = 0; // Will be calculated from Notion database
        factors.insert("notion_urgency".to_string(), json!(notion_urgency));
    }

    // Linear: Check team velocity and issue priority
    if registry.entries.get("linear").map_or(false, |e| e.connected) {
        let linear_weight = 0; // Will be calculated from Linear API
        factors.insert("linear_team_weight".to_string(), json!(linear_weight));
    }

    // GitHub: Check PR review status, issue reactions
    if registry.entries.get("github").map_or(false, |e| e.connected) {
        let github_boost = 0; // Will be calculated from GitHub API
        factors.insert("github_boost".to_string(), json!(github_boost));
    }

    // Calculate final priority with integrations (max bonus: +20)
    let integration_bonus: i64 = factors.values()
        .filter_map(|v| v.as_i64())
        .sum();

    let final_priority = (base_priority + integration_bonus).clamp(0, 100);

    Ok(json!({
        "task_id": task_id,
        "base_priority": base_priority,
        "final_priority": final_priority,
        "factors": factors,
        "connected_integrations": registry.entries.values()
            .filter(|e| e.connected)
            .map(|e| e.service.clone())
            .collect::<Vec<_>>()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_creation() {
        let registry = IntegrationRegistry::new();
        assert!(registry.entries.contains_key("google_calendar"));
        assert!(registry.entries.contains_key("notion"));
        assert!(registry.entries.contains_key("linear"));
        assert!(registry.entries.contains_key("github"));
    }

    #[test]
    fn test_get_status_unknown_service() {
        let registry = IntegrationRegistry::new();
        let result = registry.get_status_json("unknown_service");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_status_valid_service() {
        let registry = IntegrationRegistry::new();
        let result = registry.get_status_json("google_calendar");
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status["service"], "google_calendar");
        assert_eq!(status["features"].as_array().unwrap().len(), 2);
    }
}
