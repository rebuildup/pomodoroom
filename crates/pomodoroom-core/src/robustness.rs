//! Monte Carlo simulation for day-plan robustness scoring.
//!
//! This module estimates the robustness of generated schedules under uncertainty
//! by simulating various overrun and interruption scenarios.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use rand::prelude::*;
use rand_pcg::Mcg128Xsl64;
use serde::{Deserialize, Serialize};

use crate::scheduler::{ScheduledBlock, ScheduledBlockType};

/// Configuration for Monte Carlo simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonteCarloConfig {
    /// Number of simulation iterations
    pub iterations: usize,

    /// Probability of task overrun (0.0-1.0)
    pub overrun_probability: f32,

    /// Maximum overrun as percentage of task duration (0.0-1.0)
    pub max_overrun_ratio: f32,

    /// Probability of random interruption (0.0-1.0)
    pub interruption_probability: f32,

    /// Average interruption duration in minutes
    pub avg_interruption_minutes: i64,

    /// Interruption duration variance (standard deviation in minutes)
    pub interruption_variance: i64,

    /// Random seed for reproducibility (None = random)
    pub seed: Option<u64>,
}

impl Default for MonteCarloConfig {
    fn default() -> Self {
        Self {
            iterations: 1000,
            overrun_probability: 0.2,
            max_overrun_ratio: 0.5,
            interruption_probability: 0.1,
            avg_interruption_minutes: 15,
            interruption_variance: 10,
            seed: None,
        }
    }
}

/// Result of Monte Carlo robustness simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobustnessResult {
    /// Robustness percentile (0-100)
    pub robustness_score: f32,

    /// Percentage of simulations where all tasks completed
    pub completion_rate: f32,

    /// Average total overrun across simulations (minutes)
    pub avg_overrun_minutes: f32,

    /// Average number of interrupted tasks
    pub avg_interruptions: f32,

    /// Risk level classification
    pub risk_level: RiskLevel,

    /// Breakdown by task
    pub task_analysis: Vec<TaskRobustnessInfo>,
}

/// Risk level classification for plans.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// 80-100% robustness - very safe
    Low,
    /// 50-79% robustness - acceptable
    Medium,
    /// 20-49% robustness - risky
    High,
    /// 0-19% robustness - very risky
    Critical,
}

impl From<f32> for RiskLevel {
    fn from(score: f32) -> Self {
        if score >= 80.0 {
            RiskLevel::Low
        } else if score >= 50.0 {
            RiskLevel::Medium
        } else if score >= 20.0 {
            RiskLevel::High
        } else {
            RiskLevel::Critical
        }
    }
}

/// Robustness info for a single task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRobustnessInfo {
    pub task_id: String,
    pub task_title: String,
    pub on_time_rate: f32,
    pub avg_delay_minutes: f32,
}

/// Monte Carlo simulator for plan robustness.
pub struct MonteCarloSimulator {
    config: MonteCarloConfig,
}

impl MonteCarloSimulator {
    /// Create a new simulator with default config.
    pub fn new() -> Self {
        Self {
            config: MonteCarloConfig::default(),
        }
    }

    /// Create a simulator with custom config.
    pub fn with_config(config: MonteCarloConfig) -> Self {
        Self { config }
    }

