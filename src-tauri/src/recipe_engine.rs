//! Internal recipe engine (if-this-then-that) for automations.
//!
//! This module provides a local automation system where users can define
//! recipes with triggers, conditions, and actions.
//!
//! ## Features
//! - Triggers: timer state, task state, schedule events
//! - Conditions: time range, tags, energy level
//! - Actions: create break, defer task, notify, switch mode
//! - Deterministic execution with failure logging
//! - Test-run simulation support

use chrono::{DateTime, Datelike, Timelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// Trigger types that can start recipe execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TriggerType {
    /// Timer state changed (e.g., started, paused, completed).
    TimerStateChanged,
    /// Task state changed (e.g., created, started, completed).
    TaskStateChanged,
    /// Schedule event occurred (e.g., time block started).
    ScheduleEvent,
    /// Break started.
    BreakStarted,
    /// Break ended.
    BreakEnded,
    /// Focus session started.
    FocusStarted,
    /// Focus session ended.
    FocusEnded,
    /// Manual trigger.
    Manual,
}

/// Condition types for recipe filtering.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConditionType {
    /// Time range condition.
    TimeRange {
        /// Start hour (0-23).
        start_hour: u32,
        /// End hour (0-23).
        end_hour: u32,
    },
    /// Day of week condition.
    DayOfWeek {
        /// Days (0 = Sunday, 6 = Saturday).
        days: Vec<u32>,
    },
    /// Tag condition.
    Tag {
        /// Required tags (all must match).
        tags: Vec<String>,
    },
    /// Energy level condition.
    EnergyLevel {
        /// Minimum energy level (1-5).
        min_level: u32,
        /// Maximum energy level (1-5).
        max_level: u32,
    },
    /// Task count condition.
    TaskCount {
        /// Minimum count.
        min_count: u32,
        /// Maximum count (None = unlimited).
        max_count: Option<u32>,
    },
    /// Pomodoro count condition.
    PomodoroCount {
        /// Minimum count.
        min_count: u32,
        /// Maximum count (None = unlimited).
        max_count: Option<u32>,
    },
}

/// Action types that recipes can perform.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    /// Create a break.
    CreateBreak {
        /// Break duration in minutes.
        duration_minutes: u32,
        /// Break type (short, long).
        break_type: String,
    },
    /// Defer a task.
    DeferTask {
        /// Defer duration in minutes.
        duration_minutes: u32,
        /// Reason for deferral.
        reason: Option<String>,
    },
    /// Send a notification.
    Notify {
        /// Notification title.
        title: String,
        /// Notification body.
        body: String,
    },
    /// Switch timer mode.
    SwitchMode {
        /// Mode to switch to (focus, break).
        mode: String,
    },
    /// Start a task.
    StartTask {
        /// Task ID to start.
        task_id: Option<String>,
    },
    /// Complete a task.
    CompleteTask {
        /// Task ID to complete.
        task_id: Option<String>,
    },
    /// Adjust schedule.
    AdjustSchedule {
        /// Adjustment type (extend, shorten).
        adjustment: String,
        /// Minutes to adjust.
        minutes: i32,
    },
    /// Log a message.
    Log {
        /// Log level (info, warn, error).
        level: String,
        /// Log message.
        message: String,
    },
}

/// Trigger definition for a recipe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trigger {
    /// Trigger type.
    pub trigger_type: TriggerType,
    /// Additional data for trigger matching.
    #[serde(default)]
    pub data: serde_json::Value,
}

/// Condition definition for a recipe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    /// Condition type.
    pub condition_type: ConditionType,
    /// Whether this condition should be negated.
    #[serde(default)]
    pub negate: bool,
}

/// Action definition for a recipe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    /// Action type.
    pub action_type: ActionType,
    /// Order of execution (lower first).
    #[serde(default)]
    pub order: u32,
}

/// Recipe definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recipe {
    /// Unique recipe ID.
    pub id: String,
    /// Recipe name.
    pub name: String,
    /// Recipe description.
    #[serde(default)]
    pub description: String,
    /// Whether recipe is enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Trigger that starts the recipe.
    pub trigger: Trigger,
    /// Conditions that must all be satisfied.
    #[serde(default)]
    pub conditions: Vec<Condition>,
    /// Actions to execute when triggered.
    pub actions: Vec<Action>,
    /// Priority for execution order (lower = higher priority).
    #[serde(default)]
    pub priority: u32,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
    /// Last modification timestamp.
    pub updated_at: DateTime<Utc>,
}

