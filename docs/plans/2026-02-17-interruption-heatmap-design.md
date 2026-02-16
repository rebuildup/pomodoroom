# Interruption Heatmap Design

> Issue #232

## Goal
Identify when and why interruptions cluster by creating a heatmap visualization.

## Design Approach

### Interruption Source Classification

1. **InterruptionSource** - Source type classification
   - External: Slack, Email, Phone, Meeting, Other
   - Internal: Context switch, Fatigue, Blocker, Other
   - Priority: Low, Medium, High

2. **InterruptionEvent** - Individual interruption data
   - occurred_at: DateTime
   - duration_minutes: u32
   - source: InterruptionSource
   - impact: InterruptionImpact

3. **InterruptionHeatmap** - 2D grid of interruption counts
   - grid: 7 days x 24 hours (168 cells)
   - cell_heat: f64 (0.0-1.0 normalized intensity)
   - peak_hours: Vec<(u8, u8)> (day, hour) with highest activity

### Heatmap Visualization

ASCII-style heatmap using intensity characters:
- ` ` (0-1 interruptions)
- `░` (2-5)
- `▒` (6-10)
- `▓` (11-20)
- `█` (20+)

Color coding for source:
- (E) External
- (I) Internal

### Data Model

```rust
/// Interruption source classification.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterruptionSourceType {
    External,
    Internal,
}

/// Specific interruption source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InterruptionSource {
    Slack { priority: InterruptionPriority },
    Email { priority: InterruptionPriority },
    Phone { priority: InterruptionPriority },
    Meeting { priority: InterruptionPriority },
    ContextSwitch,
    Fatigue,
    Blocker,
    Other(String),
}

/// Interruption priority level.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterruptionPriority {
    Low,
    Medium,
    High,
}

/// Impact level of interruption.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InterruptionImpact {
    Minimal,
    Moderate,
    Severe,
}

/// Single interruption event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptionEvent {
    pub occurred_at: String,
    pub duration_minutes: u32,
    pub source: InterruptionSource,
    pub impact: InterruptionImpact,
}

/// Heatmap cell data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapCell {
    pub day_of_week: u8,
    pub hour: u8,
    pub interruption_count: u64,
    pub total_duration_min: u64,
    pub heat_intensity: f64,
}

/// Interruption heatmap analyzer.
pub struct InterruptionHeatmapAnalyzer {
    pub min_heat_threshold: u64,
}
```

### CLI Commands

```bash
pomodoroom stats interruptions                # Show full heatmap
pomodoroom stats interruptions --source slack  # Filter by source
pomodoroom stats interruptions --external       # External only
pomodoroom stats interruptions --internal       # Internal only
pomodoroom stats interruptions --hotspots      # Show peak hours only
```

### ASCII Heatmap Output

```
Interruption Heatmap (Last 30 Days)
     0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
Sun  `  `  `  `  `  ▒  ▓  █  █  █  ▓  ▒  ▒  `  `  `  `  `
Mon  `  `  `  `  ░  ▒  ▓  █  █  █  ▓  ▒  ▒  `  `  `  `  `
Tue  `  `  `  ░  ▒  ▓  ▓  █  █  ▓  ▒  ░  `  `  `  `  `  `
Wed  `  `  `  `  ▒  ▓  █  █  █  ▓  ▒  ▒  `  `  `  `  `  `
Thu  `  `  `  `  ▒  ▓  █  █  █  ▓  ▒  ▒  `  `  `  `  `  `
Fri  `  `  `  ░  ▒  ▓  ▓  █  █  ▓  ▒  ░  `  `  `  `  `  `
Sat  `  `  `  `  `  `  ▒  ▒  ▒  `  `  `  `  `  `  `  `  `  `

Legend: ` (0-1) ░ (2-5) ▒ (6-10) ▓ (11-20) █ (20+)
Peak hours: Mon 09:00 (15), Wed 14:00 (12), Thu 15:00 (18)
```

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|---------------|
| Heatmap supports source filters | --source, --external, --internal flags |
| Hotspot windows influence planner | Peak hours returned as list |
| Raw event query is reproducible | Database query with date range |

## Implementation Plan

### Task 1: Add Interruption Types
- Create `crates/pomodoroom-core/src/stats/interruption_heatmap.rs`
- Define InterruptionSource, InterruptionEvent, HeatmapCell, InterruptionHeatmapAnalyzer

### Task 2: Add Heatmap Computation Logic
- Implement analyzer.build_heatmap() method
- Calculate cell heat intensity based on interruption count/duration
- Identify peak hours

### Task 3: Add Database Method for Interruption Data
- Add get_interruption_events() to Database
- Query interruption events with date range filtering
- Store/retrieve interruption metadata

### Task 4: Extend Stats CLI Command
- Add `Interruptions` action to stats subcommand
- Add --source, --external, --internal, --hotspots flags
- Display ASCII heatmap

### Task 5: Add Integration Tests
- Test heatmap computation
- Test source filtering
- Test peak hour identification
- Test ASCII visualization
