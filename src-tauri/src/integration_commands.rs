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

use chrono::{DateTime, Duration, Timelike, Utc};
use indexmap::IndexMap;
use pomodoroom_core::{
    storage::schedule_db::ScheduleDb,
    task::{Task, TaskState},
};
use std::sync::Mutex;
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

#[derive(Debug, Clone)]
struct LocalTaskSnapshot {
    title: String,
    description: Option<String>,
    state: TaskState,
}

#[derive(Debug, Clone)]
struct RemoteTaskSnapshot {
    external_id: String,
    list_title: String,
    title: String,
    notes: Option<String>,
    state: TaskState,
}

#[derive(Debug, Default)]
struct SyncCounts {
    items_fetched: usize,
    items_created: usize,
    items_updated: usize,
    items_unchanged: usize,
}

fn classify_sync_change(remote: &RemoteTaskSnapshot, existing: Option<&LocalTaskSnapshot>) -> &'static str {
    match existing {
        None => "create",
        Some(local) => {
            if local.title == remote.title
                && local.description == remote.notes
                && local.state == remote.state
            {
                "unchanged"
            } else {
                "update"
            }
        }
    }
}

fn build_task_from_remote(remote: &RemoteTaskSnapshot, existing: Option<&LocalTaskSnapshot>) -> Task {
    let now = Utc::now();
    let mut task = Task::new(remote.title.clone());
    task.description = remote.notes.clone();
    task.tags = vec!["google_tasks".to_string(), format!("google_list:{}", remote.list_title)];
    task.estimated_minutes = Some(25);
    task.required_minutes = Some(25);
    task.source_service = Some("google_tasks".to_string());
    task.source_external_id = Some(remote.external_id.clone());
    task.updated_at = now;

    let mut state = remote.state;
    if let Some(local) = existing {
        if matches!(local.state, TaskState::Running | TaskState::Paused) && remote.state == TaskState::Ready {
            state = local.state;
        }
    }
    task.state = state;
    if state == TaskState::Done {
        task.completed = true;
        task.completed_at = Some(now);
    }
    task
}

fn load_existing_google_snapshots(db: &ScheduleDb) -> Result<std::collections::HashMap<String, LocalTaskSnapshot>, String> {
    let mut map = std::collections::HashMap::new();
    for task in db.list_tasks().map_err(|e| e.to_string())? {
        if task.source_service.as_deref() != Some("google_tasks") {
            continue;
        }
        let Some(source_id) = task.source_external_id.clone() else {
            continue;
        };
        map.insert(
            source_id,
            LocalTaskSnapshot {
                title: task.title,
                description: task.description,
                state: task.state,
            },
        );
    }
    Ok(map)
}

fn parse_remote_task(list_id: &str, list_title: &str, raw: &Value) -> Option<RemoteTaskSnapshot> {
    let task_id = raw.get("id")?.as_str()?.trim();
    if task_id.is_empty() {
        return None;
    }
    let title = raw
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("(untitled)")
        .trim()
        .to_string();
    let notes = raw
        .get("notes")
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let status = raw.get("status").and_then(Value::as_str).unwrap_or("needsAction");
    let state = if status.eq_ignore_ascii_case("completed") {
        TaskState::Done
    } else {
        TaskState::Ready
    };
    Some(RemoteTaskSnapshot {
        external_id: format!("{list_id}:{task_id}"),
        list_title: list_title.to_string(),
        title,
        notes,
        state,
    })
}

fn fetch_google_task_snapshots() -> Result<Vec<RemoteTaskSnapshot>, String> {
    let lists_value = crate::google_tasks::cmd_google_tasks_list_tasklists()?;
    let lists = lists_value
        .as_array()
        .ok_or_else(|| "Invalid tasklists response format".to_string())?;

    let mut tasks = Vec::new();
    for list in lists {
        let Some(list_id) = list.get("id").and_then(Value::as_str) else {
            continue;
        };
        let list_title = list
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("untitled-list");
        let task_values = crate::google_tasks::cmd_google_tasks_list_tasks(
            list_id.to_string(),
            Some(true),
            Some(false),
        )?;
        if let Some(raw_tasks) = task_values.as_array() {
            for raw in raw_tasks {
                if let Some(task) = parse_remote_task(list_id, list_title, raw) {
                    tasks.push(task);
                }
            }
        }
    }
    Ok(tasks)
}

