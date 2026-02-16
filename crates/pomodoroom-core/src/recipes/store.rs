//! Recipe storage and persistence.
//!
//! Manages loading and saving recipes from TOML files.

use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use crate::storage::data_dir;
use super::{Recipe, RecipeError, Result};

/// Storage for user recipes
pub struct RecipeStore {
    path: PathBuf,
}

/// Wrapper for serializing recipes to TOML
#[derive(Serialize, Deserialize)]
struct RecipesFile {
    recipes: Vec<Recipe>,
}

impl RecipeStore {
    /// Open the recipe store, creating default if needed
    pub fn open() -> Result<Self> {
        let data_dir = data_dir()
            .map_err(|e| RecipeError::DataDirError(e.to_string()))?;

        let path = data_dir.join("recipes.toml");

        // Create file if it doesn't exist
        if !path.exists() {
            std::fs::write(&path, r#"# Recipes configuration
[[recipes]]
name = "example"
description = "Example recipe"
enabled = false

[[recipes.triggers]]
type = "TimerCompleted"
step_type = "focus"

[[recipes.actions]]
type = "CreateBreak"
duration_mins = 5
"#)?;
        }

        Ok(Self { path })
    }

    /// Create a recipe store with a custom path (for testing)
    #[cfg(test)]
    pub fn with_path(path: PathBuf) -> Self {
        Self { path }
    }

    /// Load all recipes from storage
    pub fn load_all(&self) -> Result<Vec<Recipe>> {
        // Return empty vec if file doesn't exist
        if !self.path.exists() {
            return Ok(Vec::new());
        }

        let content = std::fs::read_to_string(&self.path)?;

        // Parse as top-level array wrapper
        let file: RecipesFile = toml::from_str(&content)
            .unwrap_or_else(|_| {
                // Handle empty or malformed file
                RecipesFile { recipes: Vec::new() }
            });

        Ok(file.recipes)
    }

    /// Save all recipes to storage
    pub fn save_all(&self, recipes: &[Recipe]) -> Result<()> {
        let file = RecipesFile {
            recipes: recipes.to_vec(),
        };
        let content = toml::to_string_pretty(&file)?;
        std::fs::write(&self.path, content)?;
        Ok(())
    }

    /// Get the recipes file path
    pub fn path(&self) -> &PathBuf {
        &self.path
    }
}

impl Default for RecipeStore {
    fn default() -> Self {
        Self::open().expect("Failed to open recipe store")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_creates_default_file() {
        let temp_dir = std::env::temp_dir().join("recipe_test_1");
        std::fs::create_dir_all(&temp_dir).unwrap();

        let store = RecipeStore::with_path(temp_dir.join("recipes.toml"));

        // File doesn't exist yet - load should return empty vec
        let recipes = store.load_all().unwrap();
        assert_eq!(recipes.len(), 0);

        std::fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_store_roundtrip() {
        let temp_dir = std::env::temp_dir().join("recipe_test_2");
        std::fs::create_dir_all(&temp_dir).unwrap();

        let store = RecipeStore::with_path(temp_dir.join("recipes.toml"));

        let recipes = vec![
            Recipe {
                name: "test1".to_string(),
                description: "test".to_string(),
                enabled: true,
                triggers: vec![],
                actions: vec![],
            },
        ];

        store.save_all(&recipes).unwrap();
        let loaded = store.load_all().unwrap();

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "test1");

        std::fs::remove_dir_all(temp_dir).unwrap();
    }
}
