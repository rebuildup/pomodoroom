//! A/B testing framework for notification policy experiments.
//!
//! This module provides functionality for:
//! - Defining experiment variants with stable assignment
//! - Randomizing user/day/session assignment
//! - Tracking metrics per variant
//! - Safe experiment shutdown with data preservation
//!
//! # Usage
//! ```rust,ignore
//! use pomodoroom_core::policy::experiments::*;
//! use chrono::Utc;
//!
//! // Define an experiment
//! let experiment = ExperimentDefinition {
//!     id: "notification-style-test".to_string(),
//!     name: "Notification Style A/B Test".to_string(),
//!     variants: vec![
//!         ExperimentVariant {
//!             id: "control".to_string(),
//!             name: "Current Style".to_string(),
//!             weight: 50,
//!             config: NotificationPolicyConfig::default(),
//!             active: true,
//!         },
//!         ExperimentVariant {
//!             id: "treatment".to_string(),
//!             name: "New Style".to_string(),
//!             weight: 50,
//!             config: NotificationPolicyConfig::new_with_style(NotificationStyle::Subtle),
//!             active: true,
//!         },
//!     ],
//!     ..Default::default()
//! };
//!
//! let registry = ExperimentRegistry::new();
//! registry.register_experiment(experiment);
//!
//! // Get assigned variant for a user/day
//! let engine = ExperimentEngine::new(std::sync::Arc::new(registry));
//! let variant = engine.get_variant_for_user("notification-style-test", "user-123", Utc::now());
//!
//! // Record metrics
//! engine.record_metric("notification-style-test", "control",
//!     ExperimentMetric::PromptAccepted { accepted: true });
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Unique identifier for an experiment
pub type ExperimentId = String;

/// Unique identifier for an experiment variant
pub type VariantId = String;

/// Unique identifier for a user or session
pub type SubjectId = String;

/// Definition of an A/B test experiment for notification policies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperimentDefinition {
    /// Unique experiment identifier
    pub id: ExperimentId,
    /// Human-readable experiment name
    pub name: String,
    /// Experiment description
    pub description: Option<String>,
    /// Variants to test (weights should sum to 100)
    pub variants: Vec<ExperimentVariant>,
    /// Randomization strategy
    pub randomization: RandomizationStrategy,
    /// Experiment status
    pub status: ExperimentStatus,
    /// Start time (None = not started)
    pub start_time: Option<DateTime<Utc>>,
    /// End time (None = ongoing)
    pub end_time: Option<DateTime<Utc>>,
    /// Target sample size (None = unlimited)
    pub target_sample_size: Option<usize>,
}

/// A variant in an experiment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperimentVariant {
    /// Variant identifier (e.g., "control", "treatment")
    pub id: VariantId,
    /// Variant name
    pub name: String,
    /// Weight for randomization (0-100)
    pub weight: u32,
    /// Notification policy configuration for this variant
    pub config: NotificationPolicyConfig,
    /// Whether this variant is active
    pub active: bool,
}

/// Notification policy configuration for an experiment variant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationPolicyConfig {
    /// Notification style (subtle, normal, aggressive)
    pub style: NotificationStyle,
    /// Escalation delay in minutes
    pub escalation_delay_minutes: u32,
    /// Maximum escalation level
    pub max_escalation_level: u32,
    /// Whether to show quiet hours
    pub quiet_hours_enabled: bool,
    /// Custom parameters (extensible)
    pub custom_params: HashMap<String, serde_json::Value>,
}

impl Default for NotificationPolicyConfig {
    fn default() -> Self {
        Self {
            style: NotificationStyle::Normal,
            escalation_delay_minutes: 5,
            max_escalation_level: 3,
            quiet_hours_enabled: true,
            custom_params: HashMap::new(),
        }
    }
}

impl NotificationPolicyConfig {
    /// Create a new config with specific style
    pub fn new_with_style(style: NotificationStyle) -> Self {
        Self {
            style,
            ..Default::default()
        }
    }
}

/// Notification style for experiment variants
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationStyle {
    /// Subtle, minimal notifications
    Subtle,
    /// Standard notification behavior
    Normal,
    /// More aggressive escalation
    Aggressive,
}

