//! Google Calendar OAuth and API commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for Google Calendar integration.

use base64::prelude::*;
use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use chrono::{DateTime, FixedOffset, Utc};

use pomodoroom_core::scheduler::CalendarEvent;

// === Type Definitions ===

/// Type alias for backward compatibility with google_tasks.rs
pub type GoogleOAuthConfig = GoogleCalendarOAuthConfig;

/// OAuth configuration for Google Calendar.
#[derive(Debug, Clone)]
pub struct GoogleCalendarOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
}

impl GoogleCalendarOAuthConfig {
    /// Create a new OAuth config from environment variables or defaults.
    pub fn new() -> Self {
        Self {
            client_id: std::env::var("GOOGLE_CLIENT_ID")
                .unwrap_or_else(|_| "default_client_id".to_string()),
            client_secret: std::env::var("GOOGLE_CLIENT_SECRET")
                .unwrap_or_else(|_| "default_client_secret".to_string()),
        }
    }

    /// Get the client ID.
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Get the client secret.
    pub fn client_secret(&self) -> &str {
        &self.client_secret
    }
}

/// Token response from Google OAuth.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: Option<u64>,
}

impl TokenResponse {
    /// Convert to JSON string for storage.
    fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(&json!({
            "accessToken": self.access_token,
            "refreshToken": self.refresh_token,
            "expiresIn": self.expires_in,
        })).map_err(|e| format!("Failed to serialize tokens: {}", e))
    }
}

/// Stored OAuth tokens (deserialized format from keyring).
#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct StoredTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    #[serde(default)]
    #[serde(rename = "accessToken")]
    pub access_token_alt: Option<String>,
}

impl Default for StoredTokens {
    fn default() -> Self {
        Self {
            access_token: String::new(),
            refresh_token: None,
            expires_at: None,
            access_token_alt: None,
        }
    }
}

// === OAuth Commands ===

/// Gets OAuth authorization URL for Google Calendar.
#[tauri::command]
pub fn cmd_google_auth_get_auth_url(
    config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<Value, String> {
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar.events+\
         https://www.googleapis.com/auth/calendar.events.readonly+\
         redirect_uri=urn:ietf:wg:oauth:2.0:oob:auto:oob:auto&response_type=code\
         &client_id={}",
        config.client_id.as_str()
    );

    Ok(json!({ "auth_url": auth_url }))
}

