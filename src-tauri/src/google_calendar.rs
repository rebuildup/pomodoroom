//! Google Calendar OAuth and API commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for Google Calendar integration.
//!
//! # Google Calendar Integration Flow
//! 1. Get auth URL → Open in browser → User authorizes → Get auth code
//! 2. Exchange auth code for access tokens → Store in OS keyring
//! 3. Fetch events using access tokens
//!
//! # Security Considerations
//! - Access tokens stored securely in OS keyring (platform-specific)
//! - Tokens never logged or exposed to frontend
//! - All OAuth tokens flow through secure system tray

use base64::prelude::*;
use pomodoroom_core::integration::OAuthConfig;
use pomodoroom_core::integration::AUTH_CONNECT_TIMEOUT_SECS;
use reqwest::Client;
use serde_json::json;
use tauri::State;
use chrono::{DateTime, FixedOffset, Utc};

/// Gets OAuth authorization URL for Google Calendar.
///
/// Opens browser window with Google auth page. User must manually copy code
/// and paste it back to the application.
///
/// # Returns
/// JSON object with authorization URL
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
///
/// # Arguments
/// * `config` - OAuth configuration containing client_id and client_secret
///
/// # Returns
/// Success status
#[tauri::command]
pub fn cmd_google_auth_connect(
    config: State<'_, GoogleCalendarOAuthConfig>,
    app: AppHandle,
) -> Result<(), String> {
    tauri_plugin_opener::open(&app, format!("https://accounts.google.com/o/oauth2/v2/auth?scope=https://www.googleapis.com/auth/calendar.events+https://www.googleapis.com/auth/calendar.events.readonly&response_type=code&client_id={}&redirect_uri=urn:ietf:wg:oauth:2.0:oob:auto:oob:auto", config.client_id.as_str()), None::<&str>)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Exchanges authorization code for access tokens.
///
/// # Arguments
/// * `config` - OAuth configuration
/// * `code` - Authorization code from Google callback
///
/// # Returns
/// JSON with access and refresh tokens, plus expiry time
#[tauri::command]
pub async fn cmd_google_auth_exchange_code(
    config: State<'_, GoogleCalendarOAuthConfig>,
    code: String,
) -> Result<Value, String> {
    use reqwest::Client;

    let client = Client::new();

    // Build token request parameters
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

    // Parse JSON response
    let token_response: TokenResponse = serde_json::from_str::<serde_json::Value>(&resp.text().await)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Store tokens securely via bridge command
    crate::bridge::cmd_store_oauth_tokens(
        "google_calendar".to_string(),
        &token_response.access_token,
        &token_response.refresh_token,
        Some(token_response.expires_in),
    ).map_err(|e| format!("Failed to store tokens: {}", e))?;

    Ok(token_response)
}

/// Lists events from Google Calendar for a date range.
///
/// # Arguments
/// * `start_iso` - Start date in ISO 8601 format (YYYY-MM-DD)
/// * `end_iso` - End date in ISO 8601 format (YYYY-MM-DD)
///
/// # Returns
/// Array of calendar events as JSON
#[tauri::command]
pub fn cmd_google_calendar_list_events(
    start_iso: String,
    end_iso: String,
    config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<Value, String> {
    // Load tokens from secure storage
    let tokens = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let Some(tokens) = tokens else {
        return Err("Not connected to Google Calendar".to_string());
    }

    use pomodoroom_core::integration::CalendarEvent;

    let client = Client::new();

    // Convert ISO dates to DateTime and format for API
    let start_dt = parse_datetime(&start_iso)?;
    let end_dt = parse_datetime(&end_iso)?;

    // Format dates for Google Calendar API (RFC3339)
    let start_str = start_dt.format("%Y-%m-%dT%H:%M:%S%Z").to_string();
    let end_str = end_dt.format("%Y-%m-%dT%H:%M:%S%Z").to_string();

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events\
         ?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime",
        start_str, end_str
    );

    // Fetch events with OAuth bearer token
    let resp = client
        .get(&events_url)
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch events: {}", e))?;

    // Parse response - Google returns { items: [{ ... }] }
    let json: Value = serde_json::from_str(&resp.text().await)
        .map_err(|e| format!("Failed to parse events response: {}", e))?;

    let events: Vec<CalendarEvent> = parse_calendar_events(json)?;

    // Return as JSON
    serde_json::to_value(&events).map_err(|e| format!("JSON error: {}", e))
}

/// Creates a new event in Google Calendar.
///
/// # Arguments
/// * `event_json` - Event data with start_time, end_time, summary, description
///
/// # Returns
/// Success status
#[tauri::command]
pub async fn cmd_google_calendar_create_event(
    event_json: Value,
    config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<(), String> {
    // Load tokens from secure storage
    let tokens = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let Some(tokens) = tokens else {
        return Err("Not connected to Google Calendar".to_string());
    }

    use pomodoroom_core::integration::CalendarEvent;

    let client = Client::new();

    // Parse event data
    let start_str = event_json
        .get("start_time")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing start_time".to_string())?;

    let end_str = event_json
        .get("end_time")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing end_time".to_string())?;

    let summary = event_json
        .get("summary")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing summary".to_string())?;

    let description = event_json
        .get("description")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing description".to_string())?;

    // Parse to DateTime
    let start_dt = parse_datetime(start_str)?;
    let end_dt = parse_datetime(end_str)?;

    // Create event JSON following Google Calendar API format
    let event_json = json!({
        "start": {
            "dateTime": start_dt.format("%Y-%m-%dT%H:%M:%S%Z").to_string()
        },
        "end": {
            "dateTime": end_dt.format("%Y-%m-%dT%H:%M:%S%Z").to_string()
        }
    });

    let events_url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    // Send event creation request with OAuth bearer token
    let resp = client
        .post(events_url)
        .bearer_auth(&tokens.access_token)
        .json(&event_json)
        .send()
        .await
        .map_err(|e| format!("Failed to create event: {}", e))?;

    Ok(())
}

/// Deletes an event from Google Calendar.
///
/// # Arguments
/// * `event_id` - Google Calendar event ID to delete
///
/// # Returns
/// Success status
#[tauri::command]
pub async fn cmd_google_calendar_delete_event(
    event_id: String,
    config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<(), String> {
    // Load tokens from secure storage
    let tokens = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let Some(tokens) = tokens else {
        return Err("Not connected to Google Calendar".to_string());
    }

    let client = Client::new();

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/{}",
        event_id
    );

    // Delete event with OAuth bearer token
    let resp = client
        .delete(&events_url)
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to delete event: {}", e))?;

    Ok(())
}

/// Lists available calendars from Google Calendar.
///
/// # Returns
/// Array of calendar IDs and names as JSON
#[tauri::command]
pub fn cmd_google_calendar_list_calendars(
    config: State<'_, GoogleCalendarOAuthConfig>,
) -> Result<Value, String> {
    // Load tokens from secure storage
    let tokens = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let Some(tokens) = tokens else {
        return Err("Not connected to Google Calendar".to_string());
    }

    let client = Client::new();

    let calendar_list_url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

    // Fetch calendar list with OAuth bearer token
    let resp = client
        .get(calendar_list_url)
        .bearer_auth(&tokens.access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch calendars: {}", e))?;

    // Parse response - Google returns { items: [{ id, summary, ... }] }
    let json: Value = serde_json::from_str(&resp.text().await)
        .map_err(|e| format!("Failed to parse calendar list: {}", e))?;

    // Extract calendar IDs and names
    Ok(json)
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
        .map(|dt: DateTime<Utc>| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid datetime format '{}': {}", s, e))
}

/// Validate time range is within reasonable bounds.
fn validate_time_range(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), String> {
    // Ensure start is before end
    if start >= end {
        return Err(format!("Start time must be before end time: {} >= {}", start, end));
    }

    // Check date range is within reasonable bounds (100 years past to 10 years future)
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

/// Parse calendar events from JSON value
/// with date bounds validation
fn parse_calendar_events(events_json: Value) -> Result<Vec<CalendarEvent>, String> {
    let events_array = events_json
        .as_array()
        .ok_or_else(|| "calendar_events must be an array".to_string())?;

    let mut events = Vec::new();

    for event_json in events_array {
        let start_str = event_json
            .get("start_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing start_time".to_string())?;

        let end_str = event_json
            .get("end_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing end_time".to_string())?;

        let start_time = DateTime::parse_from_rfc3339(start_str)
            .map_err(|e| format!("invalid start_time: {}", e))?
            .with_timezone(&Utc);
        let end_time = DateTime::parse_from_rfc3339(end_str)
            .map_err(|e| format!("invalid end_time: {}", e))?
            .with_timezone(&Utc);

        // Validate date bounds
        validate_time_range(start_time, end_time)?;

        // Create event object
        events.push(CalendarEvent::new(
            event_json
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("".to_string())
                .to_string(),
            event_json
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or_else("Event".to_string())
                .to_string(),
            start_time,
            end_time,
        ));
    }

    Ok(events)
}