/// How to randomize assignment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RandomizationStrategy {
    /// Assign by user ID (stable per user)
    PerUser,
    /// Assign by day (all users get same variant for a day)
    PerDay,
    /// Assign by session (can change within day)
    PerSession,
}

/// Experiment status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExperimentStatus {
    /// Experiment is draft (not yet started)
    Draft,
    /// Experiment is running
    Running,
    /// Experiment is paused
    Paused,
    /// Experiment is completed
    Completed,
    /// Experiment was stopped
    Stopped,
}

impl Default for ExperimentDefinition {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Untitled Experiment".to_string(),
            description: None,
            variants: vec![],
            randomization: RandomizationStrategy::PerUser,
            status: ExperimentStatus::Draft,
            start_time: None,
            end_time: None,
            target_sample_size: None,
        }
    }
}

/// Metric recorded during an experiment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExperimentMetric {
    /// User accepted a prompt
    PromptAccepted { accepted: bool },
    /// User completed a pomodoro
    PomodoroCompleted { count: u32 },
    /// User satisfaction rating (1-5)
    Satisfaction { rating: u32 },
    /// Custom metric value
    Custom { name: String, value: f64 },
}

/// Summary of experiment results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperimentSummary {
    /// Experiment ID
    pub experiment_id: ExperimentId,
    /// Per-variant metrics
    pub variant_summaries: HashMap<VariantId, VariantSummary>,
    /// Total participants
    pub total_participants: usize,
    /// Experiment duration (in hours)
    pub duration_hours: Option<f64>,
}

/// Summary for a single variant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariantSummary {
    /// Variant ID
    pub variant_id: VariantId,
    /// Number of subjects assigned
    pub subject_count: usize,
    /// Metrics collected
    pub metrics: VariantMetrics,
}

/// Metrics aggregated for a variant
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VariantMetrics {
    /// Number of prompts accepted
    pub prompts_accepted: usize,
    /// Total prompts shown
    pub prompts_shown: usize,
    /// Acceptance rate (0.0 - 1.0)
    pub acceptance_rate: f64,
    /// Average satisfaction (1-5)
    pub avg_satisfaction: Option<f64>,
    /// Total pomodoros completed
    pub total_pomodoros: u32,
    /// Custom metric values
    pub custom_metrics: HashMap<String, f64>,
}

/// Registry of experiments
pub struct ExperimentRegistry {
    experiments: Mutex<HashMap<ExperimentId, ExperimentDefinition>>,
}

impl ExperimentRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            experiments: Mutex::new(HashMap::new()),
        }
    }

    /// Register an experiment
    pub fn register_experiment(&self, experiment: ExperimentDefinition) -> Result<(), String> {
        let mut experiments = self
            .experiments
            .lock()
            .map_err(|e| format!("Lock failed: {}", e))?;

        // Validate weights sum to 100
        let total_weight: u32 = experiment.variants.iter().map(|v| v.weight).sum();
        if total_weight != 100 {
            return Err(format!(
                "Variant weights must sum to 100, got {}",
                total_weight
            ));
        }

        experiments.insert(experiment.id.clone(), experiment);
        Ok(())
    }

    /// Get an experiment by ID
    pub fn get_experiment(&self, id: &str) -> Option<ExperimentDefinition> {
        let experiments = self
            .experiments
            .lock()
            .map_err(|_| ())
            .ok()?;
        experiments.get(id).cloned()
    }

    /// List all experiments
    pub fn list_experiments(&self) -> Vec<ExperimentDefinition> {
        let experiments = self
            .experiments
            .lock()
            .map_err(|_| ())
            .ok();
        match experiments {
            Some(e) => e.values().cloned().collect(),
            None => Vec::new(),
        }
    }

    /// Update experiment status
    pub fn update_status(
        &self,
        id: &str,
        status: ExperimentStatus,
    ) -> Result<(), String> {
        let mut experiments = self
            .experiments
            .lock()
            .map_err(|e| format!("Lock failed: {}", e))?;

        let experiment = experiments
            .get_mut(id)
            .ok_or_else(|| format!("Experiment '{}' not found", id))?;

        experiment.status = status;

        // Update timestamps based on status
        match status {
            ExperimentStatus::Running if experiment.start_time.is_none() => {
                experiment.start_time = Some(Utc::now());
            }
            ExperimentStatus::Completed | ExperimentStatus::Stopped if experiment.end_time.is_none() => {
                experiment.end_time = Some(Utc::now());
            }
            _ => {}
        }

        Ok(())
    }
}

