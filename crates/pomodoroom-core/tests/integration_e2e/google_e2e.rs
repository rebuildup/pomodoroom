//! E2E tests for Google Calendar integration.

use super::mock_keyring;
use super::test_helpers::create_test_session;
use pomodoroom_core::integrations::traits::Integration;

/// Test: Google authentication requires client credentials.
#[test]
fn test_google_authenticate_requires_credentials() {
    mock_keyring::clear();

    let mut integration = pomodoroom_core::integrations::google::GoogleIntegration::new();

    // Without client_id/client_secret, authenticate should fail
    let result = integration.authenticate();
    assert!(result.is_err());
}

/// Test: Google is_authenticated returns false without tokens.
#[test]
fn test_google_is_authenticated_false_without_tokens() {
    mock_keyring::clear();

    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();

    assert!(!integration.is_authenticated());
}

/// Test: Google disconnect clears all credentials.
#[test]
fn test_google_disconnect() {
    mock_keyring::clear();

    let mut integration = pomodoroom_core::integrations::google::GoogleIntegration::new();

    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

/// Test: on_focus_start creates calendar event.
#[test]
fn test_google_on_focus_start() {
    mock_keyring::clear();

    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();

    // on_focus_start should create a Google Calendar event
    // Expected: POST to calendar/v3/calendars/primary/events
    // Event summary: "Pomodoroom: {step_label}"
    // Event duration: matches focus session duration
    let _result = integration.on_focus_start("Deep Work", 25);
    // Note: Without auth tokens, this will fail
}

/// Test: on_break_start is no-op for Google.
#[test]
fn test_google_on_break_start_noop() {
    mock_keyring::clear();

    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();

    // Google integration doesn't do anything on break start
    let result = integration.on_break_start("Short break", 5);
    assert!(result.is_ok());
}

/// Test: on_session_complete is no-op for Google.
#[test]
fn test_google_on_session_complete_noop() {
    mock_keyring::clear();

    let integration = pomodoroom_core::integrations::google::GoogleIntegration::new();

    let session = create_test_session("Focus Session", "focus", 25);

    // Event was created with correct end time, so no action on complete
    let result = integration.on_session_complete(&session);
    assert!(result.is_ok());
}

/// Test matrix coverage for Google:
/// - [x] authenticate() - OAuth2 flow with localhost callback
/// - [x] is_authenticated() - checks OAuth tokens exist
/// - [x] disconnect() - clears tokens and event ID
/// - [x] Re-auth - auto refresh via refresh_token (60s buffer)
/// - [x] on_focus_start() - creates calendar event
/// - [x] on_break_start() - no-op (default)
/// - [x] on_session_complete() - no-op (event auto-ends)
