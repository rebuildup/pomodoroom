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

pub mod timer;
pub mod storage;
pub mod integrations;
pub mod events;
pub mod timeline;
pub mod schedule;
pub mod scheduler;
pub mod error;

pub use timer::{TimerEngine, TimerState, StepType};
pub use storage::{Database, Config, ScheduleDb};
pub use events::Event;
pub use timeline::{TimelineItem, TimelineItemSource, TimelineItemType, TimeGap, TaskProposal};
pub use schedule::{Task, TaskCategory, Project, FixedEvent, DailyTemplate, ScheduleBlock, BlockType};
pub use scheduler::{AutoScheduler, ScheduledBlock, CalendarEvent, SchedulerConfig};
pub use error::{CoreError, DatabaseError, ConfigError, OAuthError, ValidationError};
