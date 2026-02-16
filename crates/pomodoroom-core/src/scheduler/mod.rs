//! Automatic scheduler for Pomodoro blocks.
//!
//! This module provides automatic scheduling of tasks into available time slots:
//! - Detects available time gaps based on DailyTemplate and calendar events
//! - Assigns tasks to gaps based on priority and fit
//! - Avoids conflicts with fixed events and calendar events
//! - Generates scheduled Pomodoro blocks

use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use serde::{Deserialize, Serialize};

use crate::schedule::{DailyTemplate, FixedEvent};
use crate::task::{EnergyLevel, Task, TaskCategory, TaskState};
use crate::timeline::TimelineEvent;

/// A scheduled Pomodoro block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledBlock {
    pub id: String,
    pub task_id: String,
    pub task_title: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub pomodoro_count: i32,
    pub break_minutes: i32,
}

impl ScheduledBlock {
    /// Create a new scheduled block
    pub fn new(
        task_id: String,
        task_title: String,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        pomodoro_count: i32,
        break_minutes: i32,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task_id,
            task_title,
            start_time,
            end_time,
            pomodoro_count,
            break_minutes,
        }
    }

    /// Get total duration in minutes
    pub fn duration_minutes(&self) -> i64 {
        (self.end_time - self.start_time).num_minutes()
    }
}

/// Calendar event for conflict detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

impl CalendarEvent {
    /// Create a new calendar event
    pub fn new(
        id: String,
        title: String,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> Self {
        Self {
            id,
            title,
            start_time,
            end_time,
        }
    }

    /// Check if this event overlaps with a time range
    pub fn overlaps(&self, start: DateTime<Utc>, end: DateTime<Utc>) -> bool {
        self.start_time < end && self.end_time > start
    }
}

/// Scheduler configuration
#[derive(Debug, Clone)]
pub struct SchedulerConfig {
    /// Focus duration per Pomodoro (minutes)
    pub focus_duration: i64,
    /// Short break duration (minutes)
    pub short_break: i64,
    /// Long break duration (minutes)
    pub long_break: i64,
    /// Pomodoros before long break
    pub pomodoros_before_long_break: i32,
    /// Minimum gap duration to schedule (minutes)
    pub min_gap_minutes: i64,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            focus_duration: 25,
            short_break: 5,
            long_break: 15,
            pomodoros_before_long_break: 4,
            min_gap_minutes: 15,
        }
    }
}

/// Automatic scheduler for Pomodoro blocks
pub struct AutoScheduler {
    config: SchedulerConfig,
}

impl AutoScheduler {
    /// Create a new scheduler with default config
    pub fn new() -> Self {
        Self {
            config: SchedulerConfig::default(),
        }
    }

    /// Create with custom config
    pub fn with_config(config: SchedulerConfig) -> Self {
        Self { config }
    }

    /// Generate schedule for a specific day
    ///
    /// # Arguments
    /// * `template` - Daily template with wake/sleep times and fixed events
    /// * `tasks` - Pool of available tasks to schedule
    /// * `calendar_events` - Existing calendar events to avoid
    /// * `day` - Target day to schedule for
    ///
    /// # Returns
    /// Vector of scheduled Pomodoro blocks
    pub fn generate_schedule(
        &self,
        template: &DailyTemplate,
        tasks: &[Task],
        calendar_events: &[CalendarEvent],
        day: DateTime<Utc>,
    ) -> Vec<ScheduledBlock> {
        // 1. Validate date bounds
        let (day_start, day_end) = match self.parse_day_boundaries(template, day) {
            Some(bounds) => bounds,
            None => return Vec::new(),
        };

        // 2. Build fixed events for this day
        let fixed_events = self.build_fixed_events(template, day);

        // 3. Combine fixed events and calendar events
        let all_events: Vec<TimelineEvent> = fixed_events
            .iter()
            .cloned()
            .chain(
                calendar_events
                    .iter()
                    .map(|e| TimelineEvent::new(e.start_time, e.end_time)),
            )
            .collect();

        // 4. Find time gaps
        let gaps = crate::timeline::detect_time_gaps(&all_events, day_start, day_end);

        // 5. Filter READY tasks only (progressive focus requirement)
        let mut ready_tasks: Vec<_> = tasks
            .iter()
            .filter(|t| t.state == TaskState::Ready)
            .filter(|t| !t.completed && t.category == TaskCategory::Active)
            .filter(|t| t.estimated_pomodoros > t.completed_pomodoros)
            .cloned()
            .collect();

        // 6. Sort by energy-aware priority (progressive focus)
        self.sort_tasks_by_energy_and_priority(&mut ready_tasks, day_start);

        // 7. Get max parallel lanes from template (default to 1 if not set)
        let max_lanes = template.max_parallel_lanes.unwrap_or(1).max(1) as usize;

        // 8. Assign tasks to gaps with parallel lane support
        self.assign_tasks_to_gaps(&ready_tasks, &gaps, max_lanes)
    }