fn default_true() -> bool {
    true
}

impl Recipe {
    /// Create a new recipe.
    pub fn new(id: impl Into<String>, name: impl Into<String>, trigger: Trigger) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            name: name.into(),
            description: String::new(),
            enabled: true,
            trigger,
            conditions: Vec::new(),
            actions: Vec::new(),
            priority: 0,
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a condition to the recipe.
    pub fn with_condition(mut self, condition: Condition) -> Self {
        self.conditions.push(condition);
        self.updated_at = Utc::now();
        self
    }

    /// Add an action to the recipe.
    pub fn with_action(mut self, action: Action) -> Self {
        self.actions.push(action);
        self.updated_at = Utc::now();
        self
    }

    /// Set enabled status.
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self.updated_at = Utc::now();
        self
    }

    /// Set priority.
    pub fn with_priority(mut self, priority: u32) -> Self {
        self.priority = priority;
        self.updated_at = Utc::now();
        self
    }
}

/// Context for recipe evaluation.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecipeContext {
    /// Current time.
    pub current_time: Option<DateTime<Utc>>,
    /// Current timer state.
    pub timer_state: Option<String>,
    /// Current task ID.
    pub current_task_id: Option<String>,
    /// Current task tags.
    pub task_tags: Vec<String>,
    /// Current energy level (1-5).
    pub energy_level: Option<u32>,
    /// Current task count.
    pub task_count: Option<u32>,
    /// Current pomodoro count.
    pub pomodoro_count: Option<u32>,
    /// Additional data.
    #[serde(default)]
    pub data: serde_json::Value,
}

impl RecipeContext {
    /// Create a new empty context.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set current time.
    pub fn with_time(mut self, time: DateTime<Utc>) -> Self {
        self.current_time = Some(time);
        self
    }

    /// Set timer state.
    pub fn with_timer_state(mut self, state: impl Into<String>) -> Self {
        self.timer_state = Some(state.into());
        self
    }

    /// Set current task.
    pub fn with_task(mut self, task_id: impl Into<String>, tags: Vec<String>) -> Self {
        self.current_task_id = Some(task_id.into());
        self.task_tags = tags;
        self
    }

    /// Set energy level.
    pub fn with_energy_level(mut self, level: u32) -> Self {
        self.energy_level = Some(level.clamp(1, 5));
        self
    }

    /// Set task count.
    pub fn with_task_count(mut self, count: u32) -> Self {
        self.task_count = Some(count);
        self
    }

    /// Set pomodoro count.
    pub fn with_pomodoro_count(mut self, count: u32) -> Self {
        self.pomodoro_count = Some(count);
        self
    }
}

/// Result of a condition evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionResult {
    /// Whether condition passed.
    pub passed: bool,
    /// Condition type evaluated.
    pub condition_type: String,
    /// Reason for pass/fail.
    pub reason: String,
}

/// Result of an action execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    /// Whether action succeeded.
    pub success: bool,
    /// Action type executed.
    pub action_type: String,
    /// Result message.
    pub message: String,
    /// Error if failed.
    pub error: Option<String>,
}

/// Result of recipe execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecipeResult {
    /// Recipe ID executed.
    pub recipe_id: String,
    /// Recipe name.
    pub recipe_name: String,
    /// Whether execution was successful.
    pub success: bool,
    /// Condition evaluation results.
    pub condition_results: Vec<ConditionResult>,
    /// Action execution results.
    pub action_results: Vec<ActionResult>,
    /// Execution timestamp.
    pub executed_at: DateTime<Utc>,
    /// Total execution time in milliseconds.
    pub execution_time_ms: u64,
}

/// Statistics for recipe engine.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecipeStats {
    /// Total recipes registered.
    pub total_recipes: u64,
    /// Total executions.
    pub total_executions: u64,
    /// Successful executions.
    pub successful_executions: u64,
    /// Failed executions.
    pub failed_executions: u64,
    /// Executions by trigger type.
    pub by_trigger: HashMap<String, u64>,
    /// Executions by recipe ID.
    pub by_recipe: HashMap<String, u64>,
}

/// Recipe engine for managing and executing recipes.
pub struct RecipeEngine {
    /// Registered recipes.
    recipes: Mutex<HashMap<String, Recipe>>,
    /// Execution statistics.
    stats: Mutex<RecipeStats>,
    /// Execution log for failed actions.
    execution_log: Mutex<Vec<RecipeResult>>,
}