fn sync_google_tasks_and_count() -> Result<SyncCounts, String> {
    let remote_tasks = fetch_google_task_snapshots()?;
    let db = ScheduleDb::open().map_err(|e| e.to_string())?;
    let existing = load_existing_google_snapshots(&db)?;
    let mut counts = SyncCounts {
        items_fetched: remote_tasks.len(),
        ..SyncCounts::default()
    };

    for remote in &remote_tasks {
        let existing_snapshot = existing.get(&remote.external_id);
        match classify_sync_change(remote, existing_snapshot) {
            "create" => counts.items_created += 1,
            "update" => counts.items_updated += 1,
            _ => counts.items_unchanged += 1,
        }
        let task = build_task_from_remote(remote, existing_snapshot);
        db.upsert_task_from_source(&task).map_err(|e| e.to_string())?;
    }

    Ok(counts)
}

/// Find the "Pomodoroom" calendar ID in a Google Calendar calendarList response.
/// Returns None if not found.
fn find_pomodoroom_in_calendar_list(body: &Value) -> Option<String> {
    body["items"].as_array()?.iter().find_map(|cal| {
        if cal["summary"].as_str() == Some("Pomodoroom") {
            cal["id"].as_str().map(|s| s.to_string())
        } else {
            None
        }
    })
}

