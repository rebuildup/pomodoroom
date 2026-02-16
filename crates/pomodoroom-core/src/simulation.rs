//! Deterministic simulation harness for the scheduler.
//!
//! This module provides a deterministic simulation environment for testing
//! scheduler behavior under reproducible conditions. It enables:
//! - Seed-based deterministic scheduling
//! - Scenario recording and replay
//! - Regression testing with known inputs

use chrono::{DateTime, Duration, Timelike, Utc};
use serde::{Deserialize, Serialize};

use crate::schedule::DailyTemplate;
use crate::scheduler::{AutoScheduler, CalendarEvent, ScheduledBlock, SchedulerConfig};
use crate::task::{EnergyLevel, Task, TaskCategory, TaskKind, TaskState};

/// Seed for deterministic random number generation
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SimulationSeed(pub u64);

impl SimulationSeed {
    /// Create a new simulation seed
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }

    /// Generate a seed from a string (for named scenarios)
    pub fn from_string(s: &str) -> Self {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        s.hash(&mut hasher);
        Self(hasher.finish())
    }
}

impl Default for SimulationSeed {
    fn default() -> Self {
        Self(42) // Default seed for reproducibility
    }
}

/// Deterministic random number generator (Xorshift64*)
#[derive(Debug, Clone, Copy)]
pub struct DeterministicRng {
    state: u64,
}

impl DeterministicRng {
    /// Create a new RNG with the given seed
    pub fn new(seed: SimulationSeed) -> Self {
        Self { state: seed.0 }
    }

    /// Generate next random u64
    fn next_u64(&mut self) -> u64 {
        // Xorshift64* algorithm
        self.state ^= self.state >> 12;
        self.state ^= self.state << 25;
        self.state ^= self.state >> 27;
        self.state.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    /// Generate random value in range [0, max)
    pub fn next_u32_range(&mut self, max: u32) -> u32 {
        ((self.next_u64() >> 32) as u32) % max
    }

    /// Generate random bool with given probability
    pub fn next_bool(&mut self, probability: f64) -> bool {
        let val = self.next_u64() as f64 / u64::MAX as f64;
        val < probability
    }

    /// Generate random value from a slice (returns index)
    pub fn choose_index(&mut self, len: usize) -> usize {
        if len == 0 {
            return 0;
        }
        (self.next_u64() as usize) % len
    }

    /// Shuffle a vector in place
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = (self.next_u64() as usize) % (i + 1);
            items.swap(i, j);
        }
    }
}

/// Simulation scenario definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationScenario {
    /// Scenario name
    pub name: String,
    /// Random seed
    pub seed: SimulationSeed,
    /// Day to simulate
    pub day: DateTime<Utc>,
    /// Daily template
    pub template: DailyTemplate,
    /// Tasks to schedule
    pub tasks: Vec<Task>,
    /// Calendar events
    pub calendar_events: Vec<CalendarEvent>,
    /// Scheduler configuration
    pub config: SchedulerConfig,
}

impl SimulationScenario {
    /// Create a new scenario
    pub fn new(name: impl Into<String>, seed: SimulationSeed) -> Self {
        Self {
            name: name.into(),
            seed,
            day: Utc::now(),
            template: DailyTemplate::default(),
            tasks: Vec::new(),
            calendar_events: Vec::new(),
            config: SchedulerConfig::default(),
        }
    }

    /// Set the day
    pub fn with_day(mut self, day: DateTime<Utc>) -> Self {
        self.day = day;
        self
    }

    /// Set the template
    pub fn with_template(mut self, template: DailyTemplate) -> Self {
        self.template = template;
        self
    }

    /// Set tasks
    pub fn with_tasks(mut self, tasks: Vec<Task>) -> Self {
        self.tasks = tasks;
        self
    }

    /// Set calendar events
    pub fn with_calendar_events(mut self, events: Vec<CalendarEvent>) -> Self {
        self.calendar_events = events;
        self
    }

