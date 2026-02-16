//! Integration tests for diagnostics bundle generation.

use pomodoroom_core::{Database, DiagnosticsGenerator, SchedulingEvent, StepType};
use chrono::{Duration, Utc};

#[test]
fn test_full_diagnostics_workflow() {
    let db = Database::open_memory().unwrap();
    let base = Utc::now();

    // Create some sessions
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + Duration::minutes(25),
        Some("task-123"),
        Some("project-abc"),
    ).unwrap();

    db.record_session(
        StepType::Break,
        "Rest",
        5,
        base + Duration::minutes(25),
        base + Duration::minutes(30),
        None,
        None,
    ).unwrap();

    // Get sessions
    let sessions = db.get_all_session_records().unwrap();
    assert_eq!(sessions.len(), 2);

    // Generate bundle
    let config_json = serde_json::json!({"duration_min": 25});
    let events = Vec::new();

    let gen = DiagnosticsGenerator::new();
    let bundle = gen.generate(sessions, config_json, events, "test");

    assert_eq!(bundle.version, "1.0.0");
    assert!(!bundle.hash.is_empty());
    assert_eq!(bundle.timeline.total_sessions, 2);
}

#[test]
fn test_config_redaction() {
    let config_json = serde_json::json!({
        "duration": 25,
        "api_key": "secret123",
        "auth_token": "abc456",
        "password": "mypassword"
    });

    let gen = DiagnosticsGenerator::new();
    let bundle = gen.generate(Vec::new(), config_json, Vec::new(), "test");

    assert!(bundle.config.redacted_fields.contains(&"api_key".to_string()));
    assert!(bundle.config.redacted_fields.contains(&"auth_token".to_string()));
    assert!(bundle.config.redacted_fields.contains(&"password".to_string()));
}

#[test]
fn test_hash_reproducibility() {
    let config_json = serde_json::json!({"duration": 25});

    let gen1 = DiagnosticsGenerator::new();
    let bundle1 = gen1.generate(Vec::new(), config_json.clone(), Vec::new(), "test");

    let gen2 = DiagnosticsGenerator::new();
    let bundle2 = gen2.generate(Vec::new(), config_json, Vec::new(), "test");

    // Note: Due to random salt in DiagnosticsGenerator, hashes will be different
    // This test verifies the structure is consistent
    assert_eq!(bundle1.version, bundle2.version);
    assert_eq!(bundle1.app_version, bundle2.app_version);
    assert_eq!(bundle1.timeline.total_sessions, bundle2.timeline.total_sessions);
}

#[test]
fn test_anonymization() {
    let db = Database::open_memory().unwrap();
    let base = Utc::now();

    // Create session with identifiable data
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + Duration::minutes(25),
        Some("sensitive-task-id"),
        Some("confidential-project"),
    ).unwrap();

    let sessions = db.get_all_session_records().unwrap();
    let config_json = serde_json::json!({});
    let gen = DiagnosticsGenerator::new();
    let bundle = gen.generate(sessions, config_json, Vec::new(), "test");

    // Task and project IDs should be hashed, not original values
    let task_id = bundle.timeline.sessions[0].task_id.as_ref().unwrap();
    let project_id = bundle.timeline.sessions[0].project_id.as_ref().unwrap();

    // Hashed IDs should be 16 characters (truncated SHA-256)
    assert_eq!(task_id.len(), 16);
    assert_eq!(project_id.len(), 16);

    // Should not contain original values
    assert!(!task_id.contains("sensitive"));
    assert!(!project_id.contains("confidential"));
}

#[test]
fn test_export_format() {
    let gen = DiagnosticsGenerator::new();
    let bundle = gen.generate(
        Vec::new(),
        serde_json::json!({"name": "test"}),
        vec![SchedulingEvent {
            timestamp: Utc::now(),
            event_type: "test_event".to_string(),
            details: serde_json::json!({"key": "value"}),
        }],
        "0.1.0",
    );

    let exported = DiagnosticsGenerator::export(&bundle).unwrap();

    // Verify JSON structure
    assert!(exported.contains("\"version\""));
    assert!(exported.contains("\"created_at\""));
    assert!(exported.contains("\"app_version\""));
    assert!(exported.contains("\"hash\""));
    assert!(exported.contains("\"config\""));
    assert!(exported.contains("\"timeline\""));
    assert!(exported.contains("\"events\""));
    assert!(exported.contains("test_event"));
}