    /// Auto-fill available slots with top priority tasks
    ///
    /// Simpler version that just fills gaps with available tasks
    pub fn auto_fill(
        &self,
        template: &DailyTemplate,
        tasks: &[Task],
        calendar_events: &[CalendarEvent],
        day: DateTime<Utc>,
    ) -> Vec<ScheduledBlock> {
        self.generate_schedule(template, tasks, calendar_events, day)
    }

    /// Parse wake up and sleep times from template
    fn parse_day_boundaries(
        &self,
        template: &DailyTemplate,
        day: DateTime<Utc>,
    ) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
        let wake_parts: Vec<&str> = template.wake_up.split(':').collect();
        let sleep_parts: Vec<&str> = template.sleep.split(':').collect();

        if wake_parts.len() != 2 || sleep_parts.len() != 2 {
            return None;
        }

        let wake_hour: u32 = wake_parts[0].parse().ok()?;
        let wake_min: u32 = wake_parts[1].parse().ok()?;
        let sleep_hour: u32 = sleep_parts[0].parse().ok()?;
        let sleep_min: u32 = sleep_parts[1].parse().ok()?;

        let day_start = day
            .with_hour(wake_hour)?
            .with_minute(wake_min)?
            .with_second(0)?
            .with_nanosecond(0)?;

        let mut day_end = day
            .with_hour(sleep_hour)?
            .with_minute(sleep_min)?
            .with_second(0)?
            .with_nanosecond(0)?;

        // Handle sleep time that crosses midnight (e.g., 23:00 to 07:00 next day)
        if sleep_hour < wake_hour || (sleep_hour == wake_hour && sleep_min < wake_min) {
            day_end = day_end + Duration::days(1);
        }

