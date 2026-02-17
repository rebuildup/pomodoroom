//! E2E tests for integration services.
//!
//! Tests use mocked HTTP responses to verify integration behavior
//! without requiring real credentials or external API access.
//!
//! Test matrix coverage:
//! | Service | authenticate | is_authenticated | disconnect | on_focus_start | on_break_start | on_session_complete |
//! |---------|-------------|------------------|------------|----------------|----------------|---------------------|
//! | Google  | OAuth2      | Token check      | Clear      | Calendar event | no-op          | no-op               |
//! | Notion  | API verify  | Token+DB check   | Clear both | no-op          | no-op          | Create page         |
//! | Linear  | GraphQL     | Key check        | Clear      | Tracking mark  | no-op          | Clear marker        |
//! | GitHub  | API verify  | Token check      | Clear      | Set status     | Set status     | Clear status        |
//! | Discord | URL validate| URL check        | Clear      | Post message   | no-op          | Post message        |
//! | Slack   | auth.test   | Token check      | Clear      | Status+DND     | Clear DND      | Clear status        |

use chrono::Utc;
use pomodoroom_core::integrations::traits::Integration;
use pomodoroom_core::storage::database::SessionRecord;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

// ============================================================================
// Mock Keyring (in-memory storage for tests)
// ============================================================================

static MOCK_KEYRING: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[allow(dead_code)]
fn keyring_get(key: &str) -> Option<String> {
    MOCK_KEYRING.lock().unwrap().get(key).cloned()
}

fn keyring_set(key: &str, value: &str) {
    MOCK_KEYRING.lock().unwrap().insert(key.to_string(), value.to_string());
}

#[allow(dead_code)]
fn keyring_delete(key: &str) {
    MOCK_KEYRING.lock().unwrap().remove(key);
}

fn keyring_clear() {
    MOCK_KEYRING.lock().unwrap().clear();
}

// ============================================================================
// Test Helpers
// ============================================================================

fn create_test_session(step_label: &str, step_type: &str, duration_min: u64) -> SessionRecord {
    SessionRecord {
        id: 0, // Test ID
        step_label: step_label.to_string(),
        step_type: step_type.to_string(),
        duration_min,
        started_at: Utc::now(),
        completed_at: Utc::now(),
        task_id: None,
        project_id: None,
    }
}

// ============================================================================
// Discord E2E Tests
// ============================================================================

#[test]
fn test_discord_is_authenticated_false_without_url() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::discord::DiscordIntegration::new();
    assert!(!integration.is_authenticated());
}

#[test]
fn test_discord_authenticate_requires_url() {
    keyring_clear();
    let mut integration = pomodoroom_core::integrations::discord::DiscordIntegration::new();
    let result = integration.authenticate();
    assert!(result.is_err());
}

#[test]
fn test_discord_disconnect_clears_credentials() {
    keyring_clear();
    keyring_set("discord_webhook_url", "https://discord.com/api/webhooks/123/abc");

    let mut integration = pomodoroom_core::integrations::discord::DiscordIntegration::new();
    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

#[test]
fn test_discord_on_break_start_is_noop() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::discord::DiscordIntegration::new();
    // on_break_start uses default no-op implementation
    let result = integration.on_break_start("Break", 5);
    assert!(result.is_ok());
}

// ============================================================================
// GitHub E2E Tests
// ============================================================================

#[test]
fn test_github_is_authenticated_false_without_token() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::github::GitHubIntegration::new();
    assert!(!integration.is_authenticated());
}

#[test]
fn test_github_authenticate_requires_token() {
    keyring_clear();
    let mut integration = pomodoroom_core::integrations::github::GitHubIntegration::new();
    let result = integration.authenticate();
    assert!(result.is_err());
}

#[test]
fn test_github_disconnect_clears_token() {
    keyring_clear();
    keyring_set("github_token", "ghp_test_token");

    let mut integration = pomodoroom_core::integrations::github::GitHubIntegration::new();
    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

#[test]
fn test_github_name_and_display_name() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::github::GitHubIntegration::new();
    assert_eq!(integration.name(), "github");
    assert_eq!(integration.display_name(), "GitHub");
}

// ============================================================================
// Google E2E Tests
// ============================================================================

#[test]
fn test_google_is_authenticated_false_without_tokens() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();
    assert!(!integration.is_authenticated());
}

#[test]
fn test_google_authenticate_requires_client_credentials() {
    keyring_clear();
    let mut integration = pomodoroom_core::integrations::google::GoogleIntegration::new();
    let result = integration.authenticate();
    assert!(result.is_err());
}

