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
pub mod bayesian_tuner;
pub mod checkin;
pub mod context_switch;
pub mod error;
pub mod events;
pub mod feature_flags;
pub mod focus_windows;
pub mod handoff;
pub mod integrations;
pub mod interruption_budget;
pub mod long_break_placement;
pub mod onboarding;
pub mod pair_focus;
pub mod policy;
pub mod robustness;
pub mod schedule;
pub mod scheduler;
pub mod scoring;
pub mod simulation;
pub mod stats;
pub mod storage;
pub mod task;
pub mod timeline;
pub mod timer;

pub use calendar::{AggregatedView, CalendarShardId, RoutingContext, ShardConfig, ShardPolicy, ShardRouter};
pub use bayesian_tuner::{BayesianBreakTuner, BreakLengthSummary, BreakObservation, BreakTuningConfig, TunerState, TuningDecision};
pub use checkin::{Blocker, CheckinConfig, CheckinGenerator, CheckinInput, CheckinSummary, CompletedSegment, PostingDestination, PostingResult, SourceLink};
pub use context_switch::{ContextId, SwitchCostMatrix, SwitchOverheadReport};
pub use error::{ConfigError, CoreError, DatabaseError, OAuthError, ValidationError};
pub use events::Event;
pub use feature_flags::{FeatureFlag, FlagContext, FlagDiagnostics, FlagId, FlagManager, FlagParameter, FlagState, FlagValue, FromFlagParameter, RolloutRule, RuleAction, RuleCondition};
pub use focus_windows::{AlternativeSlot, ConflictSeverity, DndPlatform, DndSyncError, DndSyncResult, DndSyncStatus, FocusWindow, FocusWindowConfig, FocusWindowError, FocusWindowManager, OverlapConflict, PrivacyLevel, PublishedFocusWindow, UserId, WindowId, WorkspaceSharingSettings, WorkspaceId};
pub use handoff::{ActivityEntry, ActivityType, BlockerInfo, BlockerType, EffortEstimate, HandoffError, HandoffGenerator, HandoffHistoryEntry, HandoffPacket, HandoffState, HandoffTaskState, NextStep, PacketId, Reference, ReferenceType, SessionContext, StepPriority, TaskId, TaskLink, TaskRelationship};
pub use interruption_budget::{InterruptionBudgetConfig, InterruptionBudgetTracker, InterruptionDashboard, InterruptionRecord, InterruptionRisk, InterruptionStats, PolicyRecommendation, RecommendationType, TeamStats, TrendAnalysis, TypeStats};
pub use long_break_placement::{BreakCandidate, LongBreakConfig, LongBreakPlacer, PlacementResult};
pub use onboarding::{EnergyCurveType, OnboardingWizard, QuestionCategory, QuestionChoice, QuestionResponse, ScoreAdjustments, SessionId, StarterProfile, WizardConfig, WizardError, WizardProgress, WizardQuestion, WizardSession};
pub use pair_focus::{AttendanceEntry, AttendanceEvent, OptOutReason, OptOutRecord, PairFocusError, PairFocusManager, Participant, ParticipantId, ParticipantStatus, ParticipantSummary, RoomId, RoomState, SessionPhase, SessionSummary, SharedPolicy, SharedSessionRoom, Vote};
pub use policy::{parse_version, check_compatibility, Compatibility, PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
pub use robustness::{MonteCarloConfig, MonteCarloSimulator, RiskLevel, RobustnessResult, TaskRobustnessInfo};
pub use schedule::{BlockType, DailyTemplate, FixedEvent, Project, ScheduleBlock};
pub use scheduler::{AutoScheduler, CalendarEvent, ScheduledBlock, SchedulerConfig};
pub use scoring::{BenchmarkResult, ObjectiveTerm, ObjectiveWeights, Ordering, ScoreBreakdown, ScoringContext, ScoringEngine};
pub use simulation::{DeterministicRng, SimulationHarness, SimulationMetrics, SimulationResult, SimulationScenario, SimulationSeed, ScenarioVariation};
pub use stats::{BreakAdherenceStats, BreakAdherenceReport, BreakAdherenceAnalyzer};
pub use storage::{Config, Database, ScheduleDb};
pub use task::{EnergyLevel, Task, TaskCategory, TaskState, TaskTransitionError};
pub use timeline::{TaskProposal, TimeGap, TimelineItem, TimelineItemSource, TimelineItemType};
pub use timer::{
    InterruptionType, StepType, StreakDecayCalculator, StreakDecayConfig, StreakDecayEvent,
    StreakManager, TimerEngine, TimerState,
};
