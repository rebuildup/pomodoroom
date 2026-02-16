//! Policy import/export and editing module.
//!
//! This module provides functionality for:
//! - Exporting and importing timer policies with semantic versioning
//! - Editing focus/break profiles with validation
//! - Previewing generated day plans from policy settings

mod bundle;
mod compat;
mod editor;

pub use bundle::{PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
pub use compat::{check_compatibility, parse_version, Compatibility};
pub use editor::{
    constraints, DayPlanPreview, EditorMetadata, PolicyEditor, StepPreview, ValidationError,
    ValidationResult,
};
