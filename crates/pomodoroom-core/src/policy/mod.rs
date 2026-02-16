//! Policy import/export and editing module.
//!
//! This module provides functionality for:
//! - Exporting and importing timer policies with semantic versioning
//! - Editing focus/break profiles with validation
//! - Previewing generated day plans from policy settings

mod bundle;
mod compat;
mod editor;
mod experiments;

pub use bundle::{PolicyBundle, PolicyData, PolicyMetadata, POLICY_VERSION};
pub use compat::{check_compatibility, parse_version, Compatibility};
pub use editor::{
    constraints, DayPlanPreview, EditorMetadata, PolicyEditor, StepPreview, ValidationError,
    ValidationResult,
};
pub use experiments::{
    ExperimentDefinition, ExperimentEngine, ExperimentMetric, ExperimentRegistry,
    ExperimentStatus, ExperimentSummary, ExperimentVariant, NotificationPolicyConfig,
    NotificationStyle, RandomizationStrategy, VariantId, VariantMetrics, VariantSummary,
};
