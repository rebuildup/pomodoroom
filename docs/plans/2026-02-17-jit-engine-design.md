# JIT Event Engine Design

> Issue #431

## Overview

Replace the future-calculating Gantt scheduler with a Just-In-Time (JIT) event-driven engine.

## Current Problems

The current scheduler in `crates/pomodoroom-core/src/scheduler/`:
1. Pre-calculates all time slots for the day
2. Breaks when user behavior changes (webhook, etc.)
3. Infinite recompute loops

This is the "illusion of future prediction" - we shouldn't calculate the future at all.

## JIT Engine Design

### Core Philosophy

> **Don't calculate the future. Only suggest "what to do right now" based on current context.**

The system calculates **only** at these trigger points:

| Event | Trigger | Calculation |
|-------|---------|-------------|
| Task complete | User clicks "Complete" | Next top 3 tasks + optimal break time |
| Interrupt selected | User selects "Interrupt" from Gatekeeper | Next task based on remaining energy |
| Webhook received | AI/build ready | Add completed task to suggestion queue |
| Break ended | Break timer expires | Next task after energy recovery |

### Data Structures

```rust
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};

/// Energy level (0-100)
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Energy {
    pub level: EnergyLevel,
    pub drift_debt: Duration,  // Accumulated fatigue
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EnergyLevel {
    Low,
    Medium,
    High,
}

/// Current execution context
pub struct Context {
    pub current_energy: Energy,
    pub recent_tasks: Vec<TaskCompletion>,
    pub drift_time: Duration,
    pub time_of_day: Hour,
    pub active_tags: Vec<String>,
    pub active_projects: Vec<String>,
}

/// Task suggestion with reasoning
pub struct Suggestion {
    pub task: Task,
    pub score: f64,
    pub reason: SuggestionReason,
    pub estimated_duration: Duration,
}

pub enum SuggestionReason {
    HighEnergyAvailable { match_score: f64 },
    ContextContinuation { previous_task: String },
    SmallTaskForDriftedTime { available_minutes: u32 },
    BacklogCleanup { low_priority_count: u32 },
}

/// JIT Engine
pub struct JITEngine {
    db: Database,
}
```

### Scoring Algorithm

```rust
impl JITEngine {
    fn calculate_score(&self, task: &Task, context: &Context) -> f64 {
        let mut score = 50.0; // Base score

        // 1. Energy matching (±10 points)
        score += self.energy_match_score(task, context);

        // 2. Context continuation (±5 points)
        score += self.context_continuation_score(task, context);

        // 3. Drift penalty (-10 points)
        score -= self.drift_penalty(task, context);

        // 4. Priority adjustment (±15 points)
        score += self.priority_adjustment(task);

        // 5. Time of day preference (±5 points)
        score += self.time_preference(task, context);

        score.max(0.0).min(100.0)
    }
}
```

### API

```rust
impl JITEngine {
    /// Get top 3 task suggestions for current context
    pub fn suggest_next_tasks(&self, context: &Context) -> Vec<Suggestion> {
        todo!()
    }

    /// Suggest optimal break duration
    pub fn suggest_break_duration(&self, context: &Context) -> Duration {
        match context.current_energy.level {
            EnergyLevel::High => Duration::from_secs(300),   // 5 min
            EnergyLevel::Medium => Duration::from_secs(600),  // 10 min
            EnergyLevel::Low => Duration::from_secs(1800),    // 30 min
        }
    }

    /// Record task completion for context tracking
    pub fn record_completion(&self, task_id: &str, context: &Context) {
        todo!()
    }
}
```

## Migration Strategy

### Phase 1: Parallel Implementation (Non-breaking)
- Create `jit/` module alongside `scheduler/`
- Keep old scheduler working
- New CLI commands under `jit` prefix

### Phase 2: Gradual Migration
- Add feature flag to switch between schedulers
- Migrate database queries progressively

### Phase 3: Cleanup
- Remove old `scheduler/` module
- Update all references to use JIT engine

## Files to Modify

**New:**
- `crates/pomodoroom-core/src/jit/mod.rs`
- `crates/pomodoroom-core/src/jit/engine.rs`
- `crates/pomodoroom-core/src/jit/scoring.rs`
- `crates/pomodoroom-core/src/jit/context.rs`

**Modify:**
- `crates/pomodoroom-cli/src/main.rs` - Add `jit` subcommand
- `src-tauri/src/bridge.rs` - Add JIT commands
- `src/components/m3/TaskSuggestionPanel.tsx` - New UI component

**Remove:**
- `crates/pomodoroom-core/src/scheduler/mod.rs`
- `crates/pomodoroom-core/src/scheduler/slack.rs`
- `crates/pomodoroom-core/src/scheduler/schedule_db.rs`