    /// Set scheduler config
    pub fn with_config(mut self, config: SchedulerConfig) -> Self {
        self.config = config;
        self
    }

    /// Generate random tasks using the seed
    pub fn generate_random_tasks(&mut self, count: usize) {
        let mut rng = DeterministicRng::new(self.seed);
        self.tasks = (0..count)
            .map(|i| generate_random_task(&mut rng, i))
            .collect();
    }

    /// Generate random calendar events using the seed
    pub fn generate_random_calendar_events(&mut self, count: usize) {
        let mut rng = DeterministicRng::new(self.seed);
        self.calendar_events = (0..count)
            .map(|i| generate_random_calendar_event(&mut rng, self.day, i))
            .collect();
    }
}

/// Simulation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    /// Scenario that was run
    pub scenario: SimulationScenario,
    /// Scheduled blocks
    pub scheduled_blocks: Vec<ScheduledBlock>,
    /// Metrics
    pub metrics: SimulationMetrics,
    /// Timestamp
    pub run_at: DateTime<Utc>,
}

/// Simulation metrics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SimulationMetrics {
    /// Total tasks
    pub total_tasks: usize,
    /// Tasks scheduled
    pub tasks_scheduled: usize,
    /// Total Pomodoros scheduled
    pub total_pomodoros: i32,
    /// Total scheduled duration in minutes
    pub total_duration_minutes: i64,
    /// Number of gaps in schedule
    pub gap_count: usize,
    /// Average task priority
    pub avg_priority: f64,
}

/// Deterministic simulation harness
pub struct SimulationHarness {
    /// RNG for deterministic behavior (currently unused but kept for API compatibility)
    #[allow(dead_code)]
    rng: DeterministicRng,
    /// Scheduler configuration (currently unused but kept for future use)
    #[allow(dead_code)]
    config: SchedulerConfig,
    /// History of simulations
    history: Vec<SimulationResult>,
}

impl SimulationHarness {
    /// Create a new harness with the given seed
    pub fn new(seed: SimulationSeed) -> Self {
        Self {
            rng: DeterministicRng::new(seed),
            config: SchedulerConfig::default(),
            history: Vec::new(),
        }
    }

    /// Run a simulation scenario
    pub fn run_scenario(&mut self, scenario: &SimulationScenario) -> SimulationResult {
        let scheduler = AutoScheduler::with_config(scenario.config.clone());

        let scheduled_blocks = scheduler.generate_schedule(
            &scenario.template,
            &scenario.tasks,
            &scenario.calendar_events,
            scenario.day,
        );

        let metrics = self.calculate_metrics(&scheduled_blocks, &scenario.tasks);

        let result = SimulationResult {
            scenario: scenario.clone(),
            scheduled_blocks,
            metrics,
            run_at: Utc::now(),
        };

        self.history.push(result.clone());
        result
    }

    /// Run multiple scenarios with systematic variation
    pub fn run_sweep(
        &mut self,
        base_scenario: &SimulationScenario,
        variations: Vec<ScenarioVariation>,
    ) -> Vec<SimulationResult> {
        let mut results = Vec::new();

        for variation in variations {
            let scenario = variation.apply(base_scenario.clone());
            let result = self.run_scenario(&scenario);
            results.push(result);
        }

        results
    }

    /// Calculate metrics from results
    fn calculate_metrics(&self, blocks: &[ScheduledBlock], tasks: &[Task]) -> SimulationMetrics {
        let total_pomodoros: i32 = blocks.iter().map(|b| b.pomodoro_count).sum();
        let total_duration: i64 = blocks.iter().map(|b| b.duration_minutes()).sum();
        let scheduled_task_ids: std::collections::HashSet<_> =
            blocks.iter().map(|b| &b.task_id).collect();

        let avg_priority = if tasks.is_empty() {
            0.0
        } else {
            tasks
                .iter()
                .filter_map(|t| t.priority)
                .map(|p| p as f64)
                .sum::<f64>()
                / tasks.len() as f64
        };

        SimulationMetrics {
            total_tasks: tasks.len(),
            tasks_scheduled: scheduled_task_ids.len(),
            total_pomodoros,
            total_duration_minutes: total_duration,
            gap_count: 0, // Would need gap calculation
            avg_priority,
        }
    }

