//! Gatekeeper Protocol - Strict intervention system for timer completion.
//!
//! When a timer completes or a break extends too long, the system gradually
//! increases the intensity of intervention to bring the user back to focus.
//!
//! ## Escalation Levels
//!
//! | Level | Name       | Timing              | Action                        |
//! |-------|------------|---------------------|-------------------------------|
//! | 0     | Calm       | Normal              | None                          |
//! | 1     | Nudge      | At completion time  | Normal notification, flash   |
//! | 2     | Alert      | +3 minutes passed   | Pinned anchor, red flashing   |
//! | 3     | Gravity    | +5 minutes passed   | Force top-most dialog         |
//!
//! ## Usage
//!
//! ```ignore
//! let mut gatekeeper = Gatekeeper::new();
//! gatekeeper.start_drifting(now_ms());
//!
//! // In a loop:
//! if let Some(action) = gatekeeper.tick(now_ms()) {
//!     match action {
//!         GatekeeperAction::PlayNotification => { /* ... */ }
//!         GatekeeperAction::ShowAlertWindow => { /* ... */ }
//!         GatekeeperAction::ForceTopMostDialog => { /* ... */ }
//!         GatekeeperAction::None => {}
//!     }
//! }
//! ```

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Gatekeeper escalation levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GatekeeperLevel {
    /// Level 0: Normal state - no intervention needed.
    Calm,
    /// Level 1: Timer completed - gentle notification.
    Nudge,
    /// Level 2: +3 minutes passed - strong alert.
    Alert,
    /// Level 3: +5 minutes passed - force top dialog.
    Gravity,
}

impl GatekeeperLevel {
    /// Get the numeric value of the level (0-3).
    pub fn as_u8(self) -> u8 {
        match self {
            GatekeeperLevel::Calm => 0,
            GatekeeperLevel::Nudge => 1,
            GatekeeperLevel::Alert => 2,
            GatekeeperLevel::Gravity => 3,
        }
    }
}

/// Action that the gatekeeper requests the UI to perform.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GatekeeperAction {
    /// No action needed.
    None,
    /// Play notification sound and flash taskbar.
    PlayNotification,
    /// Show alert window (pinned anchor, red flashing).
    ShowAlertWindow,
    /// Force top-most dialog (cannot be dismissed).
    ForceTopMostDialog,
}

/// State of the Gatekeeper Protocol.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatekeeperState {
    /// Current escalation level.
    pub level: GatekeeperLevel,
    /// When the drifting state began (epoch milliseconds), if currently drifting.
    pub drifting_since_epoch_ms: Option<u64>,
    /// Accumulated break debt in milliseconds (drift duration).
    pub break_debt_ms: u64,
    /// Threshold for Alert level (milliseconds since drift started).
    pub alert_threshold_ms: u64,
    /// Threshold for Gravity level (milliseconds since drift started).
    pub gravity_threshold_ms: u64,
}

impl Default for GatekeeperState {
    fn default() -> Self {
        Self::new()
    }
}

impl GatekeeperState {
    /// Create a new Gatekeeper state with default thresholds.
    pub fn new() -> Self {
        Self::with_thresholds(
            Duration::from_secs(180), // 3 minutes for Alert
            Duration::from_secs(300), // 5 minutes for Gravity
        )
    }

    /// Create a new Gatekeeper state with custom thresholds.
    pub fn with_thresholds(alert_threshold: Duration, gravity_threshold: Duration) -> Self {
        Self {
            level: GatekeeperLevel::Calm,
            drifting_since_epoch_ms: None,
            break_debt_ms: 0,
            alert_threshold_ms: alert_threshold.as_millis() as u64,
            gravity_threshold_ms: gravity_threshold.as_millis() as u64,
        }
    }

    /// Check if currently in a drifting state.
    pub fn is_drifting(&self) -> bool {
        self.drifting_since_epoch_ms.is_some()
    }

