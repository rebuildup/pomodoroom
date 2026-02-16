//! Integration tests for break adherence dashboard.
//!
//! Tests the full workflow from session recording to adherence analysis,
//! including project filtering and high-risk window detection.

use pomodoroom_core::{BreakAdherenceAnalyzer, Database, StepType};

#[test]
fn test_full_break_adherence_workflow() {
    let db = Database::open_memory().unwrap();
    let base = chrono::Utc::now();

    // Simulate a day of work: 4 focus sessions with 3 breaks (1 skipped)
    // Focus 1 -> Break 1 (taken)
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + chrono::Duration::minutes(25),
        None,
        None,
    )
    .unwrap();
    db.record_session(
        StepType::Break,
        "Rest",
        5,
        base + chrono::Duration::minutes(25),
        base + chrono::Duration::minutes(30),
        None,
        None,
    )
    .unwrap();

    // Focus 2 -> No break (skipped)
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base + chrono::Duration::minutes(30),
        base + chrono::Duration::minutes(55),
        None,
        None,
    )
    .unwrap();

    // Focus 3 -> Break 2 (deferred - 10 min delay)
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base + chrono::Duration::minutes(55),
        base + chrono::Duration::minutes(80),
        None,
        None,
    )
    .unwrap();
    db.record_session(
        StepType::Break,
        "Rest",
        5,
        base + chrono::Duration::minutes(90),
        base + chrono::Duration::minutes(95),
        None,
        None,
    )
    .unwrap();

    // Focus 4 -> Break 3 (taken)
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base + chrono::Duration::minutes(95),
        base + chrono::Duration::minutes(120),
        None,
        None,
    )
    .unwrap();
    db.record_session(
        StepType::Break,
        "Rest",
        5,
        base + chrono::Duration::minutes(120),
        base + chrono::Duration::minutes(125),
        None,
        None,
    )
    .unwrap();

    let today = base.format("%Y-%m-%d").to_string();
    let rows = db.get_break_adherence_data(&today, &today, None).unwrap();

    let analyzer = BreakAdherenceAnalyzer::new();
    let report = analyzer.generate_report(&rows);

    assert_eq!(report.stats.total_focus_sessions, 4);
    assert_eq!(report.stats.breaks_taken, 2);
    assert_eq!(report.stats.breaks_skipped, 1);
    assert_eq!(report.stats.breaks_deferred, 1);
    assert!((report.stats.adherence_rate - 0.5).abs() < 0.01);
}

#[test]
fn test_break_adherence_with_project_filter() {
    let db = Database::open_memory().unwrap();
    let base = chrono::Utc::now();

    // Project A sessions
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + chrono::Duration::minutes(25),
        None,
        Some("project-a"),
    )
    .unwrap();
    db.record_session(
        StepType::Break,
        "Rest",
        5,
        base + chrono::Duration::minutes(25),
        base + chrono::Duration::minutes(30),
        None,
        Some("project-a"),
    )
    .unwrap();

    // Project B sessions
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base + chrono::Duration::minutes(60),
        base + chrono::Duration::minutes(85),
        None,
        Some("project-b"),
    )
    .unwrap();
    // No break for project B

    let today = base.format("%Y-%m-%d").to_string();

    // Filter by project A
    let rows_a = db
        .get_break_adherence_data(&today, &today, Some("project-a"))
        .unwrap();
    let report_a = BreakAdherenceAnalyzer::new().generate_report(&rows_a);
    assert_eq!(report_a.stats.total_focus_sessions, 1);
    assert_eq!(report_a.stats.breaks_taken, 1);

    // Filter by project B
    let rows_b = db
        .get_break_adherence_data(&today, &today, Some("project-b"))
        .unwrap();
    let report_b = BreakAdherenceAnalyzer::new().generate_report(&rows_b);
    assert_eq!(report_b.stats.total_focus_sessions, 1);
    assert_eq!(report_b.stats.breaks_skipped, 1);
}

#[test]
fn test_high_risk_window_detection() {
    let db = Database::open_memory().unwrap();
    // Use a fixed date at 14:00 to ensure predictable hour values
    // 2026-02-16 is a Monday
    let base = chrono::DateTime::parse_from_rfc3339("2026-02-16T14:00:00+00:00")
        .unwrap()
        .with_timezone(&chrono::Utc);

    // Create multiple sessions at hour 14 with high skip rate
    // Each session is short (5 min) to keep them all within hour 14
    for i in 0..5 {
        let start = base + chrono::Duration::minutes(i * 10);
        db.record_session(
            StepType::Focus,
            "Work",
            5,
            start,
            start + chrono::Duration::minutes(5),
            None,
            None,
        )
        .unwrap();
        // Only take break for first 2 sessions (40% taken = 60% skip)
        if i < 2 {
            db.record_session(
                StepType::Break,
                "Rest",
                2,
                start + chrono::Duration::minutes(5),
                start + chrono::Duration::minutes(7),
                None,
                None,
            )
            .unwrap();
        }
    }

    let date_str = base.format("%Y-%m-%d").to_string();
    let rows = db.get_break_adherence_data(&date_str, &date_str, None).unwrap();
    let report = BreakAdherenceAnalyzer::new().generate_report(&rows);

    // Verify total sessions
    assert_eq!(report.stats.total_focus_sessions, 5);
    assert_eq!(report.stats.breaks_taken, 2);
    assert_eq!(report.stats.breaks_skipped, 3);

    // Hour 14 should be identified as high-risk (3/5 = 60% skip rate > 30%)
    assert!(!report.high_risk_windows.is_empty());
    assert!(report.high_risk_windows.iter().any(|w| w.hour == 14));
}
