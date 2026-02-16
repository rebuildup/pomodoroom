# Break Adherence Dashboard Design

> Issue #230

## Goal
Visualize adherence to recommended breaks over time.

## Current State Analysis

The `sessions` table stores completed sessions with:
- `step_type`: "focus" or "break"
- `completed_at`: timestamp
- `duration_min`: actual duration
- `task_id`, `project_id`: task/project association

**Gap**: We don't track whether breaks were "taken", "skipped", or "deferred". We need to infer this from the session patterns.

## Design Approach

### Break Adherence Inference Logic

A break is considered:
- **Taken**: A "break" session exists after a "focus" session
- **Skipped**: No "break" session within expected window after focus
- **Deferred**: Break session exists but with delay > threshold

### Data Model

```sql
-- New table for break adherence analysis
CREATE TABLE break_adherence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    focus_session_id INTEGER NOT NULL,  -- Reference to focus session
    expected_break_at TEXT NOT NULL,    -- When break should have started
    actual_break_at TEXT,               -- When break actually started (NULL = skipped)
    break_status TEXT NOT NULL,         -- 'taken', 'skipped', 'deferred'
    delay_min INTEGER DEFAULT 0,        -- Minutes delayed (0 for taken/skipped)
    task_id TEXT,
    project_id TEXT,
    hour_of_day INTEGER,                -- 0-23 for time-of-day analysis
    day_of_week INTEGER,                -- 0-6 for day analysis
    created_at TEXT NOT NULL
);
```

### API Structure

```rust
pub struct BreakAdherenceStats {
    pub total_focus_sessions: u64,
    pub breaks_taken: u64,
    pub breaks_skipped: u64,
    pub breaks_deferred: u64,
    pub adherence_rate: f64,  // taken / total
    pub avg_delay_min: f64,
}

pub struct HourlyAdherence {
    pub hour: u8,
    pub total: u64,
    pub taken: u64,
    pub skipped: u64,
    pub deferred: u64,
    pub risk_score: f64,  // 0-1, higher = more risk
}

pub struct BreakAdherenceReport {
    pub stats: BreakAdherenceStats,
    pub by_hour: Vec<HourlyAdherence>,
    pub by_project: HashMap<String, BreakAdherenceStats>,
    pub high_risk_windows: Vec<HighRiskWindow>,
}
```

### CLI Commands

```bash
pomodoroom stats breaks                    # Show break adherence summary
pomodoroom stats breaks --by-hour          # Hourly breakdown
pomodoroom stats breaks --by-project       # Per-project breakdown
pomodoroom stats breaks --export csv       # Export to CSV
pomodoroom stats breaks --start 2026-01-01 --end 2026-01-31  # Date range filter
```

## Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|---------------|
| Dashboard filters by date range and project | `--start`, `--end`, `--project` flags |
| Ratios are computed from session events | `BreakAdherenceStats` with computed ratios |
| Export to CSV is supported | `--export csv` flag |

## Implementation Plan

### Task 1: Add break_adherence table migration
- Modify `database.rs` to add new table
- Add indexes for efficient querying

### Task 2: Implement break adherence computation
- Create `BreakAdherenceAnalyzer` struct
- Implement inference logic from session patterns
- Add `compute_adherence()` method

### Task 3: Add stats query methods
- `get_break_adherence_stats(start, end, project)`
- `get_hourly_adherence(start, end)`
- `get_project_adherence(start, end)`

### Task 4: Add CLI commands
- Add `breaks` subcommand to `stats` command
- Implement `--by-hour`, `--by-project`, `--export` flags

### Task 5: Add integration tests
- Test adherence computation with sample sessions
- Test CSV export

### Task 6: Run full test suite
