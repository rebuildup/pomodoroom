//! Slack integration -- set user status + DND during focus sessions.

use crate::integrations::keyring_store;
use crate::integrations::traits::Integration;
use crate::storage::database::SessionRecord;

use chrono::Utc;
use reqwest::Client;
use serde_json::json;

pub struct SlackIntegration {
    token: String,
}

impl Default for SlackIntegration {
    fn default() -> Self {
        Self {
            token: String::new(),
        }
    }
}

impl SlackIntegration {
    /// Load stored token from the OS keyring (empty string if absent).
    pub fn new() -> Self {
        let token = keyring_store::get("slack_token")
            .ok()
            .flatten()
            .unwrap_or_default();
        Self { token }
    }

    /// Persist user-provided token to the OS keyring and update in-memory state.
    pub fn set_credentials(&mut self, token: &str) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::set("slack_token", token)?;
        self.token = token.to_string();
        Ok(())
    }

    /// Set the Slack user profile status.
    fn set_status(
        &self,
        text: &str,
        emoji: &str,
        expiration: i64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let client = Client::new();
        let body = json!({
            "profile": {
                "status_text": text,
                "status_emoji": emoji,
                "status_expiration": expiration,
            }
        });

        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://slack.com/api/users.profile.set")
                .header("Authorization", format!("Bearer {}", self.token))
                .header("Content-Type", "application/json")
                .json(&body)
                .send(),
        )?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(format!("Slack profile.set error: HTTP {status}").into());
        }
        Ok(())
    }

    /// Enable DND for the given number of minutes.
    fn set_snooze(&self, num_minutes: u64) -> Result<(), Box<dyn std::error::Error>> {
        let client = Client::new();
        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://slack.com/api/dnd.setSnooze")
                .header("Authorization", format!("Bearer {}", self.token))
                .form(&[("num_minutes", num_minutes.to_string())])
                .send(),
        )?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(format!("Slack dnd.setSnooze error: HTTP {status}").into());
        }
        Ok(())
    }

    /// End DND snooze.
    fn end_snooze(&self) -> Result<(), Box<dyn std::error::Error>> {
        let client = Client::new();
        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://slack.com/api/dnd.endSnooze")
                .header("Authorization", format!("Bearer {}", self.token))
                .send(),
        )?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(format!("Slack dnd.endSnooze error: HTTP {status}").into());
        }
        Ok(())
    }
}

impl Integration for SlackIntegration {
    fn name(&self) -> &str {
        "slack"
    }

    fn display_name(&self) -> &str {
        "Slack"
    }

    fn is_authenticated(&self) -> bool {
        !self.token.is_empty()
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.token.is_empty() {
            return Err("No Slack token stored. Call set_credentials first.".into());
        }

        let client = Client::new();
        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://slack.com/api/auth.test")
                .header("Authorization", format!("Bearer {}", self.token))
                .send(),
        )?;

        if !resp.status().is_success() {
            return Err(format!("Slack auth check failed: HTTP {}", resp.status()).into());
        }

        let body: serde_json::Value =
            tokio::runtime::Handle::current().block_on(resp.json())?;

        if body.get("ok").and_then(|v| v.as_bool()) != Some(true) {
            let err = body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error");
            return Err(format!("Slack auth.test failed: {err}").into());
        }

        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::delete("slack_token")?;
        self.token.clear();
        Ok(())
    }

    fn on_focus_start(
        &self,
        step_label: &str,
        duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("Slack integration is not authenticated.".into());
        }

        let expiration = Utc::now().timestamp() + (duration_min as i64 * 60);
        self.set_status(
            &format!("Focusing: {step_label}"),
            ":tomato:",
            expiration,
        )?;
        self.set_snooze(duration_min)?;
        Ok(())
    }

    fn on_break_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("Slack integration is not authenticated.".into());
        }

        // Try to end snooze, but don't fail if it doesn't exist
        let _ = self.end_snooze().map_err(|e| {
            eprintln!("Warning: failed to end Slack snooze: {e}");
        });
        self.set_status("On Break", ":coffee:", 0)?;
        Ok(())
    }

    fn on_session_complete(
        &self,
        _session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("Slack integration is not authenticated.".into());
        }

        // Try to end snooze, but don't fail if it doesn't exist
        let _ = self.end_snooze().map_err(|e| {
            eprintln!("Warning: failed to end Slack snooze: {e}");
        });
        // Clear status completely
        self.set_status("", "", 0)?;
        Ok(())
    }
}
