//! Recipe evaluation engine.
//!
//! Evaluates events against recipes and produces actions for execution.

use crate::Event;
use crate::recipes::{Action, Recipe, RecipeStore, Result};

/// Recipe engine that evaluates events and returns matching actions
pub struct RecipeEngine {
    store: RecipeStore,
}

impl RecipeEngine {
    /// Create a new recipe engine
    pub fn new() -> Result<Self> {
        Ok(Self {
            store: RecipeStore::open()?,
        })
    }

    /// Load only enabled recipes
    pub fn load_enabled_recipes(&self) -> Result<Vec<Recipe>> {
        let all = self.store.load_all()?;
        Ok(all.into_iter().filter(|r| r.enabled).collect())
    }

    /// Evaluate an event and return matching actions
    /// Returns all actions from all matching recipes in order
    pub fn evaluate_event(&self, event: &Event) -> Result<Vec<(String, Action)>> {
        let recipes = self.load_enabled_recipes()?;
        let mut results = Vec::new();

        for recipe in recipes {
            if let Some(actions) = recipe.matches_event(event) {
                for action in actions {
                    results.push((recipe.name.clone(), action.clone()));
                }
            }
        }

        Ok(results)
    }
}

impl Default for RecipeEngine {
    fn default() -> Self {
        Self::new().expect("Failed to create recipe engine")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_engine_returns_matching_actions() {
        let temp_dir = std::env::temp_dir().join("engine_test_1");
        std::fs::create_dir_all(&temp_dir).unwrap();

        let store = RecipeStore::with_path(temp_dir.join("recipes.toml"));

        let recipes = vec![Recipe {
            name: "auto-break".to_string(),
            description: "Auto break".to_string(),
            enabled: true,
            triggers: vec![crate::recipes::Trigger::TimerCompleted {
                step_type: crate::timer::StepType::Focus,
            }],
            actions: vec![Action::CreateBreak { duration_mins: 5 }],
        }];

        store.save_all(&recipes).unwrap();

        let engine = RecipeEngine { store };
        let event = Event::TimerCompleted {
            step_index: 0,
            step_type: crate::timer::StepType::Focus,
            at: Utc::now(),
        };

        let actions = engine.evaluate_event(&event).unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].0, "auto-break");

        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_engine_skips_disabled_recipes() {
        let temp_dir = std::env::temp_dir().join("engine_test_2");
        std::fs::create_dir_all(&temp_dir).unwrap();

        let store = RecipeStore::with_path(temp_dir.join("recipes.toml"));

        let recipes = vec![Recipe {
            name: "disabled-recipe".to_string(),
            description: "Disabled".to_string(),
            enabled: false,
            triggers: vec![crate::recipes::Trigger::TimerReset],
            actions: vec![Action::CreateBreak { duration_mins: 5 }],
        }];

        store.save_all(&recipes).unwrap();

        let engine = RecipeEngine { store };
        let event = Event::TimerReset { at: Utc::now() };

        let actions = engine.evaluate_event(&event).unwrap();
        assert_eq!(actions.len(), 0);

        std::fs::remove_dir_all(temp_dir).unwrap();
    }
}
