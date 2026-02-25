//! Integration tests for estimate accuracy tracking.

use pomodoroom_core::{Database, EstimateAccuracyTracker, GroupBy, AccuracySessionData, StepType};
use chrono::{Duration, Utc};

#[test]
fn test_full_accuracy_workflow() {
    let db = Database::open_memory().unwrap();
    // Use a fixed date at noon to avoid date boundary issues
    let base = chrono::DateTime::parse_from_rfc3339("2026-02-16T12:00:00+00:00")
        .unwrap()
        .with_timezone(&Utc);

    // Record sessions with different actual durations
    // 25 planned but took 30 (underestimation)
    db.record_session(
        StepType::Focus,
        "Task 1",
        30,
        base,
        base + Duration::minutes(30),
        Some("task-1"),
        Some("project-a"),
    ).unwrap();

    // 25 planned but took 20 (overestimation)
    let base2 = base + Duration::hours(1);
    db.record_session(
        StepType::Focus,
        "Task 2",
        20,
        base2,
        base2 + Duration::minutes(20),
        Some("task-2"),
        Some("project-a"),
    ).unwrap();

    // Get accuracy data
    let start = base.format("%Y-%m-%d").to_string();
    let end = base.format("%Y-%m-%d").to_string();
    let rows = db.get_accuracy_data(Some(&start), Some(&end)).unwrap();
    assert_eq!(rows.len(), 2);

    // Verify data structure
    assert_eq!(rows[0].planned_duration, 25);
    assert_eq!(rows[0].actual_duration, 30);
    assert_eq!(rows[1].planned_duration, 25);
    assert_eq!(rows[1].actual_duration, 20);
}

#[test]
fn test_tracker_accuracy_calculation() {
    let tracker = EstimateAccuracyTracker::new();

    let sessions = vec![
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 30,
            tag: Some("work-a".to_string()),
            project: Some("project-a".to_string()),
        },
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 35,
            tag: Some("work-a".to_string()),
            project: Some("project-a".to_string()),
        },
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 20,
            tag: Some("work-b".to_string()),
            project: Some("project-b".to_string()),
        },
    ];

    let stats = tracker.compute_accuracy(&sessions);

    // work-a should have positive bias (underestimation)
    let work_a = stats.iter().find(|s| s.key == "work-a").unwrap();
    assert!(work_a.mean_bias > 0.0);
    assert!(work_a.corrective_factor > 1.0);

    // work-b should have negative bias (overestimation)
    let work_b = stats.iter().find(|s| s.key == "work-b").unwrap();
    assert!(work_b.mean_bias < 0.0);
    assert!(work_b.corrective_factor < 1.0);
}

#[test]
fn test_grouping_by_project() {
    let tracker = EstimateAccuracyTracker::new();

    let sessions = vec![
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 30,
            tag: Some("urgent".to_string()),
            project: Some("alpha".to_string()),
        },
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 20,
            tag: Some("routine".to_string()),
            project: Some("alpha".to_string()),
        },
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 25,
            tag: Some("urgent".to_string()),
            project: Some("beta".to_string()),
        },
    ];

    let stats = tracker.compute_grouped(&sessions, GroupBy::Project);

    // Should have 2 groups: alpha and beta
    assert_eq!(stats.len(), 2);

    let alpha = stats.iter().find(|s| s.key == "alpha").unwrap();
    assert_eq!(alpha.session_count, 2);

    let beta = stats.iter().find(|s| s.key == "beta").unwrap();
    assert_eq!(beta.session_count, 1);
    assert_eq!(beta.mean_bias, 0.0); // Exactly on target
    assert_eq!(beta.corrective_factor, 1.0);
}

#[test]
fn test_corrective_factor_calculation() {
    let tracker = EstimateAccuracyTracker::new();

    // Sessions that consistently take 50% longer than planned
    let sessions = vec![
        AccuracySessionData {
            planned_duration: 20,
            actual_duration: 30,
            tag: Some("test".to_string()),
            project: None,
        },
        AccuracySessionData {
            planned_duration: 20,
            actual_duration: 30,
            tag: Some("test".to_string()),
            project: None,
        },
    ];

    let stats = tracker.compute_accuracy(&sessions);
    let stat = &stats[0];

    // Corrective factor should be 1.5 (30/20)
    assert!((stat.corrective_factor - 1.5).abs() < 0.01);
    assert!(stat.correction_suggestion().contains("50% longer"));
}

#[test]
fn test_accuracy_percentage() {
    let tracker = EstimateAccuracyTracker::new();

    let sessions = vec![
        // Perfect estimate
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 25,
            tag: Some("perfect".to_string()),
            project: None,
        },
        // Off by 5 min (20% error)
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 30,
            tag: Some("ok".to_string()),
            project: None,
        },
        // Off by 10 min (40% error)
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 15,
            tag: Some("poor".to_string()),
            project: None,
        },
    ];

    let stats = tracker.compute_accuracy(&sessions);

    let perfect = stats.iter().find(|s| s.key == "perfect").unwrap();
    assert_eq!(perfect.accuracy_percentage, 1.0);

    let ok = stats.iter().find(|s| s.key == "ok").unwrap();
    assert!(ok.accuracy_percentage > 0.7); // ~0.8

    let poor = stats.iter().find(|s| s.key == "poor").unwrap();
    assert!(poor.accuracy_percentage < 0.7); // ~0.6
}

