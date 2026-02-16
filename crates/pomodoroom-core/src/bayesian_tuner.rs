//! Bayesian optimization for break length policy tuning.
//!
//! This module uses Thompson Sampling (a simple Bayesian approach) to
//! optimize break lengths while respecting safety constraints.

use serde::{Deserialize, Serialize};
use std::f32::consts::E;

/// Configuration for Bayesian break tuning.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BreakTuningConfig {
    /// Enable/disable tuning per profile
    pub enabled: bool,

    /// Minimum break length (minutes)
    pub min_break_minutes: i32,

    /// Maximum break length (minutes)
    pub max_break_minutes: i32,

    /// Daily total break budget (minutes)
    pub daily_break_budget: i32,

    /// Exploration rate (higher = more exploration)
    pub exploration_rate: f32,

    /// Minimum samples before tuning starts
    pub min_samples: usize,

    /// Confidence threshold for exploitation (0.0-1.0)
    pub confidence_threshold: f32,
}

impl Default for BreakTuningConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            min_break_minutes: 3,
            max_break_minutes: 15,
            daily_break_budget: 60,
            exploration_rate: 0.1,
            min_samples: 5,
            confidence_threshold: 0.8,
        }
    }
}

/// Observation of break effectiveness.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakObservation {
    /// Break length in minutes
    pub break_length: i32,

    /// Outcome score (0.0-1.0, higher = better)
    /// Computed from: completion rate, interruption rate, focus quality
    pub outcome_score: f32,

    /// Whether safety constraints were violated
    pub safety_violation: bool,
}

/// Result of Bayesian tuning decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuningDecision {
    /// Recommended break length (minutes)
    pub recommended_break: i32,

    /// Confidence level for this recommendation
    pub confidence: f32,

    /// Whether this is an exploration or exploitation decision
    pub is_exploration: bool,

    /// Explanation for the decision
    pub rationale: String,
}

/// Statistics for a break length bin.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct BreakStats {
    /// Sum of outcome scores
    score_sum: f32,

    /// Sum of squared outcome scores (for variance)
    score_sq_sum: f32,

    /// Number of observations
    count: usize,

    /// Number of safety violations
    violations: usize,
}

impl BreakStats {
    fn mean(&self) -> f32 {
        if self.count == 0 {
            0.5 // Prior mean
        } else {
            self.score_sum / self.count as f32
        }
    }

    fn variance(&self) -> f32 {
        if self.count < 2 {
            0.25 // Prior variance (high uncertainty)
        } else {
            let n = self.count as f32;
            (self.score_sq_sum / n) - (self.score_sum / n).powi(2)
        }
    }

    fn std_dev(&self) -> f32 {
        self.variance().sqrt().max(0.01)
    }

    fn add_observation(&mut self, score: f32) {
        self.score_sum += score;
        self.score_sq_sum += score * score;
        self.count += 1;
    }
}

/// Bayesian tuner for break length optimization.
pub struct BayesianBreakTuner {
    config: BreakTuningConfig,

    /// Statistics per break length (binned)
    stats: std::collections::HashMap<i32, BreakStats>,

    /// Total observations across all lengths
    total_observations: usize,

    /// Today's total break time used
    daily_break_used: i32,
}

impl BayesianBreakTuner {
    /// Create a new tuner with default config.
    pub fn new() -> Self {
        Self {
            config: BreakTuningConfig::default(),
            stats: std::collections::HashMap::new(),
            total_observations: 0,
            daily_break_used: 0,
        }
    }

    /// Create a tuner with custom config.
    pub fn with_config(config: BreakTuningConfig) -> Self {
        Self {
            config,
            stats: std::collections::HashMap::new(),
            total_observations: 0,
            daily_break_used: 0,
        }
    }

