//! Energy curve types and analyzer.
//!
//! Energy curves represent user productivity patterns throughout the day and week.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Energy level for a specific hour/day combination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyWindow {
    /// Hour of day (0-23)
    pub hour: u8,
    /// Day of week (0-6, Sunday=0)
    pub day_of_week: u8,
    /// Baseline energy level (0.0-1.0)
    pub baseline_energy: f64,
    /// Number of samples used for this window
    pub sample_count: u64,
    /// Confidence level (0.0-1.0)
    pub confidence: f64,
}

impl EnergyWindow {
    /// Create a new energy window with default values.
    pub fn new(hour: u8, day_of_week: u8) -> Self {
        Self {
            hour,
            day_of_week,
            baseline_energy: 0.5,
            sample_count: 0,
            confidence: 0.0,
        }
    }

    /// Calculate confidence from sample count.
    pub fn calculate_confidence(sample_count: u64, min_samples: u64) -> f64 {
        match sample_count {
            0..=2 => 0.1,
            3..=5 => 0.3,
            6..=10 => 0.6,
            _ => {
                // Approaches 1.0 asymptotically
                let excess = sample_count.saturating_sub(min_samples) as f64;
                (0.8 + 0.2 * (1.0 - (-excess / 10.0).exp())).min(1.0)
            }
        }
    }
}

/// Complete energy curve profile for a user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyCurve {
    /// All energy windows (168 = 24 hours * 7 days)
    pub windows: Vec<EnergyWindow>,
    /// When the curve was last updated
    pub last_updated: DateTime<Utc>,
    /// Fallback energy level when no data exists
    pub cold_start_fallback: f64,
}

impl Default for EnergyCurve {
    fn default() -> Self {
        Self::new()
    }
}

impl EnergyCurve {
    /// Create a new energy curve with default windows.
    pub fn new() -> Self {
        let windows = Self::create_default_windows();
        Self {
            windows,
            last_updated: Utc::now(),
            cold_start_fallback: 0.5,
        }
    }

    /// Create default windows for all hour/day combinations.
    fn create_default_windows() -> Vec<EnergyWindow> {
        let mut windows = Vec::with_capacity(168);
        for day in 0..7 {
            for hour in 0..24 {
                windows.push(EnergyWindow::new(hour, day));
            }
        }
        windows
    }

    /// Get energy for a specific hour/day combination.
    pub fn get_energy(&self, hour: u8, day_of_week: u8) -> f64 {
        if let Some(window) = self.find_window(hour, day_of_week) {
            if window.sample_count > 0 {
                return window.baseline_energy;
            }
        }
        self.cold_start_fallback
    }

    /// Get confidence for a specific hour/day combination.
    pub fn get_confidence(&self, hour: u8, day_of_week: u8) -> f64 {
        if let Some(window) = self.find_window(hour, day_of_week) {
            return window.confidence;
        }
        0.0
    }

    /// Find window by hour and day.
    pub fn find_window(&self, hour: u8, day_of_week: u8) -> Option<&EnergyWindow> {
        self.windows
            .iter()
            .find(|w| w.hour == hour && w.day_of_week == day_of_week)
    }

    /// Find mutable window by hour and day.
    pub fn find_window_mut(&mut self, hour: u8, day_of_week: u8) -> Option<&mut EnergyWindow> {
        self.windows
            .iter_mut()
            .find(|w| w.hour == hour && w.day_of_week == day_of_week)
    }

    /// Get recommended work hours based on energy levels.
    pub fn get_recommended_hours(&self, day_of_week: u8, min_energy: f64) -> Vec<u8> {
        self.windows
            .iter()
            .filter(|w| w.day_of_week == day_of_week && w.baseline_energy >= min_energy)
            .map(|w| w.hour)
            .collect()
    }

    /// Render energy curve as ASCII chart for a specific day.
    pub fn render_ascii_chart(&self, day_of_week: u8) -> String {
        let day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        let mut output = format!("\n{} Energy Curve:\n", day_names[day_of_week as usize]);
        output.push_str(&"─".repeat(50));
        output.push('\n');

        for hour in 0..24 {
            let energy = self.get_energy(hour, day_of_week);
            let confidence = self.get_confidence(hour, day_of_week);
            let bar_length = (energy * 30.0) as usize;
            let bar = "█".repeat(bar_length);
            let empty = " ".repeat(30 - bar_length);

            let conf_indicator = if confidence >= 0.6 {
                "●"
            } else if confidence >= 0.3 {
                "○"
            } else {
                "·"
            };

            output.push_str(&format!(
                "{:02}:00 {}{}{} {:.0}%\n",
                hour, bar, empty, conf_indicator, energy * 100.0
            ));
        }

        output.push_str(&"─".repeat(50));
        output.push_str("\n● High conf  ○ Medium  · Low\n");
        output
    }
}