impl RecipeEngine {
    /// Create a new recipe engine.
    pub fn new() -> Self {
        Self {
            recipes: Mutex::new(HashMap::new()),
            stats: Mutex::new(RecipeStats::default()),
            execution_log: Mutex::new(Vec::new()),
        }
    }

    /// Register a recipe.
    pub fn register(&self, recipe: Recipe) {
        let mut recipes = self.recipes.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();
        let id = recipe.id.clone();
        recipes.insert(id, recipe);
        stats.total_recipes = recipes.len() as u64;
    }

    /// Unregister a recipe.
    pub fn unregister(&self, id: &str) -> bool {
        let mut recipes = self.recipes.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();
        let removed = recipes.remove(id).is_some();
        stats.total_recipes = recipes.len() as u64;
        removed
    }

    /// Get a recipe by ID.
    pub fn get(&self, id: &str) -> Option<Recipe> {
        self.recipes.lock().unwrap().get(id).cloned()
    }

    /// Get all recipes.
    pub fn get_all(&self) -> Vec<Recipe> {
        self.recipes.lock().unwrap().values().cloned().collect()
    }

    /// Get enabled recipes sorted by priority.
    pub fn get_enabled(&self) -> Vec<Recipe> {
        let mut recipes: Vec<_> = self
            .recipes
            .lock()
            .unwrap()
            .values()
            .filter(|r| r.enabled)
            .cloned()
            .collect();
        recipes.sort_by_key(|r| r.priority);
        recipes
    }

    /// Check if a trigger matches.
    pub fn check_trigger(&self, trigger: &Trigger, context: &RecipeContext) -> bool {
        match &trigger.trigger_type {
            TriggerType::TimerStateChanged => context.timer_state.is_some(),
            TriggerType::TaskStateChanged => context.current_task_id.is_some(),
            TriggerType::ScheduleEvent => context.current_time.is_some(),
            TriggerType::BreakStarted => context.timer_state.as_deref() == Some("break"),
            TriggerType::BreakEnded => {
                // Check if we just ended a break (data might contain this info)
                context.data.get("break_ended").and_then(|v| v.as_bool()).unwrap_or(false)
            }
            TriggerType::FocusStarted => context.timer_state.as_deref() == Some("focus"),
            TriggerType::FocusEnded => {
                context.data.get("focus_ended").and_then(|v| v.as_bool()).unwrap_or(false)
            }
            TriggerType::Manual => true,
        }
    }

    /// Evaluate a condition against context.
    pub fn evaluate_condition(
        &self,
        condition: &Condition,
        context: &RecipeContext,
    ) -> ConditionResult {
        let (passed, reason) = match &condition.condition_type {
            ConditionType::TimeRange { start_hour, end_hour } => {
                let current_hour = context.current_time.map_or(0, |t| t.hour());
                let in_range = if start_hour <= end_hour {
                    current_hour >= *start_hour && current_hour <= *end_hour
                } else {
                    // Handle overnight range (e.g., 22:00 - 06:00)
                    current_hour >= *start_hour || current_hour <= *end_hour
                };
                (in_range, format!("Hour {} in range {}-{}", current_hour, start_hour, end_hour))
            }
            ConditionType::DayOfWeek { days } => {
                let current_day = context.current_time.map_or(0, |t| t.weekday().num_days_from_sunday());
                let in_days = days.contains(&current_day);
                (in_days, format!("Day {} in allowed days {:?}", current_day, days))
            }
            ConditionType::Tag { tags } => {
                let has_tags = tags.iter().all(|t| context.task_tags.contains(t));
                (has_tags, format!("Required tags: {:?}, have: {:?}", tags, context.task_tags))
            }
            ConditionType::EnergyLevel { min_level, max_level } => {
                let level = context.energy_level.unwrap_or(3);
                let in_range = level >= *min_level && level <= *max_level;
                (in_range, format!("Energy {} in range {}-{}", level, min_level, max_level))
            }
            ConditionType::TaskCount { min_count, max_count } => {
                let count = context.task_count.unwrap_or(0);
                let meets_min = count >= *min_count;
                let meets_max = max_count.map_or(true, |max| count <= max);
                (meets_min && meets_max, format!("Task count {} meets range", count))
            }
            ConditionType::PomodoroCount { min_count, max_count } => {
                let count = context.pomodoro_count.unwrap_or(0);
                let meets_min = count >= *min_count;
                let meets_max = max_count.map_or(true, |max| count <= max);
                (meets_min && meets_max, format!("Pomodoro count {} meets range", count))
            }
        };

        ConditionResult {
            passed: if condition.negate { !passed } else { passed },
            condition_type: format!("{:?}", condition.condition_type),
            reason,
        }
    }

