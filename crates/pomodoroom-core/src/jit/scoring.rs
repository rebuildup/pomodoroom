//! JIT scoring algorithm.
//!
//! This module provides the scoring algorithm for task suggestions,
//! considering energy matching, context continuation, drift penalty,
//! priority adjustment, and time of day preferences.

use crate::jit::context::{Context, EnergyLevel};
use crate::task::{Task, TaskCategory, TaskKind};

/// Energy matching score (±10 points).
///
/// Rewards tasks that match current energy level:
/// - High energy + high estimate = +10
/// - Medium energy + medium estimate = +5
/// - Low energy + low estimate = +10
/// - Mismatches = -5
pub fn energy_match_score(task: &Task, context: &Context) -> f64 {
    let estimate_level = if let Some(minutes) = task.estimated_minutes {
        if minutes >= 50 {
            EnergyLevel::High
        } else if minutes >= 25 {
            EnergyLevel::Medium
        } else {
            EnergyLevel::Low
        }
    } else {
        EnergyLevel::Medium // Default to medium for unknown
    };

    match (context.current_energy.level, estimate_level) {
        (EnergyLevel::High, EnergyLevel::High) => 10.0,
        (EnergyLevel::High, EnergyLevel::Medium) => 5.0,
        (EnergyLevel::High, EnergyLevel::Low) => -5.0,
        (EnergyLevel::Medium, EnergyLevel::High) => -3.0,
        (EnergyLevel::Medium, EnergyLevel::Medium) => 5.0,
        (EnergyLevel::Medium, EnergyLevel::Low) => 3.0,
        (EnergyLevel::Low, EnergyLevel::High) => -10.0,
        (EnergyLevel::Low, EnergyLevel::Medium) => -3.0,
        (EnergyLevel::Low, EnergyLevel::Low) => 10.0,
    }
}

/// Context continuation score (±5 points).
///
/// Rewards tasks that continue recent work patterns:
/// - Matching active tag = +3
/// - Matching active project = +3
/// - Both = +5
pub fn context_continuation_score(task: &Task, context: &Context) -> f64 {
    let mut score: f64 = 0.0;

    // Check tag continuity
    for tag in &task.tags {
        if context.active_tags.contains(tag) {
            score += 3.0;
            break;
        }
    }

    // Check project continuity
    if !context.active_projects.is_empty() {
        for project_id in &task.project_ids {
            if context.active_projects.contains(project_id) {
                score += 3.0;
                break;
            }
        }
    }

    // Cap at 5
    score.min(5.0)
}

/// Drift penalty (-10 points max).
///
/// Penalizes tasks that exceed available time due to drift:
/// - For small drift (< 15 min): no penalty for short tasks
/// - For large drift: -10 for long tasks
pub fn drift_penalty(task: &Task, context: &Context) -> f64 {
    if context.drift_time < 15 {
        return 0.0; // No penalty for small drift
    }

    let estimate = task.estimated_minutes.unwrap_or(25);

    // If drifted time and estimate would exceed reasonable bounds
    if context.drift_time + estimate > 60 {
        if estimate > 45 {
            10.0 // Heavy penalty for long tasks when drifted
        } else {
            5.0 // Moderate penalty for medium tasks
        }
    } else {
        0.0
    }
}

/// Priority adjustment (±15 points).
///
/// Adjusts score based on task priority:
/// - P1 (Critical): +15
/// - P2 (High): +10
/// - P3 (Medium): +5
/// - P4 (Low): 0
/// - P5 (Backlog): -5
pub fn priority_adjustment(task: &Task) -> f64 {
    match task.priority.unwrap_or(50) {
        p if p <= 20 => 15.0,  // Critical (0-20)
        p if p <= 40 => 10.0,  // High (21-40)
        p if p <= 60 => 5.0,   // Medium (41-60)
        p if p <= 80 => 0.0,   // Low (61-80)
        _ => -5.0,  // Backlog (81-100)
    }
}

/// Time of day preference (±5 points).
///
/// Adjusts score based on task characteristics vs time of day:
/// - Morning: +3 for creative/complex tasks
/// - Afternoon: +2 for routine tasks
/// - Evening: -2 for complex tasks
pub fn time_preference(task: &Task, context: &Context) -> f64 {
    // For now, use simple heuristics based on estimate
    // Longer estimates = more complex task

    let estimate = task.estimated_minutes.unwrap_or(25);

    if context.time_of_day.is_morning() {
        // Morning favors complex tasks
        if estimate >= 50 {
            5.0
        } else if estimate >= 25 {
            2.0
        } else {
            0.0
        }
    } else if context.time_of_day.is_afternoon() {
        // Afternoon is neutral
        0.0
    } else if context.time_of_day.is_evening() {
        // Evening disfavors complex tasks
        if estimate >= 50 {
            -5.0
        } else if estimate >= 25 {
            -2.0
        } else {
            2.0 // Small tasks OK in evening
        }
    } else {
        0.0
    }
}

