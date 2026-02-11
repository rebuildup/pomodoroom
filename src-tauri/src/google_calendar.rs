//! Google Calendar bridge commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for Google Calendar integration.
//! It bridges the frontend to Google's OAuth2 and Calendar Events API.
//!
//! The commands handle:
//! - Generating OAuth authorization URLs
//! - Exchanging authorization codes for access tokens
//! - Listing calendar events within a time range
//! - Creating calendar events

use serde_json::{json, Value};
use chrono::{DateTime, Utc};

// Google OAuth configuration
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3";

// OAuth scopes for Google Calendar
const CALENDAR_EVENTS_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_READONLY_SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";

// Default redirect port for OAuth callback
const OAUTH_REDIRECT_PORT: u16 = 19821;

/// OAuth configuration struct for Google Calendar.
#[derive(Debug, Clone)]
struct GoogleOAuthConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

impl GoogleOAuthConfig {
    /// Create a new OAuth config.
    /// Uses placeholder credentials - should be loaded from config in production.
    fn new() -> Self {
        Self {
            client_id: std::env::var("GOOGLE_CLIENT_ID")
                .unwrap_or_else(|_| "YOUR_CLIENT_ID".to_string()),
            client_secret: std::env::var("GOOGLE_CLIENT_SECRET")
                .unwrap_or_else(|_| "YOUR_CLIENT_SECRET".to_string()),
            redirect_uri: format!("http://localhost:{}/callback", OAUTH_REDIRECT_PORT),
        }
    }

    /// Build the OAuth authorization URL.
    ///
    /// # Scopes
    /// - calendar.events: Read and write access to calendar events
    /// - access_type=offline: Requests refresh token for long-lived access
    /// - prompt=consent: Forces consent dialog to ensure refresh token is returned
    fn build_auth_url(&self, state: &str) -> String {
        let scopes = format!("{} {}", CALENDAR_EVENTS_SCOPE, CALENDAR_READONLY_SCOPE);
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
            GOOGLE_AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri),
            urlencoding::encode(&scopes),
            urlencoding::encode(state),
        )
    }
}

/// Token response from Google OAuth token endpoint.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: String,
    scope: Option<String>,
}

/// Calendar event from Google Calendar API.
#[derive(Debug, serde::Deserialize)]
struct CalendarEvent {
    id: String,
    summary: Option<String>,
    description: Option<String>,
    start: EventTime,
    end: EventTime,
}

/// Event time (can be date or datetime).
#[derive(Debug, serde::Deserialize)]
struct EventTime {
    date: Option<String>,        // All-day event
    date_time: Option<String>,    // Timed event (RFC3339)
    time_zone: Option<String>,
}

// ── OAuth Commands ─────────────────────────────────────────────────────────

/// Get the Google OAuth authorization URL.
///
/// This command generates the OAuth URL that the frontend should open
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
pub fn cmd_google_auth_get_auth_url() -> Result<Value, String> {
    let config = GoogleOAuthConfig::new();

    // Generate state parameter for CSRF protection
    let state = generate_csrf_state()?;

    let auth_url = config.build_auth_url(&state);

    Ok(json!({
        "auth_url": auth_url,
        "state": state,
        "redirect_port": OAUTH_REDIRECT_PORT,
    }))
}

/// Exchange OAuth authorization code for access tokens.
///
/// This command should be called after the user completes the OAuth flow
/// and the authorization code is received via the callback.
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
pub fn cmd_google_auth_exchange_code(
    code: String,
    state: String,
    expected_state: String,
) -> Result<Value, String> {
    // Validate state parameter for CSRF protection
    if state != expected_state {
        return Err("State parameter mismatch - possible CSRF attack".to_string());
    }

    let config = GoogleOAuthConfig::new();

    // Exchange code for tokens using HTTP client
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let token_response = rt.block_on(async {
        exchange_code_for_tokens(&config, &code).await
    })?;

    // Store tokens using bridge command.
    let now = Utc::now().timestamp();
    let stored_tokens = StoredTokens::from_token_response(token_response.clone(), now);
    let tokens_json = serde_json::to_string(&stored_tokens)
        .map_err(|e| format!("Failed to serialize tokens: {e}"))?;

    // Use the token storage from bridge module
    crate::bridge::cmd_store_oauth_tokens("google_calendar".to_string(), tokens_json)?;

    // Return token info to frontend (excluding sensitive data)
    Ok(json!({
        "access_token": token_response.access_token,
        "expires_in": token_response.expires_in,
        "token_type": token_response.token_type,
        "authenticated": true,
    }))
}

