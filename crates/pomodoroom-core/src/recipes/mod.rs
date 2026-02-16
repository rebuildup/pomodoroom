//! Recipe engine for if-this-then-that automation.
//!
//! Allows users to define recipes that trigger actions based on system events.

pub mod trigger;
pub mod action;
pub mod recipe;
pub mod store;
pub mod error;
pub mod engine;

pub use trigger::Trigger;
pub use action::Action;
pub use recipe::Recipe;
pub use store::RecipeStore;
pub use engine::RecipeEngine;
pub use error::{RecipeError, Result};
