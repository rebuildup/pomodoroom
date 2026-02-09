//! Timeline and task proposal system.
//!
//! This module provides:
//! - Time gap detection between calendar events
//! - Task proposal engine based on available time slots
//! - Integration with external services (Google Calendar, Notion, Linear)

mod gap;
mod proposal;
mod item;
mod priority;

pub use gap::{TimeGap, TimeGapDetector, detect_time_gaps, TimelineEvent};
pub use proposal::{TaskProposal, ProposalEngine, ProposalReason, generate_proposals};
pub use item::{TimelineItem, TimelineItemType, TimelineItemSource};
pub use priority::{
    PriorityCalculator, PriorityWeights, PriorityConfig,
    calculate_priority, calculate_priority_with_config,
};