    /// Run Monte Carlo simulation on a schedule.
    pub fn simulate(&self, blocks: &[ScheduledBlock], day_end: DateTime<Utc>) -> RobustnessResult {
        let mut rng = match self.config.seed {
            Some(seed) => Mcg128Xsl64::seed_from_u64(seed),
            None => Mcg128Xsl64::from_entropy(),
        };

        let focus_blocks: Vec<_> = blocks
            .iter()
            .filter(|b| b.block_type == ScheduledBlockType::Focus)
            .collect();

        if focus_blocks.is_empty() {
            return RobustnessResult {
                robustness_score: 100.0,
                completion_rate: 100.0,
                avg_overrun_minutes: 0.0,
                avg_interruptions: 0.0,
                risk_level: RiskLevel::Low,
                task_analysis: vec![],
            };
        }

        let mut completion_count = 0usize;
        let mut total_overrun = 0.0f32;
        let mut total_interruptions = 0usize;
        let mut task_delays: HashMap<String, (f32, usize)> = HashMap::new();

        for _ in 0..self.config.iterations {
            let (completed, overrun, interruptions, delays) =
                self.run_single_simulation(&focus_blocks, day_end, &mut rng);

            if completed {
                completion_count += 1;
            }
            total_overrun += overrun;
            total_interruptions += interruptions;

            // Accumulate task-level delays
            for (task_id, delay) in delays {
                let entry = task_delays.entry(task_id).or_insert((0.0, 0));
                entry.0 += delay;
                entry.1 += 1;
            }
        }

        let iterations = self.config.iterations as f32;
        let completion_rate = (completion_count as f32 / iterations) * 100.0;
        let avg_overrun = total_overrun / iterations;
        let avg_interruptions = total_interruptions as f32 / iterations;

        // Robustness score is primarily completion rate, adjusted by overrun
        let robustness_score = completion_rate * (1.0 - (avg_overrun / 60.0).min(0.3));

        // Build task analysis
        let task_analysis: Vec<TaskRobustnessInfo> = focus_blocks
            .iter()
            .map(|b| {
                let (total_delay, count) = task_delays
                    .get(&b.task_id)
                    .copied()
                    .unwrap_or((0.0, 0));
                let avg_delay = if count > 0 {
                    total_delay / count as f32
                } else {
                    0.0
                };
                // On-time rate: percentage of simulations where delay < 5 minutes
                let on_time_rate = ((count as f32 - (avg_delay / 5.0).max(1.0)) / count as f32
                    * 100.0)
                    .max(0.0)
                    .min(100.0);
                TaskRobustnessInfo {
                    task_id: b.task_id.clone(),
                    task_title: b.task_title.clone(),
                    on_time_rate,
                    avg_delay_minutes: avg_delay,
                }
            })
            .collect();

        RobustnessResult {
            robustness_score: robustness_score.clamp(0.0, 100.0),
            completion_rate,
            avg_overrun_minutes: avg_overrun,
            avg_interruptions,
            risk_level: RiskLevel::from(robustness_score),
            task_analysis,
        }
    }

    /// Run a single simulation iteration.
    fn run_single_simulation(
        &self,
        blocks: &[&ScheduledBlock],
        day_end: DateTime<Utc>,
        rng: &mut Mcg128Xsl64,
    ) -> (bool, f32, usize, Vec<(String, f32)>) {
        let mut current_time = blocks.first().map(|b| b.start_time).unwrap_or(Utc::now());
        let mut total_overrun = 0.0f32;
        let mut interruptions = 0usize;
        let mut task_delays: Vec<(String, f32)> = Vec::new();

        for block in blocks {
            // Apply overrun to this task
            let original_duration = block.duration_minutes() as f32;
            let actual_duration = if rng.gen::<f32>() < self.config.overrun_probability {
                let overrun_ratio = rng.gen::<f32>() * self.config.max_overrun_ratio;
                original_duration * (1.0 + overrun_ratio)
            } else {
                original_duration
            };

            // Add random interruption
            let interruption_duration = if rng.gen::<f32>() < self.config.interruption_probability {
                interruptions += 1;
                let base = self.config.avg_interruption_minutes as f32;
                let var = self.config.interruption_variance as f32;
                let delta: f32 = rng.gen::<f32>() * var * 2.0 - var;
                (base + delta).max(0.0)
            } else {
                0.0
            };

            // Calculate task end time
            let planned_end = block.end_time;
            let actual_end = current_time
                + Duration::seconds((actual_duration + interruption_duration * 60.0) as i64);

            // Calculate delay for this task
            let delay = (actual_end - planned_end).num_minutes().max(0) as f32;
            if delay > 0.0 {
                task_delays.push((block.task_id.clone(), delay));
            }

            current_time = actual_end;
            total_overrun += delay;
        }

        // Check if we completed within day bounds
        let completed = current_time <= day_end;

        (completed, total_overrun, interruptions, task_delays)
    }

    /// Compare multiple schedules and rank by robustness.
    pub fn rank_by_robustness(
        &self,
        schedules: &[Vec<ScheduledBlock>],
        day_end: DateTime<Utc>,
    ) -> Vec<(usize, RobustnessResult)> {
        let mut results: Vec<_> = schedules
            .iter()
            .enumerate()
            .map(|(idx, blocks)| {
                let result = self.simulate(blocks, day_end);
                (idx, result)
            })
            .collect();

        // Sort by robustness score (descending), then by completion rate as tie-breaker
        results.sort_by(|a, b| {
            b.1.robustness_score
                .partial_cmp(&a.1.robustness_score)
                .unwrap()
                .then(
                    b.1.completion_rate
                        .partial_cmp(&a.1.completion_rate)
                        .unwrap(),
                )
        });

        results
    }
}

