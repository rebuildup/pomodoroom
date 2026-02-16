# Interruption Heatmap Implementation Plan

> Issue #232

## Overview

Implement interruption heatmap by hour and source to identify when and why interruptions cluster.

## Tasks

### Task 1: Add Interruption Types (30 min)
- [ ] Create `crates/pomodoroom-core/src/stats/interruption_heatmap.rs`
- [ ] Define InterruptionSource, InterruptionEvent, HeatmapCell, InterruptionHeatmapAnalyzer
- [ ] Export from stats module

**Files:**
- `crates/pomodoroom-core/src/stats/interruption_heatmap.rs` (new)
- `crates/pomodoroom-core/src/stats/mod.rs` (modify)
- `crates/pomodoroom-core/src/lib.rs` (modify)

### Task 2: Add Heatmap Computation Logic (45 min)
- [ ] Implement InterruptionHeatmapAnalyzer::build_heatmap()
- [ ] Calculate cell heat intensity from interruption count/duration
- [ ] Implement peak hour identification
- [ ] Implement ASCII heatmap visualization

**Files:**
- `crates/pomodoroom-core/src/stats/interruption_heatmap.rs` (modify)

### Task 3: Add Database Method for Interruption Data (20 min)
- [ ] Add get_interruption_events() to Database
- [ ] Query operation_log for interruption events
- [ ] Filter by date range

**Files:**
- `crates/pomodoroom-core/src/storage/database.rs` (modify)

### Task 4: Extend Stats CLI Command (30 min)
- [ ] Add `Interruptions` action to stats subcommand
- [ ] Add --source, --external, --internal, --hotspots flags
- [ ] Display ASCII heatmap

**Files:**
- `crates/pomodoroom-cli/src/commands/stats.rs` (modify)

### Task 5: Add Integration Tests (20 min)
- [ ] Create `crates/pomodoroom-core/tests/interruption_heatmap_integration.rs`
- [ ] Test heatmap computation
- [ ] Test source filtering
- [ ] Test peak hour identification

**Files:**
- `crates/pomodoroom-core/tests/interruption_heatmap_integration.rs` (new)

## Acceptance Criteria

- [ ] Heatmap supports source filters
- [ ] Hotspot windows influence planner suggestions
- [ ] Raw event query is reproducible

## Dependencies

- chrono (already in deps)
- serde (already in deps)
- Existing operation_log table for interruption tracking