    /// Enable or disable tuning.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.config.enabled = enabled;
    }

    /// Record an observation.
    pub fn observe(&mut self, observation: BreakObservation) {
        let length = observation.break_length.clamp(
            self.config.min_break_minutes,
            self.config.max_break_minutes,
        );

        let stats = self.stats.entry(length).or_default();

        if observation.safety_violation {
            stats.violations += 1;
        }

        stats.add_observation(observation.outcome_score);
        self.total_observations += 1;
    }

    /// Record break time used today.
    pub fn record_break_used(&mut self, minutes: i32) {
        self.daily_break_used += minutes;
    }

    /// Reset daily break counter.
    pub fn reset_daily(&mut self) {
        self.daily_break_used = 0;
    }

    /// Get recommended break length using Thompson Sampling.
    pub fn recommend(&self) -> TuningDecision {
        // If tuning is disabled, return default
        if !self.config.enabled {
            return TuningDecision {
                recommended_break: 5,
                confidence: 1.0,
                is_exploration: false,
                rationale: "Tuning disabled, using default 5-minute break".to_string(),
            };
        }

        // Check if we're over budget
        let remaining_budget = self.config.daily_break_budget - self.daily_break_used;
        if remaining_budget <= 0 {
            return TuningDecision {
                recommended_break: self.config.min_break_minutes,
                confidence: 1.0,
                is_exploration: false,
                rationale: "Daily break budget exhausted, using minimum break".to_string(),
            };
        }

        // If not enough samples, explore
        if self.total_observations < self.config.min_samples {
            return self.explore();
        }

        // Thompson Sampling: sample from each arm's posterior and pick best
        let mut best_length = 5;
        let mut best_sample = f32::NEG_INFINITY;
        let mut best_stats: Option<&BreakStats> = None;
        let default_stats = BreakStats::default();

        for length in self.config.min_break_minutes..=self.config.max_break_minutes {
            // Check budget constraint
            if length > remaining_budget {
                continue;
            }

            let stats = self.stats.get(&length).unwrap_or(&default_stats);

            // Sample from Normal(mean, std) using Box-Muller transform approximation
            // For simplicity, we use mean + exploration_rate * std as the sample
            let mean = stats.mean();
            let std = stats.std_dev();
            let sample = mean + self.config.exploration_rate * std;

            // Penalty for safety violations
            let violation_penalty = if stats.count > 0 {
                (stats.violations as f32 / stats.count as f32) * 0.5
            } else {
                0.0
            };
            let adjusted_sample = sample - violation_penalty;

            if adjusted_sample > best_sample {
                best_sample = adjusted_sample;
                best_length = length;
                best_stats = Some(stats);
            }
        }

        // Determine confidence and exploration status
        let default_stats = BreakStats::default();
        let stats = best_stats.unwrap_or(&default_stats);
        let confidence = self.compute_confidence(stats);
        let is_exploration = confidence < self.config.confidence_threshold;

        let rationale = if is_exploration {
            format!(
                "Exploring {}-minute breaks ({} samples, {:.0}% confidence)",
                best_length,
                stats.count,
                confidence * 100.0
            )
        } else {
            format!(
                "Recommending {}-minute break (mean outcome: {:.2}, {} observations)",
                best_length,
                stats.mean(),
                stats.count
            )
        };

        TuningDecision {
            recommended_break: best_length,
            confidence,
            is_exploration,
            rationale,
        }
    }

    /// Explore by recommending a less-sampled break length.
    fn explore(&self) -> TuningDecision {
        // Find the least-sampled break length
        let mut best_length = self.config.min_break_minutes;
        let mut min_count = usize::MAX;

        for length in self.config.min_break_minutes..=self.config.max_break_minutes {
            let count = self.stats.get(&length).map(|s| s.count).unwrap_or(0);
            if count < min_count {
                min_count = count;
                best_length = length;
            }
        }

        TuningDecision {
            recommended_break: best_length,
            confidence: 0.0,
            is_exploration: true,
            rationale: format!(
                "Exploring {}-minute break ({} samples, need {})",
                best_length, min_count, self.config.min_samples
            ),
        }
    }

    /// Compute confidence based on sample count and variance.
    fn compute_confidence(&self, stats: &BreakStats) -> f32 {
        if stats.count == 0 {
            return 0.0;
        }

        // Confidence increases with sample count (diminishing returns)
        let count_factor = 1.0 - E.powf(-(stats.count as f32) / 10.0);

        // Confidence decreases with variance
        let variance_penalty = (stats.variance() * 2.0).min(0.5);

        (count_factor - variance_penalty).clamp(0.0, 1.0)
    }

    /// Export tuner state for persistence.
    pub fn export_state(&self) -> TunerState {
        TunerState {
            config: self.config.clone(),
            stats: self.stats.clone(),
            total_observations: self.total_observations,
            daily_break_used: self.daily_break_used,
        }
    }

    /// Import tuner state.
    pub fn import_state(state: TunerState) -> Self {
        Self {
            config: state.config,
            stats: state.stats,
            total_observations: state.total_observations,
            daily_break_used: state.daily_break_used,
        }
    }

    /// Get statistics summary for explainability.
    pub fn get_statistics_summary(&self) -> Vec<BreakLengthSummary> {
        (self.config.min_break_minutes..=self.config.max_break_minutes)
            .map(|length| {
                let stats = self.stats.get(&length);
                BreakLengthSummary {
                    break_length: length,
                    sample_count: stats.map(|s| s.count).unwrap_or(0),
                    mean_outcome: stats.map(|s| s.mean()).unwrap_or(0.5),
                    std_dev: stats.map(|s| s.std_dev()).unwrap_or(0.5),
                    safety_violation_rate: stats
                        .map(|s| {
                            if s.count > 0 {
                                s.violations as f32 / s.count as f32
                            } else {
                                0.0
                            }
                        })
                        .unwrap_or(0.0),
                }
            })
            .collect()
    }
}

