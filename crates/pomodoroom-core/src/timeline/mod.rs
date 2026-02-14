//! Timeline and task proposal system.
//!
//! This module provides:
//! - Time gap detection between calendar events
//! - Task proposal engine based on available time slots
//! - Integration with external services (Google Calendar, Notion, Linear)

mod gap;
mod item;
mod priority;
mod proposal;

pub use gap::{detect_time_gaps, TimeGap, TimeGapDetector, TimelineEvent};
pub use item::{TimelineItem, TimelineItemSource, TimelineItemType};
pub use priority::{
    calculate_priority, calculate_priority_with_config, PriorityCalculator, PriorityConfig,
    PriorityWeights,
};
pub use proposal::{generate_proposals, ProposalEngine, ProposalReason, TaskProposal};
