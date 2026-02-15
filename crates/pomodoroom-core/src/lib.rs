//! # Pomodoroom Core Library
//!
//! This library provides the core business logic for the Pomodoroom Pomodoro timer.
//! It implements a CLI-first philosophy where all operations are available via
//! a standalone CLI binary, with the Tauri desktop application being a thin GUI
//! layer over the same core library.
//!
//! ## Architecture
//!
//! - **Timer Engine**: A wall-clock-based state machine that requires the caller
//!   to periodically invoke `tick()` for progress updates
//! - **Storage**: SQLite-based session storage and TOML-based configuration
//! - **Integrations**: Plugin system for external services (Google, Notion, Linear,
//!   GitHub, Discord, Slack)
//! - **Timeline**: Time gap detection and task proposal engine
//!
//! ## Key Components
//!
//! - [`TimerEngine`]: Core timer state machine
//! - [`Database`]: Session and statistics persistence
//! - [`Config`]: Application configuration management
//! - [`Integration`]: Trait for external service integrations

pub mod calendar;
pub mod error;
pub mod events;
pub mod integrations;
pub mod schedule;
pub mod scheduler;
pub mod storage;
pub mod task;
pub mod timeline;
pub mod timer;

pub use calendar::{AggregatedView, CalendarShardId, RoutingContext, ShardConfig, ShardPolicy, ShardRouter};
pub use error::{ConfigError, CoreError, DatabaseError, OAuthError, ValidationError};
pub use events::Event;
pub use schedule::{BlockType, DailyTemplate, FixedEvent, Project, ScheduleBlock};
pub use scheduler::{AutoScheduler, CalendarEvent, ScheduledBlock, SchedulerConfig};
pub use storage::{Config, Database, ScheduleDb};
pub use task::{EnergyLevel, Task, TaskCategory, TaskState, TaskTransitionError};
pub use timeline::{TaskProposal, TimeGap, TimelineItem, TimelineItemSource, TimelineItemType};
pub use timer::{
    InterruptionType, StepType, StreakDecayCalculator, StreakDecayConfig, StreakDecayEvent,
    StreakManager, TimerEngine, TimerState,
};
