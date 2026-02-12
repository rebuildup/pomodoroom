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
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

// Google OAuth configuration
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3";

// OAuth scopes for Google Calendar
const CALENDAR_EVENTS_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_READONLY_SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";

// Default redirect port for OAuth callback
const OAUTH_REDIRECT_PORT: u16 = 19821;
const OAUTH_CONNECT_TIMEOUT_SECS: u64 = 180;

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

fn validate_oauth_config(config: &GoogleOAuthConfig) -> Result<(), String> {
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
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: String,
    scope: Option<String>,
}



/// Selected calendar IDs configuration stored in database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct SelectedCalendarsConfig {
    calendar_ids: Vec<String>,
    updated_at: i64,
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

#[tauri::command]
pub fn cmd_google_auth_connect(app: AppHandle) -> Result<Value, String> {
    let config = GoogleOAuthConfig::new();
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

fn parse_callback_query(query: &str) -> Result<HashMap<String, String>, String> {
    let parsed = url::form_urlencoded::parse(query.as_bytes())
        .into_owned()
        .collect::<HashMap<String, String>>();
    Ok(parsed)
}

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

/// List user's calendars from Google Calendar API.
///
/// Returns all calendars the user has access to, including
/// owned calendars and subscribed calendars.
///
/// # Returns
/// JSON array of calendar entries:
/// ```json
/// [
///   {
///     "id": "user@gmail.com",
///     "summary": "user@gmail.com",
///     "primary": true,
///     "selected": true,
///     "accessRole": "owner"
///   }
/// ]
/// ```
#[tauri::command]
pub fn cmd_google_calendar_list_calendars() -> Result<Value, String> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| format!("Failed to create runtime: {e}"))?;

    let calendars = rt.block_on(async {
        fetch_calendar_list().await
    })?;

    Ok(json!(calendars))
}

/// Fetch calendar list from Google Calendar API.
async fn fetch_calendar_list() -> Result<Vec<Value>, String> {
    use reqwest::Client;

    let access_token = get_access_token("google_calendar").await?;

    let url = format!("{}/users/me/calendarList", GOOGLE_CALENDAR_API_BASE);

    let client = Client::new();
    let resp = client
        .get(&url)
        .query(&[("minAccessRole", "freeBusyReader")])
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

    let calendars = json_body["items"]
        .as_array()
        .map(|arr| arr.clone())
        .unwrap_or_default();

    Ok(calendars)
}

/// Get selected calendar IDs from database.
///
/// Returns the list of calendar IDs that the user has selected
/// for event synchronization. If no selection exists, returns
/// the primary calendar ID.
#[tauri::command]
pub fn cmd_google_calendar_get_selected_calendars(
    db: tauri::State<'_, crate::bridge::DbState>,
) -> Result<Value, String> {
    const CONFIG_KEY: &str = "google_calendar:selected_calendars";

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;

    match db.kv_get(CONFIG_KEY).map_err(|e| e.to_string())? {
        None => {
            // No selection saved, return default (primary only)
            Ok(json!({
                "calendar_ids": ["primary"],
                "is_default": true
            }))
        }
        Some(json_str) => {
            let config: SelectedCalendarsConfig = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse config: {e}"))?;

            Ok(json!({
                "calendar_ids": config.calendar_ids,
                "is_default": false
            }))
        }
    }
}

/// Set selected calendar IDs in database.
///
/// Saves the user's calendar selection for event synchronization.
///
/// # Arguments
/// * `calendar_ids` - List of calendar IDs to sync events from
#[tauri::command]
pub fn cmd_google_calendar_set_selected_calendars(
    db: tauri::State<'_, crate::bridge::DbState>,
    calendar_ids: Vec<String>,
) -> Result<(), String> {
    if calendar_ids.is_empty() {
        return Err("At least one calendar must be selected".to_string());
    }

    const CONFIG_KEY: &str = "google_calendar:selected_calendars";

    let config = SelectedCalendarsConfig {
        calendar_ids: calendar_ids.clone(),
        updated_at: Utc::now().timestamp(),
    };

    let config_json = serde_json::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    let db = db.0.lock().map_err(|e| format!("Lock error: {e}"))?;
    db.kv_set(CONFIG_KEY, &config_json).map_err(|e| e.to_string())?;

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

    #[test]
    fn test_parse_callback_query_extracts_code_and_state() {
        let query = "code=abc123&state=xyz987&scope=email";
        let parsed = parse_callback_query(query).expect("query should parse");
        assert_eq!(parsed.get("code"), Some(&"abc123".to_string()));
        assert_eq!(parsed.get("state"), Some(&"xyz987".to_string()));
        assert_eq!(parsed.get("scope"), Some(&"email".to_string()));
    }

    #[test]
    fn test_validate_oauth_config_rejects_placeholder_credentials() {
        let cfg = GoogleOAuthConfig {
            client_id: "YOUR_CLIENT_ID".to_string(),
            client_secret: "YOUR_CLIENT_SECRET".to_string(),
            redirect_uri: "http://localhost:19821/callback".to_string(),
        };

        let result = validate_oauth_config(&cfg);
        assert!(result.is_err());
    }
}