impl Default for MonteCarloSimulator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_block(id: &str, start: DateTime<Utc>, duration_min: i64) -> ScheduledBlock {
        ScheduledBlock::new(
            id.to_string(),
            "Test Task".to_string(),
            start,
            start + Duration::minutes(duration_min),
            ScheduledBlockType::Focus,
            None,
            1,
            5,
        )
    }

    #[test]
    fn test_empty_schedule_is_perfectly_robust() {
        let simulator = MonteCarloSimulator::new();
        let result = simulator.simulate(&[], Utc::now());

        assert_eq!(result.robustness_score, 100.0);
        assert_eq!(result.risk_level, RiskLevel::Low);
    }

    #[test]
    fn test_deterministic_with_seed() {
        let config = MonteCarloConfig {
            iterations: 100,
            seed: Some(42),
            ..Default::default()
        };
        let simulator = MonteCarloSimulator::with_config(config);

        let now = Utc::now();
        let blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(30), 25),
        ];
        let day_end = now + Duration::hours(2);

        let result1 = simulator.simulate(&blocks, day_end);
        let result2 = simulator.simulate(&blocks, day_end);

        // Same seed should produce same results
        assert!((result1.robustness_score - result2.robustness_score).abs() < 0.001);
    }

    #[test]
    fn test_tight_schedule_has_lower_robustness() {
        let config = MonteCarloConfig {
            iterations: 500,
            seed: Some(42),
            overrun_probability: 0.3,
            ..Default::default()
        };
        let simulator = MonteCarloSimulator::with_config(config);

        let now = Utc::now();

        // Tight schedule: back-to-back tasks
        let tight_blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(25), 25),
            make_block("3", now + Duration::minutes(50), 25),
            make_block("4", now + Duration::minutes(75), 25),
        ];
        let tight_end = now + Duration::minutes(100);

        // Loose schedule: gaps between tasks
        let loose_blocks = vec![
            make_block("1", now, 25),
            make_block("2", now + Duration::minutes(35), 25),
            make_block("3", now + Duration::minutes(70), 25),
            make_block("4", now + Duration::minutes(105), 25),
        ];
        let loose_end = now + Duration::minutes(140);

        let tight_result = simulator.simulate(&tight_blocks, tight_end);
        let loose_result = simulator.simulate(&loose_blocks, loose_end);

        // Loose schedule should be more robust
        assert!(loose_result.robustness_score >= tight_result.robustness_score);
    }

    #[test]
    fn test_risk_level_classification() {
        assert_eq!(RiskLevel::from(90.0), RiskLevel::Low);
        assert_eq!(RiskLevel::from(80.0), RiskLevel::Low);
        assert_eq!(RiskLevel::from(70.0), RiskLevel::Medium);
        assert_eq!(RiskLevel::from(50.0), RiskLevel::Medium);
        assert_eq!(RiskLevel::from(40.0), RiskLevel::High);
        assert_eq!(RiskLevel::from(20.0), RiskLevel::High);
        assert_eq!(RiskLevel::from(10.0), RiskLevel::Critical);
        assert_eq!(RiskLevel::from(0.0), RiskLevel::Critical);
    }

    #[test]
    fn test_rank_by_robustness() {
        let config = MonteCarloConfig {
            iterations: 100,
            seed: Some(42),
            ..Default::default()
        };
        let simulator = MonteCarloSimulator::with_config(config);

        let now = Utc::now();

        let schedule1 = vec![make_block("1", now, 25), make_block("2", now + Duration::minutes(35), 25)];
        let schedule2 = vec![make_block("3", now, 25), make_block("4", now + Duration::minutes(25), 25)];
        let day_end = now + Duration::hours(2);

        let ranked = simulator.rank_by_robustness(&[schedule1, schedule2], day_end);

        assert_eq!(ranked.len(), 2);
        // Results should be sorted by robustness (descending)
        assert!(ranked[0].1.robustness_score >= ranked[1].1.robustness_score);
    }

    #[test]
    fn test_task_analysis_included() {
        let simulator = MonteCarloSimulator::new();

        let now = Utc::now();
        let blocks = vec![make_block("task-1", now, 25), make_block("task-2", now + Duration::minutes(30), 25)];
        let day_end = now + Duration::hours(2);

        let result = simulator.simulate(&blocks, day_end);

        assert_eq!(result.task_analysis.len(), 2);
        assert!(result.task_analysis.iter().any(|t| t.task_id == "task-1"));
        assert!(result.task_analysis.iter().any(|t| t.task_id == "task-2"));
    }
}
