//! Integration tests for energy curve learning.

use pomodoroom_core::{Database, EnergyCurveAnalyzer, EnergyCurve, EnergyWindow, StepType};
use chrono::{Duration, Utc};

#[test]
fn test_full_energy_curve_workflow() {
    let db = Database::open_memory().unwrap();
    let base = Utc::now();

    // Create multiple sessions at different hours
    // Monday 9:00 - completed focus session
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + Duration::minutes(25),
        Some("task-1"),
        Some("project-a"),
    ).unwrap();

    // Monday 9:30 - another completed focus session
    let base2 = base + Duration::minutes(30);
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base2,
        base2 + Duration::minutes(25),
        Some("task-2"),
        Some("project-a"),
    ).unwrap();

    // Monday 14:00 - incomplete focus session (only 5 min)
    let base3 = base + Duration::hours(5);
    db.record_session(
        StepType::Focus,
        "Work",
        5,
        base3,
        base3 + Duration::minutes(5),
        Some("task-3"),
        Some("project-a"),
    ).unwrap();

    // Get energy curve data
    let rows = db.get_energy_curve_data(None, None).unwrap();
    assert!(!rows.is_empty(), "Should have energy curve data");

    // Compute curve
    let analyzer = EnergyCurveAnalyzer::new();
    let curve = analyzer.compute_curve_from_aggregates(&rows);

    // Verify curve structure
    assert_eq!(curve.windows.len(), 168); // 24 hours * 7 days
    assert_eq!(curve.cold_start_fallback, 0.5);
}

#[test]
fn test_curve_computation_with_session_data() {
    let analyzer = EnergyCurveAnalyzer::new();

    // Create session data
    let sessions = vec![
        pomodoroom_core::EnergySessionData {
            hour: 9,
            day_of_week: 1, // Monday
            expected_duration: 25,
            actual_duration: 25,
            completed: true,
        },
        pomodoroom_core::EnergySessionData {
            hour: 9,
            day_of_week: 1,
            expected_duration: 25,
            actual_duration: 20,
            completed: true,
        },
        pomodoroom_core::EnergySessionData {
            hour: 14,
            day_of_week: 1,
            expected_duration: 25,
            actual_duration: 5,
            completed: false,
        },
    ];

    let curve = analyzer.compute_curve(&sessions);

    // 9:00 Monday should have high energy (100% completion, good quality)
    let morning = curve.find_window(9, 1).unwrap();
    assert!(morning.baseline_energy > 0.8, "Morning energy should be high");
    assert_eq!(morning.sample_count, 2);

    // 14:00 Monday should have lower energy (0% completion)
    let afternoon = curve.find_window(14, 1).unwrap();
    assert!(afternoon.baseline_energy < 0.5, "Afternoon energy should be low");
    assert_eq!(afternoon.sample_count, 1);
}

#[test]
fn test_confidence_calculation() {
    assert_eq!(EnergyWindow::calculate_confidence(0, 5), 0.1);
    assert_eq!(EnergyWindow::calculate_confidence(1, 5), 0.1);
    assert_eq!(EnergyWindow::calculate_confidence(2, 5), 0.1);
    assert_eq!(EnergyWindow::calculate_confidence(3, 5), 0.3);
    assert_eq!(EnergyWindow::calculate_confidence(5, 5), 0.3);
    assert_eq!(EnergyWindow::calculate_confidence(6, 5), 0.6);
    assert_eq!(EnergyWindow::calculate_confidence(10, 5), 0.6);
    assert!(EnergyWindow::calculate_confidence(11, 5) > 0.8);
    assert!(EnergyWindow::calculate_confidence(20, 5) > 0.9);
}

#[test]
fn test_cold_start_fallback() {
    let curve = EnergyCurve::new();

    // Window with no data should return cold_start_fallback
    let energy = curve.get_energy(3, 0); // 3 AM Sunday
    assert_eq!(energy, 0.5); // Default cold_start_fallback

    let confidence = curve.get_confidence(3, 0);
    assert_eq!(confidence, 0.0);
}