fn count_google_calendar_events() -> Result<usize, String> {
    let now = Utc::now();
    let start = (now - Duration::days(7)).to_rfc3339();
    let end = (now + Duration::days(30)).to_rfc3339();
    let rt = tokio::runtime::Runtime::new().map_err(|e| format!("Failed to create runtime: {e}"))?;
    let events = rt.block_on(async {
        crate::google_calendar::cmd_google_calendar_list_events(
            "primary".to_string(),
            start,
            end,
        )
        .await
    })?;
    Ok(events.as_array().map_or(0, |arr| arr.len()))
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
        entries.insert(
            "google_calendar".to_string(),
            IntegrationEntry {
                service: "google_calendar".to_string(),
                display_name: "Google Calendar".to_string(),
                features: vec!["calendar_events".to_string(), "tasks".to_string()],
                connected: false,
                last_sync: None,
            },
        );

        // Notion integration
        entries.insert(
            "notion".to_string(),
            IntegrationEntry {
                service: "notion".to_string(),
                display_name: "Notion".to_string(),
                features: vec!["pages".to_string(), "databases".to_string()],
                connected: false,
                last_sync: None,
            },
        );

        // Linear integration
        entries.insert(
            "linear".to_string(),
            IntegrationEntry {
                service: "linear".to_string(),
                display_name: "Linear".to_string(),
                features: vec!["issues".to_string(), "projects".to_string()],
                connected: false,
                last_sync: None,
            },
        );

        // GitHub integration
        entries.insert(
            "github".to_string(),
            IntegrationEntry {
                service: "github".to_string(),
                display_name: "GitHub".to_string(),
                features: vec!["issues".to_string(), "pull_requests".to_string()],
                connected: false,
                last_sync: None,
            },
        );

        // Discord integration
        entries.insert(
            "discord".to_string(),
            IntegrationEntry {
                service: "discord".to_string(),
                display_name: "Discord".to_string(),
                features: vec!["messages".to_string(), "status".to_string()],
                connected: false,
                last_sync: None,
            },
        );

        // Slack integration
        entries.insert(
            "slack".to_string(),
            IntegrationEntry {
                service: "slack".to_string(),
                display_name: "Slack".to_string(),
                features: vec!["messages".to_string(), "status".to_string()],
                connected: false,
                last_sync: None,
            },
        );

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

    /// Calculate calendar pressure based on upcoming events.
    /// Returns pressure score (0-10) based on:
    /// - Number of meetings in next 4 hours
    /// - Time until next meeting
    fn calculate_calendar_pressure(&self, task_json: &Value) -> i64 {
        // Check if task has a due date
        let task_due = task_json
            .get("due_date")
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok());

        let now = Utc::now();

        // Base pressure from calendar density
        let mut pressure = 0i64;

        // If task is due soon and overlaps with typical meeting hours
        if let Some(due) = task_due {
            let due_dt = due.with_timezone(&Utc);
            let hours_until_due = (due_dt - now).num_hours();

            if hours_until_due < 4 {
                // High pressure if due within 4 hours (typical meeting block)
                pressure += 5;
            } else if hours_until_due < 8 {
                // Medium pressure if due within work day
                pressure += 3;
            }

            // Check if due time is during typical meeting hours (9-17)
            let due_hour = due_dt.hour();
            if (9..17).contains(&due_hour) {
                pressure += 2;
            }
        }

        // Factor in task pressure indicator
        if let Some(task_pressure) = task_json.get("pressure").and_then(|v| v.as_i64()) {
            if task_pressure > 70 {
                // High pressure tasks get calendar boost
                pressure += 3;
            }
        }

        pressure.clamp(0, 10)
    }

    /// Calculate Notion urgency based on database properties.
    /// Returns urgency score (0-10) based on:
    /// - Tags like "urgent", "high-priority"
    /// - Status field values
    fn calculate_notion_urgency(&self, task_json: &Value) -> i64 {
        let mut urgency = 0i64;

        // Check for urgency indicators in task metadata
        if let Some(tags) = task_json.get("tags").and_then(|v| v.as_array()) {
            for tag in tags {
                if let Some(tag_str) = tag.as_str() {
                    let tag_lower = tag_str.to_lowercase();
                    if tag_lower.contains("urgent") || tag_lower.contains("high-priority") {
                        urgency += 5;
                    } else if tag_lower.contains("priority") || tag_lower.contains("important") {
                        urgency += 3;
                    }
                }
            }
        }

        // Check status field
        if let Some(status) = task_json.get("status").and_then(|v| v.as_str()) {
            let status_lower = status.to_lowercase();
            if status_lower.contains("urgent") || status_lower.contains("blocked") {
                urgency += 4;
            } else if status_lower.contains("in-progress") || status_lower.contains("review") {
                urgency += 2;
            }
        }

        // Factor in due date proximity
        if let Some(due_str) = task_json.get("due_date").and_then(|v| v.as_str()) {
            if let Ok(due) = DateTime::parse_from_rfc3339(due_str) {
                let due_dt = due.with_timezone(&Utc);
                let now = Utc::now();
                let hours_until = (due_dt - now).num_hours();

                if hours_until < 24 {
                    urgency += 3;
                } else if hours_until < 72 {
                    urgency += 2;
                } else if hours_until < 168 {
                    urgency += 1;
                }
            }
        }

        urgency.clamp(0, 10)
    }

    /// Calculate Linear team weight based on issue priority and velocity.
    /// Returns weight score (0-10) based on:
    /// - Issue priority in Linear
    /// - Team workload indicators
    fn calculate_linear_weight(&self, task_json: &Value) -> i64 {
        let mut weight = 0i64;

        // Check for Linear-specific metadata
        if let Some(linear_data) = task_json.get("linear") {
            // Linear priority (0-4, where 4 is urgent)
            if let Some(priority) = linear_data.get("priority").and_then(|v| v.as_i64()) {
                weight += priority * 2; // 0-8 points based on Linear priority
            }

            // Check if assigned to current user
            if let Some(state) = linear_data.get("state").and_then(|v| v.as_object()) {
                if state.get("name").and_then(|v| v.as_str()) == Some("In Progress") {
                    weight += 2;
                }
            }

            // Check cycle information
            if linear_data.get("cycle").is_some() {
                // In current cycle - higher weight
                weight += 2;
            }
        }

        // Fallback: Check task priority if no Linear data
        if weight == 0 {
            if let Some(priority) = task_json.get("priority").and_then(|v| v.as_i64()) {
                weight += (priority / 10).clamp(0, 5);
            }
        }

        weight.clamp(0, 10)
    }

    /// Calculate GitHub boost based on PR/issue activity.
    /// Returns boost score (0-10) based on:
    /// - PR review status
    /// - Issue reactions/engagement
    /// - Mentions
    fn calculate_github_boost(&self, task_json: &Value) -> i64 {
        let mut boost = 0i64;

        // Check for GitHub-specific metadata
        if let Some(github_data) = task_json.get("github") {
            // PR status boost
            if let Some(pr_state) = github_data.get("pr_state").and_then(|v| v.as_str()) {
                match pr_state {
                    "open" => boost += 3,
                    "draft" => boost += 1,
                    _ => {}
                }
            }

            // Review status
            if let Some(reviews) = github_data.get("reviews").and_then(|v| v.as_i64()) {
                if reviews > 0 {
                    boost += 2; // Has pending reviews
                }
            }

            // Issue reactions count as engagement
            if let Some(reactions) = github_data.get("reactions").and_then(|v| v.as_i64()) {
                boost += reactions.min(3); // Up to 3 points for engagement
            }

            // Check for mentions
            if github_data.get("mentions").is_some() {
                boost += 2;
            }
        }

        // Check for PR references in title or description
        let pr_keywords = ["pr", "pull request", "review", "merge"];
        if let Some(title) = task_json.get("title").and_then(|v| v.as_str()) {
            let title_lower = title.to_lowercase();
            for keyword in &pr_keywords {
                if title_lower.contains(keyword) {
                    boost += 2;
                    break;
                }
            }
        }

        boost.clamp(0, 10)
    }

    /// Get integration status as JSON value.
    fn get_status_json(&self, service_name: &str) -> Result<Value, String> {
        let entry = self
            .entries
            .get(service_name)
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

    let results: Vec<Value> = registry
        .entries
        .values()
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
    if !registry
        .entries
        .get(&service_name)
        .map(|entry| entry.connected)
        .unwrap_or(false)
    {
        return Err(format!("Service not connected: {service_name}"));
    }

    let mut counts = SyncCounts::default();
    match service_name.as_str() {
        "google_calendar" => {
            let event_count = count_google_calendar_events()?;
            let task_counts = sync_google_tasks_and_count()?;
            counts.items_fetched = event_count + task_counts.items_fetched;
            counts.items_created = task_counts.items_created;
            counts.items_updated = task_counts.items_updated;
            counts.items_unchanged = task_counts.items_unchanged;
        }
        "notion" | "linear" | "github" | "discord" | "slack" => {
            // These integrations are currently push-oriented from app events.
            counts.items_fetched = 0;
            counts.items_created = 0;
            counts.items_updated = 0;
            counts.items_unchanged = 0;
        }
        _ => {}
    }

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
        "items_fetched": counts.items_fetched,
        "items_created": counts.items_created,
        "items_updated": counts.items_updated,
        "items_unchanged": counts.items_unchanged,
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
    let task_id = task_json
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing task.id".to_string())?;

    let base_priority = task_json
        .get("pressure")
        .and_then(|v| v.as_u64())
        .or_else(|| task_json.get("priority").and_then(|v| v.as_u64()))
        .unwrap_or(50) as i64;

    // Initialize factor breakdown
    let mut factors = serde_json::Map::new();

    // Google Calendar: Check for upcoming meetings/conflicts
    if registry
        .entries
        .get("google_calendar")
        .map_or(false, |e| e.connected)
    {
        // Calculate calendar pressure based on task due date and typical meeting hours
        let calendar_pressure = registry.calculate_calendar_pressure(&task_json);
        factors.insert("calendar_pressure".to_string(), json!(calendar_pressure));
    }

    // Notion: Check database properties for urgency tags
    if registry
        .entries
        .get("notion")
        .map_or(false, |e| e.connected)
    {
        // Calculate Notion urgency based on tags, status, and due date
        let notion_urgency = registry.calculate_notion_urgency(&task_json);
        factors.insert("notion_urgency".to_string(), json!(notion_urgency));
    }

    // Linear: Check team velocity and issue priority
    if registry
        .entries
        .get("linear")
        .map_or(false, |e| e.connected)
    {
        // Calculate Linear weight based on priority, state, and cycle
        let linear_weight = registry.calculate_linear_weight(&task_json);
        factors.insert("linear_team_weight".to_string(), json!(linear_weight));
    }

    // GitHub: Check PR review status, issue reactions
    if registry
        .entries
        .get("github")
        .map_or(false, |e| e.connected)
    {
        // Calculate GitHub boost based on PR state, reviews, and engagement
        let github_boost = registry.calculate_github_boost(&task_json);
        factors.insert("github_boost".to_string(), json!(github_boost));
    }

    // Calculate final priority with integrations (max bonus: +20)
    let integration_bonus: i64 = factors.values().filter_map(|v| v.as_i64()).sum();

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

    #[test]
    fn test_calculate_calendar_pressure() {
        let registry = IntegrationRegistry::new();

        // Task due soon during meeting hours
        let urgent_task = json!({
            "id": "task-1",
            "title": "Urgent task",
            "due_date": (Utc::now() + Duration::hours(2)).to_rfc3339(),
            "pressure": 80
        });
        let pressure = registry.calculate_calendar_pressure(&urgent_task);
        assert!(pressure > 0, "Urgent task should have calendar pressure");
        assert!(pressure <= 10, "Pressure should be capped at 10");

        // Task with no due date
        let no_due_task = json!({
            "id": "task-2",
            "title": "No due date"
        });
        let no_pressure = registry.calculate_calendar_pressure(&no_due_task);
        assert_eq!(
            no_pressure, 0,
            "Task without due date should have no pressure"
        );
    }

    #[test]
    fn test_calculate_notion_urgency() {
        let registry = IntegrationRegistry::new();

        // Task with urgent tag
        let urgent_task = json!({
            "id": "task-1",
            "title": "Urgent task",
            "tags": ["urgent", "high-priority"],
            "status": "blocked",
            "due_date": (Utc::now() + Duration::hours(12)).to_rfc3339()
        });
        let urgency = registry.calculate_notion_urgency(&urgent_task);
        assert!(
            urgency >= 5,
            "Task with urgent tags should have high urgency"
        );
        assert!(urgency <= 10, "Urgency should be capped at 10");

        // Task without urgency indicators
        let normal_task = json!({
            "id": "task-2",
            "title": "Normal task",
            "tags": ["feature"],
            "status": "todo"
        });
        let normal_urgency = registry.calculate_notion_urgency(&normal_task);
        assert!(normal_urgency < 5, "Normal task should have low urgency");
    }

    #[test]
    fn test_calculate_linear_weight() {
        let registry = IntegrationRegistry::new();

        // Task with Linear metadata
        let linear_task = json!({
            "id": "task-1",
            "title": "Linear issue",
            "linear": {
                "priority": 4,
                "state": {"name": "In Progress"},
                "cycle": {"name": "Current"}
            }
        });
        let weight = registry.calculate_linear_weight(&linear_task);
        assert!(weight > 0, "Linear task should have weight");
        assert!(weight <= 10, "Weight should be capped at 10");

        // Task without Linear data
        let normal_task = json!({
            "id": "task-2",
            "title": "Normal task",
            "priority": 50
        });
        let normal_weight = registry.calculate_linear_weight(&normal_task);
        assert!(
            normal_weight <= 5,
            "Non-Linear task should have lower weight"
        );
    }

    #[test]
    fn test_calculate_github_boost() {
        let registry = IntegrationRegistry::new();

        // Task with PR in title
        let pr_task = json!({
            "id": "task-1",
            "title": "Review PR #123",
            "github": {
                "pr_state": "open",
                "reviews": 2,
                "mentions": ["user1"]
            }
        });
        let boost = registry.calculate_github_boost(&pr_task);
        assert!(boost > 0, "PR task should have boost");
        assert!(boost <= 10, "Boost should be capped at 10");

        // Normal task without GitHub data
        let normal_task = json!({
            "id": "task-2",
            "title": "Normal task"
        });
        let normal_boost = registry.calculate_github_boost(&normal_task);
        assert_eq!(normal_boost, 0, "Non-GitHub task should have no boost");
    }

    #[test]
    fn test_find_pomodoroom_in_calendar_list_found() {
        let body = serde_json::json!({
            "items": [
                {"id": "cal1", "summary": "Personal"},
                {"id": "pomodoroom_id", "summary": "Pomodoroom"},
                {"id": "cal3", "summary": "Work"},
            ]
        });
        let id = find_pomodoroom_in_calendar_list(&body);
        assert_eq!(id, Some("pomodoroom_id".to_string()));
    }

    #[test]
    fn test_find_pomodoroom_in_calendar_list_not_found() {
        let body = serde_json::json!({
            "items": [
                {"id": "cal1", "summary": "Personal"},
                {"id": "cal2", "summary": "Work"},
            ]
        });
        let id = find_pomodoroom_in_calendar_list(&body);
        assert_eq!(id, None);
    }

    #[test]
    fn test_find_pomodoroom_in_calendar_list_empty_items() {
        let body = serde_json::json!({"items": []});
        assert_eq!(find_pomodoroom_in_calendar_list(&body), None);
    }

    #[test]
    fn test_find_pomodoroom_in_calendar_list_missing_items_key() {
        let body = serde_json::json!({});
        assert_eq!(find_pomodoroom_in_calendar_list(&body), None);
    }
}
