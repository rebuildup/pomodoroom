//! Lightweight OAuth2 Authorization Code flow for desktop apps.
//!
//! 1. Opens browser to authorization URL
//! 2. Starts a tiny localhost HTTP server to receive the callback
//! 3. Exchanges the code for an access token (+ refresh token)
//! 4. Stores tokens in OS keyring

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;

use super::keyring_store;

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

    pub fn auth_url_full(&self) -> String {
        let scopes = self.scopes.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            self.auth_url,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri()),
            urlencoding::encode(&scopes),
        )
    }
}

/// Run the full OAuth2 flow: open browser -> listen for callback -> exchange code.
pub async fn authorize(config: &OAuthConfig) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
    // Open browser
    let auth_url = config.auth_url_full();
    open::that(&auth_url)?;

    // Listen for callback
    let listener = TcpListener::bind(format!("127.0.0.1:{}", config.redirect_port))?;
    listener.set_nonblocking(false)?;

    let (mut stream, _) = listener.accept()?;
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf)?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract code from GET /callback?code=XXX&...
    let code = extract_code(&request).ok_or("no code in callback")?;

    // Send success response to browser
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h2>Authentication successful!</h2><p>You can close this tab.</p><script>window.close()</script></body></html>";
    stream.write_all(response.as_bytes())?;
    drop(stream);
    drop(listener);

    // Exchange code for tokens
    let tokens = exchange_code(config, &code).await?;

    // Store in keyring
    let tokens_json = serde_json::to_string(&tokens)?;
    keyring_store::set(&config.service_name, &tokens_json)?;

    Ok(tokens)
}

/// Exchange authorization code for tokens.
async fn exchange_code(
    config: &OAuthConfig,
    code: &str,
) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
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
        .await?;

    let body: serde_json::Value = resp.json().await?;

    if let Some(error) = body.get("error") {
        return Err(format!("OAuth error: {}", error).into());
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
        token_type: body["token_type"]
            .as_str()
            .unwrap_or("Bearer")
            .to_string(),
        scope: body.get("scope").and_then(|v| v.as_str()).map(String::from),
    })
}

/// Refresh an access token using a refresh token.
pub async fn refresh_token(
    config: &OAuthConfig,
    refresh: &str,
) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
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
        .await?;

    let body: serde_json::Value = resp.json().await?;

    if let Some(error) = body.get("error") {
        return Err(format!("OAuth refresh error: {}", error).into());
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
        token_type: body["token_type"]
            .as_str()
            .unwrap_or("Bearer")
            .to_string(),
        scope: body.get("scope").and_then(|v| v.as_str()).map(String::from),
    };

    let tokens_json = serde_json::to_string(&tokens)?;
    keyring_store::set(&config.service_name, &tokens_json)?;

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
