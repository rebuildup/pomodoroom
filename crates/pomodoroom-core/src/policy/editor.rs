//! Policy editor with validation and preview capabilities.
//!
//! Provides functionality for:
//! - Editing focus/break policy settings
//! - Validating policy constraints before save
//! - Previewing generated day plans from policy
//! - Exporting/importing policies with versioned schema

use chrono::{DateTime, NaiveTime, Timelike, Utc};
use serde::{Deserialize, Serialize};

use super::bundle::{PolicyBundle, PolicyMetadata, POLICY_VERSION};
use crate::storage::{Config, ScheduleConfig};
use crate::timer::{Schedule, Step, StepType};

/// Validation constraints for policy values.
pub mod constraints {
    /// Minimum focus duration in minutes.
    pub const FOCUS_MIN: u32 = 1;
    /// Maximum focus duration in minutes.
    pub const FOCUS_MAX: u32 = 120;
    /// Minimum short break duration in minutes.
    pub const SHORT_BREAK_MIN: u32 = 1;
    /// Maximum short break duration in minutes.
    pub const SHORT_BREAK_MAX: u32 = 30;
    /// Minimum long break duration in minutes.
    pub const LONG_BREAK_MIN: u32 = 1;
    /// Maximum long break duration in minutes.
    pub const LONG_BREAK_MAX: u32 = 60;
    /// Minimum pomodoros before long break.
    pub const POMODOROS_MIN: u32 = 1;
    /// Maximum pomodoros before long break.
    pub const POMODOROS_MAX: u32 = 10;
    /// Minimum step duration in minutes.
    pub const STEP_DURATION_MIN: u64 = 1;
    /// Maximum step duration in minutes.
    pub const STEP_DURATION_MAX: u64 = 180;
    /// Maximum steps in a schedule.
    pub const MAX_STEPS: usize = 50;
    /// Maximum label length.
    pub const MAX_LABEL_LENGTH: usize = 100;
}

/// A validation error with field path and message.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ValidationError {
    /// Field path (dot-separated, e.g., "schedule.focus_duration").
    pub field: String,
    /// Human-readable error message.
    pub message: String,
    /// Validation rule that failed.
    pub rule: String,
}

/// Result of policy validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether the policy is valid.
    pub is_valid: bool,
    /// List of validation errors (empty if valid).
    pub errors: Vec<ValidationError>,
    /// List of validation warnings (non-blocking issues).
    pub warnings: Vec<ValidationError>,
}

impl ValidationResult {
    /// Create a successful validation result.
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            errors: vec![],
            warnings: vec![],
        }
    }

    /// Create a failed validation result with errors.
    pub fn invalid(errors: Vec<ValidationError>) -> Self {
        Self {
            is_valid: false,
            errors,
            warnings: vec![],
        }
    }

    /// Add a warning to the result.
    pub fn with_warning(mut self, warning: ValidationError) -> Self {
        self.warnings.push(warning);
        self
    }
}

/// Policy editor for validating and previewing focus/break settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyEditor {
    /// Schedule configuration being edited.
    pub schedule: ScheduleConfig,
    /// Custom schedule (if using advanced mode).
    pub custom_schedule: Option<Schedule>,
    /// Editor metadata.
    pub metadata: EditorMetadata,
}

/// Metadata for the editor session.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EditorMetadata {
    /// Name for this policy.
    pub name: String,
    /// Description/intent.
    pub intent: String,
    /// When editing started.
    pub editing_since: Option<DateTime<Utc>>,
    /// Has unsaved changes.
    pub is_dirty: bool,
}

impl Default for PolicyEditor {
    fn default() -> Self {
        Self::new()
    }
}

impl PolicyEditor {
    /// Create a new policy editor with default settings.
    pub fn new() -> Self {
        Self {
            schedule: ScheduleConfig::default(),
            custom_schedule: None,
            metadata: EditorMetadata::default(),
        }
    }

    /// Create an editor from existing config.
    pub fn from_config(config: &Config) -> Self {
        Self {
            schedule: config.schedule.clone(),
            custom_schedule: config.custom_schedule.clone(),
            metadata: EditorMetadata::default(),
        }
    }

