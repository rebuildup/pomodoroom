# Energy Curve Learning Design

> Issue #220

## Goal
Infer per-user energy curve by hour/day from completed sessions.

## Design Approach

### Energy Curve Model

The energy curve represents the user's productivity patterns throughout the day and week:

1. **EnergyWindow** - Energy level for a specific hour/day combination
   - hour: 0-23
   - day_of_week: 0-6 (Sunday=0)
   - baseline_energy: f64 (0.0-1.0)
   - sample_count: u64
   - confidence: f64 (0.0-1.0)

2. **EnergyCurve** - Complete energy profile
   - windows: Vec<EnergyWindow>
   - last_updated: DateTime<Utc>
   - cold_start_fallback: f64 (default 0.5)

3. **EnergyCurveAnalyzer** - Analyzer for computing curves
   - min_samples_for_confidence: u64 (default 5)
   - rolling_window_days: u64 (default 30)

### Data Model

```rust
/// Energy level for a specific hour/day combination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyWindow {
    pub hour: u8,
    pub day_of_week: u8,
    pub baseline_energy: f64,
    pub sample_count: u64,
    pub confidence: f64,
}

/// Complete energy curve profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyCurve {
    pub windows: Vec<EnergyWindow>,
    pub last_updated: DateTime<Utc>,
    pub cold_start_fallback: f64,
}

/// Analyzer for computing energy curves from session data.
pub struct EnergyCurveAnalyzer {
    pub min_samples_for_confidence: u64,
    pub rolling_window_days: u64,
}
```

### Energy Calculation

Energy is calculated from session completion rate and focus quality:

1. **Completion Rate**: ratio of completed sessions to started sessions
2. **Focus Quality**: average duration / expected duration (25min)
3. **Combined Energy**: weighted average of completion and quality

### Confidence Levels

- 0-2 samples: confidence = 0.1 (very low)
- 3-5 samples: confidence = 0.3 (low)
- 6-10 samples: confidence = 0.6 (medium)
- 11+ samples: confidence = 0.8+ (high)

### Cold Start Fallback

When no data exists for a time window:
- Return cold_start_fallback (default 0.5)
- System recommends based on general patterns
- Gradually improves as user accumulates data

### CLI Commands

```bash
pomodoroom energy show                    # Show current energy curve
pomodoroom energy show --day monday       # Show for specific day
pomodoroom energy update                  # Force recalculation
pomodoroom energy recommend               # Get time-based recommendations
```

### Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|---------------|
| Energy curve updates from real session data | EnergyCurveAnalyzer.compute_curve() |
| Recommendations reference curve confidence | EnergyWindow.confidence field |
| Cold-start fallback is defined | EnergyCurve.cold_start_fallback |

## Implementation Plan

### Task 1: Add Energy Curve Types
- Create `crates/pomodoroom-core/src/energy/mod.rs`
- Create `crates/pomodoroom-core/src/energy/curve.rs`
- Define EnergyWindow, EnergyCurve, EnergyCurveAnalyzer

### Task 2: Add Curve Computation Logic
- Add compute_curve() method
- Calculate energy from session completion/quality
- Implement confidence scoring

### Task 3: Add Database Method for Energy Data
- Add get_energy_curve_data() to Database
- Query sessions grouped by hour/day

### Task 4: Add CLI Energy Command
- Add `energy` subcommand with show/update/recommend actions
- Display energy curve as ASCII chart

### Task 5: Add Integration Tests
- Test curve computation
- Test confidence calculation
- Test cold-start fallback
