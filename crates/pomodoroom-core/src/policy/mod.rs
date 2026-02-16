//! Policy import/export module.
//!
//! This module provides functionality for exporting and importing timer policies
//! (schedules, break settings, etc.) with semantic versioning compatibility checks.

mod bundle;
mod compat;

pub use bundle::{PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
pub use compat::{check_compatibility, Compatibility};