    /// Validate the current policy settings.
    pub fn validate(&self) -> ValidationResult {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Validate schedule config
        self.validate_schedule_config(&mut errors, &mut warnings);

        // Validate custom schedule if present
        if let Some(ref custom) = self.custom_schedule {
            self.validate_custom_schedule(custom, &mut errors, &mut warnings);
        }

        // Check for logical inconsistencies
        self.check_logical_constraints(&mut warnings);

        if errors.is_empty() {
            ValidationResult {
                is_valid: true,
                errors,
                warnings,
            }
        } else {
            ValidationResult {
                is_valid: false,
                errors,
                warnings,
            }
        }
    }

    fn validate_schedule_config(
        &self,
        errors: &mut Vec<ValidationError>,
        warnings: &mut Vec<ValidationError>,
    ) {
        use constraints::*;

        // Focus duration
        if self.schedule.focus_duration < FOCUS_MIN || self.schedule.focus_duration > FOCUS_MAX {
            errors.push(ValidationError {
                field: "schedule.focus_duration".to_string(),
                message: format!(
                    "Focus duration must be between {} and {} minutes",
                    FOCUS_MIN, FOCUS_MAX
                ),
                rule: "range".to_string(),
            });
        } else if self.schedule.focus_duration > 90 {
            warnings.push(ValidationError {
                field: "schedule.focus_duration".to_string(),
                message: "Focus durations over 90 minutes may cause fatigue".to_string(),
                rule: "recommendation".to_string(),
            });
        }

        // Short break
        if self.schedule.short_break < SHORT_BREAK_MIN
            || self.schedule.short_break > SHORT_BREAK_MAX
        {
            errors.push(ValidationError {
                field: "schedule.short_break".to_string(),
                message: format!(
                    "Short break must be between {} and {} minutes",
                    SHORT_BREAK_MIN, SHORT_BREAK_MAX
                ),
                rule: "range".to_string(),
            });
        }

        // Long break
        if self.schedule.long_break < LONG_BREAK_MIN || self.schedule.long_break > LONG_BREAK_MAX {
            errors.push(ValidationError {
                field: "schedule.long_break".to_string(),
                message: format!(
                    "Long break must be between {} and {} minutes",
                    LONG_BREAK_MIN, LONG_BREAK_MAX
                ),
                rule: "range".to_string(),
            });
        }

        // Pomodoros before long break
        if self.schedule.pomodoros_before_long_break < POMODOROS_MIN
            || self.schedule.pomodoros_before_long_break > POMODOROS_MAX
        {
            errors.push(ValidationError {
                field: "schedule.pomodoros_before_long_break".to_string(),
                message: format!(
                    "Pomodoros before long break must be between {} and {}",
                    POMODOROS_MIN, POMODOROS_MAX
                ),
                rule: "range".to_string(),
            });
        }
    }

    fn validate_custom_schedule(
        &self,
        schedule: &Schedule,
        errors: &mut Vec<ValidationError>,
        warnings: &mut Vec<ValidationError>,
    ) {
        use constraints::*;

        // Check empty schedule
        if schedule.steps.is_empty() {
            errors.push(ValidationError {
                field: "custom_schedule.steps".to_string(),
                message: "Schedule must have at least one step".to_string(),
                rule: "non_empty".to_string(),
            });
            return;
        }

        // Check max steps
        if schedule.steps.len() > MAX_STEPS {
            errors.push(ValidationError {
                field: "custom_schedule.steps".to_string(),
                message: format!("Schedule cannot have more than {} steps", MAX_STEPS),
                rule: "max_count".to_string(),
            });
        }

        // Validate each step
        for (i, step) in schedule.steps.iter().enumerate() {
            let field_prefix = format!("custom_schedule.steps[{}]", i);

            // Duration validation
            if step.duration_min < STEP_DURATION_MIN || step.duration_min > STEP_DURATION_MAX {
                errors.push(ValidationError {
                    field: format!("{}.duration_min", field_prefix),
                    message: format!(
                        "Step duration must be between {} and {} minutes",
                        STEP_DURATION_MIN, STEP_DURATION_MAX
                    ),
                    rule: "range".to_string(),
                });
            }

            // Label validation
            if step.label.is_empty() {
                errors.push(ValidationError {
                    field: format!("{}.label", field_prefix),
                    message: "Step label cannot be empty".to_string(),
                    rule: "required".to_string(),
                });
            } else if step.label.len() > MAX_LABEL_LENGTH {
                errors.push(ValidationError {
                    field: format!("{}.label", field_prefix),
                    message: format!("Label cannot exceed {} characters", MAX_LABEL_LENGTH),
                    rule: "max_length".to_string(),
                });
            }
        }

        // Check for consecutive focus steps (no break)
        let mut consecutive_focus = 0u64;
        let mut max_consecutive_focus = 0u64;
        for step in &schedule.steps {
            match step.step_type {
                StepType::Focus => {
                    consecutive_focus += step.duration_min;
                }
                StepType::Break => {
                    max_consecutive_focus = max_consecutive_focus.max(consecutive_focus);
                    consecutive_focus = 0;
                }
            }
        }
        max_consecutive_focus = max_consecutive_focus.max(consecutive_focus);

        if max_consecutive_focus > 120 {
            warnings.push(ValidationError {
                field: "custom_schedule.steps".to_string(),
                message: format!(
                    "Consecutive focus time of {} minutes without break may cause fatigue",
                    max_consecutive_focus
                ),
                rule: "recommendation".to_string(),
            });
        }
    }

