mod engine;
mod gatekeeper;
mod schedule;
mod streak_decay;

pub use engine::{DriftingState, TimerEngine, TimerState};
pub use gatekeeper::{
    EscalationContext, EscalationThresholds, Gatekeeper, GatekeeperLevel, GatekeeperState,
    NotificationChannel, PromptTracker, QuietHoursPolicy,
};
pub use schedule::{Schedule, Step, StepType};
pub use streak_decay::{
    InterruptionType, StreakDecayCalculator, StreakDecayConfig, StreakDecayEvent, StreakManager,
};
