//! Google Calendar OAuth and API commands for Tauri IPC.
//!
//! This module provides Tauri command handlers for Google Calendar integration.

use base64::prelude::*;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};
use chrono::{DateTime, NaiveDate, Utc};

use pomodoroom_core::scheduler::CalendarEvent;

// === Constants ===

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.readonly";

// Redirect port for OAuth callback (different from Google Tasks to avoid conflicts)
const OAUTH_REDIRECT_PORT: u16 = 19822;
const OAUTH_CONNECT_TIMEOUT_SECS: u64 = 180;

// === Type Definitions ===

/// Type alias for backward compatibility with google_tasks.rs
pub type GoogleOAuthConfig = GoogleCalendarOAuthConfig;

/// OAuth configuration for Google Calendar.
#[derive(Debug, Clone)]
pub struct GoogleCalendarOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

impl GoogleCalendarOAuthConfig {
    /// Create a new OAuth config from environment variables or defaults.
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

    /// Get the client ID.
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Get the client secret.
    pub fn client_secret(&self) -> &str {
        &self.client_secret
    }

    /// Get the redirect URI.
    pub fn redirect_uri(&self) -> &str {
        &self.redirect_uri
    }

    /// Build OAuth authorization URL for Google Calendar.
    fn build_auth_url(&self, state: &str) -> String {
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
            GOOGLE_AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri),
            urlencoding::encode(CALENDAR_SCOPE),
            urlencoding::encode(state),
        )
    }
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
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
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

    /// Check if the access token is still valid.
    pub fn is_valid(&self, buffer_secs: i64) -> bool {
        if let Some(expires_at) = self.expires_at {
            let now = Utc::now().timestamp();
            now < expires_at - buffer_secs
        } else {
            false
        }
    }
}

// ── OAuth Commands ────────────────────────────────────────────────────────

/// Get the Google Calendar OAuth authorization URL.
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
///   "redirect_port": 19822
/// }
/// ```
#[tauri::command]
pub fn cmd_google_auth_get_auth_url() -> Result<Value, String> {
    let config = GoogleCalendarOAuthConfig::new();
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

/// Connect to Google Calendar via OAuth.
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
pub fn cmd_google_auth_connect(app: AppHandle) -> Result<Value, String> {
    let config = GoogleCalendarOAuthConfig::new();
    validate_oauth_config(&config)?;

    let state = generate_csrf_state()?;
    let auth_url = config.build_auth_url(&state);

    let listener = TcpListener::bind(("127.0.0.1", OAUTH_REDIRECT_PORT))
        .map_err(|e| format!("Failed to bind OAuth callback port {}: {e}", OAUTH_REDIRECT_PORT))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Failed to configure OAuth callback listener: {e}"))?;

    open::that_detached(auth_url)
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

    crate::bridge::cmd_store_oauth_tokens("google_calendar".to_string(), tokens_json)?;

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
pub fn cmd_google_auth_exchange_code(
    code: String,
    state: String,
    expected_state: String,
) -> Result<Value, String> {
    // Validate state parameter for CSRF protection
    if state != expected_state {
        return Err("State parameter mismatch - possible CSRF attack".to_string());
    }

    let config = GoogleCalendarOAuthConfig::new();

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

    crate::bridge::cmd_store_oauth_tokens("google_calendar".to_string(), tokens_json)?;

    // Return token info to frontend (excluding sensitive data)
    Ok(json!({
        "access_token": token_response.access_token,
        "expires_in": token_response.expires_in,
        "token_type": token_response.token_type,
        "authenticated": true,
    }))
}

// ── Calendar Events Commands ───────────────────────────────────────────────

/// Lists events from Google Calendar for a date range.
#[tauri::command]
pub async fn cmd_google_calendar_list_events(
    calendar_id: String,
    start_time: String,
    end_time: String,
) -> Result<Value, String> {
    let tokens_json = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: StoredTokens = serde_json::from_str(&tokens_json.unwrap_or_default())
        .map_err(|e| format!("Invalid tokens format: {}", e))?;

    let client = Client::new();

    let start_dt = parse_datetime(&start_time)?;
    let end_dt = parse_datetime(&end_time)?;

    let start_str = start_dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    let end_str = end_dt.format("%Y-%m-%dT%H:%M:%S%:z").to_string();

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events\
         ?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime",
        urlencoding::encode(&calendar_id),
        urlencoding::encode(&start_str),
        urlencoding::encode(&end_str)
    );

    let resp = client
        .get(&events_url)
        .bearer_auth(&tokens.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch events: {}", e))?;

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Calendar API error: {} - {}", status, body));
    }

    let json: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse events response: {}", e))?;

    let events = parse_calendar_events(json)?;

    serde_json::to_value(&events).map_err(|e| format!("JSON error: {}", e))
}

/// Creates a new event in Google Calendar.
#[tauri::command]
pub async fn cmd_google_calendar_create_event(
    calendar_id: String,
    event_json: Value,
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

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events",
        urlencoding::encode(&calendar_id)
    );

    client
        .post(&events_url)
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
    calendar_id: String,
    event_id: String,
) -> Result<(), String> {
    let tokens_json = crate::bridge::cmd_load_oauth_tokens("google_calendar".to_string())?;
    let tokens: StoredTokens = serde_json::from_str(&tokens_json.unwrap_or_default())
        .map_err(|e| format!("Invalid tokens format: {}", e))?;

    let client = Client::new();

    let events_url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events/{}",
        urlencoding::encode(&calendar_id), urlencoding::encode(&event_id)
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

    let status = resp.status();
    let body = resp.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        return Err(format!("Calendar API error: {} - {}", status, body));
    }

    let json: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse calendar list: {}", e))?;

    Ok(json)
}