    fn check_logical_constraints(&self, warnings: &mut Vec<ValidationError>) {
        // Check if short break is longer than focus (unusual)
        if self.schedule.short_break >= self.schedule.focus_duration {
            warnings.push(ValidationError {
                field: "schedule.short_break".to_string(),
                message: "Short break is longer than or equal to focus duration".to_string(),
                rule: "recommendation".to_string(),
            });
        }

        // Check if long break is shorter than short break (unusual)
        if self.schedule.long_break < self.schedule.short_break {
            warnings.push(ValidationError {
                field: "schedule.long_break".to_string(),
                message: "Long break is shorter than short break".to_string(),
                rule: "recommendation".to_string(),
            });
        }
    }

    /// Generate a day plan preview from the current policy.
    pub fn preview_day_plan(&self, start_time: NaiveTime) -> DayPlanPreview {
        let schedule = self.get_effective_schedule();
        let total_duration = schedule.total_duration_min();

        let mut steps = Vec::new();
        // Convert start_time to minutes from midnight
        let start_mins = (start_time.hour() as u64 * 60) + (start_time.minute() as u64);
        let mut current_minutes = start_mins;
        let mut cumulative_minutes = 0u64;

        for (i, step) in schedule.steps.iter().enumerate() {
            let step_start_mins = current_minutes;
            let step_end_mins = step_start_mins.saturating_add(step.duration_min);

            let step_start = minutes_to_time(step_start_mins);
            let step_end = minutes_to_time(step_end_mins);

            steps.push(StepPreview {
                index: i,
                step_type: step.step_type,
                label: step.label.clone(),
                duration_min: step.duration_min,
                start_time: step_start,
                end_time: step_end,
                cumulative_minutes,
            });

            current_minutes = step_end_mins;
            cumulative_minutes += step.duration_min;
        }

        DayPlanPreview {
            total_duration_min: total_duration,
            focus_count: schedule.focus_count() as u32,
            break_count: steps.iter().filter(|s| s.step_type == StepType::Break).count() as u32,
            steps,
            cycle_repeats: total_duration > 0 && total_duration < 480, // Under 8 hours
        }
    }

    /// Get the effective schedule (custom or generated from config).
    pub fn get_effective_schedule(&self) -> Schedule {
        if let Some(ref custom) = self.custom_schedule {
            custom.clone()
        } else {
            self.generate_schedule_from_config()
        }
    }

    fn generate_schedule_from_config(&self) -> Schedule {
        let focus = self.schedule.focus_duration;
        let short_break = self.schedule.short_break;
        let long_break = self.schedule.long_break;
        let pomodoros = self.schedule.pomodoros_before_long_break;

        let mut steps = Vec::new();
        for i in 0..pomodoros {
            steps.push(Step {
                step_type: StepType::Focus,
                duration_min: focus as u64,
                label: format!("Focus {}", i + 1),
                description: String::new(),
            });
            let is_long_break = (i + 1) as u32 % pomodoros == 0;
            steps.push(Step {
                step_type: StepType::Break,
                duration_min: if is_long_break {
                    long_break
                } else {
                    short_break
                } as u64,
                label: if is_long_break {
                    "Long Break".to_string()
                } else {
                    "Short Break".to_string()
                },
                description: String::new(),
            });
        }
        Schedule::new(steps).unwrap_or_else(|_| Schedule::default_progressive())
    }

    /// Apply the policy to a config.
    pub fn apply_to_config(&self, config: &mut Config) -> Result<(), Vec<ValidationError>> {
        let validation = self.validate();
        if !validation.is_valid {
            return Err(validation.errors);
        }

        config.schedule = self.schedule.clone();
        config.custom_schedule = self.custom_schedule.clone();
        Ok(())
    }

