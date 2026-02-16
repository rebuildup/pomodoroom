# JIT Event Engine Implementation Plan

> Issue #431

## Overview

Replace the Gantt scheduler with a Just-In-Time event-driven engine.

## Phase 1: Core JIT Module (45 min)

### Task 1.1: Create jit module structure (10 min)
- [ ] Create `crates/pomodoroom-core/src/jit/mod.rs`
- [ ] Create `crates/pomodoroom-core/src/jit/engine.rs`
- [ ] Create `crates/pomodor-core/src/jit/scoring.rs`
- [ ] Create `crates/pomodoroom-core/src/jit/context.rs`
- [ ] Add module to `lib.rs`

**Files:**
- `crates/pomodoroom-core/src/jit/*.rs` (new)
- `crates/pomodoroom-core/src/lib.rs` (modify)

### Task 1.2: Implement data structures (15 min)
- [ ] `Energy` struct with level and drift_debt
- [ ] `EnergyLevel` enum (Low/Medium/High)
- [ ] `Context` struct with current state
- [ ] `Suggestion` struct
- [ ] `SuggestionReason` enum
- [ ] Add unit tests

**Files:**
- `crates/pomodoroom-core/src/jit/context.rs` (modify)

### Task 1.3: Implement scoring algorithm (20 min)
- [ ] `energy_match_score()` - Energy level matching
- [ ] `context_continuation_score()` - Tag/project continuity
- [ ] `drift_penalty()` - Time drift penalty
- [ ] `priority_adjustment()` - Priority weighting
- [ ] `time_preference()` - Time of day preferences
- [ ] `calculate_score()` - Combined scoring
- [ ] Add unit tests

**Files:**
- `crates/pomodoroom-core/src/jit/scoring.rs` (modify)

## Phase 2: JIT Engine Implementation (30 min)

### Task 2.1: Implement suggest_next_tasks (15 min)
- [ ] Fetch ready tasks from database
- [ ] Apply scoring algorithm
- [ ] Sort by score
- [ ] Return top 3 suggestions
- [ ] Add tests

**Files:**
- `crates/pomodoroom-core/src/jit/engine.rs` (modify)

### Task 2.2: Implement suggest_break_duration (10 min)
- [ ] Calculate based on energy level
- [ ] Return appropriate duration
- [ ] Add tests

**Files:**
- `crates/pomodoroom-core/src/jit/engine.rs` (modify)

### Task 2.3: Implement record_completion (5 min)
- [ ] Store completion for context tracking
- [ ] Update recent tasks list
- [ ] Add tests

**Files:**
- `crates/pomodoroom-core/src/jit/engine.rs` (modify)

## Phase 3: CLI Integration (20 min)

### Task 3.1: Add jit subcommand (10 min)
- [ ] Add `JitCommand` enum
- [ ] Add `Suggest` variant
- [ ] Add `SuggestBreak` variant
- [ ] Wire up handler

**Files:**
- `crates/pomodoroom-cli/src/main.rs` (modify)
- `crates/pomodoroom-cli/src/commands/jit.rs` (new)

### Task 3.2: Implement handlers (10 min)
- [ ] `handle_jit_suggest()` - Show suggestions
- [ ] `handle_jit_suggest_break()` - Show break duration
- [ ] Format output nicely

**Files:**
- `crates/pomodoroom-cli/src/commands/jit.rs` (modify)

## Phase 4: Tauri Bridge (20 min)

### Task 4.1: Add Tauri commands (15 min)
- [ ] `jit_suggest_next_tasks()` command
- [ ] `jit_suggest_break()` command
- [ ] Return DTO structures
- [ ] Add to capabilities

**Files:**
- `src-tauri/src/bridge.rs` (modify)
- `src-tauri/capabilities/default.json` (modify)

### Task 4.2: Create types (5 min)
- [ ] `SuggestionDto` type
- [ ] `ContextDto` type
- [ ] Conversion functions

**Files:**
- `src/types/jit.ts` (new)

## Phase 5: UI Components (30 min)

### Task 5.1: Create TaskSuggestionPanel (20 min)
- [ ] `TaskSuggestionPanel` component
- [ ] `TaskSuggestionCard` component
- [ ] Show rank, score, reason
- [ ] Handle task selection

**Files:**
- `src/components/m3/TaskSuggestionPanel.tsx` (new)
- `src/components/m3/TaskSuggestionCard.tsx` (new)

### Task 5.2: Integrate with existing UI (10 min)
- [ ] Add to main timer view
- [ ] Wire up Tauri commands
- [ ] Handle empty state

**Files:**
- `src/views/MiniTimerView.tsx` (modify)
- `src/components/m3/PomodoroTimer.tsx` (modify)

## Phase 6: Tests (20 min)

### Task 6.1: Unit tests (10 min)
- [ ] Test scoring algorithm
- [ ] Test suggestion ranking
- [ ] Test break duration calculation
- [ ] Test context tracking

**Files:**
- `crates/pomodoroom-core/src/jit/*.rs` (add tests)

### Task 6.2: Integration tests (10 min)
- [ ] Test CLI commands
- [ ] Test Tauri bridge
- [ ] End-to-end flow tests

## Acceptance Criteria

- [ ] `jit suggest` shows top 3 ranked tasks
- [ ] `jit suggest-break` shows appropriate break duration
- [ ] Scoring considers energy, context, priority
- [ ] UI displays suggestions with reasoning
- [ ] All tests pass

## Dependencies

- rusqlite (already in deps)
- chrono (already in deps)
- Existing task database schema

## Estimated Time

Total: ~2 hours 45 minutes

Can be split across multiple sessions:
- Session 1: Phase 1-2 (Core JIT) - 1h 15min
- Session 2: Phase 3-4 (CLI + Tauri) - 40min
- Session 3: Phase 5-6 (UI + Tests) - 50min
