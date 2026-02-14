//! Google Calendar + Tasks integration.
//!
//! Creates a Calendar event when a focus session starts, scoped to the
//! session duration. Uses OAuth2 with the Google Calendar & Tasks APIs.

use std::sync::Mutex;

use chrono::{Duration, Utc};
use reqwest::Client;
use serde_json::json;

use super::keyring_store;
use super::oauth::{self, OAuthConfig, OAuthTokens};
use super::traits::Integration;
use crate::storage::database::SessionRecord;

/// Google Calendar + Tasks integration.
pub struct GoogleIntegration {
    client_id: String,
    client_secret: String,
    /// ID of the calendar event created for the current focus session.
    current_event_id: Mutex<Option<String>>,
}

impl Default for GoogleIntegration {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: String::new(),
            current_event_id: Mutex::new(None),
        }
    }
}

impl GoogleIntegration {
    /// Load credentials from keyring. Returns empty strings if not stored yet.
    pub fn new() -> Self {
        let client_id = keyring_store::get("google_client_id")
            .ok()
            .flatten()
            .unwrap_or_default();
        let client_secret = keyring_store::get("google_client_secret")
            .ok()
            .flatten()
            .unwrap_or_default();

        Self {
            client_id,
            client_secret,
            current_event_id: Mutex::new(None),
        }
    }

    /// Persist Google OAuth client credentials to the OS keyring.
    pub fn set_credentials(
        client_id: &str,
        client_secret: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::set("google_client_id", client_id)?;
        keyring_store::set("google_client_secret", client_secret)?;
        Ok(())
    }

    fn oauth_config(&self) -> OAuthConfig {
        OAuthConfig {
            service_name: "google".to_string(),
            client_id: self.client_id.clone(),
            client_secret: self.client_secret.clone(),
            auth_url: "https://accounts.google.com/o/oauth2/v2/auth".to_string(),
            token_url: "https://oauth2.googleapis.com/token".to_string(),
            scopes: vec![
                "https://www.googleapis.com/auth/calendar.events".to_string(),
                "https://www.googleapis.com/auth/tasks".to_string(),
            ],
            redirect_port: 19821,
        }
    }

    /// Return a valid access token, refreshing if expired.
    fn access_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let tokens = oauth::load_tokens("google").ok_or("not authenticated with Google")?;

        if !oauth::is_expired(&tokens) {
            return Ok(tokens.access_token);
        }

        // Refresh
        let refresh = tokens
            .refresh_token
            .as_deref()
            .ok_or("no refresh token available")?;

        let config = self.oauth_config();
        let refreshed: OAuthTokens =
            tokio::runtime::Handle::current().block_on(oauth::refresh_token(&config, refresh))?;

        Ok(refreshed.access_token)
    }

    /// Create a Google Calendar event and return its ID.
    fn create_calendar_event(
        &self,
        summary: &str,
        duration_min: u64,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.access_token()?;
        let now = Utc::now();
        let end = now + Duration::minutes(duration_min as i64);

        let body = json!({
            "summary": summary,
            "start": {
                "dateTime": now.to_rfc3339(),
            },
            "end": {
                "dateTime": end.to_rfc3339(),
            },
        });

        let resp: serde_json::Value = tokio::runtime::Handle::current().block_on(async {
            Client::new()
                .post("https://www.googleapis.com/calendar/v3/calendars/primary/events")
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await?
                .json()
                .await
        })?;

        if let Some(err) = resp.get("error") {
            return Err(format!("Google Calendar API error: {err}").into());
        }

        let event_id = resp["id"]
            .as_str()
            .ok_or("missing event id in response")?
            .to_string();

        Ok(event_id)
    }
}

impl Integration for GoogleIntegration {
    fn name(&self) -> &str {
        "google"
    }

    fn display_name(&self) -> &str {
        "Google Calendar & Tasks"
    }

    fn is_authenticated(&self) -> bool {
        oauth::load_tokens("google").is_some()
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.client_id.is_empty() || self.client_secret.is_empty() {
            return Err(
                "Google client_id / client_secret not configured. Call set_credentials first."
                    .into(),
            );
        }

        let config = self.oauth_config();
        tokio::runtime::Handle::current().block_on(oauth::authorize(&config))?;
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::delete("google")?;
        if let Ok(mut guard) = self.current_event_id.lock() {
            *guard = None;
        }
        Ok(())
    }

    fn on_focus_start(
        &self,
        step_label: &str,
        duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let summary = format!("Pomodoroom: {step_label}");
        let event_id = self.create_calendar_event(&summary, duration_min)?;
        if let Ok(mut guard) = self.current_event_id.lock() {
            *guard = Some(event_id);
        }
        Ok(())
    }

    fn on_break_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Ok(()) // no-op
    }

    fn on_session_complete(
        &self,
        _session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Ok(()) // event was already created with the correct end time
    }
}