/// Session data for energy curve computation.
#[derive(Debug, Clone)]
pub struct EnergySessionData {
    /// Hour of session start
    pub hour: u8,
    /// Day of week
    pub day_of_week: u8,
    /// Expected duration in minutes
    pub expected_duration: u32,
    /// Actual duration in minutes
    pub actual_duration: u32,
    /// Whether session was completed
    pub completed: bool,
}

/// Analyzer for computing energy curves from session data.
#[derive(Debug, Clone)]
pub struct EnergyCurveAnalyzer {
    /// Minimum samples needed for high confidence
    pub min_samples_for_confidence: u64,
    /// Rolling window in days for calculations
    pub rolling_window_days: u64,
}

impl Default for EnergyCurveAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl EnergyCurveAnalyzer {
    /// Create a new analyzer with default settings.
    pub fn new() -> Self {
        Self {
            min_samples_for_confidence: 5,
            rolling_window_days: 30,
        }
    }

    /// Create analyzer with custom settings.
    pub fn with_settings(min_samples: u64, rolling_window: u64) -> Self {
        Self {
            min_samples_for_confidence: min_samples,
            rolling_window_days: rolling_window,
        }
    }

    /// Compute energy curve from session data.
    pub fn compute_curve(&self, sessions: &[EnergySessionData]) -> EnergyCurve {
        let mut curve = EnergyCurve::new();

        // Group sessions by hour/day
        for session in sessions {
            if let Some(window) = curve.find_window_mut(session.hour, session.day_of_week) {
                window.sample_count += 1;
            }
        }

        // Calculate energy for each window
        for window in &mut curve.windows {
            let window_sessions: Vec<_> = sessions
                .iter()
                .filter(|s| s.hour == window.hour && s.day_of_week == window.day_of_week)
                .collect();

            if window_sessions.is_empty() {
                window.baseline_energy = curve.cold_start_fallback;
                window.confidence = 0.0;
            } else {
                window.baseline_energy =
                    self.calculate_window_energy(&window_sessions);
                window.confidence = EnergyWindow::calculate_confidence(
                    window.sample_count,
                    self.min_samples_for_confidence,
                );
            }
        }

        curve.last_updated = Utc::now();
        curve
    }

    /// Calculate energy level for a window from sessions.
    fn calculate_window_energy(&self, sessions: &[&EnergySessionData]) -> f64 {
        if sessions.is_empty() {
            return 0.5;
        }

        // Calculate completion rate
        let completed_count = sessions.iter().filter(|s| s.completed).count();
        let completion_rate = completed_count as f64 / sessions.len() as f64;

        // Calculate focus quality (actual / expected duration)
        let total_expected: u32 = sessions.iter().map(|s| s.expected_duration).sum();
        let total_actual: u32 = sessions.iter().map(|s| s.actual_duration).sum();
        let focus_quality = if total_expected > 0 {
            (total_actual as f64 / total_expected as f64).min(1.0)
        } else {
            0.5
        };

        // Combined energy: weighted average (60% completion, 40% quality)
        0.6 * completion_rate + 0.4 * focus_quality
    }

    /// Get time-based recommendations.
    pub fn get_recommendations(&self, curve: &EnergyCurve) -> Vec<String> {
        let mut recommendations = Vec::new();
        let day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        // Find peak energy windows
        let mut best_windows: Vec<_> = curve
            .windows
            .iter()
            .filter(|w| w.confidence >= 0.3)
            .collect();
        best_windows.sort_by(|a, b| b.baseline_energy.partial_cmp(&a.baseline_energy).unwrap());

        if best_windows.is_empty() {
            recommendations.push(
                "Not enough data yet. Keep using the timer to build your energy profile.".to_string()
            );
            return recommendations;
        }

        // Top 3 recommendations
        for (i, window) in best_windows.iter().take(3).enumerate() {
            recommendations.push(format!(
                "{}. Best time on {}: {:02}:00 ({}% energy, {}% confidence)",
                i + 1,
                day_names[window.day_of_week as usize],
                window.hour,
                (window.baseline_energy * 100.0) as u32,
                (window.confidence * 100.0) as u32
            ));
        }

        // Find low energy periods to avoid
        let worst = curve.windows.iter().filter(|w| w.confidence >= 0.3).min_by(|a, b| {
            a.baseline_energy.partial_cmp(&b.baseline_energy).unwrap()
        });

        if let Some(w) = worst {
            if w.baseline_energy < 0.4 {
                recommendations.push(format!(
                    "⚠ Avoid deep work on {} around {:02}:00 (low energy period)",
                    day_names[w.day_of_week as usize],
                    w.hour
                ));
            }
        }

        recommendations
    }

