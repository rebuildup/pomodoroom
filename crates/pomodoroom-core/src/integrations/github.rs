//! GitHub integration -- set user status during focus sessions.

use crate::integrations::keyring_store;
use crate::integrations::traits::Integration;
use crate::storage::database::SessionRecord;

use reqwest::Client;
use serde_json::json;

const USER_AGENT: &str = "pomodoroom";

pub struct GitHubIntegration {
    token: String,
}

impl Default for GitHubIntegration {
    fn default() -> Self {
        Self {
            token: String::new(),
        }
    }
}

/// An issue or pull request fetched from GitHub.
#[derive(Debug, Clone)]
pub struct GitHubItem {
    pub number: i64,
    pub title: String,
    pub item_type: &'static str,
    pub state: String,
    pub url: String,
    pub repository: String,
}

impl GitHubIntegration {
    /// Load stored token from the OS keyring (empty string if absent).
    pub fn new() -> Self {
        let token = keyring_store::get("github_token")
            .ok()
            .flatten()
            .unwrap_or_default();
        Self { token }
    }

    /// Persist user-provided token to the OS keyring and update in-memory state.
    pub fn set_credentials(&mut self, token: &str) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::set("github_token", token)?;
        self.token = token.to_string();
        Ok(())
    }

    /// Fetch assigned issues and pull requests.
    /// Returns a list of items with their number, title, state, and URL.
    pub fn fetch_assigned_items(&self) -> Result<Vec<GitHubItem>, Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("GitHub is not authenticated".into());
        }

        let client = Client::new();

        // Fetch assigned issues
        let issues_url = "https://api.github.com/issues?filter=assigned&state=open&per_page=50";
        let issues_resp = tokio::runtime::Handle::current().block_on(
            client
                .get(issues_url)
                .header("Authorization", format!("Bearer {}", self.token))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/vnd.github.v3+json")
                .send()
        )?;

        if !issues_resp.status().is_success() {
            return Err(format!("GitHub API error: HTTP {}", issues_resp.status()).into());
        }

        let issues_data: serde_json::Value = tokio::runtime::Handle::current().block_on(issues_resp.json())?;

        let mut items = Vec::new();

        if let Some(issues_array) = issues_data.as_array() {
            for issue in issues_array {
                // Pull requests have a "pull_request" key
                let is_pr = issue.get("pull_request").is_some();

                let number = issue["number"]
                    .as_u64()
                    .unwrap_or(0) as i64;

                let title = issue["title"]
                    .as_str()
                    .unwrap_or("(No title)")
                    .to_string();

                let state = issue["state"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string();

                let html_url = issue["html_url"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();

                let repository = issue["repository_url"]
                    .as_str()
                    .and_then(|url| url.split('/').last())
                    .unwrap_or("unknown")
                    .to_string();

                items.push(GitHubItem {
                    number,
                    title,
                    item_type: if is_pr { "Pull Request" } else { "Issue" },
                    state,
                    url: html_url,
                    repository,
                });
            }
        }

        Ok(items)
    }

    /// Set or clear the authenticated user's GitHub status via GraphQL.
    fn set_status(
        &self,
        emoji: Option<&str>,
        message: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if !self.is_authenticated() {
            return Err("GitHub integration is not authenticated.".into());
        }

        let client = Client::new();

        let query = match (emoji, message) {
            (Some(e), Some(m)) => {
                format!(
                    r#"mutation {{ changeUserStatus(input: {{ emoji: "{e}", message: "{m}" }}) {{ status {{ message }} }} }}"#,
                )
            }
            _ => {
                // Clear status
                "mutation { changeUserStatus(input: {}) { status { message } } }".to_string()
            }
        };

        let body = json!({ "query": query });

        let resp = tokio::runtime::Handle::current().block_on(
            client
                .post("https://api.github.com/graphql")
                .header("Authorization", format!("Bearer {}", self.token))
                .header("User-Agent", USER_AGENT)
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
            Err(format!("GitHub GraphQL error (HTTP {status}): {text}").into())
        }
    }
}

impl Integration for GitHubIntegration {
    fn name(&self) -> &str {
        "github"
    }

    fn display_name(&self) -> &str {
        "GitHub"
    }

    fn is_authenticated(&self) -> bool {
        !self.token.is_empty()
    }

    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.token.is_empty() {
            return Err("No GitHub token stored. Call set_credentials first.".into());
        }

        let client = Client::new();
        let resp = tokio::runtime::Handle::current().block_on(
            client
                .get("https://api.github.com/user")
                .header("Authorization", format!("Bearer {}", self.token))
                .header("User-Agent", USER_AGENT)
                .send(),
        )?;

        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("GitHub auth check failed: HTTP {}", resp.status()).into())
        }
    }

    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        keyring_store::delete("github_token")?;
        self.token.clear();
        Ok(())
    }

    fn on_focus_start(
        &self,
        step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.set_status(Some(":tomato:"), Some(&format!("Focusing: {step_label}")))
    }

    fn on_break_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.set_status(Some(":coffee:"), Some("On Break"))
    }

    fn on_session_complete(
        &self,
        _session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        self.set_status(None, None)
    }
}