    /// Simulate action execution (for testing).
    pub fn simulate_action(&self, action: &Action) -> ActionResult {
        let success = true; // In simulation, all actions succeed
        let message = match &action.action_type {
            ActionType::CreateBreak { duration_minutes, break_type } => {
                format!("Would create {} break for {} minutes", break_type, duration_minutes)
            }
            ActionType::DeferTask { duration_minutes, reason } => {
                format!(
                    "Would defer task for {} minutes: {}",
                    duration_minutes,
                    reason.as_deref().unwrap_or("no reason")
                )
            }
            ActionType::Notify { title, body } => {
                format!("Would notify: {} - {}", title, body)
            }
            ActionType::SwitchMode { mode } => {
                format!("Would switch to {} mode", mode)
            }
            ActionType::StartTask { task_id } => {
                format!("Would start task: {:?}", task_id)
            }
            ActionType::CompleteTask { task_id } => {
                format!("Would complete task: {:?}", task_id)
            }
            ActionType::AdjustSchedule { adjustment, minutes } => {
                format!("Would {} schedule by {} minutes", adjustment, minutes)
            }
            ActionType::Log { level, message } => {
                format!("Would log [{}]: {}", level, message)
            }
        };

        ActionResult {
            success,
            action_type: format!("{:?}", action.action_type),
            message,
            error: None,
        }
    }

    /// Execute a recipe with given context.
    pub fn execute(&self, recipe_id: &str, context: &RecipeContext) -> Option<RecipeResult> {
        let recipe = self.get(recipe_id)?;
        let start_time = std::time::Instant::now();

        // Check trigger
        if !self.check_trigger(&recipe.trigger, context) {
            return None;
        }

        // Evaluate conditions
        let condition_results: Vec<_> = recipe
            .conditions
            .iter()
            .map(|c| self.evaluate_condition(c, context))
            .collect();

        // Check if all conditions passed
        let all_conditions_passed = condition_results.iter().all(|r| r.passed);

        // Execute actions if conditions passed
        let action_results: Vec<_> = if all_conditions_passed {
            let mut sorted_actions = recipe.actions.clone();
            sorted_actions.sort_by_key(|a| a.order);
            sorted_actions.iter().map(|a| self.simulate_action(a)).collect()
        } else {
            Vec::new()
        };

        let success = all_conditions_passed && action_results.iter().all(|r| r.success);

        let result = RecipeResult {
            recipe_id: recipe.id.clone(),
            recipe_name: recipe.name.clone(),
            success,
            condition_results,
            action_results,
            executed_at: Utc::now(),
            execution_time_ms: start_time.elapsed().as_millis() as u64,
        };

        // Update stats
        {
            let mut stats = self.stats.lock().unwrap();
            stats.total_executions += 1;
            if success {
                stats.successful_executions += 1;
            } else {
                stats.failed_executions += 1;
            }
            let trigger_key = format!("{:?}", recipe.trigger.trigger_type);
            *stats.by_trigger.entry(trigger_key).or_insert(0) += 1;
            *stats.by_recipe.entry(recipe_id.to_string()).or_insert(0) += 1;
        }

        // Log failed actions
        if !success {
            self.execution_log.lock().unwrap().push(result.clone());
        }

        Some(result)
    }

    /// Process all matching recipes for a trigger type.
    pub fn process(&self, trigger_type: &TriggerType, context: &RecipeContext) -> Vec<RecipeResult> {
        let recipes = self.get_enabled();
        recipes
            .iter()
            .filter(|r| r.trigger.trigger_type == *trigger_type)
            .filter_map(|r| self.execute(&r.id, context))
            .collect()
    }

    /// Test-run a recipe (simulation only).
    pub fn test_run(&self, recipe_id: &str, context: &RecipeContext) -> Option<RecipeResult> {
        self.execute(recipe_id, context)
    }

    /// Get execution statistics.
    pub fn get_stats(&self) -> RecipeStats {
        self.stats.lock().unwrap().clone()
    }

    /// Clear execution statistics.
    pub fn clear_stats(&self) {
        let mut stats = self.stats.lock().unwrap();
        *stats = RecipeStats::default();
    }

    /// Get execution log.
    pub fn get_execution_log(&self) -> Vec<RecipeResult> {
        self.execution_log.lock().unwrap().clone()
    }

