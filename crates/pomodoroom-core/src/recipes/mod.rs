//! Recipe engine for if-this-then-that automation.
//!
//! Allows users to define recipes that trigger actions based on system events.

pub mod trigger;
pub mod action;
pub mod recipe;

pub use trigger::Trigger;
pub use action::Action;
pub use recipe::Recipe;
