//! Integration tests for policy import/export functionality.
//!
//! These tests verify the complete workflow of exporting, importing,
//! and applying policies across the system.

use pomodoroom_core::policy::{check_compatibility, Compatibility, PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
use pomodoroom_core::storage::Config;

#[test]
fn test_export_import_roundtrip() {
    // Create a config with custom settings
    let mut config = Config::default();
    config.schedule.focus_duration = 45;
    config.schedule.short_break = 10;
    config.schedule.long_break = 20;
    config.schedule.pomodoros_before_long_break = 3;

    // Export to bundle (using default metadata)
    let bundle = PolicyBundle::new(
        "Custom Policy".to_string(),
        config.schedule.focus_duration,
        config.schedule.short_break,
        config.schedule.long_break,
        config.schedule.pomodoros_before_long_break,
        config.custom_schedule.clone(),
    );
    let json = bundle.to_json().unwrap();

    // Import back
    let imported = PolicyBundle::from_json(&json).unwrap();

    // Verify
    assert_eq!(imported.policy.focus_duration, 45);
    assert_eq!(imported.policy.short_break, 10);
    assert_eq!(imported.policy.long_break, 20);
    assert_eq!(imported.policy.pomodoros_before_long_break, 3);
}

#[test]
fn test_import_rejects_incompatible_version() {
    let json = r#"{
        "version": "2.0.0",
        "metadata": {
            "name": "Future Policy",
            "author": "",
            "intent": "",
            "notes": "",
            "created_at": "2026-01-01T00:00:00Z"
        },
        "policy": {
            "focus_duration": 25,
            "short_break": 5,
            "long_break": 15,
            "pomodoros_before_long_break": 4,
            "custom_schedule": null
        }
    }"#;

    let bundle = PolicyBundle::from_json(json).unwrap();
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    assert!(matches!(compat, Compatibility::Incompatible { .. }));
}

#[test]
fn test_import_accepts_minor_newer() {
    let json = r#"{
        "version": "1.5.0",
        "metadata": {
            "name": "Newer Minor",
            "author": "",
            "intent": "",
            "notes": "",
            "created_at": "2026-01-01T00:00:00Z"
        },
        "policy": {
            "focus_duration": 25,
            "short_break": 5,
            "long_break": 15,
            "pomodoros_before_long_break": 4,
            "custom_schedule": null
        }
    }"#;

    let bundle = PolicyBundle::from_json(json).unwrap();
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    assert!(matches!(compat, Compatibility::MinorNewer { .. }));
}

#[test]
fn test_apply_overwrites_config() {
    let bundle = PolicyBundle {
        version: "1.0.0".to_string(),
        metadata: PolicyMetadata::default(),
        policy: PolicyData {
            focus_duration: 60,
            short_break: 15,
            long_break: 30,
            pomodoros_before_long_break: 2,
            custom_schedule: None,
        },
    };

    let mut config = Config::default();
    let original_focus = config.schedule.focus_duration;
    assert_ne!(original_focus, 60);

    bundle.apply_to_config(&mut config);
    assert_eq!(config.schedule.focus_duration, 60);
    assert_eq!(config.schedule.short_break, 15);
    assert_eq!(config.schedule.long_break, 30);
    assert_eq!(config.schedule.pomodoros_before_long_break, 2);
}

#[test]
fn test_full_workflow_export_import_apply() {
    // Start with a custom config
    let mut original_config = Config::default();
    original_config.schedule.focus_duration = 50;
    original_config.schedule.short_break = 10;
    original_config.schedule.long_break = 25;
    original_config.schedule.pomodoros_before_long_break = 3;

    // Export to JSON
    let bundle = PolicyBundle::new(
        "Deep Work Policy".to_string(),
        original_config.schedule.focus_duration,
        original_config.schedule.short_break,
        original_config.schedule.long_break,
        original_config.schedule.pomodoros_before_long_break,
        None,
    );
    let json = bundle.to_json().unwrap();

    // Simulate saving to file and loading back
    let loaded_bundle = PolicyBundle::from_json(&json).unwrap();

    // Check compatibility
    let compat = check_compatibility(POLICY_VERSION, &loaded_bundle.version);
    assert!(matches!(compat, Compatibility::Compatible));

    // Apply to a fresh config
    let mut new_config = Config::default();
    loaded_bundle.apply_to_config(&mut new_config);

    // Verify values match original
    assert_eq!(new_config.schedule.focus_duration, 50);
    assert_eq!(new_config.schedule.short_break, 10);
    assert_eq!(new_config.schedule.long_break, 25);
    assert_eq!(new_config.schedule.pomodoros_before_long_break, 3);
}

#[test]
fn test_import_same_version_is_compatible() {
    let json = r#"{
        "version": "1.0.0",
        "metadata": {
            "name": "Same Version",
            "author": "",
            "intent": "",
            "notes": "",
            "created_at": "2026-01-01T00:00:00Z"
        },
        "policy": {
            "focus_duration": 30,
            "short_break": 5,
            "long_break": 15,
            "pomodoros_before_long_break": 4,
            "custom_schedule": null
        }
    }"#;

    let bundle = PolicyBundle::from_json(json).unwrap();
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    assert!(matches!(compat, Compatibility::Compatible));
}

#[test]
fn test_import_older_minor_is_compatible() {
    // Import from older minor version (e.g., 1.0.0 when we're on 1.5.0)
    // This should be fully compatible since we can read older formats
    let json = r#"{
        "version": "1.0.0",
        "metadata": {
            "name": "Older Policy",
            "author": "",
            "intent": "",
            "notes": "",
            "created_at": "2025-01-01T00:00:00Z"
        },
        "policy": {
            "focus_duration": 25,
            "short_break": 5,
            "long_break": 15,
            "pomodoros_before_long_break": 4,
            "custom_schedule": null
        }
    }"#;

    let bundle = PolicyBundle::from_json(json).unwrap();
    let compat = check_compatibility(POLICY_VERSION, &bundle.version);

    // Same major, same or older minor = Compatible
    assert!(matches!(compat, Compatibility::Compatible));
}
