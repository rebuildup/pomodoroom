# Multi-Objective Scheduler Scoring Engine

## Overview
This implementation replaces heuristic-only ordering with a weighted objective scoring system for task scheduling.

## Objective Terms

### 1. Due Date Risk
- **Weight**: 0.25 (default)
- **Description**: Prioritizes tasks with approaching deadlines
- **Score**: Based on buffer time (remaining hours vs task duration)
- **Higher score** = More comfortable deadline

### 2. Context Switch
- **Weight**: 0.20 (default)
- **Description**: Minimizes context switching between different projects
- **Score**: 1.0 (same project), 0.7 (same energy), 0.4 (different project/energy)
- **Higher score** = Less context switching needed

### 3. Energy Fit
- **Weight**: 0.20 (default)
- **Description**: Matches task energy level to time of day
- **Morning**: Prefers High energy tasks
- **Afternoon**: Prefers Medium energy tasks
- **Evening**: Prefers Low energy tasks
- **Score**: 1.0 (exact match), 0.6 (one level off), 0.2 (opposite)

### 4. Break Compliance
- **Weight**: 0.15 (default)
- **Description**: Ensures breaks are taken regularly
- **Score**: Decreases as consecutive tasks without break increase
- **Higher score** = Better break compliance

### 5. Priority
- **Weight**: 0.20 (default)
- **Description**: Respects task priority values (0-100)
- **Score**: Normalized priority / 100

## Weight Profiles

### Balanced (Default)
```rust
ObjectiveWeights::balanced()
```
Equal distribution across all objectives.

### Deadline Focused
```rust
ObjectiveWeights::deadline_focused()
```
Prioritizes meeting deadlines (40% due_date_risk).

### Deep Work
```rust
ObjectiveWeights::deep_work()
```
Minimizes context switches (35% context_switch).

### Sustainable
```rust
ObjectiveWeights::sustainable()
```
Focuses on energy management and breaks (30% each).

## API Usage

```rust
let engine = ScoringEngine::with_weights(ObjectiveWeights::deadline_focused());

let ctx = ScoringContext {
    task: &my_task,
    start_time: Utc::now(),
    end_time: Utc::now() + Duration::hours(1),
    previous_task: Some(&prev_task),
    hour_of_day: 9,
    streak_without_break: 2,
    weights: ObjectiveWeights::balanced(),
};

let breakdown = engine.score_task(&ctx);
println!("Total score: {}", breakdown.total_score);

for term in &breakdown.terms {
    println!("{}: {} (weight: {})", 
        term.name, term.score, term.weight);
}
```

## Explainability
Each scoring result includes:
- Individual term scores and contributions
- Total weighted score
- Top contributing term identification
- Terms sorted by contribution

## Test Coverage
- ✅ Score breakdown calculation
- ✅ Objective term creation
- ✅ Due date risk scoring
- ✅ Energy fit scoring
- ✅ Context switch scoring
- ✅ Break compliance scoring
- ✅ Weight profiles
- ✅ Complete scoring workflow
- ✅ Weight validation

## Future Enhancements
- Integration with scheduler
- Profile-specific weight persistence
- Benchmarking framework
- User feedback incorporation
