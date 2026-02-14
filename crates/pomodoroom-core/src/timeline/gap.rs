//! Time gap detection between calendar events.
//!
//! Finds available time slots between existing events that can be used
//! for focused work.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Size category of a time gap
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GapSize {
    Small,  // 15-29 minutes
    Medium, // 30-59 minutes
    Large,  // 60+ minutes
}

impl GapSize {
    /// Categorize a gap by its duration in minutes
    pub fn from_minutes(minutes: i64) -> Self {
        if minutes < 30 {
            Self::Small
        } else if minutes < 60 {
            Self::Medium
        } else {
            Self::Large
        }
    }

    /// Get the minimum duration for this gap size
    pub fn min_minutes(&self) -> i64 {
        match self {
            Self::Small => 15,
            Self::Medium => 30,
            Self::Large => 60,
        }
    }
}

/// A detected time gap between events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeGap {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub size: GapSize,
}

impl TimeGap {
    /// Create a new time gap
    pub fn new(start_time: DateTime<Utc>, end_time: DateTime<Utc>) -> Option<Self> {
        let duration = (end_time - start_time).num_minutes();
        if duration < 15 {
            return None; // Too small to be useful
        }

        Some(Self {
            start_time,
            end_time,
            size: GapSize::from_minutes(duration),
        })
    }

    /// Get duration in minutes
    pub fn duration_minutes(&self) -> i64 {
        (self.end_time - self.start_time).num_minutes()
    }

    /// Check if this gap can fit a task of given duration
    pub fn can_fit(&self, minutes: i64) -> bool {
        self.duration_minutes() >= minutes
    }
}

/// Detector for finding time gaps in a schedule
pub struct TimeGapDetector {
    /// Minimum gap duration to detect (in minutes)
    min_gap_minutes: i64,
}

impl TimeGapDetector {
    /// Create a new detector with default settings (15 min minimum)
    pub fn new() -> Self {
        Self {
            min_gap_minutes: 15,
        }
    }

    /// Set the minimum gap duration
    pub fn with_min_gap(mut self, minutes: i64) -> Self {
        self.min_gap_minutes = minutes;
        self
    }

    /// Find gaps between events in a day
    ///
    /// # Arguments
    /// * `events` - Existing events/timeline items
    /// * `day_start` - Start of the day to check
    /// * `day_end` - End of the day to check
    ///
    /// # Returns
    /// Vector of time gaps sorted by start time
    pub fn find_gaps(
        &self,
        events: &[TimelineEvent],
        day_start: DateTime<Utc>,
        day_end: DateTime<Utc>,
    ) -> Vec<TimeGap> {
        let mut gaps = Vec::new();

        // Sort events by start time
        let mut sorted_events: Vec<_> = events.to_vec();
        sorted_events.sort_by_key(|e| e.start_time);

        let mut last_end = day_start;

        for event in &sorted_events {
            // Skip events that end before our current position
            if event.end_time <= last_end {
                continue;
            }

            // Skip events that start after day end
            if event.start_time >= day_end {
                break;
            }

            // Check if there's a gap between last_end and this event
            if event.start_time > last_end {
                let gap_end = event.start_time.min(day_end);
                if let Some(gap) = TimeGap::new(last_end, gap_end) {
                    if gap.duration_minutes() >= self.min_gap_minutes {
                        gaps.push(gap);
                    }
                }
            }

            // Update last_end to the end of this event (if it extends further)
            if event.end_time > last_end {
                last_end = event.end_time.min(day_end);
            }
        }

        // Check for gap after last event
        if last_end < day_end {
            if let Some(gap) = TimeGap::new(last_end, day_end) {
                if gap.duration_minutes() >= self.min_gap_minutes {
                    gaps.push(gap);
                }
            }
        }

        gaps
    }
}

impl Default for TimeGapDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// Simplified event representation for gap detection
#[derive(Debug, Clone)]
pub struct TimelineEvent {
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

impl TimelineEvent {
    pub fn new(start_time: DateTime<Utc>, end_time: DateTime<Utc>) -> Self {
        Self {
            start_time,
            end_time,
        }
    }

    /// Get duration in minutes
    pub fn duration_minutes(&self) -> i64 {
        (self.end_time - self.start_time).num_minutes()
    }
}

/// Convenience function to find gaps with default settings
pub fn detect_time_gaps(
    events: &[TimelineEvent],
    day_start: DateTime<Utc>,
    day_end: DateTime<Utc>,
) -> Vec<TimeGap> {
    TimeGapDetector::new().find_gaps(events, day_start, day_end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gap_size_classification() {
        assert_eq!(GapSize::from_minutes(15), GapSize::Small);
        assert_eq!(GapSize::from_minutes(29), GapSize::Small);
        assert_eq!(GapSize::from_minutes(30), GapSize::Medium);
        assert_eq!(GapSize::from_minutes(59), GapSize::Medium);
        assert_eq!(GapSize::from_minutes(60), GapSize::Large);
        assert_eq!(GapSize::from_minutes(120), GapSize::Large);
    }

    #[test]
    fn test_time_gap_creation() {
        let start = Utc::now();
        let end = start + chrono::Duration::minutes(30);

        let gap = TimeGap::new(start, end);
        assert!(gap.is_some());
        assert_eq!(gap.unwrap().duration_minutes(), 30);

        // Too small
        let small_end = start + chrono::Duration::minutes(10);
        assert!(TimeGap::new(start, small_end).is_none());
    }

    #[test]
    fn test_find_gaps() {
        let day_start = Utc::now();
        let day_end = day_start + chrono::Duration::hours(24);

        let events = vec![
            TimelineEvent::new(
                day_start + chrono::Duration::hours(9),
                day_start + chrono::Duration::hours(10),
            ),
            TimelineEvent::new(
                day_start + chrono::Duration::hours(11),
                day_start + chrono::Duration::hours(12),
            ),
        ];

        let gaps = detect_time_gaps(&events, day_start, day_end);
        assert!(!gaps.is_empty());

        // Should find a gap from start to 9am, 10am-11am, and 12pm-end
        assert!(gaps.len() >= 2);
    }
}