impl Default for ExperimentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Engine for running experiments and assigning variants
pub struct ExperimentEngine {
    registry: Arc<ExperimentRegistry>,
    assignments: Mutex<HashMap<String, HashMap<SubjectId, VariantId>>>,
    metrics: Mutex<HashMap<String, ExperimentMetrics>>,
}

/// Collected metrics for an experiment
#[derive(Debug, Clone, Default)]
struct ExperimentMetrics {
    /// Per-variant metrics
    variant_metrics: HashMap<VariantId, VariantMetrics>,
    /// Variant assignments per subject
    subject_assignments: HashMap<SubjectId, VariantId>,
}

impl ExperimentEngine {
    /// Create a new experiment engine
    pub fn new(registry: Arc<ExperimentRegistry>) -> Self {
        Self {
            registry,
            assignments: Mutex::new(HashMap::new()),
            metrics: Mutex::new(HashMap::new()),
        }
    }

    /// Get the assigned variant for a user in an experiment
    pub fn get_variant_for_user(
        &self,
        experiment_id: &str,
        subject_id: &str,
        context: DateTime<Utc>,
    ) -> Option<ExperimentVariant> {
        let experiment = self.registry.get_experiment(experiment_id)?;

        // Check if already assigned (stable assignment)
        {
            let assignments = self.assignments.lock().ok()?;
            if let Some(exp_assignments) = assignments.get(experiment_id) {
                if let Some(variant_id) = exp_assignments.get(subject_id) {
                    return experiment
                        .variants
                        .iter()
                        .find(|v| &v.id == variant_id)
                        .cloned();
                }
            }
        }

        // New assignment based on randomization strategy
        let variant_id = match experiment.randomization {
            RandomizationStrategy::PerUser => self.assign_user_stable(&experiment, subject_id),
            RandomizationStrategy::PerDay => {
                self.assign_by_day_hash(&experiment, context, subject_id)
            }
            RandomizationStrategy::PerSession => {
                self.assign_by_session_hash(&experiment, context, subject_id)
            }
        };

        // Store assignment
        if let Some(mut assignments) = self.assignments.lock().ok() {
            let exp_assignments = assignments.entry(experiment_id.to_string()).or_default();
            exp_assignments.insert(subject_id.to_string(), variant_id.clone());
        }

        experiment
            .variants
            .iter()
            .find(|v| v.id == *variant_id)
            .cloned()
    }

    /// Assign user stably (deterministic based on user ID)
    fn assign_user_stable(&self, experiment: &ExperimentDefinition, subject_id: &str) -> VariantId {
        // Hash user ID to get a stable value
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        format!("{}:{}", experiment.id, subject_id).hash(&mut hasher);
        let hash_value = hasher.finish() as u32;

        // Select variant based on hash and weights
        let mut cumulative = 0;
        let target = hash_value % 100;

        for variant in &experiment.variants {
            cumulative += variant.weight;
            if target < cumulative {
                return variant.id.clone();
            }
        }

        // Fallback to first variant
        experiment
            .variants
            .first()
            .map(|v| v.id.clone())
            .unwrap_or_default()
    }

    /// Assign by day hash (all users same variant for a day)
    fn assign_by_day_hash(
        &self,
        experiment: &ExperimentDefinition,
        context: DateTime<Utc>,
        _subject_id: &str,
    ) -> VariantId {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        // Hash day + experiment
        let day_str = context.format("%Y-%m-%d").to_string();
        let mut hasher = DefaultHasher::new();
        format!("{}:{}", experiment.id, day_str).hash(&mut hasher);
        let hash_value = hasher.finish() as u32;

        let mut cumulative = 0;
        let target = hash_value % 100;

        for variant in &experiment.variants {
            cumulative += variant.weight;
            if target < cumulative {
                return variant.id.clone();
            }
        }

        experiment
            .variants
            .first()
            .map(|v| v.id.clone())
            .unwrap_or_default()
    }