    /// Export the policy as a bundle.
    pub fn export_bundle(&self) -> Result<PolicyBundle, Vec<ValidationError>> {
        let validation = self.validate();
        if !validation.is_valid {
            return Err(validation.errors);
        }

        Ok(PolicyBundle::with_metadata(
            PolicyMetadata {
                name: if self.metadata.name.is_empty() {
                    "Unnamed Policy".to_string()
                } else {
                    self.metadata.name.clone()
                },
                intent: self.metadata.intent.clone(),
                ..Default::default()
            },
            self.schedule.focus_duration,
            self.schedule.short_break,
            self.schedule.long_break,
            self.schedule.pomodoros_before_long_break,
            self.custom_schedule.clone(),
        ))
    }

    /// Import a policy from a bundle.
    pub fn import_bundle(&mut self, bundle: &PolicyBundle) -> Result<(), String> {
        // Validate the imported bundle
        if bundle.version != POLICY_VERSION {
            return Err(format!(
                "Incompatible policy version: {} (expected {})",
                bundle.version, POLICY_VERSION
            ));
        }

        self.schedule.focus_duration = bundle.policy.focus_duration;
        self.schedule.short_break = bundle.policy.short_break;
        self.schedule.long_break = bundle.policy.long_break;
        self.schedule.pomodoros_before_long_break = bundle.policy.pomodoros_before_long_break;
        self.custom_schedule = bundle.policy.custom_schedule.clone();
        self.metadata.name = bundle.metadata.name.clone();
        self.metadata.intent = bundle.metadata.intent.clone();
        self.metadata.is_dirty = true;

        Ok(())
    }

    /// Set focus duration.
    pub fn set_focus_duration(&mut self, minutes: u32) {
        self.schedule.focus_duration = minutes;
        self.metadata.is_dirty = true;
    }

    /// Set short break duration.
    pub fn set_short_break(&mut self, minutes: u32) {
        self.schedule.short_break = minutes;
        self.metadata.is_dirty = true;
    }

    /// Set long break duration.
    pub fn set_long_break(&mut self, minutes: u32) {
        self.schedule.long_break = minutes;
        self.metadata.is_dirty = true;
    }

    /// Set pomodoros before long break.
    pub fn set_pomodoros_before_long_break(&mut self, count: u32) {
        self.schedule.pomodoros_before_long_break = count;
        self.metadata.is_dirty = true;
    }

    /// Set custom schedule.
    pub fn set_custom_schedule(&mut self, schedule: Option<Schedule>) {
        self.custom_schedule = schedule;
        self.metadata.is_dirty = true;
    }

    /// Reset to default policy.
    pub fn reset_to_default(&mut self) {
        self.schedule = ScheduleConfig::default();
        self.custom_schedule = None;
        self.metadata.is_dirty = true;
    }
}

/// Preview of a day plan generated from policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayPlanPreview {
    /// Total duration in minutes for one cycle.
    pub total_duration_min: u64,
    /// Number of focus blocks.
    pub focus_count: u32,
    /// Number of breaks.
    pub break_count: u32,
    /// Individual steps with timing.
    pub steps: Vec<StepPreview>,
    /// Whether this cycle repeats in a typical day.
    pub cycle_repeats: bool,
}

/// Preview of a single step in the day plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepPreview {
    /// Index in the schedule.
    pub index: usize,
    /// Type of step.
    pub step_type: StepType,
    /// Label for display.
    pub label: String,
    /// Duration in minutes.
    pub duration_min: u64,
    /// Calculated start time.
    pub start_time: NaiveTime,
    /// Calculated end time.
    pub end_time: NaiveTime,
    /// Cumulative minutes at start of this step.
    pub cumulative_minutes: u64,
}

