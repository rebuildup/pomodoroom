# Deterministic Simulation Harness for Scheduler

## Overview
This implementation provides a deterministic simulation environment for testing scheduler behavior under reproducible conditions.

## Features

### 1. Deterministic Random Number Generation
- Xorshift64* algorithm with seed-based initialization
- Reproducible random sequences for testing
- Named scenarios via string hashing

### 2. Simulation Scenario Builder
```rust
let scenario = SimulationScenario::new("test", SimulationSeed::new(42))
    .with_day(Utc::now())
    .with_tasks(vec![...])
    .with_calendar_events(vec![...]);
```

### 3. Scenario Variations
- Seed variations for Monte Carlo analysis
- Task count variations
- Calendar event density variations
- Wake/sleep time variations

### 4. Metrics Collection
- Total tasks scheduled
- Pomodoro count
- Duration statistics
- Priority distribution

## Usage Examples

### Basic Simulation
```rust
let mut harness = SimulationHarness::new(SimulationSeed::new(42));
let result = harness.run_scenario(&scenario);
println!("Scheduled {} tasks", result.metrics.tasks_scheduled);
```

### Parameter Sweep
```rust
let variations = vec![
    ScenarioVariation::TaskCount(5),
    ScenarioVariation::TaskCount(10),
    ScenarioVariation::TaskCount(20),
];
let results = harness.run_sweep(&base_scenario, variations);
```

### Reproducibility
```rust
// Same seed always produces same results
let seed = SimulationSeed::new(12345);
let result1 = harness.run_scenario(&scenario);
let result2 = harness.run_scenario(&scenario);
assert_eq!(result1.scheduled_blocks, result2.scheduled_blocks);
```

## Test Coverage
- ✅ Deterministic RNG reproducibility
- ✅ Different seeds produce different sequences
- ✅ Scenario serialization/deserialization
- ✅ Full harness workflow
- ✅ Deterministic scheduling

## Integration with Property-Based Tests
The simulation harness complements property-based tests by providing:
- Controlled randomness for reproducible failures
- Scenario recording for regression tests
- Performance benchmarking with consistent inputs
