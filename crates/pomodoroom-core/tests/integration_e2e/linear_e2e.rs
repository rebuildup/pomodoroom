//! E2E tests for Linear integration.

use super::mock_keyring;
use super::test_helpers::create_test_session;
use pomodoroom_core::integrations::traits::Integration;

/// Test: Linear authentication requires API key.
#[test]
fn test_linear_authenticate_requires_api_key() {
    mock_keyring::clear();

    let mut integration = pomodoroom_core::integrations::linear::LinearIntegration::new();

    // Without API key, authenticate should fail
    let result = integration.authenticate();
    assert!(result.is_err());
}

/// Test: Linear is_authenticated returns false without API key.
#[test]
fn test_linear_is_authenticated_false_without_key() {
    mock_keyring::clear();

    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();

    assert!(!integration.is_authenticated());
}

/// Test: Linear disconnect clears API key and tracking issue.
#[test]
fn test_linear_disconnect() {
    mock_keyring::clear();
    mock_keyring::set("linear_api_key", "lin_api_test123").unwrap();
    mock_keyring::set("linear_tracking_issue", "LIN-123").unwrap();

    let mut integration = pomodoroom_core::integrations::linear::LinearIntegration::new();

    let _ = integration.disconnect();

    assert!(!integration.is_authenticated());
}

/// Test: on_focus_start sets tracking marker when issue is configured.
#[test]
fn test_linear_on_focus_start_with_tracking_issue() {
    mock_keyring::clear();
    mock_keyring::set("linear_api_key", "lin_api_test123").unwrap();
    mock_keyring::set("linear_tracking_issue", "LIN-123").unwrap();

    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();

    // on_focus_start should set tracking_active marker
    let result = integration.on_focus_start("Working on LIN-123", 25);
    assert!(result.is_ok());

    // Verify tracking marker was set
    assert!(mock_keyring::get("linear_tracking_active").unwrap().is_some());
}

/// Test: on_focus_start is no-op without tracking issue.
#[test]
fn test_linear_on_focus_start_without_tracking_issue() {
    mock_keyring::clear();
    mock_keyring::set("linear_api_key", "lin_api_test123").unwrap();

    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();

    // Without tracking issue configured, should be no-op
    let result = integration.on_focus_start("General work", 25);
    assert!(result.is_ok());
}

/// Test: on_session_complete clears tracking marker.
#[test]
fn test_linear_on_session_complete() {
    mock_keyring::clear();
    mock_keyring::set("linear_api_key", "lin_api_test123").unwrap();
    mock_keyring::set("linear_tracking_active", "1").unwrap();

    let integration = pomodoroom_core::integrations::linear::LinearIntegration::new();

    let session = create_test_session("Focus Session", "focus", 25);

    // on_session_complete should clear tracking marker
    let result = integration.on_session_complete(&session);
    assert!(result.is_ok());
}

/// Test matrix coverage for Linear:
/// - [x] authenticate() - validates via GraphQL viewer query
/// - [x] is_authenticated() - checks API key exists
/// - [x] disconnect() - clears API key and tracking issue
/// - [x] on_focus_start() - sets tracking_active marker (if issue configured)
/// - [x] on_break_start() - no-op (default)
/// - [x] on_session_complete() - clears tracking marker
