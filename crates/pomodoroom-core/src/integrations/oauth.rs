//! Lightweight OAuth2 Authorization Code flow for desktop apps.
//!
//! 1. Opens browser to authorization URL with CSRF protection (state parameter)
//! 2. Starts a tiny localhost HTTP server to receive the callback
//! 3. Exchanges the code for an access token (+ refresh token)
//! 4. Stores tokens in OS keyring

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

use super::keyring_store;
use crate::error::{CoreError, OAuthError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>, // Unix timestamp
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OAuthConfig {
    pub service_name: String,
    pub client_id: String,
    pub client_secret: String,
    pub auth_url: String,
    pub token_url: String,
    pub scopes: Vec<String>,
    pub redirect_port: u16,
}

impl OAuthConfig {
    pub fn redirect_uri(&self) -> String {
        format!("http://localhost:{}/callback", self.redirect_port)
    }

    /// Generate a cryptographically random state parameter for CSRF protection.
    /// The state is a URL-safe base64 encoded random 32-byte value.
    fn generate_state() -> String {
        use base64::prelude::*;
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes).expect("Failed to generate random state");
        BASE64_URL_SAFE_NO_PAD.encode(&bytes)
    }

    /// Build the full authorization URL with state parameter for CSRF protection.
    /// Returns (url, state) tuple where state must be validated in the callback.
    pub fn auth_url_full_with_state(&self) -> (String, String) {
        let state = Self::generate_state();
        let scopes = self.scopes.join(" ");
        let url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
            self.auth_url,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri()),
            urlencoding::encode(&scopes),
            urlencoding::encode(&state),
        );
        (url, state)
    }

    /// Legacy method - generates URL with state for backward compatibility.
    /// Returns only the URL part for backward compatibility.
    /// Note: This method does NOT return the state, so it cannot be validated.
    /// Use auth_url_full_with_state() for proper CSRF protection.
    pub fn auth_url_full(&self) -> String {
        let (url, _) = self.auth_url_full_with_state();
        url
    }
}

/// Run the full OAuth2 flow with CSRF protection: open browser -> listen for callback -> validate state -> exchange code.
///
/// # Errors
/// Returns an error if:
/// - The browser cannot be opened
/// - The callback timeout is exceeded (5 minutes)
/// - The state parameter doesn't match (CSRF attack detected)
/// - The authorization code cannot be extracted from the callback
/// - The token exchange fails
pub async fn authorize(config: &OAuthConfig) -> Result<OAuthTokens> {
    // Generate auth URL with state parameter for CSRF protection
    let (auth_url, expected_state) = config.auth_url_full_with_state();

    open::that(&auth_url)
        .map_err(|e| OAuthError::AuthorizationFailed(format!("Failed to open browser: {e}")))?;

    // Listen for callback with timeout
    let listener = TcpListener::bind(format!("127.0.0.1:{}", config.redirect_port))
        .map_err(|e| OAuthError::AuthorizationFailed(format!("Failed to bind to port: {e}")))?;
    listener.set_nonblocking(true)?;

    // Wait for the callback with timeout
    let start_time = std::time::Instant::now();
    let timeout = Duration::from_secs(300);

    let (mut stream, _) = loop {
        if start_time.elapsed() > timeout {
            return Err(OAuthError::CallbackTimeout { timeout_secs: 300 }.into());
        }
        match listener.accept() {
            Ok(result) => break result,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => {
                return Err(OAuthError::AuthorizationFailed(format!(
                    "Failed to accept connection: {e}"
                ))
                .into())
            }
        }
    };

    listener.set_nonblocking(false)?;

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf)?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract state from callback for CSRF validation
    let state = extract_state(&request)
        .ok_or_else(|| OAuthError::InvalidCallback("no state in callback".to_string()))?;

    // Validate state to prevent CSRF attacks
    if state != expected_state {
        return Err(OAuthError::InvalidCallback(
            "state parameter mismatch - possible CSRF attack".to_string(),
        )
        .into());
    }

    // Extract code from GET /callback?code=XXX&...
    let code = extract_code(&request)
        .ok_or_else(|| OAuthError::InvalidCallback("no code in callback".to_string()))?;

    // Send success response to browser
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h2>Authentication successful!</h2><p>You can close this tab.</p><script>window.close()</script></body></html>";
    stream.write_all(response.as_bytes())?;
    drop(stream);
    drop(listener);

    // Exchange code for tokens
    let tokens = exchange_code(config, &code).await?;

    // Store in keyring
    let tokens_json = serde_json::to_string(&tokens)?;
    keyring_store::set(&config.service_name, &tokens_json)
        .map_err(|e| CoreError::Custom(format!("Failed to store tokens: {e}")))?;

    Ok(tokens)
}