#[test]
fn test_bias_descriptions() {
    let stats_with_different_biases = vec![
        pomodoroom_core::AccuracyStats {
            key: "accurate".to_string(),
            session_count: 10,
            mean_planned: 25.0,
            mean_actual: 25.0,
            mean_absolute_error: 1.0,
            mean_bias: 0.0,
            accuracy_percentage: 0.96,
            corrective_factor: 1.0,
            confidence: 0.8,
        },
        pomodoroom_core::AccuracyStats {
            key: "moderate_under".to_string(),
            session_count: 10,
            mean_planned: 25.0,
            mean_actual: 30.0,
            mean_absolute_error: 5.0,
            mean_bias: 5.0,
            accuracy_percentage: 0.8,
            corrective_factor: 1.2,
            confidence: 0.8,
        },
        pomodoroom_core::AccuracyStats {
            key: "severe_under".to_string(),
            session_count: 10,
            mean_planned: 25.0,
            mean_actual: 45.0,
            mean_absolute_error: 20.0,
            mean_bias: 20.0,
            accuracy_percentage: 0.2,
            corrective_factor: 1.8,
            confidence: 0.8,
        },
        pomodoroom_core::AccuracyStats {
            key: "moderate_over".to_string(),
            session_count: 10,
            mean_planned: 25.0,
            mean_actual: 20.0,
            mean_absolute_error: 5.0,
            mean_bias: -5.0,
            accuracy_percentage: 0.8,
            corrective_factor: 0.8,
            confidence: 0.8,
        },
        pomodoroom_core::AccuracyStats {
            key: "severe_over".to_string(),
            session_count: 10,
            mean_planned: 25.0,
            mean_actual: 5.0,
            mean_absolute_error: 20.0,
            mean_bias: -20.0,
            accuracy_percentage: 0.2,
            corrective_factor: 0.2,
            confidence: 0.8,
        },
    ];

    for stat in stats_with_different_biases {
        let desc = stat.bias_description();
        assert!(!desc.is_empty());
    }
}

#[test]
fn test_render_report_output() {
    let tracker = EstimateAccuracyTracker::new();

    let sessions = vec![
        AccuracySessionData {
            planned_duration: 25,
            actual_duration: 30,
            tag: Some("work".to_string()),
            project: Some("project-a".to_string()),
        },
    ];

    let stats = tracker.compute_accuracy(&sessions);
    let report = tracker.render_report(&stats);

    assert!(report.contains("Estimate Accuracy Report"));
    assert!(report.contains("Group"));
    assert!(report.contains("Count"));
    assert!(report.contains("Planned"));
    assert!(report.contains("Actual"));
    assert!(report.contains("MAE"));
    assert!(report.contains("Accuracy"));
}

#[test]
fn test_confidence_calculation() {
    assert_eq!(pomodoroom_core::AccuracyStats::calculate_confidence(0, 5), 0.0);
    assert_eq!(pomodoroom_core::AccuracyStats::calculate_confidence(2, 5), 0.2);
    assert_eq!(pomodoroom_core::AccuracyStats::calculate_confidence(5, 5), 0.5);
    assert!(pomodoroom_core::AccuracyStats::calculate_confidence(10, 5) > 0.5);
    assert!(pomodoroom_core::AccuracyStats::calculate_confidence(20, 5) > 0.8);
}

#[test]
fn test_empty_sessions_handling() {
    let tracker = EstimateAccuracyTracker::new();
    let sessions: Vec<AccuracySessionData> = vec![];

    let stats = tracker.compute_accuracy(&sessions);
    assert!(stats.is_empty());
}

#[test]
fn test_time_range_filtering() {
    let db = Database::open_memory().unwrap();
    let base = chrono::DateTime::parse_from_rfc3339("2026-02-16T09:00:00+00:00")
        .unwrap()
        .with_timezone(&Utc);

    // Session on first date
    db.record_session(
        StepType::Focus,
        "Task 1",
        30,
        base,
        base + Duration::minutes(30),
        None,
        None,
    ).unwrap();

    // Session on second date
    let base2 = base + Duration::days(5);
    db.record_session(
        StepType::Focus,
        "Task 2",
        20,
        base2,
        base2 + Duration::minutes(20),
        None,
        None,
    ).unwrap();

    // Query only first date
    let rows = db.get_accuracy_data(Some("2026-02-16"), Some("2026-02-16")).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].actual_duration, 30);

    // Query all dates
    let all_rows = db.get_accuracy_data(None, None).unwrap();
    assert_eq!(all_rows.len(), 2);

    // Query date range including both
    let range_rows = db.get_accuracy_data(Some("2026-02-16"), Some("2026-02-25")).unwrap();
    assert_eq!(range_rows.len(), 2);
}