/// Calculate combined score for a task (0-100).
///
/// Combines all scoring factors:
/// 1. Base score: 50
/// 2. Energy matching: ±10
/// 3. Context continuation: ±5
/// 4. Drift penalty: -10 max
/// 5. Priority adjustment: ±15
/// 6. Time preference: ±5
///
/// Final score is clamped to [0, 100].
pub fn calculate_score(task: &Task, context: &Context) -> f64 {
    let mut score = 50.0; // Base score

    score += energy_match_score(task, context);
    score += context_continuation_score(task, context);
    score -= drift_penalty(task, context);
    score += priority_adjustment(task);
    score += time_preference(task, context);

    // Clamp to [0, 100]
    score.max(0.0).min(100.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn make_test_task(estimate_minutes: Option<u32>, priority: u8, tag: Option<String>) -> Task {
        Task {
            id: "test-1".to_string(),
            title: "Test Task".to_string(),
            description: None,
            estimated_pomodoros: (estimate_minutes.unwrap_or(25) / 25) as i32,
            completed_pomodoros: 0,
            completed: false,
            state: crate::task::TaskState::Ready,
            project_id: None,
            project_name: None,
            project_ids: Vec::new(),
            kind: TaskKind::DurationOnly,
            required_minutes: estimate_minutes,
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: if let Some(t) = tag { vec![t] } else { Vec::new() },
            priority: Some(priority as i32),
            category: TaskCategory::Active,
            estimated_minutes: estimate_minutes,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: crate::task::EnergyLevel::Medium,
            group: None,
            group_ids: Vec::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
            paused_at: None,
            source_service: None,
            source_external_id: None,
            parent_task_id: None,
            segment_order: None,
            allow_split: false,
        }
    }

    fn make_test_context(energy: EnergyLevel, drift_time: u32, active_tags: Vec<String>) -> Context {
        Context {
            current_energy: crate::jit::context::Energy::new(energy, drift_time),
            recent_tasks: Vec::new(),
            drift_time,
            time_of_day: crate::jit::context::Hour::now(),
            active_tags,
            active_projects: Vec::new(),
        }
    }

    #[test]
    fn test_energy_match_high_high() {
        let task = make_test_task(Some(50), 3, None);
        let ctx = make_test_context(EnergyLevel::High, 0, vec![]);
        let score = energy_match_score(&task, &ctx);
        assert_eq!(score, 10.0);
    }

    #[test]
    fn test_energy_match_high_low() {
        let task = make_test_task(Some(15), 3, None);
        let ctx = make_test_context(EnergyLevel::High, 0, vec![]);
        let score = energy_match_score(&task, &ctx);
        assert_eq!(score, -5.0);
    }

    #[test]
    fn test_energy_match_low_low() {
        let task = make_test_task(Some(15), 3, None);
        let ctx = make_test_context(EnergyLevel::Low, 0, vec![]);
        let score = energy_match_score(&task, &ctx);
        assert_eq!(score, 10.0);
    }

    #[test]
    fn test_context_continuation_tag() {
        let task = make_test_task(Some(25), 3, Some("work".to_string()));
        let ctx = make_test_context(EnergyLevel::Medium, 0, vec!["work".to_string()]);
        let score = context_continuation_score(&task, &ctx);
        assert_eq!(score, 3.0);
    }

    #[test]
    fn test_context_continuation_no_tag() {
        let task = make_test_task(Some(25), 3, Some("other".to_string()));
        let ctx = make_test_context(EnergyLevel::Medium, 0, vec!["work".to_string()]);
        let score = context_continuation_score(&task, &ctx);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn test_drift_penalty_small_drift() {
        let task = make_test_task(Some(50), 3, None);
        let ctx = make_test_context(EnergyLevel::Medium, 10, vec![]);
        let score = drift_penalty(&task, &ctx);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn test_drift_penalty_large_drift_long_task() {
        let task = make_test_task(Some(50), 3, None);
        let ctx = make_test_context(EnergyLevel::Medium, 30, vec![]);
        let score = drift_penalty(&task, &ctx);
        assert_eq!(score, 10.0);
    }

    #[test]
    fn test_priority_adjustment_p1() {
        let task = make_test_task(Some(25), 10, None); // Critical (0-20)
        let score = priority_adjustment(&task);
        assert_eq!(score, 15.0);
    }

    #[test]
    fn test_priority_adjustment_p3() {
        let task = make_test_task(Some(25), 50, None); // Medium (41-60)
        let score = priority_adjustment(&task);
        assert_eq!(score, 5.0);
    }

    #[test]
    fn test_priority_adjustment_p5() {
        let task = make_test_task(Some(25), 90, None); // Backlog (81-100)
        let score = priority_adjustment(&task);
        assert_eq!(score, -5.0);
    }

    #[test]
    fn test_calculate_score_clamping() {
        // Test that score is clamped to [0, 100]
        let task = make_test_task(Some(50), 1, Some("work".to_string()));
        let ctx = make_test_context(EnergyLevel::High, 0, vec!["work".to_string()]);
        let score = calculate_score(&task, &ctx);
        assert!(score >= 0.0 && score <= 100.0);
    }

    #[test]
    fn test_calculate_score_base() {
        let task = make_test_task(Some(25), 50, None); // P50 = medium priority = 5 adjustment
        let ctx = make_test_context(EnergyLevel::Medium, 0, vec![]);
        // 50 (base) + 5 (energy match medium-medium) + 0 (no tag) + 0 (no drift) + 5 (P50)
        assert_eq!(calculate_score(&task, &ctx), 60.0);
    }
}