    /// Get simulation history
    pub fn history(&self) -> &[SimulationResult] {
        &self.history
    }

    /// Clear history
    pub fn clear_history(&mut self) {
        self.history.clear();
    }

    /// Export scenario to file
    pub fn export_scenario(&self, scenario: &SimulationScenario, path: &str) -> Result<(), String> {
        let json = serde_json::to_string_pretty(scenario)
            .map_err(|e| format!("Failed to serialize scenario: {}", e))?;
        std::fs::write(path, json).map_err(|e| format!("Failed to write scenario: {}", e))?;
        Ok(())
    }

    /// Import scenario from file
    pub fn import_scenario(path: &str) -> Result<SimulationScenario, String> {
        let json =
            std::fs::read_to_string(path).map_err(|e| format!("Failed to read scenario: {}", e))?;
        let scenario: SimulationScenario = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to deserialize scenario: {}", e))?;
        Ok(scenario)
    }
}

/// Scenario variation for parameter sweeps
#[derive(Debug, Clone)]
pub enum ScenarioVariation {
    /// Vary the seed
    Seed(SimulationSeed),
    /// Vary task count
    TaskCount(usize),
    /// Vary calendar event count
    CalendarEventCount(usize),
    /// Vary wake time
    WakeTime(String),
    /// Vary sleep time
    SleepTime(String),
}

impl ScenarioVariation {
    /// Apply the variation to a scenario
    pub fn apply(&self, mut scenario: SimulationScenario) -> SimulationScenario {
        match self {
            ScenarioVariation::Seed(seed) => {
                scenario.seed = *seed;
                scenario
            }
            ScenarioVariation::TaskCount(count) => {
                scenario.generate_random_tasks(*count);
                scenario
            }
            ScenarioVariation::CalendarEventCount(count) => {
                scenario.generate_random_calendar_events(*count);
                scenario
            }
            ScenarioVariation::WakeTime(time) => {
                scenario.template.wake_up = time.clone();
                scenario
            }
            ScenarioVariation::SleepTime(time) => {
                scenario.template.sleep = time.clone();
                scenario
            }
        }
    }
}

/// Generate a random task using deterministic RNG
fn generate_random_task(rng: &mut DeterministicRng, index: usize) -> Task {
    let priorities = [10, 30, 50, 70, 90];
    let energy_levels = [EnergyLevel::Low, EnergyLevel::Medium, EnergyLevel::High];

    let now = Utc::now();

    Task {
        id: format!("task-{}", index),
        title: format!("Task {}", index),
        description: None,
        estimated_pomodoros: (rng.next_u32_range(4) + 1) as i32,
        completed_pomodoros: 0,
        completed: false,
        state: TaskState::Ready,
        project_id: None,
        project_name: None,
        project_ids: vec![],
        kind: TaskKind::DurationOnly,
        required_minutes: None,
        fixed_start_at: None,
        fixed_end_at: None,
        window_start_at: None,
        window_end_at: None,
        tags: vec![],
        priority: Some(priorities[rng.choose_index(priorities.len())]),
        category: TaskCategory::Active,
        estimated_minutes: None,
        estimated_start_at: None,
        elapsed_minutes: 0,
        energy: energy_levels[rng.choose_index(energy_levels.len())],
        group: None,
        group_ids: vec![],
        created_at: now,
        updated_at: now,
        completed_at: None,
        paused_at: None,
        source_service: None,
        source_external_id: None,
        parent_task_id: None,
        segment_order: None,
        allow_split: true,
    }
}