/// Exchange authorization code for access tokens with Google.
async fn exchange_code_for_tokens(
    config: &GoogleOAuthConfig,
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

/// Get a valid access token, refreshing if necessary.
async fn get_access_token(service_name: &str) -> Result<String, String> {
    // Try to load existing tokens
    let tokens_json = crate::bridge::cmd_load_oauth_tokens(service_name.to_string())?
        .ok_or_else(|| "No stored tokens found".to_string())?;

    let tokens: StoredTokens = serde_json::from_str(&tokens_json)
        .map_err(|e| format!("Failed to parse stored tokens: {e}"))?;

    // Check if token is expired (with 60s buffer)
    let now = Utc::now().timestamp();
    let is_expired = tokens.expires_at.map_or(false, |exp| now > exp - 60);

    if !is_expired {
        return Ok(tokens.access_token);
    }

    // Token is expired, need to refresh
    let config = GoogleOAuthConfig::new();
    let refresh_token = tokens.refresh_token
        .ok_or_else(|| "No refresh token available".to_string())?;

    refresh_access_token(&config, &refresh_token).await
}

/// Refresh access token using refresh token.
async fn refresh_access_token(
    config: &GoogleOAuthConfig,
    refresh_token: &str,
) -> Result<String, String> {
    use reqwest::Client;

    let client = Client::new();
    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
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

    let token_response: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;

    // Update stored tokens with new access token and expiration
    let now = Utc::now().timestamp();
    let expires_at = token_response.expires_in.map(|exp| now + exp as i64);

    let new_tokens = StoredTokens {
        access_token: token_response.access_token.clone(),
        refresh_token: Some(refresh_token.to_string()), // Keep original refresh token
        expires_at,
    };

    let tokens_json = serde_json::to_string(&new_tokens)
        .map_err(|e| format!("Failed to serialize new tokens: {e}"))?;

    crate::bridge::cmd_store_oauth_tokens("google_calendar".to_string(), tokens_json)?;

    Ok(token_response.access_token)
}

/// Stored token structure (simplified from OAuthTokens).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredTokens {
    #[serde(alias = "access_token")]
    access_token: String,
    #[serde(alias = "refresh_token")]
    refresh_token: Option<String>,
    #[serde(alias = "expires_at")]
    expires_at: Option<i64>,
}

impl StoredTokens {
    fn from_token_response(tokens: TokenResponse, now_unix: i64) -> Self {
        Self {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: tokens.expires_in.map(|exp| now_unix + exp as i64),
        }
    }
}

// ── Calendar Events Commands ───────────────────────────────────────────────

/// List events from a Google Calendar within a time range.
///
/// # Arguments
/// * `calendar_id` - Calendar ID (use "primary" for user's main calendar)
/// * `start_time` - Start time in ISO 8601 format (RFC3339)
/// * `end_time` - End time in ISO 8601 format (RFC3339)
///
/// # Returns
/// JSON array of calendar events:
/// ```json
/// [
///   {
///     "id": "event123",
///     "summary": "Team Meeting",
///     "description": "Weekly sync",
///     "start": { "dateTime": "2024-01-15T10:00:00Z" },
///     "end": { "dateTime": "2024-01-15T11:00:00Z" }
///   }
/// ]
/// ```
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - Invalid time range format
/// - Calendar API request fails
#[tauri::command]
pub fn cmd_google_calendar_list_events(
    calendar_id: String,
    start_time: String,
    end_time: String,
) -> Result<Value, String> {
    // Validate and parse time bounds
    let start_dt = parse_datetime(&start_time)?;
    let end_dt = parse_datetime(&end_time)?;

    // Validate reasonable time bounds
    validate_time_range(start_dt, end_dt)?;

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let events = rt.block_on(async {
        fetch_calendar_events(&calendar_id, &start_time, &end_time).await
    })?;

    Ok(json!(events))
}

