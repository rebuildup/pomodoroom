# Estimate Accuracy Tracking Implementation Plan

> Issue #233

## Overview

Implement estimate accuracy tracking to measure planned vs actual duration accuracy by tag/project.

## Tasks

### Task 1: Add Estimate Accuracy Types (20 min)
- [ ] Create `crates/pomodoroom-core/src/stats/estimate_accuracy.rs`
- [ ] Define `EstimateAccuracy`, `AccuracyStats`, `GroupBy`, `EstimateAccuracyTracker`
- [ ] Export from stats module

**Files:**
- `crates/pomodoroom-core/src/stats/estimate_accuracy.rs` (new)
- `crates/pomodoroom-core/src/stats/mod.rs` (modify)
- `crates/pomodoroom-core/src/lib.rs` (modify)

### Task 2: Add Accuracy Computation Logic (30 min)
- [ ] Implement `EstimateAccuracyTracker::compute_accuracy()`
- [ ] Calculate MAE, mean bias, accuracy percentage
- [ ] Implement corrective factor calculation
- [ ] Implement grouping by tag/project

**Files:**
- `crates/pomodoroom-core/src/stats/estimate_accuracy.rs` (modify)

### Task 3: Add Database Method for Accuracy Data (20 min)
- [ ] Add `get_estimate_accuracy_data()` to Database
- [ ] Query sessions with task/project info for grouping
- [ ] Return data for accuracy computation

**Files:**
- `crates/pomodoroom-core/src/storage/database.rs` (modify)

### Task 4: Extend Stats CLI Command (30 min)
- [ ] Add `Accuracy` action to stats subcommand
- [ ] Add --by-tag, --by-project flags
- [ ] Add --weekly, --monthly flags for time range
- [ ] Add --suggest-factors flag
- [ ] Display accuracy report

**Files:**
- `crates/pomodoroom-cli/src/commands/stats.rs` (modify)

### Task 5: Add Integration Tests (20 min)
- [ ] Create `crates/pomodoroom-core/tests/estimate_accuracy_integration.rs`
- [ ] Test accuracy calculation
- [ ] Test grouping by tag/project
- [ ] Test corrective factor suggestions
- [ ] Test time range filtering

**Files:**
- `crates/pomodoroom-core/tests/estimate_accuracy_integration.rs` (new)

## Acceptance Criteria

- [ ] Accuracy metrics are available weekly/monthly
- [ ] Corrective factors are explainable
- [ ] Planner can optionally apply factors

## Dependencies

- chrono (already in deps)
- serde (already in deps)
- Existing session records in database