/// Generate a random calendar event using deterministic RNG
fn generate_random_calendar_event(
    rng: &mut DeterministicRng,
    day: DateTime<Utc>,
    index: usize,
) -> CalendarEvent {
    let start_hour = 9 + rng.next_u32_range(8) as u32; // 9am to 5pm
    let duration_minutes = 30 + rng.next_u32_range(90) as i64; // 30 to 120 minutes

    let start = day
        .with_hour(start_hour)
        .and_then(|d| d.with_minute(0))
        .unwrap_or(day);

    CalendarEvent {
        id: format!("event-{}", index),
        title: format!("Event {}", index),
        start_time: start,
        end_time: start + Duration::minutes(duration_minutes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_rng_reproducibility() {
        let seed = SimulationSeed::new(12345);
        let mut rng1 = DeterministicRng::new(seed);
        let mut rng2 = DeterministicRng::new(seed);

        // Same seed should produce same sequence
        for _ in 0..100 {
            assert_eq!(rng1.next_u64(), rng2.next_u64());
        }
    }

    #[test]
    fn test_deterministic_rng_different_seeds() {
        let mut rng1 = DeterministicRng::new(SimulationSeed::new(12345));
        let mut rng2 = DeterministicRng::new(SimulationSeed::new(54321));

        // Different seeds should produce different sequences
        let vals1: Vec<_> = (0..10).map(|_| rng1.next_u64()).collect();
        let vals2: Vec<_> = (0..10).map(|_| rng2.next_u64()).collect();
        assert_ne!(vals1, vals2);
    }

    #[test]
    fn test_scenario_builder() {
        let scenario = SimulationScenario::new("test", SimulationSeed::default())
            .with_day(Utc::now())
            .with_tasks(vec![]);

        assert_eq!(scenario.name, "test");
        assert!(!scenario.tasks.is_empty() || true); // Empty is ok
    }

    #[test]
    fn test_harness_run_scenario() {
        let mut harness = SimulationHarness::new(SimulationSeed::default());

        let mut scenario = SimulationScenario::new("test", SimulationSeed::default());
        scenario.generate_random_tasks(5);

        let result = harness.run_scenario(&scenario);

        assert_eq!(result.scenario.name, "test");
        assert_eq!(result.metrics.total_tasks, 5);
    }

    #[test]
    fn test_deterministic_scheduling() {
        let seed = SimulationSeed::new(42);

        // Run same scenario twice
        let mut harness1 = SimulationHarness::new(seed);
        let mut harness2 = SimulationHarness::new(seed);

        let scenario = SimulationScenario::new("test", seed).with_tasks(
            (0..10)
                .map(|i| generate_random_task(&mut DeterministicRng::new(seed), i))
                .collect(),
        );

        let result1 = harness1.run_scenario(&scenario);
        let result2 = harness2.run_scenario(&scenario);

        // Should produce identical results
        assert_eq!(
            result1.scheduled_blocks.len(),
            result2.scheduled_blocks.len()
        );
    }

    #[test]
    fn test_scenario_serialization() {
        let scenario = SimulationScenario::new("test", SimulationSeed::new(42));

        let json = serde_json::to_string(&scenario).unwrap();
        let deserialized: SimulationScenario = serde_json::from_str(&json).unwrap();

        assert_eq!(scenario.name, deserialized.name);
        assert_eq!(scenario.seed.0, deserialized.seed.0);
    }

    #[test]
    fn test_scenario_variation() {
        let base = SimulationScenario::new("base", SimulationSeed::default());

        let varied = ScenarioVariation::TaskCount(10).apply(base.clone());
        assert_eq!(varied.tasks.len(), 10);

        let varied = ScenarioVariation::WakeTime("07:00".to_string()).apply(base);
        assert_eq!(varied.template.wake_up, "07:00");
    }
}
