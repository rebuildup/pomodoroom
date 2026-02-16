//! Linear integration -- time tracking via the Linear GraphQL API.

use crate::integrations::keyring_store;
use crate::integrations::traits::Integration;
use crate::storage::database::SessionRecord;

use reqwest::Client;
use serde_json::json;

pub struct LinearIntegration {
    api_key: String,
}

impl Default for LinearIntegration {
    fn default() -> Self {
        Self {
            api_key: String::new(),
        }
    }
}

/// An issue fetched from Linear.
#[derive(Debug, Clone)]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub state: String,
    pub priority: i64,
    pub url: String,
}

impl LinearIntegration {
    /// Load stored API key from the OS keyring (empty string if absent).
    pub fn new() -> Self {
        let api_key = keyring_store::get("linear_api_key")
            .ok()
            .flatten()
            .unwrap_or_default();
        Self { api_key }
    }

    /// Persist user-provided API key to the OS keyring and update in-memory state.
    pub fn set_credentials(&mut self, api_key: &str) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::set("linear_api_key", api_key)?;
        self.api_key = api_key.to_string();
        Ok(())
    }

    /// Fetch assigned issues from Linear.
    /// Returns a list of issues with their identifier, title, status, and priority.
    pub fn fetch_assigned_issues(&self) -> Result<Vec<LinearIssue>, Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("Linear is not authenticated".into());
        }

        let client = Client::new();
        let query = r#"
            query {
                viewer {
                    assignedIssues(first: 50) {
                        nodes {
                            id
                            identifier
                            title
                            state { name color }
                            priority
                            url
                        }
                    }
                }
            }
        "#;

        let body = json!({ "query": query });

        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://api.linear.app/graphql")
                .header("Authorization", &self.api_key)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
        )?;

        if !resp.status().is_success() {
            return Err(format!("Linear API error: HTTP {}", resp.status()).into());
        }

        let data: serde_json::Value = tokio::runtime::Handle::current().block_on(resp.json())?;

        if let Some(err) = data.get("errors") {
            return Err(format!("Linear GraphQL error: {err}").into());
        }

        let nodes = data["data"]["viewer"]["assignedIssues"]["nodes"]
            .as_array()
            .ok_or("missing nodes in response")?;

        let mut issues = Vec::new();
        for node in nodes {
            let id = node["id"]
                .as_str()
                .unwrap_or("")
                .to_string();

            let identifier = node["identifier"]
                .as_str()
                .unwrap_or("UNKNOWN")
                .to_string();

            let title = node["title"]
                .as_str()
                .unwrap_or("(No title)")
                .to_string();

            let state_name = node["state"]["name"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string();

            let priority = node["priority"]
                .as_u64()
                .unwrap_or(0) as i64;

            let url = node["url"]
                .as_str()
                .unwrap_or("")
                .to_string();

            issues.push(LinearIssue {
                id,
                identifier,
                title,
                state: state_name,
                priority,
                url,
            });
        }

        Ok(issues)
    }
}

impl Integration for LinearIntegration {
    fn name(&self) -> &str {
        "linear"
    }

    fn display_name(&self) -> &str {
        "Linear"
    }

    fn is_authenticated(&self) -> bool {
        !self.api_key.is_empty()
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.api_key.is_empty() {
            return Err("No Linear API key stored. Call set_credentials first.".into());
        }

        let client = Client::new();
        let body = json!({ "query": "{ viewer { id name } }" });

        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://api.linear.app/graphql")
                .header("Authorization", &self.api_key)
                .header("Content-Type", "application/json")
                .json(&body)
                .send(),
        )?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("Linear auth check failed: HTTP {}", resp.status()).into())
        }
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::delete("linear_api_key")?;
        keyring_store::delete("linear_tracking_issue")?;
        self.api_key.clear();
        Ok(())
    }

    fn on_focus_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Ok(());
        }

        // Check if a tracking issue is configured
        let issue_id = keyring_store::get("linear_tracking_issue")?.unwrap_or_default();
        if issue_id.is_empty() {
            // No issue set -- nothing to track
            return Ok(());
        }

        // Store a marker that tracking has started (timestamp or flag).
        // Actual GraphQL time-tracking mutations will be added when Linear
        // exposes a public time-tracking API.
        keyring_store::set("linear_tracking_active", "1")?;
        Ok(())
    }

    fn on_session_complete(
        &self,
        _session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Clear tracking state - ignore error if key doesn't exist
        let _ = keyring_store::delete("linear_tracking_active").map_err(|e| {
            // Log the error but don't fail the entire operation
            eprintln!("Warning: failed to clear linear_tracking_active: {e}");
        });
        Ok(())
    }
}
