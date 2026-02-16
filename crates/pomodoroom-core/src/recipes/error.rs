//! Recipe-specific errors.

use thiserror::Error;

/// Errors that can occur in recipe operations
#[derive(Error, Debug)]
pub enum RecipeError {
    #[error("Failed to read/write recipes file: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Failed to parse recipes TOML: {0}")]
    ParseError(#[from] toml::de::Error),

    #[error("Failed to serialize recipes TOML: {0}")]
    SerializeError(#[from] toml::ser::Error),

    #[error("Recipe '{0}' not found")]
    NotFound(String),

    #[error("Invalid recipe: {0}")]
    InvalidRecipe(String),

    #[error("Failed to access data directory: {0}")]
    DataDirError(String),
}

pub type Result<T, E = RecipeError> = std::result::Result<T, E>;
