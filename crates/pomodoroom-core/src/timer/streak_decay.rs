//! Interruption-aware streak decay model.
//!
//! This module implements a weighted decay system for focus streaks
//! based on interruption types. Different interruptions have different
//! impacts on the streak value.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

/// Types of interruptions that can affect streak decay
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptionType {
    /// User voluntarily paused the timer
    VoluntaryPause,
    /// Quick context check (within grace window)
    QuickCheck,
    /// External notification/distraction
    ExternalNotification,
    /// System forced interruption (meeting, call)
    ForcedInterruption,
    /// Extended break (over 5 minutes)
    ExtendedBreak,
}

impl InterruptionType {
    /// Get the decay factor for this interruption type
    /// Returns value between 0.0 (no decay) and 1.0 (full reset)
    pub fn decay_factor(&self) -> f64 {
        match self {
            InterruptionType::VoluntaryPause => 0.1,        // 10% decay
            InterruptionType::QuickCheck => 0.05,           // 5% decay (minimal)
            InterruptionType::ExternalNotification => 0.25, // 25% decay
            InterruptionType::ForcedInterruption => 0.5,    // 50% decay
            InterruptionType::ExtendedBreak => 0.75,        // 75% decay
        }
    }

    /// Human-readable description of the interruption
    pub fn description(&self) -> &'static str {
        match self {
            InterruptionType::VoluntaryPause => "Voluntary pause",
            InterruptionType::QuickCheck => "Quick context check",
            InterruptionType::ExternalNotification => "External notification",
            InterruptionType::ForcedInterruption => "Forced interruption",
            InterruptionType::ExtendedBreak => "Extended break",
        }
    }
}

/// Configuration for streak decay behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreakDecayConfig {
    /// Grace window duration for quick checks (seconds)
    pub grace_window_seconds: i64,
    /// Minimum streak value before decay
    pub min_streak: u32,
    /// Maximum streak value
    pub max_streak: u32,
    /// Whether to log decay events
    pub enable_logging: bool,
}

impl Default for StreakDecayConfig {
    fn default() -> Self {
        Self {
            grace_window_seconds: 30, // 30 seconds grace window
            min_streak: 0,
            max_streak: 100,
            enable_logging: true,
        }
    }
}

/// A streak decay event log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreakDecayEvent {
    /// Timestamp of the decay event
    pub timestamp: DateTime<Utc>,
    /// Type of interruption that caused decay
    pub interruption_type: InterruptionType,
    /// Streak value before decay
    pub streak_before: u32,
    /// Streak value after decay
    pub streak_after: u32,
    /// Decay amount applied
    pub decay_amount: f64,
    /// Human-readable reason
    pub reason: String,
    /// Duration of the interruption (if known)
    pub interruption_duration: Option<Duration>,
}

/// Streak decay calculator
pub struct StreakDecayCalculator {
    config: StreakDecayConfig,
}

impl StreakDecayCalculator {
    /// Create a new calculator with default config
    pub fn new() -> Self {
        Self {
            config: StreakDecayConfig::default(),
        }
    }

    /// Create with custom config
    pub fn with_config(config: StreakDecayConfig) -> Self {
        Self { config }
    }

    /// Calculate the decayed streak value
    ///
    /// # Arguments
    /// * `current_streak` - Current streak value
    /// * `interruption_type` - Type of interruption
    /// * `interruption_duration` - Optional duration of interruption
    ///
    /// # Returns
    /// New streak value after decay
    pub fn calculate_decay(
        &self,
        current_streak: u32,
        interruption_type: InterruptionType,
        interruption_duration: Option<Duration>,
    ) -> u32 {
        let base_factor = interruption_type.decay_factor();

        // Adjust factor based on interruption duration
        let adjusted_factor = if let Some(duration) = interruption_duration {
            self.adjust_factor_by_duration(base_factor, duration)
        } else {
            base_factor
        };

        let decay_amount = (current_streak as f64 * adjusted_factor).floor() as u32;
        // Ensure at least 1 decay for non-zero streaks to prevent stagnation
        let decay_amount = if current_streak > 0 && decay_amount == 0 {
            1
        } else {
            decay_amount
        };
        let new_streak = current_streak.saturating_sub(decay_amount);

        new_streak.clamp(self.config.min_streak, self.config.max_streak)
    }

