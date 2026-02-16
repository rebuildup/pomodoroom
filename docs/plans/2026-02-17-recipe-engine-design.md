# Recipe Engine Design

## Overview
Internal recipe engine (if-this-then-that) for personal automation in Pomodoroom.

## Goals
- Allow users to automate actions with local trigger/condition/action recipes
- Deterministic recipe execution
- Failed actions logged with reason

## Architecture

### Core Components

1. **Recipe Engine** (`recipes/` module)
   - Loads recipes from TOML
   - Evaluates events against triggers
   - Queues actions for execution

2. **Recipe Store** (`recipes/store.rs`)
   - Reads/writes `~/.pomodoroom/recipes.toml`
   - Validation and serialization

3. **Action Executor** (`recipes/executor.rs`)
   - Executes actions (create break, etc.)
   - Logs failures

4. **CLI Integration** (`recipes/command.rs`)
   - `pomodoroom-cli recipe list/add/remove/test`

### Data Flow
```
TimerEngine → Event → RecipeEngine.evaluate()
                   ↓
            Condition matches?
                   ↓
            ActionExecutor.execute()
                   ↓
            Break session created
```

## Data Structures

### TOML Format
```toml
# ~/.pomodoroom/recipes.toml
[[recipes]]
name = "auto-break-after-focus"
description = "Auto-create break after focus completes"
enabled = true

[[recipes.triggers]]
type = "TimerCompleted"
step_type = "Focus"

[[recipes.actions]]
type = "CreateBreak"
duration_mins = 5
```

### Rust Structures
```rust
pub struct Recipe {
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub triggers: Vec<Trigger>,
    pub actions: Vec<Action>,
}

pub enum Trigger {
    TimerCompleted { step_type: StepType },
    TimerSkipped { from_step: StepType },
    TimerStarted { step_type: StepType },
    TimerReset,
    // Extendable for future
}

pub enum Action {
    CreateBreak { duration_mins: u32 },
    // Extendable for future
}
```

## Evaluation Logic

Recipes are evaluated in TOML order. Matching triggers produce actions that execute sequentially.

```rust
impl RecipeEngine {
    pub fn evaluate_event(&self, event: &Event) -> Vec<Action> {
        let mut matched_actions = Vec::new();

        for recipe in self.enabled_recipes() {
            if let Some(actions) = recipe.matches(event) {
                matched_actions.extend(actions);
            }
        }

        matched_actions
    }
}
```

Determinism guaranteed by:
- Sequential recipe evaluation
- Sequential action execution
- No parallel execution

## Error Handling

Failed actions are logged but don't stop other actions:

```rust
pub struct ActionResult {
    pub recipe_name: String,
    pub action_type: String,
    pub status: ExecutionStatus,
}

pub enum ExecutionStatus {
    Success,
    Failed { reason: String, retriable: bool },
    Skipped { reason: String },
}
```

## CLI Commands

```bash
# List recipes
pomodoroom-cli recipe list

# Add recipe from stdin
pomodoroom-cli recipe add < recipe.toml

# Remove recipe
pomodoroom-cli recipe remove <name>

# Test recipe (dry-run)
pomodoroom-cli recipe test <name> --event TimerCompleted
```

## File Structure
```
crates/pomodoroom-core/src/recipes/
  mod.rs              # Public exports
  store.rs            # Recipe TOML loading/saving
  engine.rs           # Evaluation logic
  executor.rs         # Action execution
  trigger.rs          # Trigger definitions
  action.rs           # Action definitions

crates/pomodoroom-cli/src/commands/
  recipe.rs           # CLI recipe commands

~/.pomodoroom/
  recipes.toml        # User recipe definitions
  recipe-execution.log  # Execution log
```

## Testing Strategy

1. Recipe parser tests (TOML → structs)
2. Trigger matching tests (event → trigger)
3. Engine evaluation tests (event → actions)
4. Action executor tests (actions → side effects)
5. Error handling tests (failures logged, continues)
6. Integration tests (full flow)

## Extension Points

Future additions:
- More triggers (TaskState, time-based, tag-based)
- More actions (task ops, notifications, mode switch)
- Condition predicates (time range, energy level)
- Recipe editor UI
- Recipe templates/presets
