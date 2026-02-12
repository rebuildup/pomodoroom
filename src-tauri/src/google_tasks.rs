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
use chrono::{DateTime, FixedOffset, Utc};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

// Google OAuth configuration
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_TASKS_API_BASE: &str = "https://www.googleapis.com/tasks/v1";
const TASKS_SCOPE: &str = "https://www.googleapis.com/auth/tasks";

// Default redirect port for OAuth callback
const OAUTH_REDIRECT_PORT: u16 = 19821;
const OAUTH_CONNECT_TIMEOUT_SECS: u64 = 180;

/// OAuth configuration struct for Google Tasks.
#[derive(Debug, Clone)]
pub struct GoogleTasksOAuthConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

impl GoogleTasksOAuthConfig {
    /// Create a new OAuth config.
    /// Reuses the same environment variables as Google Calendar.
    pub fn new() -> Self {
        let build_client_id = option_env!("GOOGLE_CLIENT_ID").unwrap_or("");
        let build_client_secret = option_env!("GOOGLE_CLIENT_SECRET").unwrap_or("");

        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| (!build_client_id.trim().is_empty()).then(|| build_client_id.to_string()))
            .unwrap_or_else(|| "YOUR_CLIENT_ID".to_string());

        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| (!build_client_secret.trim().is_empty()).then(|| build_client_secret.to_string()))
            .unwrap_or_else(|| "YOUR_CLIENT_SECRET".to_string());

        Self {
            client_id,
            client_secret,
            redirect_uri: format!("http://localhost:{}/callback", OAUTH_REDIRECT_PORT),
        }
    }

    #[allow(dead_code)]
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    #[allow(dead_code)]
    pub fn client_secret(&self) -> &str {
        &self.client_secret
    }

    #[allow(dead_code)]
    pub fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    /// Build OAuth authorization URL for Google Tasks.
    fn build_auth_url(&self, state: &str) -> String {
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
            GOOGLE_AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri),
            urlencoding::encode(TASKS_SCOPE),
            urlencoding::encode(state),
        )
    }
}

/// Validate OAuth configuration.
fn validate_oauth_config(config: &GoogleTasksOAuthConfig) -> Result<(), String> {
    if config.client_id.trim().is_empty() || config.client_id == "YOUR_CLIENT_ID" {
        return Err("Google OAuth client_id is not configured. Set GOOGLE_CLIENT_ID.".to_string());
    }

    if config.client_secret.trim().is_empty() || config.client_secret == "YOUR_CLIENT_SECRET" {
        return Err("Google OAuth client_secret is not configured. Set GOOGLE_CLIENT_SECRET.".to_string());
    }

    Ok(())
}

/// Token response from Google OAuth token endpoint.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: String,
    pub scope: Option<String>,
}

/// Stored token structure for OAuth tokens.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredTokens {
    #[serde(alias = "access_token")]
    pub access_token: String,
    #[serde(alias = "refresh_token")]
    pub refresh_token: Option<String>,
    #[serde(alias = "expires_at")]
    pub expires_at: Option<i64>,
}

impl StoredTokens {
    pub fn from_token_response(tokens: TokenResponse, now_unix: i64) -> Self {
        Self {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expires_in.map(|exp| now_unix + exp as i64),
        }
    }
}

// ── Data Structures ───────────────────────────────────────────────────

/// Google Task List representation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct TaskList {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub updated: String,
}

/// Google Task representation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
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

/// Selected task lists configuration stored in database.
/// Supports multiple task list selection.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SelectedTasklistsConfig {
    pub tasklist_ids: Vec<String>,
    pub updated_at: i64,
}

/// Session task configuration stored in database.
/// Associates a Google Task with the current Pomodoro session.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionTaskConfig {
    pub task_id: String,
    pub tasklist_id: String,
    pub task_title: String,
    pub set_at: i64,
}

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

    let url = format!("{}/users/@me/lists", GOOGLE_TASKS_API_BASE);

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

/// Get selected task list ID from database.
///
/// Returns the task list ID that user has selected for synchronization.
/// If no selection exists, returns null with is_default flag.
///
/// # Returns
/// JSON object with:
/// - `tasklist_id`: The selected task list ID (or null if none selected)
/// - `is_default`: true if no selection was saved
///
/// # Example
/// ```json
/// {
///   "tasklist_id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow",
///   "is_default": false
/// }
/// ```
#[tauri::command]
pub fn cmd_google_tasks_get_selected_tasklist(
    db: tauri::State<'_, crate::bridge::DbState>,
) -> Result<Value, String> {
    const CONFIG_KEY: &str = "google_tasks:selected_tasklist";

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;

    match db.kv_get(CONFIG_KEY).map_err(|e| e.to_string())? {
        None => {
            // No selection saved
            Ok(json!({
                "tasklist_id": Option::<String>::None,
                "is_default": true
            }))
        }
        Some(json_str) => {
            let config: SelectedTaskListConfig = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse config: {e}"))?;
            Ok(json!({
                "tasklist_id": config.tasklist_id,
                "is_default": false
            }))
        }
    }
}

