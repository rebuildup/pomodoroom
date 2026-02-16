# Estimate Accuracy Tracking Design

> Issue #233

## Goal
Track planned vs actual duration accuracy at granular levels (by tag/project).

## Design Approach

### Accuracy Metrics

1. **EstimateAccuracy** - Accuracy metrics for a single session or aggregated
   - planned_duration: u32 (minutes)
   - actual_duration: u32 (minutes)
   - error: f64 (actual - planned)
   - absolute_error: f64 (|actual - planned|)
   - relative_error: f64 (error / planned)
   - bias: f64 (positive = underestimation, negative = overestimation)

2. **AccuracyStats** - Aggregated statistics
   - tag_or_project: String
   - session_count: u64
   - mean_absolute_error (MAE): f64
   - mean_bias: f64
   - accuracy_percentage: f64
   - corrective_factor: f64

3. **EstimateAccuracyTracker** - Analyzer for computing accuracy
   - time_range: (DateTime, DateTime)
   - group_by: GroupBy (Tag, Project)

### Data Model

```rust
/// Accuracy metrics for a single estimate.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EstimateAccuracy {
    pub planned_duration: u32,
    pub actual_duration: u32,
    pub error: f64,
    pub absolute_error: f64,
    pub relative_error: f64,
}

/// Aggregated accuracy statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccuracyStats {
    pub key: String,  // Tag or project name
    pub session_count: u64,
    pub mean_planned: f64,
    pub mean_actual: f64,
    pub mean_absolute_error: f64,
    pub mean_bias: f64,
    pub accuracy_percentage: f64,
    pub corrective_factor: f64,
    pub confidence: f64,
}

/// Group accuracy metrics by.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GroupBy {
    Tag,
    Project,
}

/// Tracker for computing estimate accuracy.
pub struct EstimateAccuracyTracker {
    pub min_sessions_for_confidence: u64,
}
```

### Accuracy Calculation

1. **MAE (Mean Absolute Error)**: Average of |actual - planned|
2. **Mean Bias**: Average of (actual - planned), indicates direction
3. **Accuracy Percentage**: 1.0 - min(1.0, MAE / mean_planned)
4. **Corrective Factor**: mean_actual / mean_planned (multiply estimates by this)

### Bias Interpretation
- Positive bias: Underestimation (tasks take longer than expected)
- Negative bias: Overestimation (tasks finish faster than expected)
- Corrective factor > 1.0: Multiply estimates up
- Corrective factor < 1.0: Multiply estimates down

### CLI Commands

```bash
pomodoroom stats accuracy                    # Show overall accuracy
pomodoroom stats accuracy --by-tag           # Group by tag
pomodoroom stats accuracy --by-project       # Group by project
pomodoroom stats accuracy --weekly           # Weekly report
pomodoroom stats accuracy --monthly          # Monthly report
pomodoroom stats accuracy --suggest-factors  # Show corrective factors
```

### Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|---------------|
| Accuracy metrics available weekly/monthly | Time range filtering in tracker |
| Corrective factors are explainable | Display bias and factor with examples |
| Planner can optionally apply factors | CLI output shows factors |

## Implementation Plan

### Task 1: Add Estimate Accuracy Types
- Create `crates/pomodoroom-core/src/stats/estimate_accuracy.rs`
- Define EstimateAccuracy, AccuracyStats, GroupBy, EstimateAccuracyTracker

### Task 2: Add Accuracy Computation Logic
- Implement tracker.compute_accuracy() method
- Calculate MAE, bias, accuracy percentage
- Implement corrective factor calculation

### Task 3: Add Database Method for Accuracy Data
- Add get_estimate_accuracy_data() to Database
- Query sessions with planned vs actual duration

### Task 4: Extend Stats CLI Command
- Add `accuracy` subcommand to stats
- Add --by-tag, --by-project, --weekly, --monthly flags
- Display accuracy report with corrective factors

### Task 5: Add Integration Tests
- Test accuracy calculation
- Test grouping by tag/project
- Test corrective factor suggestions