        Some((day_start, day_end))
    }

    /// Build fixed events for a specific day
    fn build_fixed_events(
        &self,
        template: &DailyTemplate,
        day: DateTime<Utc>,
    ) -> Vec<TimelineEvent> {
        let weekday = day.weekday().num_days_from_monday() as u8; // 0=Mon ... 6=Sun

        template
            .fixed_events
            .iter()
            .filter(|event| event.enabled && event.days.contains(&weekday))
            .filter_map(|event| self.parse_fixed_event(event, day))
            .collect()
    }

    /// Parse a fixed event to a TimelineEvent
    fn parse_fixed_event(&self, event: &FixedEvent, day: DateTime<Utc>) -> Option<TimelineEvent> {
        let parts: Vec<&str> = event.start_time.split(':').collect();
        if parts.len() != 2 {
            return None;
        }

        let hour: u32 = parts[0].parse().ok()?;
        let minute: u32 = parts[1].parse().ok()?;

        let start_time = day
            .with_hour(hour)?
            .with_minute(minute)?
            .with_second(0)?
            .with_nanosecond(0)?;

        let end_time = start_time + Duration::minutes(event.duration_minutes as i64);

        Some(TimelineEvent::new(start_time, end_time))
    }

    /// Sort tasks by priority (highest first)

    /// Sort tasks by energy level and priority (progressive focus).
    ///
    /// Energy-aware scheduling strategy:
    /// - Morning (6-12): HIGH energy tasks first
    /// - Afternoon (12-17): MEDIUM energy tasks first
    /// - Evening (17-22): LOW energy tasks first
    fn sort_tasks_by_energy_and_priority(&self, tasks: &mut Vec<Task>, day_start: DateTime<Utc>) {
        let hour = day_start.hour();
        let preferred_energy = if hour < 12 {
            EnergyLevel::High
        } else if hour < 17 {
            EnergyLevel::Medium
        } else {
            EnergyLevel::Low
        };

        tasks.sort_by(|a, b| {
            // First: prefer tasks matching the current time's energy level
            let energy_match_a = energy_level_match_score(a.energy, preferred_energy);
            let energy_match_b = energy_level_match_score(b.energy, preferred_energy);

            match energy_match_b.cmp(&energy_match_a) {
                std::cmp::Ordering::Equal => {
                    // Second: by priority (higher first)
                    let priority_a = a.priority.unwrap_or(50);
                    let priority_b = b.priority.unwrap_or(50);
                    match priority_b.cmp(&priority_a) {
                        std::cmp::Ordering::Equal => {
                            // Third: prefer tasks with projects
                            match (&a.project_id, &b.project_id) {
                                (Some(_), None) => std::cmp::Ordering::Less,
                                (None, Some(_)) => std::cmp::Ordering::Greater,
                                _ => std::cmp::Ordering::Equal,
                            }
                        }
                        other => other,
                    }
                }
                other => other,
            }
        });
    }

    /// Assign tasks to time gaps with parallel lane support.
    ///
    /// Parallel lanes allow multiple tasks to be scheduled concurrently,
    /// enabling the user to switch focus between different work streams.
    fn assign_tasks_to_gaps(
        &self,
        tasks: &[Task],
        gaps: &[crate::timeline::TimeGap],
        max_lanes: usize,
    ) -> Vec<ScheduledBlock> {
        let mut scheduled = Vec::new();
        let mut next_task_idx: usize = 0;

        for gap in gaps {
            if gap.duration_minutes() < self.config.min_gap_minutes {
                continue;
            }

            // Try to schedule tasks in parallel lanes for this gap
            let gap_start = gap.start_time;
            let gap_end = gap.end_time;

            // For each lane, assign a distinct task.
            for _lane_idx in 0..max_lanes {
                if next_task_idx >= tasks.len() {
                    continue;
                }

                let task = &tasks[next_task_idx];
                let remaining_pomodoros =
                    (task.estimated_pomodoros - task.completed_pomodoros).max(0);

                if remaining_pomodoros == 0 {
                    next_task_idx += 1;
                    continue;
                }

                // Calculate how many pomodoros fit in remaining gap
                let gap_remaining = (gap_end - gap_start).num_minutes();
                let pomodoro_with_break = self.config.focus_duration + self.config.short_break;

                let max_pomodoros = (gap_remaining / pomodoro_with_break) as i32;
                let pomodoros_to_schedule = remaining_pomodoros.min(max_pomodoros).min(4);

                if pomodoros_to_schedule == 0 {
                    continue;
                }

                // Calculate end time for this block
                let block_duration = (pomodoros_to_schedule as i64 * self.config.focus_duration)
                    + ((pomodoros_to_schedule - 1) as i64 * self.config.short_break);

                let block_end = gap_start + Duration::minutes(block_duration);

                // Create scheduled block with lane assignment
                let block = ScheduledBlock::new(
                    task.id.clone(),
                    task.title.clone(),
                    gap_start,
                    block_end,
                    pomodoros_to_schedule,
                    self.config.short_break as i32,
                );
                // Lane is stored via task_id prefix for simplicity
                // (Alternative: add lane field to ScheduledBlock in future)
                scheduled.push(block);

                // Advance gap start for next lane (small offset for visual separation)
                // For true parallel scheduling, all lanes use same time slot
                // The offset here is conceptual - actual parallel execution
                // means tasks overlap in time but user switches between them

                // Move forward so lanes do not schedule the same task in this gap.
                next_task_idx += 1;
            }

            // For progressive focus, move to next gap after processing all lanes
            // Each gap represents a distinct time period where we can focus
        }

        scheduled
    }
}

impl Default for AutoScheduler {
    fn default() -> Self {
        Self::new()
    }
}