/// Convert minutes from midnight to NaiveTime.
fn minutes_to_time(minutes: u64) -> NaiveTime {
    // Wrap around if more than 24 hours
    let minutes = minutes % (24 * 60);
    let hours = (minutes / 60) as u32;
    let mins = (minutes % 60) as u32;
    NaiveTime::from_hms_opt(hours, mins, 0).unwrap_or(NaiveTime::from_hms_opt(0, 0, 0).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_starts_with_defaults() {
        let editor = PolicyEditor::new();
        assert_eq!(editor.schedule.focus_duration, 25);
        assert_eq!(editor.schedule.short_break, 5);
        assert_eq!(editor.schedule.long_break, 15);
        assert_eq!(editor.schedule.pomodoros_before_long_break, 4);
        assert!(editor.custom_schedule.is_none());
    }

    #[test]
    fn default_policy_is_valid() {
        let editor = PolicyEditor::new();
        let result = editor.validate();
        assert!(result.is_valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn invalid_focus_duration_detected() {
        let mut editor = PolicyEditor::new();
        editor.set_focus_duration(150); // Over max
        let result = editor.validate();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.field == "schedule.focus_duration"));
    }

    #[test]
    fn zero_focus_duration_detected() {
        let mut editor = PolicyEditor::new();
        editor.set_focus_duration(0); // Under min
        let result = editor.validate();
        assert!(!result.is_valid);
    }

    #[test]
    fn warning_for_long_focus() {
        let mut editor = PolicyEditor::new();
        editor.set_focus_duration(95); // Over 90
        let result = editor.validate();
        assert!(result.is_valid); // Still valid
        assert!(result.warnings.iter().any(|w| w.field == "schedule.focus_duration"));
    }

    #[test]
    fn day_plan_preview_generated() {
        let editor = PolicyEditor::new();
        let preview = editor.preview_day_plan(NaiveTime::from_hms_opt(9, 0, 0).unwrap());

        assert!(preview.total_duration_min > 0);
        assert_eq!(preview.focus_count, 4);
        assert_eq!(preview.break_count, 4);
        assert!(!preview.steps.is_empty());
    }

    #[test]
    fn custom_schedule_validation() {
        let mut editor = PolicyEditor::new();
        editor.set_custom_schedule(Some(Schedule::new(vec![]).unwrap_or(Schedule {
            steps: vec![],
        })));

        // Empty schedule should fail
        editor.custom_schedule = Some(Schedule {
            steps: vec![],
        });
        let result = editor.validate();
        assert!(!result.is_valid);
    }

    #[test]
    fn step_duration_validation() {
        let mut editor = PolicyEditor::new();
        editor.set_custom_schedule(Some(Schedule {
            steps: vec![Step {
                step_type: StepType::Focus,
                duration_min: 200, // Over max
                label: "Too long".to_string(),
                description: String::new(),
            }],
        }));
        let result = editor.validate();
        assert!(!result.is_valid);
    }

    #[test]
    fn apply_to_config_updates_values() {
        let mut editor = PolicyEditor::new();
        editor.set_focus_duration(50);
        editor.set_short_break(10);

        let mut config = Config::default();
        let result = editor.apply_to_config(&mut config);

        assert!(result.is_ok());
        assert_eq!(config.schedule.focus_duration, 50);
        assert_eq!(config.schedule.short_break, 10);
    }

    #[test]
    fn apply_invalid_policy_fails() {
        let mut editor = PolicyEditor::new();
        editor.set_focus_duration(200); // Invalid

        let mut config = Config::default();
        let result = editor.apply_to_config(&mut config);

        assert!(result.is_err());
    }

    #[test]
    fn export_creates_valid_bundle() {
        let mut editor = PolicyEditor::new();
        editor.metadata.name = "Test Policy".to_string();

        let result = editor.export_bundle();
        assert!(result.is_ok());

        let bundle = result.unwrap();
        assert_eq!(bundle.metadata.name, "Test Policy");
        assert_eq!(bundle.version, POLICY_VERSION);
    }

    #[test]
    fn import_bundle_updates_editor() {
        let bundle = PolicyBundle::new(
            "Imported Policy".to_string(),
            45,
            10,
            30,
            3,
            None,
        );

        let mut editor = PolicyEditor::new();
        let result = editor.import_bundle(&bundle);

        assert!(result.is_ok());
        assert_eq!(editor.schedule.focus_duration, 45);
        assert_eq!(editor.schedule.short_break, 10);
        assert_eq!(editor.metadata.name, "Imported Policy");
    }

    #[test]
    fn short_break_longer_than_focus_warning() {
        let mut editor = PolicyEditor::new();
        editor.set_focus_duration(10);
        editor.set_short_break(15); // Break longer than focus

        let result = editor.validate();
        assert!(result.is_valid); // Still valid
        assert!(result.warnings.iter().any(|w| w.field == "schedule.short_break"));
    }

    #[test]
    fn reset_clears_custom_schedule() {
        let mut editor = PolicyEditor::new();
        editor.set_custom_schedule(Some(Schedule::default()));
        editor.reset_to_default();

        assert!(editor.custom_schedule.is_none());
        assert_eq!(editor.schedule.focus_duration, 25);
    }
}