    /// Assign by session hash (can change within day)
    fn assign_by_session_hash(
        &self,
        experiment: &ExperimentDefinition,
        context: DateTime<Utc>,
        _subject_id: &str,
    ) -> VariantId {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        // Hash hour + experiment
        let hour_str = context.format("%Y-%m-%d-%H").to_string();
        let mut hasher = DefaultHasher::new();
        format!("{}:{}", experiment.id, hour_str).hash(&mut hasher);
        let hash_value = hasher.finish() as u32;

        let mut cumulative = 0;
        let target = hash_value % 100;

        for variant in &experiment.variants {
            cumulative += variant.weight;
            if target < cumulative {
                return variant.id.clone();
            }
        }

        experiment
            .variants
            .first()
            .map(|v| v.id.clone())
            .unwrap_or_default()
    }

    /// Record a metric for an experiment variant
    pub fn record_metric(
        &self,
        experiment_id: &str,
        variant_id: &str,
        metric: ExperimentMetric,
    ) -> Result<(), String> {
        let mut metrics = self
            .metrics
            .lock()
            .map_err(|e| format!("Lock failed: {}", e))?;

        let exp_metrics = metrics.entry(experiment_id.to_string()).or_default();

        // Update variant metrics
        let var_metrics = exp_metrics
            .variant_metrics
            .entry(variant_id.to_string())
            .or_default();

        match metric {
            ExperimentMetric::PromptAccepted { accepted } => {
                var_metrics.prompts_shown += 1;
                if accepted {
                    var_metrics.prompts_accepted += 1;
                }
                var_metrics.acceptance_rate = var_metrics.prompts_accepted as f64
                    / var_metrics.prompts_shown as f64;
            }
            ExperimentMetric::PomodoroCompleted { count } => {
                var_metrics.total_pomodoros += count;
            }
            ExperimentMetric::Satisfaction { rating } => {
                // Update running average
                let current = var_metrics.avg_satisfaction.unwrap_or(0.0);
                let n = var_metrics.total_pomodoros as f64;
                let new_avg = (current * n + rating as f64) / (n + 1.0);
                var_metrics.avg_satisfaction = Some(new_avg);
            }
            ExperimentMetric::Custom { name, value } => {
                *var_metrics.custom_metrics.entry(name).or_insert(0.0) += value;
            }
        }

        Ok(())
    }

    /// Generate summary for an experiment
    pub fn generate_summary(&self, experiment_id: &str) -> Result<ExperimentSummary, String> {
        let experiment = self
            .registry
            .get_experiment(experiment_id)
            .ok_or_else(|| format!("Experiment '{}' not found", experiment_id))?;

        let metrics = self
            .metrics
            .lock()
            .map_err(|e| format!("Lock failed: {}", e))?;

        let exp_metrics = metrics
            .get(experiment_id)
            .cloned()
            .unwrap_or_else(|| ExperimentMetrics {
                variant_metrics: HashMap::new(),
                subject_assignments: HashMap::new(),
            });

        let mut variant_summaries = HashMap::new();

        for variant in &experiment.variants {
            let var_metrics = exp_metrics
                .variant_metrics
                .get(&variant.id)
                .cloned()
                .unwrap_or_default();

            let subject_count = exp_metrics
                .subject_assignments
                .values()
                .filter(|id| **id == variant.id)
                .count();

            variant_summaries.insert(variant.id.clone(), VariantSummary {
                variant_id: variant.id.clone(),
                subject_count,
                metrics: var_metrics,
            });
        }

        let duration_hours = match (experiment.start_time, experiment.end_time) {
            (Some(start), Some(end)) => Some((end - start).num_hours().abs() as f64),
            _ => None,
        };

        Ok(ExperimentSummary {
            experiment_id: experiment_id.to_string(),
            variant_summaries,
            total_participants: exp_metrics.subject_assignments.len(),
            duration_hours,
        })
    }

    /// Export experiment data (for safe shutdown)
    pub fn export_experiment_data(&self, experiment_id: &str) -> Result<String, String> {
        let summary = self.generate_summary(experiment_id)?;
        serde_json::to_string_pretty(&summary)
            .map_err(|e| format!("Serialization failed: {}", e))
    }
}