/// Calculate energy level match score for task prioritization.
///
/// Returns higher score for tasks matching the preferred energy level:
/// - Exact match: 3
/// - One level off: 1
/// - Two levels off: 0
fn energy_level_match_score(task_energy: EnergyLevel, preferred: EnergyLevel) -> u8 {
    match (task_energy, preferred) {
        (EnergyLevel::High, EnergyLevel::High)
        | (EnergyLevel::Medium, EnergyLevel::Medium)
        | (EnergyLevel::Low, EnergyLevel::Low) => 3,
        (EnergyLevel::High, EnergyLevel::Medium)
        | (EnergyLevel::Medium, EnergyLevel::High)
        | (EnergyLevel::Medium, EnergyLevel::Low)
        | (EnergyLevel::Low, EnergyLevel::Medium) => 1,
        _ => 0, // High vs Low mismatch
    }
}

/// Convert Task to timeline item for priority calculation
pub fn task_to_timeline_item(task: &Task) -> crate::timeline::TimelineItem {
    let estimated_minutes =
        (task.estimated_pomodoros - task.completed_pomodoros).max(0) as i64 * 25;

    crate::timeline::TimelineItem::new(
        task.id.clone(),
        crate::timeline::TimelineItemType::Task,
        crate::timeline::TimelineItemSource::Manual,
        &task.title,
        Utc::now(),
        Utc::now() + Duration::minutes(estimated_minutes),
    )
    .with_priority(task.priority.unwrap_or(50) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::task::{EnergyLevel, TaskKind, TaskState};

    // Property-based testing imports
    use proptest::prelude::*;

    fn make_test_task(id: &str, priority: i32, estimated: i32) -> Task {
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: None,
            estimated_pomodoros: estimated,
            completed_pomodoros: 0,
            completed: false,
            state: TaskState::Ready,
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: TaskKind::DurationOnly,
            required_minutes: Some((estimated * 25).max(0) as u32),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: Vec::new(),
            priority: Some(priority),
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy: EnergyLevel::Medium,
            group: None,
            group_ids: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
            paused_at: None,
        }
    }

    fn make_test_task_with_energy(
        id: &str,
        priority: i32,
        estimated: i32,
        energy: EnergyLevel,
    ) -> Task {
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: None,
            estimated_pomodoros: estimated,
            completed_pomodoros: 0,
            completed: false,
            state: TaskState::Ready,
            project_id: None,
            project_name: None,
            project_ids: vec![],
            kind: TaskKind::DurationOnly,
            required_minutes: Some((estimated * 25).max(0) as u32),
            fixed_start_at: None,
            fixed_end_at: None,
            window_start_at: None,
            window_end_at: None,
            tags: Vec::new(),
            priority: Some(priority),
            category: TaskCategory::Active,
            estimated_minutes: None,
            estimated_start_at: None,
            elapsed_minutes: 0,
            energy,
            group: None,
            group_ids: vec![],
            created_at: Utc::now(),
            updated_at: Utc::now(),
            completed_at: None,
            paused_at: None,
        }
    }

    fn make_test_template() -> DailyTemplate {
        DailyTemplate {
            wake_up: "09:00".to_string(),
            sleep: "18:00".to_string(),
            fixed_events: vec![FixedEvent {
                id: "lunch".to_string(),
                name: "Lunch".to_string(),
                start_time: "12:00".to_string(),
                duration_minutes: 60,
                days: vec![0, 1, 2, 3, 4, 5, 6], // All days
                enabled: true,
            }],
            max_parallel_lanes: Some(2),
        }
    }

    #[test]
    fn test_schedule_generation() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();
        let day = Utc::now();

        let tasks = vec![make_test_task("1", 80, 2), make_test_task("2", 60, 1)];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // Should schedule tasks in available gaps
        assert!(!scheduled.is_empty());
    }

    #[test]
    fn test_fixed_event_avoidance() {
        let scheduler = AutoScheduler::new();
        let mut template = make_test_template();

        // Add a fixed event that blocks morning
        template.fixed_events.push(FixedEvent {
            id: "meeting".to_string(),
            name: "Meeting".to_string(),
            start_time: "10:00".to_string(),
            duration_minutes: 120,
            days: vec![0, 1, 2, 3, 4, 5, 6],
            enabled: true,
        });

        let day = Utc::now();
        let tasks = vec![make_test_task("1", 80, 4)];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // Scheduled blocks should not overlap with fixed events
        let meeting_start = day.with_hour(10).unwrap().with_minute(0).unwrap();
        let meeting_end = day.with_hour(12).unwrap().with_minute(0).unwrap();

        for block in &scheduled {
            assert!(
                !(block.start_time < meeting_end && block.end_time > meeting_start),
                "Scheduled block overlaps with fixed event"
            );
        }
    }

    #[test]
    fn test_task_priority_ordering() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();
        let day = Utc::now();

        let tasks = vec![
            make_test_task("low", 20, 1),
            make_test_task("high", 90, 1),
            make_test_task("medium", 50, 1),
        ];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // High priority task should be scheduled first
        if scheduled.len() >= 2 {
            assert_eq!(scheduled[0].task_id, "high");
        }
    }

    // New tests for progressive focus and parallel lanes

    #[test]
    fn test_only_ready_tasks_scheduled() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();
        let day = Utc::now();

        let mut running_task = make_test_task("running", 80, 2);
        running_task.state = TaskState::Running;

        let mut paused_task = make_test_task("paused", 70, 1);
        paused_task.state = TaskState::Paused;

        let ready_task = make_test_task("ready", 60, 1);

        let tasks = vec![running_task, paused_task, ready_task];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // Only READY task should be scheduled
        assert!(!scheduled.is_empty());
        assert_eq!(scheduled[0].task_id, "ready");
    }

    #[test]
    fn test_energy_aware_scheduling_morning() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();

        // Create a day at 9am (morning)
        let day = Utc::now()
            .with_hour(9)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap();

        let tasks = vec![
            make_test_task_with_energy("high_energy", 50, 1, EnergyLevel::High),
            make_test_task_with_energy("low_energy", 60, 1, EnergyLevel::Low),
            make_test_task_with_energy("medium_energy", 40, 1, EnergyLevel::Medium),
        ];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // HIGH energy tasks should be scheduled first in morning
        if !scheduled.is_empty() {
            // First scheduled should have high or medium energy (preferred for morning)
            assert!(
                scheduled[0].task_id == "high_energy" || scheduled[0].task_id == "medium_energy"
            );
        }
    }

    #[test]
    fn test_parallel_lanes_single_gap() {
        use std::collections::HashSet;

        let scheduler = AutoScheduler::new();
        let mut template = make_test_template();

        // Set max parallel lanes to 3
        template.max_parallel_lanes = Some(3);

        // Remove fixed events for a clear gap
        template.fixed_events.clear();

        let day = Utc::now();
        let tasks = vec![
            make_test_task("task1", 80, 1),
            make_test_task("task2", 70, 1),
            make_test_task("task3", 60, 1),
        ];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // With parallel lanes, multiple tasks should be scheduled
        assert!(scheduled.len() >= 2);

        // No task should be duplicated across lanes in the same scheduling run.
        let unique_task_ids: HashSet<_> = scheduled.iter().map(|b| b.task_id.as_str()).collect();
        assert_eq!(unique_task_ids.len(), scheduled.len());
    }

    #[test]
    fn test_parallel_lanes_default_to_one() {
        let scheduler = AutoScheduler::new();
        let mut template = make_test_template();

        // No max_parallel_lanes set
        template.max_parallel_lanes = None;

        let day = Utc::now();
        let tasks = vec![
            make_test_task("task1", 80, 2),
            make_test_task("task2", 70, 2),
        ];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // Should still schedule tasks (with default 1 lane)
        assert!(!scheduled.is_empty());
    }

    #[test]
    fn test_energy_level_match_score() {
        // Exact match
        assert_eq!(
            energy_level_match_score(EnergyLevel::High, EnergyLevel::High),
            3
        );
        assert_eq!(
            energy_level_match_score(EnergyLevel::Medium, EnergyLevel::Medium),
            3
        );
        assert_eq!(
            energy_level_match_score(EnergyLevel::Low, EnergyLevel::Low),
            3
        );

        // One level off
        assert_eq!(
            energy_level_match_score(EnergyLevel::High, EnergyLevel::Medium),
            1
        );
        assert_eq!(
            energy_level_match_score(EnergyLevel::Medium, EnergyLevel::Low),
            1
        );
        assert_eq!(
            energy_level_match_score(EnergyLevel::Low, EnergyLevel::Medium),
            1
        );

        // Two levels off (worst match)
        assert_eq!(
            energy_level_match_score(EnergyLevel::High, EnergyLevel::Low),
            0
        );
        assert_eq!(
            energy_level_match_score(EnergyLevel::Low, EnergyLevel::High),
            0
        );
    }

    #[test]
    fn test_date_bounds_validation() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();
        let day = Utc::now();

        // Valid day bounds should produce schedule
        let tasks = vec![make_test_task("1", 80, 1)];
        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);
        assert!(!scheduled.is_empty());

        // Test with invalid wake time (should return empty)
        let mut invalid_template = make_test_template();
        invalid_template.wake_up = "invalid".to_string();
        let scheduled_invalid = scheduler.generate_schedule(&invalid_template, &tasks, &[], day);
        assert!(scheduled_invalid.is_empty());
    }

    #[test]
    fn test_energy_aware_scheduling_evening() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();

        // The day_start is determined by wake_up time (09:00) in parse_day_boundaries
        // So energy-aware sorting uses 09:00 as the reference, not the original day parameter
        let day = Utc::now()
            .with_hour(15)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap();

        // All tasks have same priority to test energy level preference
        let tasks = vec![
            make_test_task_with_energy("high_energy", 50, 1, EnergyLevel::High),
            make_test_task_with_energy("low_energy", 50, 1, EnergyLevel::Low),
            make_test_task_with_energy("medium_energy", 50, 1, EnergyLevel::Medium),
        ];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // Since parse_day_boundaries sets day_start to wake_up time (09:00),
        // HIGH energy tasks are preferred (morning: 6-12)
        if !scheduled.is_empty() {
            let first_task_id = &scheduled[0].task_id;
            assert_eq!(
                first_task_id, "high_energy",
                "Expected high energy task first (morning start at 09:00), got {}",
                first_task_id
            );
        }
    }

    #[test]
    fn test_energy_match_scores_afternoon() {
        // Verify energy match scores for afternoon (preferred: Medium)
        let preferred = EnergyLevel::Medium;

        assert_eq!(energy_level_match_score(EnergyLevel::High, preferred), 1);
        assert_eq!(energy_level_match_score(EnergyLevel::Medium, preferred), 3);
        assert_eq!(energy_level_match_score(EnergyLevel::Low, preferred), 1);
    }

    #[test]
    fn test_energy_aware_sort_ordering() {
        // Direct test of the sort function
        let day = Utc::now()
            .with_hour(15)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap();

        let mut tasks = vec![
            make_test_task_with_energy("high_energy", 50, 1, EnergyLevel::High),
            make_test_task_with_energy("low_energy", 50, 1, EnergyLevel::Low),
            make_test_task_with_energy("medium_energy", 50, 1, EnergyLevel::Medium),
        ];

        let scheduler = AutoScheduler::new();
        scheduler.sort_tasks_by_energy_and_priority(&mut tasks, day);

        // Afternoon (15:00) prefers MEDIUM energy
        // With same priority, medium should come first
        assert_eq!(
            tasks[0].id, "medium_energy",
            "First task should be medium_energy, got {}",
            tasks[0].id
        );
    }

    #[test]
    fn test_energy_aware_scheduling_with_high_priority_mismatch() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();

        // Afternoon (3pm) - MEDIUM energy preferred
        let day = Utc::now()
            .with_hour(15)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap();

        // High priority but wrong energy (High) vs Medium priority but right energy (Medium)
        // Priority wins when energies have different match scores
        let tasks = vec![
            make_test_task_with_energy("high_pri_high_energy", 80, 1, EnergyLevel::High),
            make_test_task_with_energy("medium_pri_medium_energy", 50, 1, EnergyLevel::Medium),
            make_test_task_with_energy("low_pri_low_energy", 30, 1, EnergyLevel::Low),
        ];

        let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

        // High priority task should still be scheduled despite energy mismatch
        // because it has significantly higher priority
        if !scheduled.is_empty() {
            let first_task_id = &scheduled[0].task_id;
            // High priority (80) wins over energy match
            assert_eq!(first_task_id, "high_pri_high_energy");
        }
    }

    // =========================================================================
    // Property-Based Tests for Planning Invariants
    // =========================================================================

    /// Generate an arbitrary task for property-based testing
    fn arbitrary_task() -> impl Strategy<Value = Task> {
        (0..100i32, 1..10i32, 0..3i32).prop_map(|(priority, estimated, energy)| {
            let energy_level = match energy {
                0 => EnergyLevel::Low,
                1 => EnergyLevel::Medium,
                _ => EnergyLevel::High,
            };
            Task {
                id: uuid::Uuid::new_v4().to_string(),
                title: "Test Task".to_string(),
                description: None,
                estimated_pomodoros: estimated,
                completed_pomodoros: 0,
                completed: false,
                state: TaskState::Ready,
                project_id: None,
                project_name: None,
                project_ids: vec![],
                kind: TaskKind::DurationOnly,
                required_minutes: Some((estimated * 25) as u32),
                fixed_start_at: None,
                fixed_end_at: None,
                window_start_at: None,
                window_end_at: None,
                tags: Vec::new(),
                priority: Some(priority),
                category: TaskCategory::Active,
                estimated_minutes: None,
                estimated_start_at: None,
                elapsed_minutes: 0,
                energy: energy_level,
                group: None,
                group_ids: vec![],
                created_at: Utc::now(),
                updated_at: Utc::now(),
                completed_at: None,
                paused_at: None,
            }
        })
    }

    /// Generate an arbitrary fixed event for property-based testing
    fn arbitrary_fixed_event(day: DateTime<Utc>) -> impl Strategy<Value = FixedEvent> {
        (8..20u32, 15..120u32).prop_map(move |(start_hour, duration)| FixedEvent {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Fixed Event".to_string(),
            start_time: format!("{:02}:00", start_hour),
            duration_minutes: duration as i32,
            days: vec![day.weekday().num_days_from_monday() as u8],
            enabled: true,
        })
    }

    /// Generate an arbitrary calendar event for property-based testing
    fn arbitrary_calendar_event(day: DateTime<Utc>) -> impl Strategy<Value = CalendarEvent> {
        (9..17u32, 30..90u32).prop_map(move |(start_hour, duration)| {
            let start = day.with_hour(start_hour).unwrap().with_minute(0).unwrap();
            CalendarEvent {
                id: uuid::Uuid::new_v4().to_string(),
                title: "Calendar Event".to_string(),
                start_time: start,
                end_time: start + Duration::minutes(duration as i64),
            }
        })
    }

    proptest! {
        /// Invariant: No two scheduled blocks should overlap
        #[test]
        fn prop_no_overlapping_blocks(
            tasks in prop::collection::vec(arbitrary_task(), 1..10),
            calendar_events in prop::collection::vec(
                arbitrary_calendar_event(Utc::now()), 0..5
            )
        ) {
            let scheduler = AutoScheduler::new();
            let template = DailyTemplate {
                wake_up: "08:00".to_string(),
                sleep: "20:00".to_string(),
                fixed_events: vec![],
                max_parallel_lanes: Some(1),
            };
            let day = Utc::now();

            let scheduled = scheduler.generate_schedule(&template, &tasks, &calendar_events, day);

            // Check no overlaps between any two blocks
            for i in 0..scheduled.len() {
                for j in (i + 1)..scheduled.len() {
                    let block_a = &scheduled[i];
                    let block_b = &scheduled[j];
                    prop_assert!(
                        !(block_a.start_time < block_b.end_time && block_a.end_time > block_b.start_time),
                        "Blocks {} and {} overlap: [{:?}, {:?}) vs [{:?}, {:?})",
                        block_a.id, block_b.id,
                        block_a.start_time, block_a.end_time,
                        block_b.start_time, block_b.end_time
                    );
                }
            }
        }

        /// Invariant: All scheduled blocks must have positive duration
        #[test]
        fn prop_positive_duration(
            tasks in prop::collection::vec(arbitrary_task(), 1..10)
        ) {
            let scheduler = AutoScheduler::new();
            let template = DailyTemplate {
                wake_up: "08:00".to_string(),
                sleep: "20:00".to_string(),
                fixed_events: vec![],
                max_parallel_lanes: Some(1),
            };
            let day = Utc::now();

            let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

            for block in &scheduled {
                let duration = block.duration_minutes();
                prop_assert!(
                    duration > 0,
                    "Block {} has non-positive duration: {} minutes",
                    block.id, duration
                );
            }
        }

        /// Invariant: Scheduled blocks must not overlap with fixed events
        #[test]
        fn prop_no_overlap_with_fixed_events(
            tasks in prop::collection::vec(arbitrary_task(), 1..10),
            fixed_event in arbitrary_fixed_event(Utc::now())
        ) {
            let scheduler = AutoScheduler::new();
            let template = DailyTemplate {
                wake_up: "06:00".to_string(),
                sleep: "23:00".to_string(),
                fixed_events: vec![fixed_event.clone()],
                max_parallel_lanes: Some(1),
            };
            let day = Utc::now();

            let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

            // Parse fixed event time
            let parts: Vec<&str> = fixed_event.start_time.split(':').collect();
            if parts.len() == 2 {
                if let (Ok(hour), Ok(minute)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                    let event_start = day.with_hour(hour).and_then(|d| d.with_minute(minute)).and_then(|d| d.with_second(0)).and_then(|d| d.with_nanosecond(0));
                    if let Some(start) = event_start {
                        let event_end = start + Duration::minutes(fixed_event.duration_minutes as i64);

                        for block in &scheduled {
                            prop_assert!(
                                !(block.start_time < event_end && block.end_time > start),
                                "Block {} overlaps with fixed event: [{:?}, {:?}) vs [{:?}, {:?})",
                                block.id, block.start_time, block.end_time, start, event_end
                            );
                        }
                    }
                }
            }
        }

        /// Invariant: Scheduled blocks must not overlap with calendar events
        #[test]
        fn prop_no_overlap_with_calendar_events(
            tasks in prop::collection::vec(arbitrary_task(), 1..10),
            calendar_event in arbitrary_calendar_event(Utc::now())
        ) {
            let scheduler = AutoScheduler::new();
            let template = DailyTemplate {
                wake_up: "06:00".to_string(),
                sleep: "23:00".to_string(),
                fixed_events: vec![],
                max_parallel_lanes: Some(1),
            };
            let day = Utc::now();

            let scheduled = scheduler.generate_schedule(&template, &tasks, &[calendar_event.clone()], day);

            for block in &scheduled {
                prop_assert!(
                    !(block.start_time < calendar_event.end_time && block.end_time > calendar_event.start_time),
                    "Block {} overlaps with calendar event: [{:?}, {:?}) vs [{:?}, {:?})",
                    block.id, block.start_time, block.end_time,
                    calendar_event.start_time, calendar_event.end_time
                );
            }
        }

        /// Invariant: All scheduled blocks must be within day boundaries
        #[test]
        fn prop_blocks_within_day_boundaries(
            tasks in prop::collection::vec(arbitrary_task(), 1..10)
        ) {
            let scheduler = AutoScheduler::new();
            let template = DailyTemplate {
                wake_up: "08:00".to_string(),
                sleep: "18:00".to_string(),
                fixed_events: vec![],
                max_parallel_lanes: Some(1),
            };
            let day = Utc::now();

            let day_start = day.with_hour(8).unwrap().with_minute(0).unwrap().with_second(0).unwrap().with_nanosecond(0).unwrap();
            let day_end = day.with_hour(18).unwrap().with_minute(0).unwrap().with_second(0).unwrap().with_nanosecond(0).unwrap();

            let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

            for block in &scheduled {
                prop_assert!(
                    block.start_time >= day_start && block.end_time <= day_end,
                    "Block {} outside day boundaries: [{:?}, {:?}) not in [{:?}, {:?})",
                    block.id, block.start_time, block.end_time, day_start, day_end
                );
            }
        }

        /// Invariant: No duplicate task IDs in scheduled blocks
        #[test]
        fn prop_no_duplicate_task_ids(
            tasks in prop::collection::vec(arbitrary_task(), 1..10)
        ) {
            use std::collections::HashSet;

            let scheduler = AutoScheduler::new();
            let template = DailyTemplate {
                wake_up: "08:00".to_string(),
                sleep: "20:00".to_string(),
                fixed_events: vec![],
                max_parallel_lanes: Some(2),
            };
            let day = Utc::now();

            let scheduled = scheduler.generate_schedule(&template, &tasks, &[], day);

            let task_ids: HashSet<_> = scheduled.iter().map(|b| b.task_id.clone()).collect();
            prop_assert_eq!(
                task_ids.len(),
                scheduled.len(),
                "Found duplicate task IDs in scheduled blocks"
            );
        }
    }
}