    /// Get the current escalation level as a number (0-3).
    pub fn escalation_level(&self) -> u8 {
        self.level.as_u8()
    }
}

/// The Gatekeeper Protocol engine.
///
/// Tracks drifting state and escalates interventions based on time elapsed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gatekeeper {
    state: GatekeeperState,
}

impl Default for Gatekeeper {
    fn default() -> Self {
        Self::new()
    }
}

impl Gatekeeper {
    /// Create a new Gatekeeper with default thresholds.
    pub fn new() -> Self {
        Self {
            state: GatekeeperState::new(),
        }
    }

    /// Create a new Gatekeeper with custom thresholds.
    pub fn with_thresholds(alert_threshold: Duration, gravity_threshold: Duration) -> Self {
        Self {
            state: GatekeeperState::with_thresholds(alert_threshold, gravity_threshold),
        }
    }

    /// Get the current state.
    pub fn state(&self) -> &GatekeeperState {
        &self.state
    }

    /// Start the drifting state (call when timer completes without user action).
    pub fn start_drifting(&mut self, now_ms: u64) -> GatekeeperAction {
        self.state.level = GatekeeperLevel::Nudge;
        self.state.drifting_since_epoch_ms = Some(now_ms);
        self.state.break_debt_ms = 0;
        GatekeeperAction::PlayNotification
    }

    /// Stop the drifting state (call when user takes action).
    pub fn stop_drifting(&mut self) {
        self.state.level = GatekeeperLevel::Calm;
        self.state.drifting_since_epoch_ms = None;
        // Note: break_debt_ms is preserved for tracking purposes
    }

    /// Reset the gatekeeper to initial state.
    pub fn reset(&mut self) {
        self.state.level = GatekeeperLevel::Calm;
        self.state.drifting_since_epoch_ms = None;
        self.state.break_debt_ms = 0;
    }

    /// Update the gatekeeper state based on elapsed time.
    /// Returns the action that should be performed, if any.
    pub fn tick(&mut self, now_ms: u64) -> GatekeeperAction {
        if let Some(since_ms) = self.state.drifting_since_epoch_ms {
            let elapsed = now_ms.saturating_sub(since_ms);
            self.state.break_debt_ms = elapsed;

            // Check for escalation
            let previous_level = self.state.level;

            if elapsed >= self.state.gravity_threshold_ms {
                self.state.level = GatekeeperLevel::Gravity;
            } else if elapsed >= self.state.alert_threshold_ms {
                self.state.level = GatekeeperLevel::Alert;
            }

            // Return action based on level change or current level
            match (previous_level, self.state.level) {
                (GatekeeperLevel::Calm, GatekeeperLevel::Nudge) => {
                    GatekeeperAction::PlayNotification
                }
                (_, GatekeeperLevel::Alert) if previous_level != GatekeeperLevel::Alert => {
                    GatekeeperAction::ShowAlertWindow
                }
                (_, GatekeeperLevel::Gravity) if previous_level != GatekeeperLevel::Gravity => {
                    GatekeeperAction::ForceTopMostDialog
                }
                _ => GatekeeperAction::None,
            }
        } else {
            GatekeeperAction::None
        }
    }

    /// Get the current action without updating state.
    pub fn current_action(&self) -> GatekeeperAction {
        match self.state.level {
            GatekeeperLevel::Calm => GatekeeperAction::None,
            GatekeeperLevel::Nudge => GatekeeperAction::PlayNotification,
            GatekeeperLevel::Alert => GatekeeperAction::ShowAlertWindow,
            GatekeeperLevel::Gravity => GatekeeperAction::ForceTopMostDialog,
        }
    }

    /// Set custom thresholds for escalation.
    pub fn set_thresholds(&mut self, alert_threshold: Duration, gravity_threshold: Duration) {
        self.state.alert_threshold_ms = alert_threshold.as_millis() as u64;
        self.state.gravity_threshold_ms = gravity_threshold.as_millis() as u64;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    #[test]
    fn gatekeeper_starts_in_calm_state() {
        let gatekeeper = Gatekeeper::new();
        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Calm);
        assert!(!gatekeeper.state().is_drifting());
    }