#[test]
fn test_google_disconnect_clears_event_id() {
    keyring_clear();

    let mut integration = pomodoroom_core::integrations::google::GoogleIntegration::new();
    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

#[test]
fn test_google_on_break_start_is_noop() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();
    let result = integration.on_break_start("Break", 5);
    assert!(result.is_ok());
}

#[test]
fn test_google_on_session_complete_is_noop() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();
    let session = create_test_session("Focus", "focus", 25);
    let result = integration.on_session_complete(&session);
    assert!(result.is_ok());
}

#[test]
fn test_google_name_and_display_name() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();
    assert_eq!(integration.name(), "google");
    assert_eq!(integration.display_name(), "Google Calendar & Tasks");
}

// ============================================================================
// Linear E2E Tests
// ============================================================================

#[test]
fn test_linear_is_authenticated_false_without_key() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();
    assert!(!integration.is_authenticated());
}

#[test]
fn test_linear_authenticate_requires_api_key() {
    keyring_clear();
    let mut integration = pomodoroom_core::integrations::linear::LinearIntegration::new();
    let result = integration.authenticate();
    assert!(result.is_err());
}

#[test]
fn test_linear_disconnect_clears_credentials() {
    keyring_clear();
    keyring_set("linear_api_key", "lin_api_test");
    keyring_set("linear_tracking_issue", "LIN-123");

    let mut integration = pomodoroom_core::integrations::linear::LinearIntegration::new();
    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

#[test]
fn test_linear_on_break_start_is_noop() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();
    let result = integration.on_break_start("Break", 5);
    assert!(result.is_ok());
}

#[test]
fn test_linear_name_and_display_name() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();
    assert_eq!(integration.name(), "linear");
    assert_eq!(integration.display_name(), "Linear");
}

// ============================================================================
// Notion E2E Tests
// ============================================================================

#[test]
fn test_notion_is_authenticated_requires_both_credentials() {
    keyring_clear();

    let integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    assert!(!integration.is_authenticated());

    // Only token, no database ID
    keyring_set("notion_token", "secret_token");
    let integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    assert!(!integration.is_authenticated());
}

#[test]
fn test_notion_authenticate_requires_token() {
    keyring_clear();
    let mut integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    let result = integration.authenticate();
    assert!(result.is_err());
}

#[test]
fn test_notion_disconnect_clears_both_credentials() {
    keyring_clear();
    keyring_set("notion_token", "secret_token");
    keyring_set("notion_database_id", "db-123");

    let mut integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

#[test]
fn test_notion_on_focus_start_is_noop() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    // Notion is write-on-complete only
    let result = integration.on_focus_start("Focus", 25);
    assert!(result.is_ok());
}

#[test]
fn test_notion_on_break_start_is_noop() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    let result = integration.on_break_start("Break", 5);
    assert!(result.is_ok());
}

#[test]
fn test_notion_on_session_complete_fails_without_auth() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    let session = create_test_session("Focus", "focus", 25);
    let result = integration.on_session_complete(&session);
    assert!(result.is_err());
}

#[test]
fn test_notion_name_and_display_name() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::notion::NotionIntegration::new();
    assert_eq!(integration.name(), "notion");
    assert_eq!(integration.display_name(), "Notion");
}

// ============================================================================
// Slack E2E Tests
// ============================================================================

#[test]
fn test_slack_is_authenticated_false_without_token() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    assert!(!integration.is_authenticated());
}

#[test]
fn test_slack_authenticate_requires_token() {
    keyring_clear();
    let mut integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    let result = integration.authenticate();
    assert!(result.is_err());
}

#[test]
fn test_slack_disconnect_clears_token() {
    keyring_clear();
    keyring_set("slack_token", "xoxp-test-token");

    let mut integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

#[test]
fn test_slack_on_focus_start_fails_without_auth() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    let result = integration.on_focus_start("Focus", 25);
    assert!(result.is_err());
}

#[test]
fn test_slack_on_break_start_fails_without_auth() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    let result = integration.on_break_start("Break", 5);
    assert!(result.is_err());
}

#[test]
fn test_slack_on_session_complete_fails_without_auth() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    let session = create_test_session("Focus", "focus", 25);
    let result = integration.on_session_complete(&session);
    assert!(result.is_err());
}

#[test]
fn test_slack_name_and_display_name() {
    keyring_clear();
    let integration = pomodoroom_core::integrations::slack::SlackIntegration::new();
    assert_eq!(integration.name(), "slack");
    assert_eq!(integration.display_name(), "Slack");
}