#[test]
fn test_recommendations_empty_curve() {
    let analyzer = EnergyCurveAnalyzer::new();
    let curve = EnergyCurve::new();

    let recommendations = analyzer.get_recommendations(&curve);

    assert!(!recommendations.is_empty());
    assert!(recommendations[0].contains("Not enough data"));
}

#[test]
fn test_recommendations_with_data() {
    let analyzer = EnergyCurveAnalyzer::new();
    let mut curve = EnergyCurve::new();

    // Set high energy for Monday 9:00
    if let Some(w) = curve.find_window_mut(9, 1) {
        w.baseline_energy = 0.9;
        w.confidence = 0.8;
        w.sample_count = 10;
    }

    // Set low energy for Monday 14:00
    if let Some(w) = curve.find_window_mut(14, 1) {
        w.baseline_energy = 0.3;
        w.confidence = 0.6;
        w.sample_count = 6;
    }

    let recommendations = analyzer.get_recommendations(&curve);

    assert!(!recommendations.is_empty());
    // Should recommend Monday 9:00
    assert!(recommendations.iter().any(|r| r.contains("Monday") && r.contains("09:00")));
    // Should warn about Monday 14:00
    assert!(recommendations.iter().any(|r| r.contains("Avoid") || r.contains("low energy")));
}

#[test]
fn test_ascii_chart_output() {
    let mut curve = EnergyCurve::new();

    // Set some energy levels
    if let Some(w) = curve.find_window_mut(9, 1) {
        w.baseline_energy = 0.8;
        w.sample_count = 5;
    }
    if let Some(w) = curve.find_window_mut(14, 1) {
        w.baseline_energy = 0.4;
        w.sample_count = 3;
    }

    let chart = curve.render_ascii_chart(1); // Monday

    assert!(chart.contains("Mon"));
    assert!(chart.contains("09:00"));
    assert!(chart.contains("14:00"));
    assert!(chart.contains("█")); // Energy bar
    assert!(chart.contains("80%"));
    assert!(chart.contains("40%"));
}

#[test]
fn test_get_recommended_hours() {
    let mut curve = EnergyCurve::new();

    // Set high energy for some hours
    for hour in [9, 10, 11] {
        if let Some(w) = curve.find_window_mut(hour, 1) {
            w.baseline_energy = 0.8;
            w.sample_count = 5;
        }
    }

    // Set low energy for other hours
    for hour in [13, 14, 15] {
        if let Some(w) = curve.find_window_mut(hour, 1) {
            w.baseline_energy = 0.3;
            w.sample_count = 5;
        }
    }

    let recommended = curve.get_recommended_hours(1, 0.7);

    assert_eq!(recommended.len(), 3);
    assert!(recommended.contains(&9));
    assert!(recommended.contains(&10));
    assert!(recommended.contains(&11));
}

#[test]
fn test_database_energy_curve_data_date_filtering() {
    let db = Database::open_memory().unwrap();
    let base = chrono::DateTime::parse_from_rfc3339("2026-02-16T09:00:00+00:00")
        .unwrap()
        .with_timezone(&Utc);

    // Create sessions on different dates
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base,
        base + Duration::minutes(25),
        None,
        None,
    ).unwrap();

    let base2 = base + Duration::days(5);
    db.record_session(
        StepType::Focus,
        "Work",
        25,
        base2,
        base2 + Duration::minutes(25),
        None,
        None,
    ).unwrap();

    // Query only first date
    let rows = db.get_energy_curve_data(Some("2026-02-16"), Some("2026-02-16")).unwrap();
    assert_eq!(rows.len(), 1);

    // Query all dates
    let all_rows = db.get_energy_curve_data(None, None).unwrap();
    assert_eq!(all_rows.len(), 2);
}

#[test]
fn test_analyzer_with_custom_settings() {
    let analyzer = EnergyCurveAnalyzer::with_settings(10, 60);

    // Verify the analyzer was created with custom settings
    assert_eq!(analyzer.min_samples_for_confidence, 10);
    assert_eq!(analyzer.rolling_window_days, 60);

    // Confidence calculation is static, but verify behavior
    // With default 5 min_samples:
    assert_eq!(EnergyWindow::calculate_confidence(5, 5), 0.3);
    assert_eq!(EnergyWindow::calculate_confidence(6, 5), 0.6);
}