    /// Clear execution log.
    pub fn clear_execution_log(&self) {
        self.execution_log.lock().unwrap().clear();
    }
}

impl Default for RecipeEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_engine() -> RecipeEngine {
        RecipeEngine::new()
    }

    fn create_context() -> RecipeContext {
        RecipeContext::new()
            .with_time(Utc::now())
            .with_timer_state("focus")
            .with_energy_level(3)
    }

    fn create_recipe(id: &str, trigger_type: TriggerType) -> Recipe {
        Recipe::new(
            id,
            format!("Recipe {}", id),
            Trigger {
                trigger_type,
                data: serde_json::Value::Null,
            },
        )
    }

    #[test]
    fn engine_starts_empty() {
        let engine = create_engine();
        assert_eq!(engine.get_all().len(), 0);
    }

    #[test]
    fn register_recipe() {
        let engine = create_engine();
        let recipe = create_recipe("test-1", TriggerType::Manual);
        engine.register(recipe);

        assert!(engine.get("test-1").is_some());
        assert_eq!(engine.get_all().len(), 1);
    }

    #[test]
    fn unregister_recipe() {
        let engine = create_engine();
        engine.register(create_recipe("test-1", TriggerType::Manual));

        assert!(engine.unregister("test-1"));
        assert_eq!(engine.get_all().len(), 0);
    }

    #[test]
    fn get_enabled_recipes() {
        let engine = create_engine();
        engine.register(create_recipe("test-1", TriggerType::Manual));
        engine.register(
            create_recipe("test-2", TriggerType::Manual).with_enabled(false),
        );

        let enabled = engine.get_enabled();
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].id, "test-1");
    }

    #[test]
    fn check_trigger_timer_state() {
        let engine = create_engine();
        let trigger = Trigger {
            trigger_type: TriggerType::TimerStateChanged,
            data: serde_json::Value::Null,
        };

        let context = RecipeContext::new().with_timer_state("focus");
        assert!(engine.check_trigger(&trigger, &context));

        let empty_context = RecipeContext::new();
        assert!(!engine.check_trigger(&trigger, &empty_context));
    }

    #[test]
    fn evaluate_time_range_condition() {
        let engine = create_engine();
        let condition = Condition {
            condition_type: ConditionType::TimeRange {
                start_hour: 9,
                end_hour: 17,
            },
            negate: false,
        };

        // Create context with hour 12
        let time = Utc::now().with_hour(12).unwrap();
        let context = RecipeContext::new().with_time(time);

        let result = engine.evaluate_condition(&condition, &context);
        assert!(result.passed);
    }

    #[test]
    fn evaluate_time_range_condition_outside() {
        let engine = create_engine();
        let condition = Condition {
            condition_type: ConditionType::TimeRange {
                start_hour: 9,
                end_hour: 17,
            },
            negate: false,
        };

        // Create context with hour 20
        let time = Utc::now().with_hour(20).unwrap();
        let context = RecipeContext::new().with_time(time);

        let result = engine.evaluate_condition(&condition, &context);
        assert!(!result.passed);
    }

    #[test]
    fn evaluate_negated_condition() {
        let engine = create_engine();
        let condition = Condition {
            condition_type: ConditionType::TimeRange {
                start_hour: 9,
                end_hour: 17,
            },
            negate: true, // Negated
        };

        let time = Utc::now().with_hour(12).unwrap();
        let context = RecipeContext::new().with_time(time);

        let result = engine.evaluate_condition(&condition, &context);
        assert!(!result.passed); // Was in range, but negated
    }

    #[test]
    fn evaluate_tag_condition() {
        let engine = create_engine();
        let condition = Condition {
            condition_type: ConditionType::Tag {
                tags: vec!["work".to_string(), "urgent".to_string()],
            },
            negate: false,
        };

        let context = RecipeContext::new()
            .with_task("task-1", vec!["work".to_string(), "urgent".to_string()]);

        let result = engine.evaluate_condition(&condition, &context);
        assert!(result.passed);
    }

    #[test]
    fn evaluate_energy_level_condition() {
        let engine = create_engine();
        let condition = Condition {
            condition_type: ConditionType::EnergyLevel {
                min_level: 3,
                max_level: 5,
            },
            negate: false,
        };

        let context = RecipeContext::new().with_energy_level(4);
        let result = engine.evaluate_condition(&condition, &context);
        assert!(result.passed);

        let low_energy_context = RecipeContext::new().with_energy_level(1);
        let result = engine.evaluate_condition(&condition, &low_energy_context);
        assert!(!result.passed);
    }

    #[test]
    fn execute_recipe_success() {
        let engine = create_engine();
        let recipe = create_recipe("test-1", TriggerType::Manual)
            .with_action(Action {
                action_type: ActionType::Notify {
                    title: "Test".to_string(),
                    body: "Message".to_string(),
                },
                order: 0,
            });
        engine.register(recipe);

        let result = engine.execute("test-1", &RecipeContext::new());
        assert!(result.is_some());
        let result = result.unwrap();
        assert!(result.success);
        assert_eq!(result.action_results.len(), 1);
    }

    #[test]
    fn execute_recipe_condition_fails() {
        let engine = create_engine();
        let recipe = create_recipe("test-1", TriggerType::Manual)
            .with_condition(Condition {
                condition_type: ConditionType::EnergyLevel {
                    min_level: 4,
                    max_level: 5,
                },
                negate: false,
            })
            .with_action(Action {
                action_type: ActionType::Notify {
                    title: "Test".to_string(),
                    body: "Message".to_string(),
                },
                order: 0,
            });
        engine.register(recipe);

        // Energy level 3 doesn't meet min 4
        let context = RecipeContext::new().with_energy_level(3);
        let result = engine.execute("test-1", &context);
        assert!(result.is_some());
        let result = result.unwrap();
        assert!(!result.success);
        assert_eq!(result.action_results.len(), 0); // No actions executed
    }

    #[test]
    fn process_matching_recipes() {
        let engine = create_engine();
        engine.register(create_recipe("test-1", TriggerType::FocusStarted));
        engine.register(create_recipe("test-2", TriggerType::BreakStarted));
        engine.register(create_recipe("test-3", TriggerType::FocusStarted));

        let context = RecipeContext::new().with_timer_state("focus");
        let results = engine.process(&TriggerType::FocusStarted, &context);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn simulate_action() {
        let engine = create_engine();
        let action = Action {
            action_type: ActionType::CreateBreak {
                duration_minutes: 15,
                break_type: "short".to_string(),
            },
            order: 0,
        };

        let result = engine.simulate_action(&action);
        assert!(result.success);
        assert!(result.message.contains("Would create"));
    }

    #[test]
    fn stats_tracking() {
        let engine = create_engine();
        engine.register(create_recipe("test-1", TriggerType::Manual));

        engine.execute("test-1", &RecipeContext::new());
        engine.execute("test-1", &RecipeContext::new());

        let stats = engine.get_stats();
        assert_eq!(stats.total_executions, 2);
        assert_eq!(stats.successful_executions, 2);
    }

    #[test]
    fn execution_log_for_failures() {
        let engine = create_engine();
        let recipe = create_recipe("test-1", TriggerType::Manual)
            .with_condition(Condition {
                condition_type: ConditionType::EnergyLevel {
                    min_level: 5,
                    max_level: 5,
                },
                negate: false,
            });
        engine.register(recipe);

        // This will fail due to condition not met
        engine.execute("test-1", &RecipeContext::new().with_energy_level(1));

        let log = engine.get_execution_log();
        assert_eq!(log.len(), 1);
    }

    #[test]
    fn recipe_priority_ordering() {
        let engine = create_engine();
        engine.register(create_recipe("low", TriggerType::Manual).with_priority(10));
        engine.register(create_recipe("high", TriggerType::Manual).with_priority(1));
        engine.register(create_recipe("medium", TriggerType::Manual).with_priority(5));

        let enabled = engine.get_enabled();
        assert_eq!(enabled[0].id, "high");
        assert_eq!(enabled[1].id, "medium");
        assert_eq!(enabled[2].id, "low");
    }

    #[test]
    fn test_run_simulation() {
        let engine = create_engine();
        let recipe = create_recipe("test-1", TriggerType::Manual)
            .with_action(Action {
                action_type: ActionType::Log {
                    level: "info".to_string(),
                    message: "Test".to_string(),
                },
                order: 0,
            });
        engine.register(recipe);

        let result = engine.test_run("test-1", &RecipeContext::new());
        assert!(result.is_some());
        assert!(result.unwrap().success);
    }

    #[test]
    fn clear_stats() {
        let engine = create_engine();
        engine.register(create_recipe("test-1", TriggerType::Manual));
        engine.execute("test-1", &RecipeContext::new());

        engine.clear_stats();
        let stats = engine.get_stats();
        assert_eq!(stats.total_executions, 0);
    }
}
