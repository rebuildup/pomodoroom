//! Integration tests for interruption heatmap functionality.
//!
//! This test file verifies:
//! - Heatmap computation from events
//! - Source filtering by type and name
//! - Peak hour identification
//! - Date range queries

use pomodoroom_core::{
    InterruptionEvent, InterruptionSource, InterruptionPriority, InterruptionImpact,
    InterruptionHeatmapAnalyzer, InterruptionSourceType,
};

#[test]
fn test_heatmap_computation_from_events() {
    let analyzer = InterruptionHeatmapAnalyzer::new();

    // Create test events across different days and hours
    let events = vec![
        // Monday 9:00 - 2 interruptions
        InterruptionEvent {
            occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
            duration_minutes: 5,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Moderate,
        },
        InterruptionEvent {
            occurred_at: "2026-02-17T09:30:00+00:00".to_string(),
            duration_minutes: 3,
            source: InterruptionSource::Email { priority: InterruptionPriority::Low },
            impact: InterruptionImpact::Minimal,
        },
        // Monday 14:00 - 1 interruption
        InterruptionEvent {
            occurred_at: "2026-02-17T14:00:00+00:00".to_string(),
            duration_minutes: 10,
            source: InterruptionSource::Meeting { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Moderate,
        },
        // Tuesday 10:00 - 3 interruptions
        InterruptionEvent {
            occurred_at: "2026-02-18T10:00:00+00:00".to_string(),
            duration_minutes: 5,
            source: InterruptionSource::Fatigue,
            impact: InterruptionImpact::Moderate,
        },
        InterruptionEvent {
            occurred_at: "2026-02-18T10:15:00+00:00".to_string(),
            duration_minutes: 2,
            source: InterruptionSource::ContextSwitch,
            impact: InterruptionImpact::Minimal,
        },
        InterruptionEvent {
            occurred_at: "2026-02-18T10:45:00+00:00".to_string(),
            duration_minutes: 7,
            source: InterruptionSource::Blocker,
            impact: InterruptionImpact::Severe,
        },
    ];

    let heatmap = analyzer.build_heatmap(&events);

    // 2026-02-17 is Tuesday (day_of_week = 2)
    // Wait, let me check: 2026-02-17
    // Actually 2026-02-17 is a Tuesday
    // So 2026-02-17 would be day 2
    // And 2026-02-18 would be day 3

    assert_eq!(heatmap.total_interruptions, 6);

    // Check that cells have correct counts
    let cell_tuesday_9 = heatmap.get_cell(2, 9);  // Tuesday 9:00
    assert!(cell_tuesday_9.is_some());
    assert_eq!(cell_tuesday_9.unwrap().interruption_count, 2);

    let cell_tuesday_14 = heatmap.get_cell(2, 14);  // Tuesday 14:00
    assert!(cell_tuesday_14.is_some());
    assert_eq!(cell_tuesday_14.unwrap().interruption_count, 1);

    let cell_wednesday_10 = heatmap.get_cell(3, 10);  // Wednesday 10:00
    assert!(cell_wednesday_10.is_some());
    assert_eq!(cell_wednesday_10.unwrap().interruption_count, 3);
}

#[test]
fn test_filter_by_source_type() {
    let analyzer = InterruptionHeatmapAnalyzer::new();

    let events = vec![
        InterruptionEvent {
            occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
            duration_minutes: 5,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Moderate,
        },
        InterruptionEvent {
            occurred_at: "2026-02-17T10:00:00+00:00".to_string(),
            duration_minutes: 3,
            source: InterruptionSource::Fatigue,
            impact: InterruptionImpact::Moderate,
        },
        InterruptionEvent {
            occurred_at: "2026-02-17T11:00:00+00:00".to_string(),
            duration_minutes: 8,
            source: InterruptionSource::Email { priority: InterruptionPriority::Low },
            impact: InterruptionImpact::Minimal,
        },
    ];

    // Filter external sources
    let external = analyzer.filter_by_source_type(&events, InterruptionSourceType::External);
    assert_eq!(external.len(), 2);  // Slack and Email

    // Filter internal sources
    let internal = analyzer.filter_by_source_type(&events, InterruptionSourceType::Internal);
    assert_eq!(internal.len(), 1);  // Fatigue
}

#[test]
fn test_filter_by_source_name() {
    let analyzer = InterruptionHeatmapAnalyzer::new();

    let events = vec![
        InterruptionEvent {
            occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
            duration_minutes: 5,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Moderate,
        },
        InterruptionEvent {
            occurred_at: "2026-02-17T10:00:00+00:00".to_string(),
            duration_minutes: 3,
            source: InterruptionSource::Fatigue,
            impact: InterruptionImpact::Moderate,
        },
        InterruptionEvent {
            occurred_at: "2026-02-17T11:00:00+00:00".to_string(),
            duration_minutes: 8,
            source: InterruptionSource::Email { priority: InterruptionPriority::Low },
            impact: InterruptionImpact::Minimal,
        },
    ];

    // Filter by slack
    let slack_events = analyzer.filter_by_source(&events, "slack");
    assert_eq!(slack_events.len(), 1);

    // Filter by fatigue
    let fatigue_events = analyzer.filter_by_source(&events, "fatigue");
    assert_eq!(fatigue_events.len(), 1);

    // Filter by non-existent source
    let phone_events = analyzer.filter_by_source(&events, "phone");
    assert_eq!(phone_events.len(), 0);
}

#[test]
fn test_peak_hour_identification() {
    let analyzer = InterruptionHeatmapAnalyzer::new();

    let events = vec![
        // Monday 9:00 - 10 interruptions
        InterruptionEvent {
            occurred_at: "2026-02-16T09:00:00+00:00".to_string(),
            duration_minutes: 1,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Minimal,
        },
        // (add 9 more at same time - simulate via multiple events)
        InterruptionEvent {
            occurred_at: "2026-02-16T09:05:00+00:00".to_string(),
            duration_minutes: 1,
            source: InterruptionSource::Email { priority: InterruptionPriority::Low },
            impact: InterruptionImpact::Minimal,
        },
        // Tuesday 14:00 - 8 interruptions
        InterruptionEvent {
            occurred_at: "2026-02-17T14:00:00+00:00".to_string(),
            duration_minutes: 1,
            source: InterruptionSource::Meeting { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Minimal,
        },
    ];

    // Add more events to reach counts
    let mut all_events = events.clone();
    for i in 2..=10 {
        all_events.push(InterruptionEvent {
            occurred_at: format!("2026-02-16T09:{:02}:00+00:00", i * 5),
            duration_minutes: 1,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Minimal,
        });
    }
    for i in 2..=8 {
        all_events.push(InterruptionEvent {
            occurred_at: format!("2026-02-17T14:{:02}:00+00:00", i * 5),
            duration_minutes: 1,
            source: InterruptionSource::Meeting { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Minimal,
        });
    }

    let heatmap = analyzer.build_heatmap(&all_events);
    let peaks = analyzer.get_peak_hours(&heatmap, 5);

    // Should find Monday 9:00 as the top peak (10 interruptions)
    assert!(!peaks.is_empty());
    assert_eq!(peaks[0].0, 1);  // Monday
    assert_eq!(peaks[0].1, 9);  // 9:00
    assert_eq!(peaks[0].2, 10); // 10 interruptions
}

#[test]
fn test_empty_heatmap() {
    let analyzer = InterruptionHeatmapAnalyzer::new();
    let events: Vec<InterruptionEvent> = vec![];

    let heatmap = analyzer.build_heatmap(&events);

    assert_eq!(heatmap.total_interruptions, 0);
    assert!(heatmap.cells.iter().all(|c| c.interruption_count == 0));
    assert!(heatmap.peak_hours.is_empty());
}

#[test]
fn test_heatmap_cell_coordinates() {
    let analyzer = InterruptionHeatmapAnalyzer::new();
    let events = vec![
        InterruptionEvent {
            occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
            duration_minutes: 5,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Moderate,
        },
    ];

    let heatmap = analyzer.build_heatmap(&events);

    // Test getting cell at valid coordinates
    let cell = heatmap.get_cell(2, 9);
    assert!(cell.is_some());
    assert_eq!(cell.unwrap().interruption_count, 1);

    // Test getting cell at invalid coordinates
    let invalid_cell = heatmap.get_cell(10, 25);  // Invalid day/hour
    assert!(invalid_cell.is_none());
}

#[test]
fn test_day_and_hour_totals() {
    let analyzer = InterruptionHeatmapAnalyzer::new();

    let mut events = vec![];
    // Add 5 interruptions on Monday (day 1) at 9:00, 10:00, 11:00, 14:00, 15:00
    for hour in [9, 10, 11, 14, 15] {
        events.push(InterruptionEvent {
            occurred_at: format!("2026-02-16T{:02}:00:00+00:00", hour),
            duration_minutes: 5,
            source: InterruptionSource::Slack { priority: InterruptionPriority::Medium },
            impact: InterruptionImpact::Moderate,
        });
    }
    // Add 3 interruptions at 9:00 across different days (Mon, Tue, Wed)
    for day in [0, 1, 2] {
        events.push(InterruptionEvent {
            occurred_at: format!("2026-02-{:02}T09:00:00+00:00", 16 + day),
            duration_minutes: 5,
            source: InterruptionSource::Fatigue,
            impact: InterruptionImpact::Minimal,
        });
    }

    let heatmap = analyzer.build_heatmap(&events);

    // 2026-02-16 is Monday (day 1)
    // Total interruptions on Monday: 5 at different hours + 1 at 9:00 = 6
    // Actually wait, let me recalculate:
    // Monday (day 1) has: 9:00, 10:00, 11:00, 14:00, 15:00 = 5 events
    // Plus the extra 9:00 event on Monday from the second loop

    assert_eq!(heatmap.day_total(1), 6);  // Monday total
    assert_eq!(heatmap.hour_total(9), 8);  // 9:00 across all days
}

#[test]
fn test_interruption_event_parsing() {
    // Test parsing from database row format
    let event = InterruptionEvent::from_row(
        "2026-02-17T09:00:00+00:00".to_string(),
        "interruption:slack".to_string(),
        r#"{"priority": "medium"}"#.to_string(),
    );

    assert!(event.is_some());
    let parsed = event.unwrap();
    assert_eq!(parsed.occurred_at, "2026-02-17T09:00:00+00:00");
    assert!(matches!(parsed.source, InterruptionSource::Slack { .. }));
    assert_eq!(parsed.hour(), 9);
    assert_eq!(parsed.day_of_week(), 2);  // Tuesday
}

#[test]
fn test_interruption_event_hour_extraction() {
    let event = InterruptionEvent {
        occurred_at: "2026-02-17T14:30:00+00:00".to_string(),
        duration_minutes: 5,
        source: InterruptionSource::Fatigue,
        impact: InterruptionImpact::Moderate,
    };

    assert_eq!(event.hour(), 14);
}

#[test]
fn test_interruption_event_day_of_week_extraction() {
    // 2026-02-17 is a Tuesday
    let event = InterruptionEvent {
        occurred_at: "2026-02-17T09:00:00+00:00".to_string(),
        duration_minutes: 5,
        source: InterruptionSource::Fatigue,
        impact: InterruptionImpact::Moderate,
    };

    assert_eq!(event.day_of_week(), 2);  // Tuesday (0=Sunday)
}