/// Gets selected calendars for display.
#[tauri::command]
pub fn cmd_google_calendar_get_selected_calendars(
    db: State<'_, crate::bridge::DbState>,
) -> Result<Value, String> {
    const CONFIG_KEY: &str = "google_calendar:selected_calendars";

    let db_guard = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;

    match db_guard.kv_get(CONFIG_KEY).map_err(|e| e.to_string())? {
        None => Ok(json!({
            "calendar_ids": ["primary"],
            "is_default": true
        })),
        Some(json_str) => {
            let calendar_ids: Vec<String> = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse selected calendars: {e}"))?;

            if calendar_ids.is_empty() {
                Ok(json!({
                    "calendar_ids": ["primary"],
                    "is_default": true
                }))
            } else {
                Ok(json!({
                    "calendar_ids": calendar_ids,
                    "is_default": false
                }))
            }
        }
    }
}

/// Sets selected calendars for display.
#[tauri::command]
pub fn cmd_google_calendar_set_selected_calendars(
    db: State<'_, crate::bridge::DbState>,
    calendars: Value,
) -> Result<(), String> {
    const CONFIG_KEY: &str = "google_calendar:selected_calendars";

    let calendar_ids: Vec<String> = serde_json::from_value(calendars)
        .map_err(|e| format!("Invalid calendars payload: {e}"))?;

    if calendar_ids.is_empty() {
        return Err("At least one calendar must be selected".to_string());
    }

    let calendar_ids = calendar_ids
        .into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();

    if calendar_ids.is_empty() {
        return Err("At least one valid calendar must be selected".to_string());
    }

    let payload = serde_json::to_string(&calendar_ids)
        .map_err(|e| format!("Failed to serialize selected calendars: {e}"))?;

    let db_guard = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db_guard.kv_set(CONFIG_KEY, &payload).map_err(|e| e.to_string())?;

    Ok(())
}

// ── OAuth Helper Functions ─────────────────────────────────────────────

/// Validate OAuth configuration.
fn validate_oauth_config(config: &GoogleCalendarOAuthConfig) -> Result<(), String> {
    if config.client_id.trim().is_empty() || config.client_id == "YOUR_CLIENT_ID" {
        return Err("Google OAuth client_id is not configured. Set GOOGLE_CLIENT_ID.".to_string());
    }

    if config.client_secret.trim().is_empty() || config.client_secret == "YOUR_CLIENT_SECRET" {
        return Err("Google OAuth client_secret is not configured. Set GOOGLE_CLIENT_SECRET.".to_string());
    }

    Ok(())
}

/// Exchange authorization code for access tokens with Google.
async fn exchange_code_for_tokens(
    config: &GoogleCalendarOAuthConfig,
    code: &str,
) -> Result<TokenResponse, String> {
    let client = Client::new();
    let params = [
        ("client_id", config.client_id()),
        ("client_secret", config.client_secret()),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", config.redirect_uri()),
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
                    "Google Calendar authentication succeeded.",
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
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|e| format!("Failed to generate random state: {e}"))?;
    Ok(BASE64_URL_SAFE_NO_PAD.encode(&bytes))
}

// ── Other Helper Functions ──────────────────────────────────────────────────

/// Parse an ISO 8601 datetime string.
fn parse_datetime(s: &str) -> Result<DateTime<Utc>, String> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
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
    let items = match events_json
        .get("items")
        .and_then(|v| v.as_array()) {
            Some(items) => items,
            None => return Ok(Vec::new()),
        };

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

        let start_time = parse_google_datetime(start_str, "start_time")?;
        let end_time = parse_google_datetime(end_str, "end_time")?;

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

fn parse_google_datetime(s: &str, field_name: &str) -> Result<DateTime<Utc>, String> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&Utc));
    }

    let date = NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|e| format!("invalid {}: {}", field_name, e))?;
    let dt = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| format!("invalid {}: {}", field_name, s))?;
    Ok(dt.and_utc())
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
    fn calendar_scope_includes_calendar_readonly_for_calendar_list() {
        assert!(CALENDAR_SCOPE.contains("https://www.googleapis.com/auth/calendar.readonly"));
    }

    #[test]
    fn parse_calendar_events_supports_all_day_date_values() {
        let json = json!({
            "items": [{
                "id": "evt1",
                "summary": "All day",
                "start": { "date": "2026-02-10" },
                "end": { "date": "2026-02-11" }
            }]
        });

        let events = parse_calendar_events(json).expect("should parse all-day event");
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn parse_calendar_events_allows_missing_items_array() {
        let json = json!({});
        let events = parse_calendar_events(json).expect("missing items should be treated as empty");
        assert!(events.is_empty());
    }
}
