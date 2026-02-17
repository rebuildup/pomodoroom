//! Recipe management CLI commands.

use clap::Subcommand;
use std::io::Read;
use pomodoroom_core::{Event, Recipe};
use pomodoroom_core::recipes::{RecipeStore, ActionExecutor};

#[derive(Subcommand)]
pub enum RecipeAction {
    /// List all recipes
    List,

    /// Add a recipe from TOML (reads stdin)
    ///
    /// # TOML Format
    ///
    /// Recipe TOML should define name, description, enabled status,
    /// and inline arrays for triggers and actions:
    ///
    /// ```text
    /// name = "my-recipe"
    /// description = "My automation recipe"
    /// enabled = true
    ///
    /// triggers = [
    ///   { type = "TimerCompleted", step_type = "focus" },
    /// ]
    ///
    /// actions = [
    ///   { type = "CreateBreak", duration_mins = 5 },
    /// ]
    /// ```
    ///
    /// Step types: "focus", "short_break", "long_break"
    /// Action types: "CreateBreak" (with duration_mins) - [placeholder, not yet implemented]
    /// Trigger types: "TimerCompleted", "TimerSkipped", "TimerStarted", "TimerReset"
    Add,

    /// Remove a recipe by name
    Remove {
        /// Recipe name to remove
        name: String,
    },

    /// Test a recipe with a trigger event
    Test {
        /// Recipe name to test
        name: String,
        /// Event type to simulate
        #[arg(long)]
        event: String,
    },
}

pub fn run(action: RecipeAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        RecipeAction::List => list_recipes(),
        RecipeAction::Add => add_recipe(),
        RecipeAction::Remove { name } => remove_recipe(name),
        RecipeAction::Test { name, event } => test_recipe(name, event),
    }
}

fn list_recipes() -> Result<(), Box<dyn std::error::Error>> {
    let store = RecipeStore::open()?;
    let recipes = store.load_all()?;

    if recipes.is_empty() {
        println!("No recipes found.");
        return Ok(());
    }

    println!("Recipes ({}):", recipes.len());
    println!();

    for recipe in recipes {
        let status = if recipe.enabled { "enabled" } else { "disabled" };
        println!("  {} ({})", recipe.name, status);
        println!("    {}", recipe.description);
        println!("    Triggers: {}", recipe.triggers.len());
        println!("    Actions: {}", recipe.actions.len());
        println!();
    }

    Ok(())
}

fn add_recipe() -> Result<(), Box<dyn std::error::Error>> {
    let mut toml_content = String::new();
    std::io::stdin().read_to_string(&mut toml_content)?;

    let recipe: Recipe = toml::from_str(&toml_content)?;

    let store = RecipeStore::open()?;
    let mut recipes = store.load_all()?;

    // Check for duplicate name
    if recipes.iter().any(|r| r.name == recipe.name) {
        return Err(format!("Recipe '{}' already exists", recipe.name).into());
    }

    let recipe_name = recipe.name.clone();
    recipes.push(recipe);
    store.save_all(&recipes)?;

    println!("Recipe '{}' added successfully.", recipe_name);

    Ok(())
}

fn remove_recipe(name: String) -> Result<(), Box<dyn std::error::Error>> {
    let store = RecipeStore::open()?;
    let mut recipes = store.load_all()?;

    let original_len = recipes.len();
    recipes.retain(|r| r.name != name);

    if recipes.len() == original_len {
        return Err(format!("Recipe '{}' not found", name).into());
    }

    store.save_all(&recipes)?;

    println!("Recipe '{}' removed successfully.", name);

    Ok(())
}

fn test_recipe(name: String, event_type: String) -> Result<(), Box<dyn std::error::Error>> {
    let store = RecipeStore::open()?;
    let recipes = store.load_all()?;

    let recipe = recipes.iter()
        .find(|r| r.name == name)
        .ok_or_else(|| format!("Recipe '{}' not found", name))?;

    // Create a mock event for testing
    let event = create_mock_event(&event_type)?;

    println!("Testing recipe '{}' with event '{}':", name, event_type);
    println!();

    if let Some(actions) = recipe.matches_event(&event) {
        println!("Matched! Actions to execute:");
        for (i, action) in actions.iter().enumerate() {
            println!("  {}. {}", i + 1, action.description());
        }

        // Run in dry-run mode
        let executor = ActionExecutor::dry_run();
        let action_pairs: Vec<(String, pomodoroom_core::Action)> = actions.iter()
            .map(|a| (name.clone(), a.clone()))
            .collect();
        let log = executor.execute_batch(action_pairs);

        println!();
        println!("Execution results:");
        println!("  Success: {}", log.success_count());
        println!("  Failed: {}", log.failure_count());
    } else {
        println!("No match - recipe would not trigger with this event.");
    }

    Ok(())
}

fn create_mock_event(event_type: &str) -> Result<Event, Box<dyn std::error::Error>> {
    use chrono::Utc;

    Ok(match event_type {
        "TimerCompleted" => Event::TimerCompleted {
            step_index: 0,
            step_type: pomodoroom_core::timer::StepType::Focus,
            at: Utc::now(),
        },
        "TimerSkipped" => Event::TimerSkipped {
            from_step: 0,
            to_step: 1,
            at: Utc::now(),
        },
        "TimerStarted" => Event::TimerStarted {
            step_index: 0,
            step_type: pomodoroom_core::timer::StepType::Focus,
            duration_secs: 1500,
            at: Utc::now(),
        },
        "TimerReset" => Event::TimerReset { at: Utc::now() },
        _ => {
            return Err(format!(
                "Unknown event type: {}. Valid types: TimerCompleted, TimerSkipped, TimerStarted, TimerReset",
                event_type
            ).into());
        }
    })
}