    #[test]
    fn start_drifting_enters_nudge_level() {
        let mut gatekeeper = Gatekeeper::new();
        let action = gatekeeper.start_drifting(now_ms());
        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Nudge);
        assert_eq!(action, GatekeeperAction::PlayNotification);
        assert!(gatekeeper.state().is_drifting());
    }

    #[test]
    fn stop_drifting_returns_to_calm() {
        let mut gatekeeper = Gatekeeper::new();
        gatekeeper.start_drifting(now_ms());
        gatekeeper.stop_drifting();
        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Calm);
        assert!(!gatekeeper.state().is_drifting());
    }

    #[test]
    fn tick_accumulates_break_debt() {
        let mut gatekeeper = Gatekeeper::new();
        gatekeeper.start_drifting(now_ms());

        // Simulate 1 second passing
        std::thread::sleep(std::time::Duration::from_millis(100));
        gatekeeper.tick(now_ms());

        assert!(gatekeeper.state().break_debt_ms >= 100);
    }

    #[test]
    fn escalation_to_alert_after_threshold() {
        let mut gatekeeper = Gatekeeper::new();
        let now = now_ms();
        gatekeeper.start_drifting(now);

        // Simulate 3+ minutes passing
        let future = now + 200_000; // 200 seconds (3 min 20 sec)
        let action = gatekeeper.tick(future);

        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Alert);
        assert_eq!(action, GatekeeperAction::ShowAlertWindow);
    }

    #[test]
    fn escalation_to_gravity_after_threshold() {
        let mut gatekeeper = Gatekeeper::new();
        let now = now_ms();
        gatekeeper.start_drifting(now);

        // Simulate 5+ minutes passing
        let future = now + 350_000; // 350 seconds (5 min 50 sec)
        let action = gatekeeper.tick(future);

        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Gravity);
        assert_eq!(action, GatekeeperAction::ForceTopMostDialog);
    }

    #[test]
    fn reset_clears_all_state() {
        let mut gatekeeper = Gatekeeper::new();
        gatekeeper.start_drifting(now_ms());
        gatekeeper.tick(now_ms() + 100_000);

        gatekeeper.reset();

        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Calm);
        assert!(!gatekeeper.state().is_drifting());
        assert_eq!(gatekeeper.state().break_debt_ms, 0);
    }

    #[test]
    fn custom_thresholds_work() {
        let alert_threshold = Duration::from_secs(60); // 1 minute
        let gravity_threshold = Duration::from_secs(120); // 2 minutes

        let mut gatekeeper = Gatekeeper::with_thresholds(alert_threshold, gravity_threshold);
        let now = now_ms();
        gatekeeper.start_drifting(now);

        // After 90 seconds: should be Alert (past 60s) but not Gravity (not past 120s)
        let future = now + 90_000;
        gatekeeper.tick(future);

        assert_eq!(gatekeeper.state().level, GatekeeperLevel::Alert);
    }

    #[test]
    fn level_as_u8_returns_correct_values() {
        assert_eq!(GatekeeperLevel::Calm.as_u8(), 0);
        assert_eq!(GatekeeperLevel::Nudge.as_u8(), 1);
        assert_eq!(GatekeeperLevel::Alert.as_u8(), 2);
        assert_eq!(GatekeeperLevel::Gravity.as_u8(), 3);
    }

    #[test]
    fn current_action_returns_correct_action() {
        let gatekeeper = Gatekeeper::new();
        assert_eq!(gatekeeper.current_action(), GatekeeperAction::None);

        let mut gatekeeper = Gatekeeper::new();
        gatekeeper.start_drifting(now_ms());
        assert_eq!(gatekeeper.current_action(), GatekeeperAction::PlayNotification);
    }
}