/// Fetch calendar events from Google Calendar API.
async fn fetch_calendar_events(
    calendar_id: &str,
    start_time: &str,
    end_time: &str,
) -> Result<Vec<Value>, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_calendar").await?;

    let url = format!(
        "{}/calendars/{}/events",
        GOOGLE_CALENDAR_API_BASE,
        urlencoding::encode(calendar_id)
    );

    let client = Client::new();
    let resp = client
        .get(&url)
        .query(&[
            ("timeMin", start_time),
            ("timeMax", end_time),
            ("singleEvents", "true"),
            ("orderBy", "startTime"),
        ])
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Calendar API error: {} - {}", status, body));
    }

    let json_body: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    // Extract events array
    let events = json_body["items"]
        .as_array()
        .map(|arr| arr.clone())
        .unwrap_or_default();

    Ok(events)
}

/// Create a new event in Google Calendar.
///
/// # Arguments
/// * `calendar_id` - Calendar ID (use "primary" for user's main calendar)
/// * `summary` - Event title
/// * `description` - Optional event description
/// * `start_time` - Start time in ISO 8601 format (RFC3339)
/// * `end_time` - End time in ISO 8601 format (RFC3339)
///
/// # Returns
/// JSON object with created event data including the event ID:
/// ```json
/// {
///   "id": "event123",
///   "summary": "Focus Session",
///   "start": { "dateTime": "2024-01-15T10:00:00Z" },
///   "end": { "dateTime": "2024-01-15T10:25:00Z" },
///   "html_link": "https://www.google.com/calendar/event?eid=..."
/// }
/// ```
///
/// # Errors
/// Returns an error if:
/// - Not authenticated (no valid access token)
/// - Invalid time format
/// - Event creation fails
#[tauri::command]
pub fn cmd_google_calendar_create_event(
    calendar_id: String,
    summary: String,
    description: Option<String>,
    start_time: String,
    end_time: String,
) -> Result<Value, String> {
    // Validate and parse time bounds
    let start_dt = parse_datetime(&start_time)?;
    let end_dt = parse_datetime(&end_time)?;

    // Validate reasonable time bounds
    validate_time_range(start_dt, end_dt)?;

    // Validate summary is not empty
    if summary.trim().is_empty() {
        return Err("Event summary cannot be empty".to_string());
    }

    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let event = rt.block_on(async {
        create_calendar_event(
            &calendar_id,
            &summary,
            description.as_deref(),
            &start_time,
            &end_time,
        ).await
    })?;

    Ok(json!(event))
}

/// Create a calendar event via Google Calendar API.
async fn create_calendar_event(
    calendar_id: &str,
    summary: &str,
    description: Option<&str>,
    start_time: &str,
    end_time: &str,
) -> Result<Value, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_calendar").await?;

    let url = format!(
        "{}/calendars/{}/events",
        GOOGLE_CALENDAR_API_BASE,
        urlencoding::encode(calendar_id)
    );

    // Build event body
    let mut body = json!({
        "summary": summary,
        "start": {
            "dateTime": start_time,
        },
        "end": {
            "dateTime": end_time,
        },
    });

    // Add description if provided
    if let Some(desc) = description {
        body["description"] = json!(desc);
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
        return Err(format!("Calendar API error: {} - {}", status, resp_body));
    }

    let event: Value = serde_json::from_str(&resp_body)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    Ok(event)
}