    /// Compute energy curve from pre-aggregated database rows.
    ///
    /// This is more efficient than `compute_curve` when reading from database
    /// since aggregation is done in SQL.
    pub fn compute_curve_from_aggregates(&self, rows: &[crate::storage::EnergyCurveRow]) -> EnergyCurve {
        let mut curve = EnergyCurve::new();
        let cold_start_fallback = curve.cold_start_fallback;

        for row in rows {
            if let Some(window) = curve.find_window_mut(row.hour, row.day_of_week) {
                window.sample_count = row.session_count;
                window.baseline_energy = if row.session_count > 0 {
                    // Calculate completion rate
                    let completion_rate = row.completed_count as f64 / row.session_count as f64;

                    // Calculate focus quality (actual / expected)
                    let focus_quality = if row.total_expected_min > 0 {
                        (row.total_actual_min as f64 / row.total_expected_min as f64).min(1.0)
                    } else {
                        0.5
                    };

                    // Combined: 60% completion, 40% quality
                    0.6 * completion_rate + 0.4 * focus_quality
                } else {
                    cold_start_fallback
                };
                window.confidence = EnergyWindow::calculate_confidence(
                    window.sample_count,
                    self.min_samples_for_confidence,
                );
            }
        }

        curve.last_updated = Utc::now();
        curve
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_energy_window_new() {
        let window = EnergyWindow::new(9, 1);
        assert_eq!(window.hour, 9);
        assert_eq!(window.day_of_week, 1);
        assert_eq!(window.baseline_energy, 0.5);
    }

    #[test]
    fn test_calculate_confidence() {
        assert_eq!(EnergyWindow::calculate_confidence(0, 5), 0.1);
        assert_eq!(EnergyWindow::calculate_confidence(2, 5), 0.1);
        assert_eq!(EnergyWindow::calculate_confidence(3, 5), 0.3);
        assert_eq!(EnergyWindow::calculate_confidence(5, 5), 0.3);
        assert_eq!(EnergyWindow::calculate_confidence(6, 5), 0.6);
        assert_eq!(EnergyWindow::calculate_confidence(10, 5), 0.6);
        assert!(EnergyWindow::calculate_confidence(11, 5) > 0.8);
    }

    #[test]
    fn test_energy_curve_default() {
        let curve = EnergyCurve::default();
        assert_eq!(curve.windows.len(), 168); // 24 * 7
        assert_eq!(curve.cold_start_fallback, 0.5);
    }

    #[test]
    fn test_energy_curve_get_energy() {
        let mut curve = EnergyCurve::new();
        curve.cold_start_fallback = 0.3;

        // Window with no data returns cold_start_fallback
        assert_eq!(curve.get_energy(0, 0), 0.3);

        // Update a window
        if let Some(window) = curve.find_window_mut(9, 1) {
            window.baseline_energy = 0.8;
            window.sample_count = 5;
        }

        // Now it returns the window's energy
        assert_eq!(curve.get_energy(9, 1), 0.8);
    }

    #[test]
    fn test_analyzer_compute_curve() {
        let analyzer = EnergyCurveAnalyzer::new();
        let sessions = vec![
            EnergySessionData {
                hour: 9,
                day_of_week: 1,
                expected_duration: 25,
                actual_duration: 25,
                completed: true,
            },
            EnergySessionData {
                hour: 9,
                day_of_week: 1,
                expected_duration: 25,
                actual_duration: 20,
                completed: true,
            },
            EnergySessionData {
                hour: 14,
                day_of_week: 1,
                expected_duration: 25,
                actual_duration: 5,
                completed: false,
            },
        ];

        let curve = analyzer.compute_curve(&sessions);

        // 9:00 Monday should have high energy (100% completion, good quality)
        let morning = curve.find_window(9, 1).unwrap();
        assert!(morning.baseline_energy > 0.8);
        assert_eq!(morning.sample_count, 2);

        // 14:00 Monday should have lower energy (0% completion)
        let afternoon = curve.find_window(14, 1).unwrap();
        assert!(afternoon.baseline_energy < 0.5);
        assert_eq!(afternoon.sample_count, 1);
    }

    #[test]
    fn test_analyzer_get_recommendations() {
        let analyzer = EnergyCurveAnalyzer::new();

        // Empty curve
        let curve = EnergyCurve::new();
        let recs = analyzer.get_recommendations(&curve);
        assert!(recs[0].contains("Not enough data"));

        // With data
        let mut curve = EnergyCurve::new();
        if let Some(w) = curve.find_window_mut(9, 1) {
            w.baseline_energy = 0.9;
            w.confidence = 0.8;
            w.sample_count = 10;
        }
        if let Some(w) = curve.find_window_mut(14, 1) {
            w.baseline_energy = 0.3;
            w.confidence = 0.6;
            w.sample_count = 6;
        }

        let recs = analyzer.get_recommendations(&curve);
        assert!(!recs.is_empty());
        assert!(recs[0].contains("Monday"));
    }
}