/// Exchange authorization code for tokens.
async fn exchange_code(config: &OAuthConfig, code: &str) -> Result<OAuthTokens> {
    let client = Client::new();
    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &config.redirect_uri()),
    ];

    let resp = client
        .post(&config.token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| OAuthError::TokenExchangeFailed(format!("HTTP request failed: {e}")))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| OAuthError::TokenExchangeFailed(format!("Failed to parse response: {e}")))?;

    if let Some(error) = body.get("error") {
        return Err(OAuthError::TokenExchangeFailed(format!("OAuth error: {}", error)).into());
    }

    let expires_in = body.get("expires_in").and_then(|v| v.as_i64());
    let expires_at = expires_in.map(|ei| chrono::Utc::now().timestamp() + ei);

    Ok(OAuthTokens {
        access_token: body["access_token"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        refresh_token: body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(String::from),
        expires_at,
        token_type: body["token_type"].as_str().unwrap_or("Bearer").to_string(),
        scope: body.get("scope").and_then(|v| v.as_str()).map(String::from),
    })
}

/// Refresh an access token using a refresh token.
pub async fn refresh_token(config: &OAuthConfig, refresh: &str) -> Result<OAuthTokens> {
    let client = Client::new();
    let params = [
        ("client_id", config.client_id.as_str()),
        ("client_secret", config.client_secret.as_str()),
        ("refresh_token", refresh),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post(&config.token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| OAuthError::TokenRefreshFailed(format!("HTTP request failed: {e}")))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| OAuthError::TokenRefreshFailed(format!("Failed to parse response: {e}")))?;

    if let Some(error) = body.get("error") {
        return Err(OAuthError::TokenRefreshFailed(format!("OAuth error: {}", error)).into());
    }

    let expires_in = body.get("expires_in").and_then(|v| v.as_i64());
    let expires_at = expires_in.map(|ei| chrono::Utc::now().timestamp() + ei);

    let tokens = OAuthTokens {
        access_token: body["access_token"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        refresh_token: body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(String::from)
            .or_else(|| Some(refresh.to_string())),
        expires_at,
        token_type: body["token_type"].as_str().unwrap_or("Bearer").to_string(),
        scope: body.get("scope").and_then(|v| v.as_str()).map(String::from),
    };

    let tokens_json = serde_json::to_string(&tokens)?;
    keyring_store::set(&config.service_name, &tokens_json)
        .map_err(|e| CoreError::Custom(format!("Failed to store tokens: {e}")))?;

    Ok(tokens)
}

/// Load stored tokens from keyring.
pub fn load_tokens(service_name: &str) -> Option<OAuthTokens> {
    keyring_store::get(service_name)
        .ok()
        .flatten()
        .and_then(|json| serde_json::from_str(&json).ok())
}

/// Check if stored tokens are expired (with 60s buffer).
pub fn is_expired(tokens: &OAuthTokens) -> bool {
    match tokens.expires_at {
        Some(exp) => chrono::Utc::now().timestamp() > exp - 60,
        None => false,
    }
}

/// Extract state parameter from callback request for CSRF validation.
fn extract_state(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let url = url::Url::parse(&format!("http://localhost{path}")).ok()?;
    url.query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string())
}

/// Extract authorization code from callback request.
fn extract_code(request: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let url = url::Url::parse(&format!("http://localhost{path}")).ok()?;
    url.query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
}

// Simple urlencoding helper
mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::Serializer::new(String::new())
            .append_key_only(s)
            .finish()
    }
}
