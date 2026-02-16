use crate::integrations::keyring_store;
use crate::integrations::traits::Integration;
use crate::storage::database::SessionRecord;

use reqwest::Client;
use serde_json::json;

const NOTION_VERSION: &str = "2022-06-28";

pub struct NotionIntegration {
    api_token: String,
    database_id: String,
}

impl Default for NotionIntegration {
    fn default() -> Self {
        Self {
            api_token: String::new(),
            database_id: String::new(),
        }
    }
}

/// A database entry fetched from Notion.
#[derive(Debug, Clone)]
pub struct NotionEntry {
    pub title: String,
    pub entry_type: String,
    pub date: String,
    pub duration: u64,
}

impl NotionIntegration {
    /// Load stored credentials from the OS keyring (empty strings if absent).
    pub fn new() -> Self {
        let api_token = keyring_store::get("notion_token")
            .ok()
            .flatten()
            .unwrap_or_default();
        let database_id = keyring_store::get("notion_database_id")
            .ok()
            .flatten()
            .unwrap_or_default();
        Self {
            api_token,
            database_id,
        }
    }

    /// Persist user-provided credentials to the OS keyring and update in-memory state.
    pub fn set_credentials(
        &mut self,
        token: &str,
        database_id: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::set("notion_token", token)?;
        keyring_store::set("notion_database_id", database_id)?;
        self.api_token = token.to_string();
        self.database_id = database_id.to_string();
        Ok(())
    }

    /// Verify the stored token is valid by hitting the Notion users/me endpoint.
    fn verify_token(client: &Client, token: &str) -> Result<(), Box<dyn std::error::Error>> {
        let resp = tokio::runtime::Handle::current().block_on(
            client
                .get("https://api.notion.com/v1/users/me")
                .header("Authorization", format!("Bearer {token}"))
                .header("Notion-Version", NOTION_VERSION)
                .send(),
        )?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("Notion auth check failed: HTTP {}", resp.status()).into())
        }
    }

    /// Fetch recent entries from the configured Notion database.
    /// Returns a list of database pages with their title, type, and date.
    pub fn fetch_database_entries(&self) -> Result<Vec<NotionEntry>, Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("Notion is not authenticated".into());
        }

        let client = Client::new();

        // Query the database for recent entries
        let body = json!({
            "sorts": [{ "timestamp": "created_time", "direction": "descending" }]
        });

        let url = format!("https://api.notion.com/v1/databases/{}/query", self.database_id);

        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_token))
                .header("Notion-Version", NOTION_VERSION)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
        )?;

        if !resp.status().is_success() {
            return Err(format!("Notion API error: HTTP {}", resp.status()).into());
        }

        let data: serde_json::Value = tokio::runtime::Handle::current().block_on(resp.json())?;

        let results = data["results"]
            .as_array()
            .ok_or("missing results in response")?;

        let mut entries = Vec::new();
        for result in results {
            // Extract title from Name property (title type)
            let title = result["properties"]["Name"]["title"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|obj| obj["text"]["content"].as_str())
                .unwrap_or("(Untitled)")
                .to_string();

            // Extract type from Type property (select type)
            let entry_type = result["properties"]["Type"]["select"]
                .as_object()
                .and_then(|obj| obj.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();

            // Extract date from Date property
            let date_str = result["properties"]["Date"]["date"]
                .as_object()
                .and_then(|obj| obj.get("start"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            // Extract duration from Duration property
            let duration = result["properties"]["Duration"]["number"]
                .as_u64()
                .unwrap_or(0);

            entries.push(NotionEntry {
                title,
                entry_type,
                date: date_str,
                duration,
            });
        }

        Ok(entries)
    }
}

impl Integration for NotionIntegration {
    fn name(&self) -> &str {
        "notion"
    }

    fn display_name(&self) -> &str {
        "Notion"
    }

    fn is_authenticated(&self) -> bool {
        !self.api_token.is_empty() && !self.database_id.is_empty()
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.api_token.is_empty() {
            return Err("No Notion token stored. Call set_credentials first.".into());
        }

        let client = Client::new();
        Self::verify_token(&client, &self.api_token)?;
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::delete("notion_token")?;
        keyring_store::delete("notion_database_id")?;
        self.api_token.clear();
        self.database_id.clear();
        Ok(())
    }

    fn on_focus_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Notion integration is write-on-complete only; no-op on start.
        Ok(())
    }

    fn on_session_complete(
        &self,
        session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("Notion integration is not authenticated.".into());
        }

        let body = json!({
            "parent": { "database_id": self.database_id },
            "properties": {
                "Name": {
                    "title": [{
                        "text": { "content": session.step_label }
                    }]
                },
                "Type": {
                    "select": { "name": session.step_type }
                },
                "Duration": {
                    "number": session.duration_min
                },
                "Date": {
                    "date": { "start": session.completed_at.to_rfc3339() }
                }
            }
        });

        let client = Client::new();
        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://api.notion.com/v1/pages")
                .header("Authorization", format!("Bearer {}", self.api_token))
                .header("Notion-Version", NOTION_VERSION)
                .header("Content-Type", "application/json")
                .json(&body)
                .send(),
        )?;

        if resp.status().is_success() {
            Ok(())
        } else {
            let status = resp.status();
            let text = tokio::runtime::Handle::current()
                .block_on(resp.text())
                .unwrap_or_default();
            Err(format!("Notion API error (HTTP {status}): {text}").into())
        }
    }
}