impl Default for ExperimentEngine {
    fn default() -> Self {
        Self::new(Arc::new(ExperimentRegistry::new()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_experiment() -> ExperimentDefinition {
        ExperimentDefinition {
            id: "test-exp".to_string(),
            name: "Test Experiment".to_string(),
            description: Some("A test experiment".to_string()),
            variants: vec![
                ExperimentVariant {
                    id: "control".to_string(),
                    name: "Control".to_string(),
                    weight: 50,
                    config: NotificationPolicyConfig::default(),
                    active: true,
                },
                ExperimentVariant {
                    id: "treatment".to_string(),
                    name: "Treatment".to_string(),
                    weight: 50,
                    config: NotificationPolicyConfig::new_with_style(NotificationStyle::Subtle),
                    active: true,
                },
            ],
            randomization: RandomizationStrategy::PerUser,
            status: ExperimentStatus::Running,
            start_time: Some(Utc::now()),
            end_time: None,
            target_sample_size: None,
        }
    }

    #[test]
    fn test_registry_register_experiment() {
        let registry = ExperimentRegistry::new();
        let experiment = create_test_experiment();

        assert!(registry.register_experiment(experiment).is_ok());
    }

    #[test]
    fn test_registry_invalid_weights() {
        let registry = ExperimentRegistry::new();
        let mut experiment = create_test_experiment();
        experiment.variants[0].weight = 30; // Sum = 80, not 100
        experiment.variants[1].weight = 30;

        let result = registry.register_experiment(experiment);
        assert!(result.is_err());
    }

    #[test]
    fn test_get_variant_for_user_stable() {
        let registry = Arc::new(ExperimentRegistry::new());
        let experiment = create_test_experiment();
        registry.register_experiment(experiment).unwrap();

        let engine = ExperimentEngine::new(registry.clone());
        let context = Utc::now();

        // Same user should always get same variant
        let variant1 = engine
            .get_variant_for_user("test-exp", "user-123", context)
            .unwrap();
        let variant2 = engine
            .get_variant_for_user("test-exp", "user-123", context)
            .unwrap();

        assert_eq!(variant1.id, variant2.id);
    }

    #[test]
    fn test_record_metric() {
        let registry = Arc::new(ExperimentRegistry::new());
        let experiment = create_test_experiment();
        registry.register_experiment(experiment).unwrap();

        let engine = ExperimentEngine::new(registry);

        // Record some metrics
        engine
            .record_metric(
                "test-exp",
                "control",
                ExperimentMetric::PromptAccepted { accepted: true },
            )
            .unwrap();
        engine
            .record_metric(
                "test-exp",
                "control",
                ExperimentMetric::PromptAccepted { accepted: false },
            )
            .unwrap();

        let summary = engine.generate_summary("test-exp").unwrap();
        let control_summary = summary.variant_summaries.get("control").unwrap();

        assert_eq!(control_summary.metrics.prompts_shown, 2);
        assert_eq!(control_summary.metrics.prompts_accepted, 1);
        assert_eq!(control_summary.metrics.acceptance_rate, 0.5);
    }

    #[test]
    fn test_export_experiment_data() {
        let registry = Arc::new(ExperimentRegistry::new());
        let experiment = create_test_experiment();
        registry.register_experiment(experiment).unwrap();

        let engine = ExperimentEngine::new(registry);

        let json = engine.export_experiment_data("test-exp").unwrap();
        assert!(json.contains("test-exp"));
    }

    #[test]
    fn test_randomization_strategies() {
        let registry = Arc::new(ExperimentRegistry::new());
        let experiment = create_test_experiment();
        registry.register_experiment(experiment).unwrap();

        let engine = ExperimentEngine::new(registry);
        let context = Utc::now();

        // Test PerUser - should be stable for same user
        let v1 = engine
            .get_variant_for_user("test-exp", "user-1", context)
            .unwrap();
        let v2 = engine
            .get_variant_for_user("test-exp", "user-1", context)
            .unwrap();
        assert_eq!(v1.id, v2.id);

        // Different users might get different variants
        let v3 = engine
            .get_variant_for_user("test-exp", "user-2", context)
            .unwrap();
        // Note: They might be same or different depending on hash, but should be deterministic
        assert_eq!(v3.id, engine.get_variant_for_user("test-exp", "user-2", context).unwrap().id);
    }
}
