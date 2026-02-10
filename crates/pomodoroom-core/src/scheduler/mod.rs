//! Automatic scheduler for Pomodoro blocks.
//!
//! This module provides automatic scheduling of tasks into available time slots:
//! - Detects available time gaps based on DailyTemplate and calendar events
//! - Assigns tasks to gaps based on priority and fit
//! - Avoids conflicts with fixed events and calendar events
//! - Generates scheduled Pomodoro blocks

use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use serde::{Deserialize, Serialize};

use crate::schedule::{DailyTemplate, FixedEvent, Task, TaskCategory};
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
    pub fn new(id: String, title: String, start_time: DateTime<Utc>, end_time: DateTime<Utc>) -> Self {
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
        // 1. Parse day boundaries from template
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
            .chain(calendar_events.iter().map(|e| TimelineEvent::new(e.start_time, e.end_time)))
            .collect();

        // 4. Find time gaps
        let gaps = crate::timeline::detect_time_gaps(&all_events, day_start, day_end);

        // 5. Filter active tasks and sort by priority
        let mut active_tasks: Vec<_> = tasks
            .iter()
            .filter(|t| !t.completed && t.category == TaskCategory::Active)
            .filter(|t| t.estimated_pomodoros > t.completed_pomodoros)
            .cloned()
            .collect();

        self.sort_tasks_by_priority(&mut active_tasks);

        // 6. Assign tasks to gaps
        let mut scheduled = Vec::new();
        let mut task_index = 0;

        for gap in gaps {
            if gap.duration_minutes() < self.config.min_gap_minutes {
                continue;
            }

            // Try to fit tasks in this gap
            let mut gap_start = gap.start_time;
            let gap_end = gap.end_time;

            while task_index < active_tasks.len() && gap_start < gap_end {
                let task = &active_tasks[task_index];
                let remaining_pomodoros = task.estimated_pomodoros - task.completed_pomodoros;

                if remaining_pomodoros <= 0 {
                    task_index += 1;
                    continue;
                }

                // Calculate how many pomodoros fit in remaining gap
                let gap_remaining = (gap_end - gap_start).num_minutes();
                let pomodoro_with_break = self.config.focus_duration + self.config.short_break;

                let max_pomodoros = (gap_remaining / pomodoro_with_break) as i32;
                let pomodoros_to_schedule = remaining_pomodoros.min(max_pomodoros).min(4); // Max 4 per block

                if pomodoros_to_schedule == 0 {
                    break;
                }

                // Calculate end time for this block
                let block_duration = (pomodoros_to_schedule as i64 * self.config.focus_duration)
                    + ((pomodoros_to_schedule - 1) as i64 * self.config.short_break);

                let block_end = gap_start + Duration::minutes(block_duration);

                // Create scheduled block
                scheduled.push(ScheduledBlock::new(
                    task.id.clone(),
                    task.title.clone(),
                    gap_start,
                    block_end,
                    pomodoros_to_schedule,
                    self.config.short_break as i32,
                ));

                gap_start = block_end + Duration::minutes(self.config.short_break);

                // Move to next task if we used all remaining pomodoros
                if pomodoros_to_schedule >= remaining_pomodoros {
                    task_index += 1;
                }
            }
        }

        scheduled
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
    fn build_fixed_events(&self, template: &DailyTemplate, day: DateTime<Utc>) -> Vec<TimelineEvent> {
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
    fn sort_tasks_by_priority(&self, tasks: &mut Vec<Task>) {
        tasks.sort_by(|a, b| {
            // First by explicit priority
            let priority_a = a.priority.unwrap_or(50);
            let priority_b = b.priority.unwrap_or(50);

            // Then by deadline (if any)
            match priority_b.cmp(&priority_a) {
                std::cmp::Ordering::Equal => {
                    match (&a.project_id, &b.project_id) {
                        // Prefer tasks with projects
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        _ => std::cmp::Ordering::Equal,
                    }
                }
                other => other,
            }
        });
    }
}

impl Default for AutoScheduler {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert Task to timeline item for priority calculation
pub fn task_to_timeline_item(task: &Task) -> crate::timeline::TimelineItem {
    let estimated_minutes = (task.estimated_pomodoros - task.completed_pomodoros).max(0) as i64 * 25;

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

    fn make_test_task(id: &str, priority: i32, estimated: i32) -> Task {
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: None,
            estimated_pomodoros: estimated,
            completed_pomodoros: 0,
            completed: false,
            project_id: None,
            tags: Vec::new(),
            priority: Some(priority),
            category: TaskCategory::Active,
            created_at: Utc::now(),
        }
    }

    fn make_test_template() -> DailyTemplate {
        DailyTemplate {
            wake_up: "09:00".to_string(),
            sleep: "18:00".to_string(),
            fixed_events: vec![
                FixedEvent {
                    id: "lunch".to_string(),
                    name: "Lunch".to_string(),
                    start_time: "12:00".to_string(),
                    duration_minutes: 60,
                    days: vec![0, 1, 2, 3, 4, 5, 6], // All days
                    enabled: true,
                },
            ],
            max_parallel_lanes: Some(2),
        }
    }

    #[test]
    fn test_schedule_generation() {
        let scheduler = AutoScheduler::new();
        let template = make_test_template();
        let day = Utc::now();

        let tasks = vec![
            make_test_task("1", 80, 2),
            make_test_task("2", 60, 1),
        ];

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
}
