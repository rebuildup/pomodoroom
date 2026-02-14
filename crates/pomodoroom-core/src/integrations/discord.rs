//! Discord integration -- post session notifications via webhook.

use crate::integrations::keyring_store;
use crate::integrations::traits::Integration;
use crate::storage::database::SessionRecord;

use reqwest::Client;
use serde_json::json;

pub struct DiscordIntegration {
    webhook_url: String,
}

impl Default for DiscordIntegration {
    fn default() -> Self {
        Self {
            webhook_url: String::new(),
        }
    }
}

impl DiscordIntegration {
    /// Load stored webhook URL from the OS keyring (empty string if absent).
    pub fn new() -> Self {
        let webhook_url = keyring_store::get("discord_webhook_url")
            .ok()
            .flatten()
            .unwrap_or_default();
        Self { webhook_url }
    }

    /// Persist user-provided webhook URL to the OS keyring and update in-memory state.
    pub fn set_credentials(&mut self, webhook_url: &str) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::set("discord_webhook_url", webhook_url)?;
        self.webhook_url = webhook_url.to_string();
        Ok(())
    }

    /// Post a message to the configured Discord webhook.
    fn post_message(&self, content: &str) -> Result<(), Box<dyn std::error::Error>> {
        if self.webhook_url.is_empty() {
            return Err("Discord webhook URL not configured.".into());
        }

        let client = Client::new();
        let body = json!({ "content": content });

        let resp = tokio::runtime::Handle::current()
            .block_on(client.post(&self.webhook_url).json(&body).send())?;

        if resp.status().is_success() || resp.status().as_u16() == 204 {
            Ok(())
        } else {
            let status = resp.status();
            let text = tokio::runtime::Handle::current()
                .block_on(resp.text())
                .unwrap_or_default();
            Err(format!("Discord webhook error (HTTP {status}): {text}").into())
        }
    }
}

impl Integration for DiscordIntegration {
    fn name(&self) -> &str {
        "discord"
    }

    fn display_name(&self) -> &str {
        "Discord"
    }

    fn is_authenticated(&self) -> bool {
        !self.webhook_url.is_empty()
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.webhook_url.is_empty() {
            return Err("No Discord webhook URL stored. Call set_credentials first.".into());
        }

        if !self
            .webhook_url
            .starts_with("https://discord.com/api/webhooks/")
        {
            return Err(
                "Invalid Discord webhook URL: must start with https://discord.com/api/webhooks/"
                    .into(),
            );
        }

        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::delete("discord_webhook_url")?;
        self.webhook_url.clear();
        Ok(())
    }

    fn on_focus_start(
        &self,
        step_label: &str,
        duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.post_message(&format!(
            "Started focus session: {step_label} ({duration_min}m)"
        ))
    }

    fn on_session_complete(
        &self,
        session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.post_message(&format!(
            "Completed {} session: {} ({}m)",
            session.step_type, session.step_label, session.duration_min
        ))
    }
}
