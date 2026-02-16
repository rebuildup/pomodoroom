# Energy Curve Learning Implementation Plan

> Issue #220

## Overview

Implement energy curve learning to infer per-user productivity patterns from completed sessions.

## Tasks

### Task 1: Add Energy Curve Types (30 min)
- [ ] Create `crates/pomodoroom-core/src/energy/mod.rs`
- [ ] Create `crates/pomodoroom-core/src/energy/curve.rs`
- [ ] Define `EnergyWindow`, `EnergyCurve`, `EnergyCurveAnalyzer`
- [ ] Add module to `lib.rs` and export types

**Files:**
- `crates/pomodoroom-core/src/energy/mod.rs` (new)
- `crates/pomodoroom-core/src/energy/curve.rs` (new)
- `crates/pomodoroom-core/src/lib.rs` (modify)

### Task 2: Add Curve Computation Logic (45 min)
- [ ] Implement `EnergyCurveAnalyzer::compute_curve()`
- [ ] Add energy calculation from session completion/quality
- [ ] Implement confidence scoring based on sample count
- [ ] Add cold-start fallback handling

**Files:**
- `crates/pomodoroom-core/src/energy/curve.rs` (modify)

### Task 3: Add Database Method for Energy Data (30 min)
- [ ] Add `get_energy_curve_data()` to Database
- [ ] Query sessions grouped by hour/day with aggregates
- [ ] Return data structure for curve computation

**Files:**
- `crates/pomodoroom-core/src/storage/database.rs` (modify)

### Task 4: Add CLI Energy Command (30 min)
- [ ] Create `crates/pomodoroom-cli/src/commands/energy.rs`
- [ ] Add `energy` subcommand with show/update/recommend actions
- [ ] Display energy curve as ASCII chart
- [ ] Wire up in main.rs

**Files:**
- `crates/pomodoroom-cli/src/commands/energy.rs` (new)
- `crates/pomodoroom-cli/src/commands/mod.rs` (modify)
- `crates/pomodoroom-cli/src/main.rs` (modify)

### Task 5: Add Integration Tests (30 min)
- [ ] Create `crates/pomodoroom-core/tests/energy_integration.rs`
- [ ] Test curve computation with sample data
- [ ] Test confidence calculation
- [ ] Test cold-start fallback
- [ ] Test ASCII chart output

**Files:**
- `crates/pomodoroom-core/tests/energy_integration.rs` (new)

## Acceptance Criteria

- [ ] Energy curve updates from real session data
- [ ] Recommendations reference curve confidence
- [ ] Cold-start fallback is defined (default 0.5)
- [ ] CLI commands work: show, update, recommend
- [ ] All tests pass

## Dependencies

- chrono (already in deps)
- serde (already in deps)
- Existing session records in database