/// Delete an event from Google Calendar.
///
/// # Arguments
/// * `calendar_id` - Calendar ID (use "primary" for user's main calendar)
/// * `event_id` - ID of the event to delete
///
/// # Returns
/// JSON object confirming deletion:
/// ```json
/// {
///   "deleted": true,
///   "event_id": "event123"
/// }
/// ```
#[tauri::command]
pub fn cmd_google_calendar_delete_event(
    calendar_id: String,
    event_id: String,
) -> Result<Value, String> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    rt.block_on(async {
        delete_calendar_event(&calendar_id, &event_id).await
    })?;

    Ok(json!({
        "deleted": true,
        "event_id": event_id,
    }))
}

/// Delete a calendar event via Google Calendar API.
async fn delete_calendar_event(
    calendar_id: &str,
    event_id: &str,
) -> Result<(), String> {
    use reqwest::Client;

    let access_token = get_access_token("google_calendar").await?;

    let url = format!(
        "{}/calendars/{}/events/{}",
        GOOGLE_CALENDAR_API_BASE,
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id)
    );

    let client = Client::new();
    let resp = client
        .delete(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

    let status = resp.status();

    if !status.is_success() {
        let body = resp.text().await
            .map_err(|e| format!("Failed to read response: {e}"))?;
        return Err(format!("Calendar API error: {} - {}", status, body));
    }

    Ok(())
}

// ── Helper Functions ───────────────────────────────────────────────────────

/// Generate a cryptographically random state parameter for CSRF protection.
fn generate_csrf_state() -> Result<String, String> {
    use base64::prelude::*;
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)
        .map_err(|e| format!("Failed to generate random state: {e}"))?;
    Ok(BASE64_URL_SAFE_NO_PAD.encode(&bytes))
}

/// Parse an ISO 8601 datetime string.
fn parse_datetime(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| format!("Invalid datetime format '{}': {}", s, e))
}

/// Validate time range is within reasonable bounds.
fn validate_time_range(start: DateTime<Utc>, end: DateTime<Utc>) -> Result<(), String> {
    // Ensure start is before end
    if start >= end {
        return Err(format!("Start time must be before end time: {} >= {}", start, end));
    }

    // Maximum reasonable date offset (10 years in future)
    const MAX_DATE_OFFSET_DAYS: i64 = 365 * 10;
    // Minimum reasonable date offset (100 years in past)
    const MIN_DATE_OFFSET_DAYS: i64 = -365 * 100;

    let now = Utc::now();
    let min_date = now + chrono::Duration::days(MIN_DATE_OFFSET_DAYS);
    let max_date = now + chrono::Duration::days(MAX_DATE_OFFSET_DAYS);

    if start < min_date || start > max_date {
        return Err(format!("Start time is out of reasonable bounds: {}", start));
    }
    if end < min_date || end > max_date {
        return Err(format!("End time is out of reasonable bounds: {}", end));
    }

    Ok(())
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
    fn test_csrf_state_generation() {
        let state1 = generate_csrf_state().unwrap();
        let state2 = generate_csrf_state().unwrap();
        // States should be different
        assert_ne!(state1, state2);
        // States should be URL-safe
        assert!(!state1.contains('/'));
        assert!(!state1.contains('+'));
        assert!(!state1.contains('='));
    }

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

    #[test]
    fn test_validate_time_range_valid() {
        let now = Utc::now();
        let start = now + chrono::Duration::hours(1);
        let end = now + chrono::Duration::hours(2);
        assert!(validate_time_range(start, end).is_ok());
    }

    #[test]
    fn test_validate_time_range_start_after_end() {
        let now = Utc::now();
        let start = now + chrono::Duration::hours(2);
        let end = now + chrono::Duration::hours(1);
        assert!(validate_time_range(start, end).is_err());
    }

    #[test]
    fn test_validate_time_range_too_far_future() {
        let now = Utc::now();
        let start = now + chrono::Duration::days(365 * 11);
        let end = now + chrono::Duration::days(365 * 11) + chrono::Duration::hours(1);
        assert!(validate_time_range(start, end).is_err());
    }
}