    /// Create a decay event log entry
    pub fn create_decay_event(
        &self,
        streak_before: u32,
        interruption_type: InterruptionType,
        interruption_duration: Option<Duration>,
    ) -> StreakDecayEvent {
        let streak_after =
            self.calculate_decay(streak_before, interruption_type, interruption_duration);
        let decay_amount =
            (streak_before as f64 - streak_after as f64) / streak_before.max(1) as f64;

        let reason = self.generate_reason(interruption_type, interruption_duration);

        StreakDecayEvent {
            timestamp: Utc::now(),
            interruption_type,
            streak_before,
            streak_after,
            decay_amount,
            reason,
            interruption_duration,
        }
    }

    /// Adjust decay factor based on interruption duration
    fn adjust_factor_by_duration(&self, base_factor: f64, duration: Duration) -> f64 {
        let seconds = duration.num_seconds();

        if seconds <= self.config.grace_window_seconds {
            // Within grace window - treat as quick check
            return InterruptionType::QuickCheck.decay_factor();
        }

        // Increase decay for longer interruptions (up to 2x)
        let multiplier = 1.0 + (seconds as f64 / 300.0).min(1.0); // Max 2x at 5 minutes
        (base_factor * multiplier).min(1.0)
    }

    /// Generate human-readable reason for the decay
    fn generate_reason(
        &self,
        interruption_type: InterruptionType,
        duration: Option<Duration>,
    ) -> String {
        let base_reason = match interruption_type {
            InterruptionType::VoluntaryPause => "You paused the timer voluntarily",
            InterruptionType::QuickCheck => "Quick context check within grace window",
            InterruptionType::ExternalNotification => "External notification caused distraction",
            InterruptionType::ForcedInterruption => "Meeting or call interrupted your focus",
            InterruptionType::ExtendedBreak => "Extended break reduced streak",
        };

        if let Some(d) = duration {
            let seconds = d.num_seconds();
            if seconds < 60 {
                format!("{} ({} seconds)", base_reason, seconds)
            } else {
                let minutes = seconds / 60;
                format!("{} ({} minutes)", base_reason, minutes)
            }
        } else {
            base_reason.to_string()
        }
    }

    /// Get recommended focus duration adjustment based on streak
    /// Returns adjustment in minutes (can be negative for shorter sessions)
    pub fn get_focus_duration_adjustment(&self, streak: u32) -> i64 {
        match streak {
            0..=5 => -5,   // Shorten sessions when streak is low
            6..=15 => 0,   // Normal duration
            16..=30 => 5,  // Extend slightly for good streak
            31..=50 => 10, // Extend more
            _ => 15,       // Maximum extension
        }
    }

    /// Generate UI explanation for why focus length changed
    pub fn explain_focus_length_change(
        &self,
        streak_before: u32,
        streak_after: u32,
        base_duration: i64,
    ) -> String {
        let adjustment_before = self.get_focus_duration_adjustment(streak_before);
        let adjustment_after = self.get_focus_duration_adjustment(streak_after);
        let new_duration = base_duration + adjustment_after;

        if streak_after < streak_before {
            let lost = streak_before - streak_after;
            format!(
                "Focus streak decreased by {}. Next session adjusted to {} minutes (from {} minutes).",
                lost, new_duration, base_duration + adjustment_before
            )
        } else if streak_after > streak_before {
            format!(
                "Focus streak increased! Next session adjusted to {} minutes.",
                new_duration
            )
        } else {
            format!(
                "Focus streak unchanged. Next session remains {} minutes.",
                new_duration
            )
        }
    }
}

impl Default for StreakDecayCalculator {
    fn default() -> Self {
        Self::new()
    }
}

/// Streak manager that tracks current streak and handles decay
pub struct StreakManager {
    calculator: StreakDecayCalculator,
    current_streak: u32,
    decay_history: Vec<StreakDecayEvent>,
}

impl StreakManager {
    pub fn new() -> Self {
        Self {
            calculator: StreakDecayCalculator::new(),
            current_streak: 0,
            decay_history: Vec::new(),
        }
    }

    pub fn with_config(config: StreakDecayConfig) -> Self {
        Self {
            calculator: StreakDecayCalculator::with_config(config),
            current_streak: 0,
            decay_history: Vec::new(),
        }
    }

    /// Get current streak value
    pub fn current_streak(&self) -> u32 {
        self.current_streak
    }

    /// Increment streak (successful focus session)
    pub fn increment_streak(&mut self) {
        self.current_streak = (self.current_streak + 1).min(self.calculator.config.max_streak);
    }

    /// Apply decay for interruption
    pub fn apply_interruption(
        &mut self,
        interruption_type: InterruptionType,
        duration: Option<Duration>,
    ) -> StreakDecayEvent {
        let event =
            self.calculator
                .create_decay_event(self.current_streak, interruption_type, duration);

        self.current_streak = event.streak_after;

        if self.calculator.config.enable_logging {
            self.decay_history.push(event.clone());
        }

        event
    }

