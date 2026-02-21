//! Gatekeeper Protocol - Strict notification escalation system
//!
//! This module implements the "Gatekeeper Protocol" which ensures users
//! cannot ignore timer completion notifications indefinitely.
//!
//! ## Escalation Levels
//!
//! - **Level 0 (Nudge)**: Initial timer completion - standard notification
//! - **Level 1 (Alert)**: 3 minutes passed - more urgent notification
//! - **Level 2 (Gravity)**: 5 minutes passed - cannot be dismissed, forces action
//!
//! ## Integration with Timer Engine
//!
//! The Gatekeeper integrates with `TimerEngine::DriftingState` which tracks:
//! - `break_debt_ms`: How long the user has been drifting
//! - `escalation_level`: Current gatekeeper level (0-2)

use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};

/// Gatekeeper escalation level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GatekeeperLevel {
    /// Level 0: Standard nudge notification
    Nudge,
    /// Level 1: Alert after 3 minutes of ignoring
    Alert,
    /// Level 2: Gravity - cannot be dismissed after 5 minutes
    Gravity,
}

impl GatekeeperLevel {
    /// Get numeric level value (0-2)
    pub fn as_u8(self) -> u8 {
        match self {
            GatekeeperLevel::Nudge => 0,
            GatekeeperLevel::Alert => 1,
            GatekeeperLevel::Gravity => 2,
        }
    }

    /// Convert from numeric level value
    pub fn from_u8(value: u8) -> Self {
        match value {
            0 => GatekeeperLevel::Nudge,
            1 => GatekeeperLevel::Alert,
            _ => GatekeeperLevel::Gravity,
        }
    }
}

/// Notification channel type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationChannel {
    /// Subtle badge indicator
    Badge,
    /// Toast notification
    Toast,
    /// Modal dialog that requires interaction
    Modal,
}

/// Gatekeeper state for tracking escalation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatekeeperState {
    /// Current escalation level
    pub level: GatekeeperLevel,
    /// When the timer completed (drifting started)
    pub completed_at: DateTime<Utc>,
    /// Accumulated break debt (milliseconds)
    pub break_debt_ms: u64,
    /// Associated prompt key for tracking ignored prompts
    pub prompt_key: String,
}

/// Context for escalation decisions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscalationContext {
    /// Is DND (Do Not Disturb) enabled?
    pub is_dnd: bool,
    /// Is currently in quiet hours?
    pub is_quiet_hours: bool,
}

/// Escalation thresholds for each level
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscalationThresholds {
    /// Duration before Alert level (default: 3 minutes)
    pub alert_threshold_ms: u64,
    /// Duration before Gravity level (default: 5 minutes)
    pub gravity_threshold_ms: u64,
}

impl Default for EscalationThresholds {
    fn default() -> Self {
        Self {
            alert_threshold_ms: 3 * 60 * 1000,  // 3 minutes
            gravity_threshold_ms: 5 * 60 * 1000, // 5 minutes
        }
    }
}

/// Quiet hours policy
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuietHoursPolicy {
    pub enabled: bool,
    pub start_hour: u8,
    pub end_hour: u8,
}

impl Default for QuietHoursPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            start_hour: 22,
            end_hour: 7,
        }
    }
}

/// Gatekeeper - ensures users respond to timer completion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gatekeeper {
    state: Option<GatekeeperState>,
    thresholds: EscalationThresholds,
}

impl Default for Gatekeeper {
    fn default() -> Self {
        Self {
            state: None,
            thresholds: EscalationThresholds::default(),
        }
    }
}

impl Gatekeeper {
    /// Create a new gatekeeper with default thresholds
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a new gatekeeper with custom thresholds
    pub fn with_thresholds(thresholds: EscalationThresholds) -> Self {
        Self {
            state: None,
            thresholds,
        }
    }

    /// Start gatekeeper tracking for a completed timer
    pub fn start(&mut self, prompt_key: String, completed_at: DateTime<Utc>) {
        self.state = Some(GatekeeperState {
            level: GatekeeperLevel::Nudge,
            completed_at,
            break_debt_ms: 0,
            prompt_key,
        });
    }

