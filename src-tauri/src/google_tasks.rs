//! Google Tasks bridge commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for Google Tasks integration.
//! It bridges the frontend to Google's Tasks API via OAuth2.
//!
//! The commands handle:
//! - OAuth authentication (reuses Calendar setup)
//! - Listing task lists
//! - Listing tasks from a specific list
//! - Completing tasks
//! - Creating new tasks

use serde_json::{json, Value};

// ── Data Structures ───────────────────────────────────────────────────────────

/// Google Task List representation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskList {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub updated: String,
}

/// Google Task representation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub status: String, // "needsAction" | "completed"
    #[serde(default)]
    pub due: Option<String>,
    #[serde(default)]
    pub updated: String,
}

/// Selected task list configuration stored in database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SelectedTaskListConfig {
    pub tasklist_id: String,
    pub updated_at: i64,
}
use chrono::{DateTime, Utc};

const GOOGLE_TASKS_API_BASE: &str = "https://www.googleapis.com/tasks/v1";
const TASKS_SCOPE: &str = "https://www.googleapis.com/auth/tasks";

// ── Task Lists Commands ─────────────────────────────────────────────────────

/// List all task lists for the authenticated user.
///
/// Returns all task lists that the user has access to.
///
/// # Returns
/// JSON array of task list entries:
/// ```json
/// [
///   {
///     "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow",
///     "title": "My Tasks",
///     "updated": "2024-01-15T10:00:00.000Z"
///   }
/// ]
/// ```
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - API request fails
#[tauri::command]
pub fn cmd_google_tasks_list_tasklists() -> Result<Value, String> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let tasklists = rt.block_on(async {
        fetch_tasklists().await
    })?;

    Ok(json!(tasklists))
}

/// Fetch task lists from Google Tasks API.
async fn fetch_tasklists() -> Result<Vec<Value>, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_tasks").await?;

    let url = format!("{}/@self/lists", GOOGLE_TASKS_API_BASE);

    let client = Client::new();
    let resp = client
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Tasks API error: {} - {}", status, body));
    }

    let json_body: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let items = json_body["items"]
        .as_array()
        .map(|arr| arr.clone())
        .unwrap_or_default();

    Ok(items)
}

// ── Tasks Commands ─────────────────────────────────────────────────────────

/// List tasks from a specific task list.
///
/// # Arguments
/// * `tasklist_id` - Task list ID (use "@default" for default list)
/// * `show_completed` - Whether to include completed tasks (default: false)
/// * `show_hidden` - Whether to include hidden tasks (default: false)
///
/// # Returns
/// JSON array of task entries:
/// ```json
/// [
///   {
///     "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
///     "title": "Complete project documentation",
///     "notes": "Write comprehensive docs",
///     "status": "needsAction",
///     "due": "2024-01-20T00:00:00.000Z"
///   }
/// ]
/// ```
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - Task list not found
/// - API request fails
#[tauri::command]
pub fn cmd_google_tasks_list_tasks(
    tasklist_id: String,
    show_completed: Option<bool>,
    show_hidden: Option<bool>,
) -> Result<Value, String> {
    let show_completed = show_completed.unwrap_or(false);
    let show_hidden = show_hidden.unwrap_or(false);
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let tasks = rt.block_on(async {
        fetch_tasks(&tasklist_id, show_completed, show_hidden).await
    })?;

    Ok(json!(tasks))
}

/// Fetch tasks from Google Tasks API.
async fn fetch_tasks(
    tasklist_id: &str,
    show_completed: bool,
    show_hidden: bool,
) -> Result<Vec<Value>, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_tasks").await?;

    let url = format!(
        "{}/@self/lists/{}/tasks",
        GOOGLE_TASKS_API_BASE,
        urlencoding::encode(tasklist_id)
    );

    let client = Client::new();
    let resp = client
        .get(&url)
        .query(&[
            ("showCompleted", if show_completed { "true" } else { "false" }),
            ("showHidden", if show_hidden { "true" } else { "false" }),
        ])
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Tasks API error: {} - {}", status, body));
    }

    let json_body: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let items = json_body["items"]
        .as_array()
        .map(|arr| arr.clone())
        .unwrap_or_default();

    Ok(items)
}

/// Complete a task.
///
/// Marks a task as completed by setting its status to "completed".
///
/// # Arguments
/// * `tasklist_id` - Task list ID
/// * `task_id` - ID of the task to complete
///
/// # Returns
/// JSON object with updated task data:
/// ```json
/// {
///   "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
///   "title": "Complete project documentation",
///   "status": "completed",
///   "completed": "2024-01-15T10:30:00.000Z"
/// }
/// ```
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - Task not found
/// - API request fails
#[tauri::command]
pub fn cmd_google_tasks_complete_task(
    tasklist_id: String,
    task_id: String,
) -> Result<Value, String> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let task = rt.block_on(async {
        complete_task(&tasklist_id, &task_id).await
    })?;

    Ok(json!(task))
}