    /// Get decay history
    pub fn decay_history(&self) -> &[StreakDecayEvent] {
        &self.decay_history
    }

    /// Clear decay history
    pub fn clear_history(&mut self) {
        self.decay_history.clear();
    }

    /// Reset streak to zero
    pub fn reset_streak(&mut self) {
        self.current_streak = 0;
    }

    /// Get calculator reference
    pub fn calculator(&self) -> &StreakDecayCalculator {
        &self.calculator
    }
}

impl Default for StreakManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interruption_type_decay_factors() {
        assert_eq!(InterruptionType::QuickCheck.decay_factor(), 0.05);
        assert_eq!(InterruptionType::VoluntaryPause.decay_factor(), 0.1);
        assert_eq!(InterruptionType::ExternalNotification.decay_factor(), 0.25);
        assert_eq!(InterruptionType::ForcedInterruption.decay_factor(), 0.5);
        assert_eq!(InterruptionType::ExtendedBreak.decay_factor(), 0.75);
    }

    #[test]
    fn test_decay_calculation() {
        let calculator = StreakDecayCalculator::new();

        // Test voluntary pause (10% decay)
        let new_streak = calculator.calculate_decay(50, InterruptionType::VoluntaryPause, None);
        assert_eq!(new_streak, 45); // 50 - (50 * 0.1) = 45

        // Test forced interruption (50% decay)
        let new_streak = calculator.calculate_decay(50, InterruptionType::ForcedInterruption, None);
        assert_eq!(new_streak, 25); // 50 - (50 * 0.5) = 25
    }

    #[test]
    fn test_grace_window() {
        let calculator = StreakDecayCalculator::new();

        // 20 seconds - within grace window
        let duration = Duration::seconds(20);
        let new_streak =
            calculator.calculate_decay(50, InterruptionType::ExternalNotification, Some(duration));
        // Should use QuickCheck factor (5%)
        assert_eq!(new_streak, 48); // 50 - (50 * 0.05) = 47.5 -> 48
    }

    #[test]
    fn test_long_interruption_decay() {
        let calculator = StreakDecayCalculator::new();

        // 5 minutes - extended decay
        let duration = Duration::minutes(5);
        let new_streak =
            calculator.calculate_decay(50, InterruptionType::ExternalNotification, Some(duration));
        // Factor should be multiplied by ~2x
        assert!(
            new_streak < 30,
            "Long interruption should cause significant decay"
        );
    }

    #[test]
    fn test_decay_event_creation() {
        let calculator = StreakDecayCalculator::new();
        let event = calculator.create_decay_event(50, InterruptionType::VoluntaryPause, None);

        assert_eq!(event.streak_before, 50);
        assert_eq!(event.streak_after, 45);
        assert!(event.reason.contains("paused"));
    }

    #[test]
    fn test_focus_duration_adjustment() {
        let calculator = StreakDecayCalculator::new();

        assert_eq!(calculator.get_focus_duration_adjustment(3), -5); // Low streak
        assert_eq!(calculator.get_focus_duration_adjustment(10), 0); // Normal
        assert_eq!(calculator.get_focus_duration_adjustment(25), 5); // Good streak (16-30 range)
        assert_eq!(calculator.get_focus_duration_adjustment(60), 15); // Excellent streak
    }

    #[test]
    fn test_streak_manager() {
        let mut manager = StreakManager::new();

        // Increment streak
        manager.increment_streak();
        manager.increment_streak();
        assert_eq!(manager.current_streak(), 2);

        // Apply interruption
        let event = manager.apply_interruption(InterruptionType::ExternalNotification, None);
        assert_eq!(event.streak_before, 2);
        assert!(event.streak_after < 2);

        // Check history
        assert_eq!(manager.decay_history().len(), 1);
    }

    #[test]
    fn test_streak_min_max() {
        let config = StreakDecayConfig {
            min_streak: 5,
            max_streak: 10,
            ..Default::default()
        };
        let calculator = StreakDecayCalculator::with_config(config.clone());

        // Should not go below min
        let streak = calculator.calculate_decay(100, InterruptionType::ExtendedBreak, None);
        assert_eq!(streak, 10); // Max is 10

        // Should not go above max
        let mut manager = StreakManager::with_config(config);
        for _ in 0..20 {
            manager.increment_streak();
        }
        assert_eq!(manager.current_streak(), 10); // Max is 10
    }
}
