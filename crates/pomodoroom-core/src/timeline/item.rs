//! Timeline item types and utilities.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Source of a timeline item (external service or manual)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimelineItemSource {
    Google,
    Notion,
    Linear,
    GitHub,
    Manual,
}

impl TimelineItemSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::Notion => "notion",
            Self::Linear => "linear",
            Self::GitHub => "github",
            Self::Manual => "manual",
        }
    }
}

/// Type of timeline item
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimelineItemType {
    Event,   // Calendar event
    Task,    // Task from todo list
    Session, // Pomodoro session
    Gap,     // Available time slot
}

impl TimelineItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Event => "event",
            Self::Task => "task",
            Self::Session => "session",
            Self::Gap => "gap",
        }
    }
}

/// A single item on the timeline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: TimelineItemType,
    pub source: TimelineItemSource,
    pub title: String,
    pub description: Option<String>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub priority: Option<u8>, // 0-100
    pub deadline: Option<DateTime<Utc>>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub url: Option<String>,
    #[serde(flatten)]
    pub metadata: serde_json::Value,
}

impl TimelineItem {
    /// Create a new timeline item
    pub fn new(
        id: impl Into<String>,
        item_type: TimelineItemType,
        source: TimelineItemSource,
        title: impl Into<String>,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
    ) -> Self {
        Self {
            id: id.into(),
            item_type,
            source,
            title: title.into(),
            description: None,
            start_time,
            end_time,
            completed: false,
            priority: None,
            deadline: None,
            tags: Vec::new(),
            url: None,
            metadata: serde_json::json!({}),
        }
    }

    /// Get duration in minutes
    pub fn duration_minutes(&self) -> i64 {
        (self.end_time - self.start_time).num_minutes()
    }

    /// Check if this item overlaps with another
    pub fn overlaps(&self, other: &Self) -> bool {
        self.start_time < other.end_time && self.end_time > other.start_time
    }

    /// Add a tag
    pub fn with_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    /// Set priority
    pub fn with_priority(mut self, priority: u8) -> Self {
        self.priority = Some(priority.min(100));
        self
    }

    /// Set deadline
    pub fn with_deadline(mut self, deadline: DateTime<Utc>) -> Self {
        self.deadline = Some(deadline);
        self
    }

    /// Mark as completed
    pub fn with_completed(mut self, completed: bool) -> Self {
        self.completed = completed;
        self
    }
}