/// Complete a task via Google Tasks API.
async fn complete_task(
    tasklist_id: &str,
    task_id: &str,
) -> Result<Value, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_tasks").await?;

    let url = format!(
        "{}/@self/lists/{}/tasks/{}",
        GOOGLE_TASKS_API_BASE,
        urlencoding::encode(tasklist_id),
        urlencoding::encode(task_id)
    );

    let body = json!({
        "status": "completed",
        "completed": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    });

    let client = Client::new();
    let resp = client
        .patch(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();
    let resp_body = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Tasks API error: {} - {}", status, resp_body));
    }

    let task: Value = serde_json::from_str(&resp_body)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(task)
}

/// Create a new task.
///
/// # Arguments
/// * `tasklist_id` - Task list ID (use "@default" for default list)
/// * `title` - Task title (required)
/// * `notes` - Optional task notes/description
/// * `due` - Optional due date in ISO 8601 format (RFC3339)
///
/// # Returns
/// JSON object with created task data:
/// ```json
/// {
///   "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
///   "title": "Review pull request",
///   "notes": "Check for any issues",
///   "status": "needsAction",
///   "due": "2024-01-20T00:00:00.000Z"
/// }
/// ```
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - Title is empty
/// - Invalid due date format
/// - API request fails
#[tauri::command]
pub fn cmd_google_tasks_create_task(
    tasklist_id: String,
    title: String,
    notes: Option<String>,
    due: Option<String>,
) -> Result<Value, String> {
    if title.trim().is_empty() {
        return Err("Task title cannot be empty".to_string());
    }

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let task = rt.block_on(async {
        create_task(&tasklist_id, &title, notes.as_deref(), due.as_deref()).await
    })?;

    Ok(json!(task))
}

/// Create a task via Google Tasks API.
async fn create_task(
    tasklist_id: &str,
    title: &str,
    notes: Option<&str>,
    due: Option<&str>,
) -> Result<Value, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_tasks").await?;

    let url = format!(
        "{}/@self/lists/{}/tasks",
        GOOGLE_TASKS_API_BASE,
        urlencoding::encode(tasklist_id)
    );

    let mut body = json!({
        "title": title,
    });

    if let Some(n) = notes {
        body["notes"] = json!(n);
    }

    if let Some(d) = due {
        // Validate and parse due date
        let _due_dt = parse_datetime(d)?;
        body["due"] = json!(d);
    }

    let client = Client::new();
    let resp = client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();
    let resp_body = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Tasks API error: {} - {}", status, resp_body));
    }

    let task: Value = serde_json::from_str(&resp_body)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(task)
}

// ── OAuth Helpers ─────────────────────────────────────────────────────────

/// Get a valid access token for Google Tasks.
///
/// This reuses the OAuth infrastructure from Google Calendar,
/// using a different service name for token storage.
async fn get_access_token(service_name: &str) -> Result<String, String> {
    let tokens_json = crate::bridge::cmd_load_oauth_tokens(service_name.to_string())?
        .ok_or_else(|| "No stored tokens found. Please authenticate first.".to_string())?;

    let tokens: crate::google_calendar::StoredTokens = serde_json::from_str(&tokens_json)
        .map_err(|e| format!("Failed to parse stored tokens: {e}"))?;

    let now = Utc::now().timestamp();
    let is_expired = tokens.expires_at.map_or(false, |exp| now > exp - 60);

    if !is_expired {
        return Ok(tokens.access_token);
    }

    // Token is expired, need to refresh
    let config = crate::google_calendar::GoogleOAuthConfig::new();
    let refresh_token = tokens.refresh_token
        .ok_or_else(|| "No refresh token available. Please re-authenticate.".to_string())?;

    refresh_access_token(&config, &refresh_token).await
}

/// Refresh access token using refresh token.
async fn refresh_access_token(
    config: &crate::google_calendar::GoogleOAuthConfig,
    refresh_token: &str,
) -> Result<String, String> {
    use reqwest::Client;

    const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

    let client = Client::new();
    let params = [
        ("client_id", config.client_id()),
        ("client_secret", config.client_secret()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Token refresh failed: {} - {}", status, body));
    }

    let token_response: crate::google_calendar::TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;

    let now = Utc::now().timestamp();
    let expires_at = token_response.expires_in.map(|exp| now + exp as i64);

    let new_tokens = crate::google_calendar::StoredTokens {
        access_token: token_response.access_token.clone(),
        refresh_token: Some(refresh_token.to_string()),
        expires_at,
    };

    let tokens_json = serde_json::to_string(&new_tokens)
        .map_err(|e| format!("Failed to serialize new tokens: {e}"))?;

    crate::bridge::cmd_store_oauth_tokens("google_tasks".to_string(), tokens_json)?;

    Ok(token_response.access_token)
}

// ── Helper Functions ─────────────────────────────────────────────────────

/// Parse an ISO 8601 datetime string.
fn parse_datetime(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid datetime format '{}': {}", s, e))
}

// Simple urlencoding helper module
mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::Serializer::new(String::new())
            .append_key_only(s)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_datetime_valid() {
        let result = parse_datetime("2024-01-15T10:00:00Z");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_datetime_invalid() {
        let result = parse_datetime("invalid-date");
        assert!(result.is_err());
    }
}