    /// Stop gatekeeper tracking
    pub fn stop(&mut self) {
        self.state = None;
    }

    /// Update break debt and calculate escalation level
    pub fn tick(&mut self, now: DateTime<Utc>) {
        if let Some(ref mut state) = self.state {
            let elapsed_ms = (now - state.completed_at).num_milliseconds().max(0) as u64;
            state.break_debt_ms = elapsed_ms;

            // Update escalation level based on thresholds
            if elapsed_ms >= self.thresholds.gravity_threshold_ms {
                state.level = GatekeeperLevel::Gravity;
            } else if elapsed_ms >= self.thresholds.alert_threshold_ms {
                state.level = GatekeeperLevel::Alert;
            } else {
                state.level = GatekeeperLevel::Nudge;
            }
        }
    }

    /// Get current state
    pub fn state(&self) -> Option<&GatekeeperState> {
        self.state.as_ref()
    }

    /// Check if user can dismiss notification (Gravity level cannot be dismissed)
    pub fn can_dismiss(&self) -> bool {
        self.state
            .as_ref()
            .map(|s| s.level != GatekeeperLevel::Gravity)
            .unwrap_or(true)
    }

    /// Get appropriate notification channel based on escalation and context
    pub fn get_notification_channel(&self, context: &EscalationContext) -> NotificationChannel {
        // DND and quiet hours always force badge only
        if context.is_dnd || context.is_quiet_hours {
            return NotificationChannel::Badge;
        }

        // Otherwise, escalate based on gatekeeper level
        match self.state.as_ref().map(|s| s.level) {
            Some(GatekeeperLevel::Gravity) => NotificationChannel::Modal,
            Some(GatekeeperLevel::Alert) => NotificationChannel::Toast,
            _ => NotificationChannel::Badge,
        }
    }

    /// Check if a given time is within quiet hours
    pub fn is_quiet_hours(time: DateTime<Utc>, policy: &QuietHoursPolicy) -> bool {
        if !policy.enabled {
            return false;
        }

        let hour = time.hour();

        // Overnight window (e.g., 22:00 - 07:00)
        if policy.start_hour > policy.end_hour {
            return hour >= policy.start_hour as u32 || hour < policy.end_hour as u32;
        }

        // Daytime window (e.g., 12:00 - 17:00)
        hour >= policy.start_hour as u32 && hour < policy.end_hour as u32
    }

    /// Create prompt key for critical start notification
    pub fn critical_start_key(task_id: &str) -> String {
        format!("critical-start:{}", task_id)
    }
}

/// In-memory ignored prompt tracker (session-based)
///
/// For persistent tracking, use database storage instead.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PromptTracker {
    ignored_counts: std::collections::HashMap<String, u32>,
}

impl PromptTracker {
    /// Mark a prompt as ignored for a specific channel
    pub fn mark_ignored(&mut self, prompt_key: &str) {
        *self.ignored_counts.entry(prompt_key.to_string()).or_insert(0) += 1;
    }

    /// Acknowledge a prompt, resetting the escalation ladder
    pub fn acknowledge(&mut self, prompt_key: &str) {
        self.ignored_counts.remove(prompt_key);
    }

    /// Get ignored count for a prompt
    pub fn ignored_count(&self, prompt_key: &str) -> u32 {
        *self.ignored_counts.get(prompt_key).unwrap_or(&0)
    }