/// Set selected task list ID in database.
///
/// Saves user's task list selection for task synchronization.
///
/// # Arguments
/// * `tasklist_id` - Task list ID to use for task sync
///
/// # Errors
/// Returns an error if:
/// - tasklist_id is empty
/// - Database operation fails
#[tauri::command]
pub fn cmd_google_tasks_set_selected_tasklist(
    db: tauri::State<'_, crate::bridge::DbState>,
    tasklist_id: String,
) -> Result<(), String> {
    if tasklist_id.trim().is_empty() {
        return Err("Task list ID cannot be empty".to_string());
    }

    const CONFIG_KEY: &str = "google_tasks:selected_tasklist";

    let config = SelectedTaskListConfig {
        tasklist_id: tasklist_id.clone(),
        updated_at: Utc::now().timestamp(),
    };

    let config_json = serde_json::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db.kv_set(CONFIG_KEY, &config_json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get selected task list IDs from database.
///
/// Returns all task list IDs that user has selected for synchronization.
/// If no selection exists, returns empty array with is_default flag.
///
/// # Returns
/// JSON object with:
/// - `tasklist_ids`: Array of selected task list IDs (empty if none selected)
/// - `is_default`: true if no selection was saved
///
/// # Example
/// ```json
/// {
///   "tasklist_ids": ["MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow", "MDEwMjA3NDc1NzQ4MjIwMDA6MDo"],
///   "is_default": false
/// }
/// ```
#[tauri::command]
pub fn cmd_google_tasks_get_selected_tasklists(
    db: tauri::State<'_, crate::bridge::DbState>,
) -> Result<Value, String> {
    const CONFIG_KEY: &str = "google_tasks:selected_tasklists";

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;

    match db.kv_get(CONFIG_KEY).map_err(|e| e.to_string())? {
        None => {
            // No selection saved
            Ok(json!({
                "tasklist_ids": Vec::<String>::new(),
                "is_default": true
            }))
        }
        Some(json_str) => {
            let config: SelectedTasklistsConfig = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse config: {e}"))?;
            Ok(json!({
                "tasklist_ids": config.tasklist_ids,
                "is_default": false
            }))
        }
    }
}

/// Set selected task list IDs in database.
///
/// Saves user's multiple task list selections for task synchronization.
///
/// # Arguments
/// * `tasklistIds` - Array of task list IDs to use for task sync
///
/// # Errors
/// Returns an error if:
/// - tasklistIds is empty
/// - Database operation fails
#[tauri::command]
pub fn cmd_google_tasks_set_selected_tasklists(
    db: tauri::State<'_, crate::bridge::DbState>,
    #[allow(non_snake_case)]
    tasklistIds: Vec<String>,
) -> Result<(), String> {
    if tasklistIds.is_empty() {
        return Err("At least one task list must be selected".to_string());
    }

    const CONFIG_KEY: &str = "google_tasks:selected_tasklists";

    let config = SelectedTasklistsConfig {
        tasklist_ids: tasklistIds.clone(),
        updated_at: Utc::now().timestamp(),
    };

    let config_json = serde_json::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db.kv_set(CONFIG_KEY, &config_json).map_err(|e| e.to_string())?;

    Ok(())
}

// ── Session Task Commands ──────────────────────────────────────────────────

/// Get the task ID associated with current session.
///
/// Returns the task that user has selected to complete when
/// the current Pomodoro session finishes.
///
/// # Returns
/// JSON object with:
/// - `task_id`: The Google Task ID (or null if none set)
/// - `tasklist_id`: The task list ID containing the task (or null)
/// - `task_title`: The task title (or null)
/// - `is_set`: true if a session task is configured
///
/// # Example
/// ```json
/// {
///   "task_id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
///   "tasklist_id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDow",
///   "task_title": "Complete project documentation",
///   "is_set": true
/// }
/// ```
#[tauri::command]
pub fn cmd_google_tasks_get_session_task(
    db: tauri::State<'_, crate::bridge::DbState>,
) -> Result<Value, String> {
    const CONFIG_KEY: &str = "google_tasks:session_task";

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;

    match db.kv_get(CONFIG_KEY).map_err(|e| e.to_string())? {
        None => {
            Ok(json!({
                "task_id": Option::<String>::None,
                "tasklist_id": Option::<String>::None,
                "task_title": Option::<String>::None,
                "is_set": false
            }))
        }
        Some(json_str) => {
            let config: SessionTaskConfig = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse session task config: {e}"))?;
            Ok(json!({
                "task_id": config.task_id,
                "tasklist_id": config.tasklist_id,
                "task_title": config.task_title,
                "is_set": true
            }))
        }
    }
}

/// Set a task to be completed when session finishes.
///
/// Associates a Google Task with the current Pomodoro session.
/// The task will be automatically marked as completed when
/// the timer reaches completion.
///
/// # Arguments
/// * `task_id` - Google Task ID to complete on session finish
/// * `tasklist_id` - Task list ID containing the task
/// * `task_title` - Task title for display purposes
///
/// # Errors
/// Returns an error if:
/// - task_id is empty
/// - tasklist_id is empty
/// - Database operation fails
#[tauri::command]
pub fn cmd_google_tasks_set_session_task(
    db: tauri::State<'_, crate::bridge::DbState>,
    task_id: String,
    tasklist_id: String,
    task_title: String,
) -> Result<(), String> {
    if task_id.trim().is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    if tasklist_id.trim().is_empty() {
        return Err("Task list ID cannot be empty".to_string());
    }

    const CONFIG_KEY: &str = "google_tasks:session_task";

    let config = SessionTaskConfig {
        task_id: task_id.clone(),
        tasklist_id: tasklist_id.clone(),
        task_title: task_title.clone(),
        set_at: Utc::now().timestamp(),
    };

    let config_json = serde_json::to_string(&config)
        .map_err(|e| format!("Failed to serialize session task config: {e}"))?;

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db.kv_set(CONFIG_KEY, &config_json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Clear the session task association.
///
/// Removes the task associated with current session.
/// After calling this, no task will be auto-completed on session finish.
///
/// # Errors
/// Returns an error if database operation fails.
#[tauri::command]
pub fn cmd_google_tasks_clear_session_task(
    db: tauri::State<'_, crate::bridge::DbState>,
) -> Result<(), String> {
    const CONFIG_KEY: &str = "google_tasks:session_task";

    let db_guard = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db_guard.conn()
        .execute("DELETE FROM kv WHERE key = ?1", [CONFIG_KEY])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Complete the task associated with current session.
///
/// Marks as completed the task that was set via cmd_google_tasks_set_session_task.
/// This is called automatically when a Pomodoro session completes.
///
/// # Returns
/// JSON object with updated task data if session task was set:
/// ```json
/// {
///   "id": "MDMyMDEwMjA3NDc1NzQ4MjIwMDA6MDo",
///   "title": "Complete project documentation",
///   "status": "completed",
///   "completed": "2024-01-15T10:30:00.000Z"
/// }
/// ```
///
/// If no session task was set, returns null.
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - Task completion fails via API
#[tauri::command]
pub fn cmd_google_tasks_complete_session_task(
    db: tauri::State<'_, crate::bridge::DbState>,
) -> Result<Value, String> {
    const CONFIG_KEY: &str = "google_tasks:session_task";

    // First, get and clear the session task
    let db_guard = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    let session_task_json = db_guard.kv_get(CONFIG_KEY).map_err(|e| e.to_string())?;

    let session_task = match session_task_json {
        None => {
            // No session task set, return null
            return Ok(json!(null));
        }
        Some(json_str) => {
            let config: SessionTaskConfig = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse session task config: {e}"))?;
            config
        }
    };

    // Clear the session task (even if completion fails, don't retry)
    drop(db_guard);
    let db_clear = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db_clear.conn()
        .execute("DELETE FROM kv WHERE key = ?1", [CONFIG_KEY])
        .map_err(|e| e.to_string())?;

    // Complete the task via API
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let task = rt.block_on(async {
        complete_task(&session_task.tasklist_id, &session_task.task_id).await
    })?;

    Ok(json!(task))
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
        "{}/lists/{}/tasks",
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
        "{}/lists/{}/tasks/{}",
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
        "{}/lists/{}/tasks",
        GOOGLE_TASKS_API_BASE,
        urlencoding::encode(tasklist_id)
    );

    let mut body = json!({
        "title": title,
        "status": "needsAction",
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

// ── OAuth Commands ────────────────────────────────────────────────────────

/// Get the Google Tasks OAuth authorization URL.
///
/// This command generates an OAuth URL that the frontend should open
/// in a browser to initiate the OAuth flow.
///
/// # Returns
/// JSON object with:
/// - `auth_url`: The URL to open in a browser
/// - `state`: CSRF protection token to validate in callback
/// - `redirect_port`: Port number for callback listener
///
/// # Example
/// ```json
/// {
///   "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
///   "state": "random_csrf_token",
///   "redirect_port": 19821
/// }
/// ```
#[tauri::command]
pub fn cmd_google_tasks_auth_get_auth_url() -> Result<Value, String> {
    let config = GoogleTasksOAuthConfig::new();
    validate_oauth_config(&config)?;

    // Generate state parameter for CSRF protection
    let state = generate_csrf_state()?;

    let auth_url = config.build_auth_url(&state);

    Ok(json!({
        "auth_url": auth_url,
        "state": state,
        "redirect_port": OAUTH_REDIRECT_PORT,
    }))
}

/// Connect to Google Tasks via OAuth.
///
/// This command handles the full OAuth flow:
/// 1. Generates OAuth URL with CSRF state
/// 2. Opens browser for user authorization
/// 3. Listens for callback on localhost
/// 4. Exchanges authorization code for access tokens
/// 5. Stores tokens securely
///
/// # Returns
/// JSON object with:
/// - `access_token`: Bearer token for API requests
/// - `expires_in`: Seconds until token expires
/// - `token_type`: Usually "Bearer"
/// - `authenticated`: true
#[tauri::command]
pub fn cmd_google_tasks_auth_connect(app: AppHandle) -> Result<Value, String> {
    let config = GoogleTasksOAuthConfig::new();
    validate_oauth_config(&config)?;

    let state = generate_csrf_state()?;
    let auth_url = config.build_auth_url(&state);

    let listener = TcpListener::bind(("127.0.0.1", OAUTH_REDIRECT_PORT))
        .map_err(|e| format!("Failed to bind OAuth callback port {}: {e}", OAUTH_REDIRECT_PORT))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure OAuth callback listener: {e}"))?;

    app.opener()
        .open_url(auth_url, None::<String>)
        .map_err(|e| format!("Failed to open browser for Google OAuth: {e}"))?;

    let code = wait_for_oauth_callback(
        &listener,
        &state,
        Duration::from_secs(OAUTH_CONNECT_TIMEOUT_SECS),
    )?;

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let token_response = rt.block_on(async { exchange_code_for_tokens(&config, &code).await })?;

    let now = Utc::now().timestamp();
    let stored_tokens = StoredTokens::from_token_response(token_response.clone(), now);
    let tokens_json = serde_json::to_string(&stored_tokens)
        .map_err(|e| format!("Failed to serialize tokens: {e}"))?;

    crate::bridge::cmd_store_oauth_tokens("google_tasks".to_string(), tokens_json)?;

    Ok(json!({
        "access_token": token_response.access_token,
        "expires_in": token_response.expires_in,
        "token_type": token_response.token_type,
        "authenticated": true,
    }))
}

/// Exchange OAuth authorization code for access tokens.
///
/// This command should be called after the user completes the OAuth flow
/// and the authorization code is received via callback.
///
/// # Arguments
/// * `code` - Authorization code from OAuth callback
/// * `state` - State parameter from callback for CSRF validation
/// * `expected_state` - Expected state from get_auth_url for validation
///
/// # Returns
/// JSON object with token information:
/// - `access_token`: Bearer token for API requests
/// - `refresh_token`: Token for obtaining new access tokens
/// - `expires_in`: Seconds until token expires
/// - `token_type`: Usually "Bearer"
///
/// # Errors
/// Returns an error if:
/// - State parameter doesn't match (possible CSRF attack)
/// - Token exchange fails with Google's servers
#[tauri::command]
pub fn cmd_google_tasks_auth_exchange_code(
    code: String,
    state: String,
    expected_state: String,
) -> Result<Value, String> {
    // Validate state parameter for CSRF protection
    if state != expected_state {
        return Err("State parameter mismatch - possible CSRF attack".to_string());
    }

    let config = GoogleTasksOAuthConfig::new();

    // Exchange code for tokens using HTTP client
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let token_response = rt.block_on(async {
        exchange_code_for_tokens(&config, &code).await
    })?;

    // Store tokens using bridge command
    let now = Utc::now().timestamp();
    let stored_tokens = StoredTokens::from_token_response(token_response.clone(), now);
    let tokens_json = serde_json::to_string(&stored_tokens)
        .map_err(|e| format!("Failed to serialize tokens: {e}"))?;

    crate::bridge::cmd_store_oauth_tokens("google_tasks".to_string(), tokens_json)?;

    // Return token info to frontend (excluding sensitive data)
    Ok(json!({
        "access_token": token_response.access_token,
        "expires_in": token_response.expires_in,
        "token_type": token_response.token_type,
        "authenticated": true,
    }))
}

/// Disconnect and clear stored tokens.
///
/// Removes all stored OAuth tokens for Google Tasks.
/// After calling this, user must re-authenticate to use Google Tasks.
///
/// # Errors
/// Returns an error if token deletion fails.
#[tauri::command]
pub fn cmd_google_tasks_auth_disconnect() -> Result<(), String> {
    crate::bridge::cmd_clear_oauth_tokens("google_tasks".to_string())?;
    Ok(())
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

/// Exchange authorization code for access tokens with Google.
async fn exchange_code_for_tokens(
    config: &GoogleTasksOAuthConfig,
    code: &str,
) -> Result<TokenResponse, String> {
    use reqwest::Client;

    let client = Client::new();
    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", config.redirect_uri.as_str()),
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
        return Err(format!("Token exchange failed: {} - {}", status, body));
    }

    serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse token response: {e}"))
}

/// Parse callback query string into HashMap.
fn parse_callback_query(query: &str) -> Result<HashMap<String, String>, String> {
    let parsed = url::form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect::<HashMap<String, String>>();
    Ok(parsed)
}

/// Send OAuth HTML response to browser.
fn send_oauth_html_response(
    stream: &mut std::net::TcpStream,
    status: &str,
    title: &str,
    message: &str,
) {
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{}</title></head><body><h2>{}</h2><p>{}</p><p>You can close this tab and return to Pomodoroom.</p></body></html>",
        title, title, message
    );
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// Wait for OAuth callback on localhost.
fn wait_for_oauth_callback(
    listener: &TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<String, String> {
    let deadline = Instant::now() + timeout;

    loop {
        if Instant::now() >= deadline {
            return Err("OAuth callback timed out. Please try again.".to_string());
        }

        match listener.accept() {
            Ok((mut stream, _addr)) => {
                let mut buf = [0u8; 8192];
                let size = stream
                    .read(&mut buf)
                    .map_err(|e| format!("Failed to read OAuth callback: {e}"))?;

                if size == 0 {
                    continue;
                }

                let req = String::from_utf8_lossy(&buf[..size]);
                let first_line = req.lines().next().unwrap_or_default();
                let mut parts = first_line.split_whitespace();
                let method = parts.next().unwrap_or_default();
                let target = parts.next().unwrap_or_default();

                if method != "GET" {
                    send_oauth_html_response(
                        &mut stream,
                        "405 Method Not Allowed",
                        "OAuth Error",
                        "Only GET requests are supported.",
                    );
                    continue;
                }

                let parsed_url = url::Url::parse(&format!("http://localhost{}", target))
                    .map_err(|e| format!("Failed to parse OAuth callback URL: {e}"))?;

                if parsed_url.path() != "/callback" {
                    send_oauth_html_response(
                        &mut stream,
                        "404 Not Found",
                        "OAuth Error",
                        "Callback endpoint not found.",
                    );
                    continue;
                }

                let query = parsed_url.query().unwrap_or_default();
                let params = parse_callback_query(query)?;

                if let Some(err) = params.get("error") {
                    let msg = params
                        .get("error_description")
                        .cloned()
                        .unwrap_or_else(|| err.clone());
                    send_oauth_html_response(&mut stream, "400 Bad Request", "OAuth Canceled", &msg);
                    return Err(format!("Google OAuth returned error: {msg}"));
                }

                let returned_state = params
                    .get("state")
                    .ok_or_else(|| "Missing state in OAuth callback".to_string())?;
                if returned_state != expected_state {
                    send_oauth_html_response(
                        &mut stream,
                        "400 Bad Request",
                        "OAuth Error",
                        "State mismatch. Please retry.",
                    );
                    return Err("OAuth state mismatch - possible CSRF attack".to_string());
                }

                let code = params
                    .get("code")
                    .ok_or_else(|| "Missing code in OAuth callback".to_string())?
                    .to_string();

                send_oauth_html_response(
                    &mut stream,
                    "200 OK",
                    "Connected",
                    "Google Tasks authentication succeeded.",
                );
                return Ok(code);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => return Err(format!("OAuth callback listener error: {e}")),
        }
    }
}

/// Generate a cryptographically random state parameter for CSRF protection.
fn generate_csrf_state() -> Result<String, String> {
    use base64::prelude::*;
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|e| format!("Failed to generate random state: {e}"))?;
    Ok(BASE64_URL_SAFE_NO_PAD.encode(&bytes))
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
