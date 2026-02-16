//! JIT (Just-In-Time) Event Engine
//!
//! This module provides just-in-time task suggestions based on current context,
//! replacing the future-calculating Gantt scheduler with an event-driven approach.
//!
//! # Philosophy
//!
//! **Don't calculate the future. Only suggest "what to do right now" based on current context.**
//!
//! The engine calculates suggestions ONLY at these trigger points:
//! - Task completion (user clicks "Complete")
//! - Interrupt selection (user selects "Interrupt" from Gatekeeper)
//! - Webhook received (AI/build ready)
//! - Break ended (break timer expires)

mod context;
mod engine;
mod scoring;

pub use context::{Context, Energy, EnergyLevel};
pub use engine::{JITEngine, Suggestion, SuggestionReason};
pub use scoring::{calculate_score, energy_match_score};