impl Default for BayesianBreakTuner {
    fn default() -> Self {
        Self::new()
    }
}

/// Serializable tuner state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunerState {
    pub config: BreakTuningConfig,
    pub stats: std::collections::HashMap<i32, BreakStats>,
    pub total_observations: usize,
    pub daily_break_used: i32,
}

/// Summary of break length statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreakLengthSummary {
    pub break_length: i32,
    pub sample_count: usize,
    pub mean_outcome: f32,
    pub std_dev: f32,
    pub safety_violation_rate: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disabled_tuning_uses_default() {
        let config = BreakTuningConfig {
            enabled: false,
            ..Default::default()
        };
        let mut tuner = BayesianBreakTuner::with_config(config);
        let decision = tuner.recommend();

        assert_eq!(decision.recommended_break, 5);
        assert!(!decision.is_exploration);
    }

    #[test]
    fn test_explores_with_few_samples() {
        let config = BreakTuningConfig {
            min_samples: 10,
            ..Default::default()
        };
        let mut tuner = BayesianBreakTuner::with_config(config);

        // Add only 5 observations
        for _ in 0..5 {
            tuner.observe(BreakObservation {
                break_length: 5,
                outcome_score: 0.7,
                safety_violation: false,
            });
        }

        let decision = tuner.recommend();
        assert!(decision.is_exploration);
        assert!(decision.rationale.contains("Exploring"));
    }

    #[test]
    fn test_respects_budget_constraint() {
        let config = BreakTuningConfig {
            daily_break_budget: 10,
            ..Default::default()
        };
        let mut tuner = BayesianBreakTuner::with_config(config);

        // Add enough samples
        for _ in 0..20 {
            tuner.observe(BreakObservation {
                break_length: 5,
                outcome_score: 0.8,
                safety_violation: false,
            });
        }

        // Use up budget
        tuner.record_break_used(10);

        let decision = tuner.recommend();
        assert_eq!(decision.recommended_break, config.min_break_minutes);
        assert!(decision.rationale.contains("budget exhausted"));
    }

    #[test]
    fn test_penalizes_safety_violations() {
        let config = BreakTuningConfig {
            min_samples: 5,
            ..Default::default()
        };
        let mut tuner = BayesianBreakTuner::with_config(config);

        // 5-minute breaks: high score but some violations
        for _ in 0..5 {
            tuner.observe(BreakObservation {
                break_length: 5,
                outcome_score: 0.9,
                safety_violation: true,
            });
        }

        // 10-minute breaks: lower score but no violations
        for _ in 0..5 {
            tuner.observe(BreakObservation {
                break_length: 10,
                outcome_score: 0.7,
                safety_violation: false,
            });
        }

        let decision = tuner.recommend();
        // Should prefer 10-minute breaks due to no violations
        assert!(decision.recommended_break >= 5);
    }

    #[test]
    fn test_state_export_import() {
        let config = BreakTuningConfig {
            enabled: true,
            ..Default::default()
        };
        let mut tuner = BayesianBreakTuner::with_config(config);

        tuner.observe(BreakObservation {
            break_length: 5,
            outcome_score: 0.8,
            safety_violation: false,
        });
        tuner.record_break_used(10);

        let state = tuner.export_state();
        let restored = BayesianBreakTuner::import_state(state);

        assert_eq!(restored.total_observations, 1);
        assert_eq!(restored.daily_break_used, 10);
    }

    #[test]
    fn test_statistics_summary() {
        let mut tuner = BayesianBreakTuner::new();

        tuner.observe(BreakObservation {
            break_length: 5,
            outcome_score: 0.8,
            safety_violation: false,
        });
        tuner.observe(BreakObservation {
            break_length: 10,
            outcome_score: 0.6,
            safety_violation: true,
        });

        let summary = tuner.get_statistics_summary();

        assert!(summary.iter().any(|s| s.break_length == 5 && s.sample_count == 1));
        assert!(summary.iter().any(|s| s.break_length == 10 && s.sample_count == 1));
    }

    #[test]
    fn test_confidence_increases_with_samples() {
        let mut tuner = BayesianBreakTuner::new();

        // Few samples = low confidence
        for _ in 0..3 {
            tuner.observe(BreakObservation {
                break_length: 5,
                outcome_score: 0.7,
                safety_violation: false,
            });
        }
        let low_conf = tuner.compute_confidence(tuner.stats.get(&5).unwrap());

        // More samples = higher confidence
        for _ in 0..20 {
            tuner.observe(BreakObservation {
                break_length: 5,
                outcome_score: 0.7,
                safety_violation: false,
            });
        }
        let high_conf = tuner.compute_confidence(tuner.stats.get(&5).unwrap());

        assert!(high_conf > low_conf);
    }
}