/// Initiates OAuth flow by opening auth URL in browser.
#[tauri::command]
pub fn cmd_google_auth_connect(
    config: State<'_, GoogleCalendarOAuthConfig>,
    app: AppHandle,
) -> Result<(), String> {
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar.events+\
         https://www.googleapis.com/auth/calendar.events.readonly&response_type=code&client_id={}&\
         redirect_uri=urn:ietf:wg:oauth:2.0:oob:auto:oob:auto",
        config.client_id.as_str()
    );
    app.opener().open_url(&auth_url, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

/// Exchanges authorization code for access tokens.
#[tauri::command]
pub async fn cmd_google_auth_exchange_code(
    config: State<'_, GoogleCalendarOAuthConfig>,
    code: String,
) -> Result<Value, String> {
    let client = Client::new();

    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("code", &code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", "urn:ietf:wg:oauth:2.0:oob:auto:oob:auto"),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))?;

    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let token_response: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Store tokens using bridge command (2 args: service_name, tokens_json)
    let tokens_json = token_response.to_json()?;
    crate::bridge::cmd_store_oauth_tokens("google_calendar".to_string(), tokens_json)
        .map_err(|e| format!("Failed to store tokens: {}", e))?;

    Ok(json!({
        "access_token": token_response.access_token,
        "refresh_token": token_response.refresh_token,
        "expires_in": token_response.expires_in,
    }))
}

/// Lists events from Google Calendar for a date range.
#[tauri::command]
pub async fn cmd_google_calendar_list_events(
    start_iso: String,
    end_iso: String,
    _config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<Value, String> {
    use pomodoroom_core::scheduler::CalendarEvent;

    let tokens_json = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: StoredTokens = serde_json::from_str(&tokens_json.unwrap_or_default())
        .map_err(|e| format!("Invalid tokens format: {}", e))?;

    let client = Client::new();

    let start_dt = parse_datetime(&start_iso)?;
    let end_dt = parse_datetime(&end_iso)?;

    let start_str = start_dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    let end_str = end_dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string();

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events\
         ?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime",
        urlencoding::encode(&start_str),
        urlencoding::encode(&end_str)
    );

    let resp = client
        .get(&events_url)
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch events: {}", e))?;

    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let json: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse events response: {}", e))?;

    let events = parse_calendar_events(json)?;

    serde_json::to_value(&events).map_err(|e| format!("JSON error: {}", e))
}

/// Creates a new event in Google Calendar.
#[tauri::command]
pub async fn cmd_google_calendar_create_event(
    event_json: Value,
    _config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<(), String> {
    let tokens_json = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: StoredTokens = serde_json::from_str(&tokens_json.unwrap_or_default())
        .map_err(|e| format!("Invalid tokens format: {}", e))?;

    let client = Client::new();

    let start_str = event_json
        .get("start_time")
        .and_then(|v: &Value| v.as_str())
        .ok_or_else(|| "Missing start_time".to_string())?;

    let end_str = event_json
        .get("end_time")
        .and_then(|v: &Value| v.as_str())
        .ok_or_else(|| "Missing end_time".to_string())?;

    let summary = event_json
        .get("summary")
        .and_then(|v: &Value| v.as_str())
        .ok_or_else(|| "Missing summary".to_string())?;

    let description = event_json
        .get("description")
        .and_then(|v: &Value| v.as_str())
        .ok_or_else(|| "Missing description".to_string())?;

    let start_dt = parse_datetime(start_str)?;
    let end_dt = parse_datetime(end_str)?;

    let event_body = json!({
        "summary": summary,
        "description": description,
        "start": {
            "dateTime": start_dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string()
        },
        "end": {
            "dateTime": end_dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string()
        }
    });

    client
        .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
        .bearer_auth(&tokens.access_token)
        .json(&event_body)
        .send()
        .await
        .map_err(|e| format!("Failed to create event: {}", e))?;

    Ok(())
}

/// Deletes an event from Google Calendar.
#[tauri::command]
pub async fn cmd_google_calendar_delete_event(
    event_id: String,
    _config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<(), String> {
    let tokens_json = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: StoredTokens = serde_json::from_str(&tokens_json.unwrap_or_default())
        .map_err(|e| format!("Invalid tokens format: {}", e))?;

    let client = Client::new();

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{}",
        event_id
    );

    client
        .delete(&events_url)
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to delete event: {}", e))?;

    Ok(())
}

/// Lists available calendars from Google Calendar.
#[tauri::command]
pub async fn cmd_google_calendar_list_calendars(
    _config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<Value, String> {
    let tokens_json = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: StoredTokens = serde_json::from_str(&tokens_json.unwrap_or_default())
        .map_err(|e| format!("Invalid tokens format: {}", e))?;

    let client = Client::new();

    let resp = client
        .get("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .bearer_auth(&tokens.access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch calendars: {}", e))?;

    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let json: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse calendar list: {}", e))?;

    Ok(json)
}

/// Gets selected calendars for display.
#[tauri::command]
pub fn cmd_google_calendar_get_selected_calendars() -> Result<Value, String> {
    // Return default selected calendars
    Ok(json!(["primary"]))
}

/// Sets selected calendars for display.
#[tauri::command]
pub fn cmd_google_calendar_set_selected_calendars(_calendars: Value) -> Result<(), String> {
    // Store selected calendars (placeholder implementation)
    Ok(())
}

// === Helper Functions ===

/// Generate a cryptographically random state parameter for CSRF protection.
fn generate_csrf_state() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|e| format!("Failed to generate random state: {e}"))?;
    Ok(BASE64_URL_SAFE_NO_PAD.encode(&bytes))
}

/// Parse an ISO 8601 datetime string.
fn parse_datetime(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt: DateTime<FixedOffset>| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid datetime format '{}': {}", s, e))
}

/// Validate time range is within reasonable bounds.
fn validate_time_range(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), String> {
    if start >= end {
        return Err(format!("Start time must be before end time: {} >= {}", start, end));
    }

    let now = Utc::now();
    let min_date = now - chrono::Duration::days(365 * 100);
    let max_date = now + chrono::Duration::days(365 * 10);

    if start < min_date || start > max_date {
        return Err(format!("Date is too far in the past or future: {}", start.format("%Y-%m-%d")));
    }
    if end < min_date || end > max_date {
        return Err(format!("Date is too far in the past or future: {}", end.format("%Y-%m-%d")));
    }

    Ok(())
}

/// Parse calendar events from JSON value with date bounds validation.
fn parse_calendar_events(events_json: Value) -> Result<Vec<CalendarEvent>, String> {
    let items = events_json
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "events must have items array".to_string())?;

    let mut events = Vec::new();

    for event_json in items {
        // Parse start time from Google Calendar API format
        let start_data = event_json.get("start")
            .ok_or_else(|| "missing start".to_string())?;

        let start_str = start_data
            .get("dateTime")
            .or_else(|| start_data.get("date"))
            .and_then(|v: &Value| v.as_str())
            .ok_or_else(|| "missing start.dateTime".to_string())?;

        // Parse end time
        let end_data = event_json.get("end")
            .ok_or_else(|| "missing end".to_string())?;

        let end_str = end_data
            .get("dateTime")
            .or_else(|| end_data.get("date"))
            .and_then(|v: &Value| v.as_str())
            .ok_or_else(|| "missing end.dateTime".to_string())?;

        let start_time = DateTime::parse_from_rfc3339(start_str)
            .map_err(|e| format!("invalid start_time: {}", e))?
            .with_timezone(&Utc);

        let end_time = DateTime::parse_from_rfc3339(end_str)
            .map_err(|e| format!("invalid end_time: {}", e))?
            .with_timezone(&Utc);

        validate_time_range(start_time, end_time)?;

        let id = event_json
            .get("id")
            .and_then(|v: &Value| v.as_str())
            .unwrap_or("")
            .to_string();

        let title = event_json
            .get("summary")
            .and_then(|v: &Value| v.as_str())
            .unwrap_or("Event")
            .to_string();

        events.push(CalendarEvent::new(id, title, start_time, end_time));
    }

    Ok(events)
}