    /// Compute notification channel based on ignore count
    pub fn compute_channel(
        &self,
        prompt_key: &str,
        context: &EscalationContext,
    ) -> NotificationChannel {
        // DND always wins - only badge allowed
        if context.is_dnd {
            return NotificationChannel::Badge;
        }

        // Quiet hours always wins - only badge allowed
        if context.is_quiet_hours {
            return NotificationChannel::Badge;
        }

        // Escalation ladder based on ignore count
        let count = self.ignored_count(prompt_key);
        if count >= 2 {
            NotificationChannel::Modal
        } else if count >= 1 {
            NotificationChannel::Toast
        } else {
            NotificationChannel::Badge
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_gatekeeper_level_conversion() {
        assert_eq!(GatekeeperLevel::Nudge.as_u8(), 0);
        assert_eq!(GatekeeperLevel::Alert.as_u8(), 1);
        assert_eq!(GatekeeperLevel::Gravity.as_u8(), 2);

        assert_eq!(GatekeeperLevel::from_u8(0), GatekeeperLevel::Nudge);
        assert_eq!(GatekeeperLevel::from_u8(1), GatekeeperLevel::Alert);
        assert_eq!(GatekeeperLevel::from_u8(5), GatekeeperLevel::Gravity);
    }

    #[test]
    fn test_gatekeeper_escalation() {
        let mut gatekeeper = Gatekeeper::new();
        let completed_at = Utc::now();

        gatekeeper.start("test-prompt".to_string(), completed_at);

        // Initial state - Nudge level
        assert_eq!(
            gatekeeper.state().unwrap().level,
            GatekeeperLevel::Nudge
        );

        // After 3 minutes - Alert level
        let alert_time = completed_at + Duration::from_secs(3 * 60);
        gatekeeper.tick(alert_time);
        assert_eq!(gatekeeper.state().unwrap().level, GatekeeperLevel::Alert);

        // After 5 minutes - Gravity level
        let gravity_time = completed_at + Duration::from_secs(5 * 60);
        gatekeeper.tick(gravity_time);
        assert_eq!(
            gatekeeper.state().unwrap().level,
            GatekeeperLevel::Gravity
        );
    }

    #[test]
    fn test_can_dismiss() {
        let mut gatekeeper = Gatekeeper::new();
        let completed_at = Utc::now();

        assert!(gatekeeper.can_dismiss()); // No state = can dismiss

        gatekeeper.start("test-prompt".to_string(), completed_at);
        assert!(gatekeeper.can_dismiss()); // Nudge = can dismiss

        let alert_time = completed_at + Duration::from_secs(4 * 60);
        gatekeeper.tick(alert_time);
        assert!(gatekeeper.can_dismiss()); // Alert = can dismiss

        let gravity_time = completed_at + Duration::from_secs(6 * 60);
        gatekeeper.tick(gravity_time);
        assert!(!gatekeeper.can_dismiss()); // Gravity = cannot dismiss
    }

    #[test]
    fn test_quiet_hours_overnight() {
        let policy = QuietHoursPolicy {
            enabled: true,
            start_hour: 22,
            end_hour: 7,
        };

        // 23:00 should be in quiet hours
        let evening = Utc::now().with_hour(23).unwrap();
        assert!(Gatekeeper::is_quiet_hours(evening, &policy));

        // 03:00 should be in quiet hours
        let night = Utc::now().with_hour(3).unwrap();
        assert!(Gatekeeper::is_quiet_hours(night, &policy));

        // 10:00 should NOT be in quiet hours
        let day = Utc::now().with_hour(10).unwrap();
        assert!(!Gatekeeper::is_quiet_hours(day, &policy));
    }

    #[test]
    fn test_notification_channel_with_dnd() {
        let gatekeeper = Gatekeeper::new();
        let context = EscalationContext {
            is_dnd: true,
            is_quiet_hours: false,
        };

        // DND should force badge regardless of gatekeeper level
        assert_eq!(
            gatekeeper.get_notification_channel(&context),
            NotificationChannel::Badge
        );
    }

    #[test]
    fn test_prompt_tracker() {
        let mut tracker = PromptTracker::default();
        let context = EscalationContext {
            is_dnd: false,
            is_quiet_hours: false,
        };

        // Initially: badge
        assert_eq!(tracker.compute_channel("test", &context), NotificationChannel::Badge);

        // After 1 ignore: toast
        tracker.mark_ignored("test");
        assert_eq!(tracker.compute_channel("test", &context), NotificationChannel::Toast);

        // After 2 ignores: modal
        tracker.mark_ignored("test");
        assert_eq!(tracker.compute_channel("test", &context), NotificationChannel::Modal);

        // Acknowledge resets
        tracker.acknowledge("test");
        assert_eq!(tracker.compute_channel("test", &context), NotificationChannel::Badge);
    }

    #[test]
    fn test_critical_start_key() {
        assert_eq!(
            Gatekeeper::critical_start_key("task-123"),
            "critical-start:task-123"
        );
    }
}
