# Property-Based Tests for Planning Invariants

## Overview
This implementation adds property-based testing to the Pomodoroom scheduler using `proptest`. These tests verify core scheduling invariants hold under a wide range of random inputs.

## Invariants Tested

### 1. No Overlapping Blocks
**Property:** No two scheduled blocks should overlap in time.

```rust
for i in 0..scheduled.len() {
    for j in (i + 1)..scheduled.len() {
        assert!(
            !(block_a.start_time < block_b.end_time && 
              block_a.end_time > block_b.start_time)
        );
    }
}
```

### 2. Positive Duration
**Property:** All scheduled blocks must have positive duration.

```rust
for block in &scheduled {
    assert!(block.duration_minutes() > 0);
}
```

### 3. No Overlap with Fixed Events
**Property:** Scheduled blocks must not overlap with fixed events (lunch, meetings, etc.).

### 4. No Overlap with Calendar Events
**Property:** Scheduled blocks must not overlap with external calendar events.

### 5. Within Day Boundaries
**Property:** All scheduled blocks must fall within the day's wake/sleep boundaries.

### 6. No Duplicate Task IDs
**Property:** Each task should be scheduled at most once.

## Test Strategy

### Input Generation
- **Tasks:** Random priority (0-99), estimated pomodoros (1-9), energy level (Low/Medium/High)
- **Fixed Events:** Random start hour (8-19), duration (15-119 minutes)
- **Calendar Events:** Random start hour (9-16), duration (30-89 minutes)

### Counterexample Minimization
`proptest` automatically minimizes failing inputs to find the simplest case that breaks an invariant, making debugging easier.

## Running the Tests

```bash
# Run property-based tests only
cargo test -p pomodoroom-core scheduler::tests::prop

# Run with verbose output
cargo test -p pomodoroom-core scheduler::tests::prop -- --nocapture

# Run all scheduler tests
cargo test -p pomodoroom-core scheduler::tests
```

## CI Integration

These tests run automatically in CI as part of the standard test suite. The property-based tests complement existing unit tests by providing broader input coverage.

## Future Improvements

- Add invariant for break duration constraints
- Test energy-aware scheduling properties
- Add parallel lane scheduling invariants
- Test deadline constraint satisfaction
