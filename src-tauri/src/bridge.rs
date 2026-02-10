//! Bridge commands for Tauri IPC.
//!
//! This module provides Tauri command handlers that expose the
//! pomodoroom-core library to the frontend. The bridge handles:
//! - Timer engine state management
//! - Configuration operations
//! - Statistics queries
//! - Timeline operations
//! - OAuth token secure storage
//!
//! Schedule commands are in schedule_commands.rs

use pomodoroom_core::storage::Database;
use pomodoroom_core::timer::TimerEngine;
use pomodoroom_core::Config;
use pomodoroom_core::timeline::{generate_proposals, detect_time_gaps, TimelineEvent, TimelineItem, TimeGap, calculate_priority, calculate_priority_with_config, PriorityConfig};
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;

// === Security Validation Constants ===

/// Maximum reasonable date offset from now (10 years in future)
const MAX_DATE_OFFSET_DAYS: i64 = 365 * 10;

/// Minimum reasonable date offset (100 years in past)
const MIN_DATE_OFFSET_DAYS: i64 = -365 * 100;

/// Validate that a date string is within reasonable bounds.
fn validate_date_bounds(dt: DateTime<Utc>) -> Result<DateTime<Utc>, String> {
    let now = Utc::now();
    let min_date = now + Duration::days(MIN_DATE_OFFSET_DAYS);
    let max_date = now + Duration::days(MAX_DATE_OFFSET_DAYS);

    if dt < min_date {
        Err(format!("Date is too far in the past: {}", dt.format("%Y-%m-%d")))
    } else if dt > max_date {
        Err(format!("Date is too far in the future: {}", dt.format("%Y-%m-%d")))
    } else {
        Ok(dt)
    }
}

/// In-memory secure token storage (for desktop app - should use keyring in production)
/// In a real implementation, this would use OS keyring via the keyring crate.
static mut TOKEN_STORE: Option<HashMap<String, String>> = None;

/// Initialize the token store (should be called on app startup)
fn init_token_store() {
    unsafe {
        if TOKEN_STORE.is_none() {
            TOKEN_STORE = Some(HashMap::new());
        }
    }
}

/// Store OAuth tokens securely.
/// Note: This is a simplified implementation. In production, use OS keyring.
#[tauri::command]
pub fn cmd_store_oauth_tokens(service_name: String, tokens_json: String) -> Result<(), String> {
    init_token_store();
    unsafe {
        if let Some(ref mut store) = TOKEN_STORE {
            // Validate that the tokens JSON is valid
            let parsed: serde_json::Value = serde_json::from_str(&tokens_json)
                .map_err(|e| format!("Invalid tokens JSON: {e}"))?;

            // Ensure tokens structure is valid
            if parsed.get("accessToken").and_then(|v| v.as_str()).is_none() {
                return Err("Missing accessToken in tokens".to_string());
            }

            store.insert(service_name, tokens_json);
            Ok(())
        } else {
            Err("Token store not initialized".to_string())
        }
    }
}

/// Load OAuth tokens from secure storage.
#[tauri::command]
pub fn cmd_load_oauth_tokens(service_name: String) -> Result<Option<String>, String> {
    init_token_store();
    unsafe {
        if let Some(ref store) = TOKEN_STORE {
            Ok(store.get(&service_name).cloned())
        } else {
            Err("Token store not initialized".to_string())
        }
    }
}

/// Clear OAuth tokens from secure storage.
#[tauri::command]
pub fn cmd_clear_oauth_tokens(service_name: String) -> Result<(), String> {
    init_token_store();
    unsafe {
        if let Some(ref mut store) = TOKEN_STORE {
            store.remove(&service_name);
            Ok(())
        } else {
            Err("Token store not initialized".to_string())
        }
    }
}

/// Shared timer engine state, protected by a Mutex.
///
/// The engine lives in-process for the desktop app (no subprocess needed
/// for the hot path). The CLI binary uses the same core library independently.
pub struct EngineState(pub Mutex<TimerEngine>);

impl EngineState {
    /// Creates a new engine state with the default schedule from config.
    pub fn new() -> Self {
        let config = Config::load_or_default();
        Self(Mutex::new(TimerEngine::new(config.schedule())))
    }
}

/// Database state stored in Tauri State to avoid re-opening per call.
pub struct DbState(pub Mutex<Database>);

impl DbState {
    pub fn new() -> Result<Self, String> {
        Database::open()
            .map(|db| Self(Mutex::new(db)))
            .map_err(|e| e.to_string())
    }
}

// ── Timer commands ─────────────────────────────────────────────────────

/// Gets the current timer state as a JSON snapshot.
///
/// Returns the complete timer state including current step,
/// remaining time, and progress percentage.
#[tauri::command]
pub fn cmd_timer_status(engine: State<'_, EngineState>) -> Result<Value, String> {
    let engine = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let snapshot = engine.snapshot();
    serde_json::to_value(snapshot).map_err(|e| format!("JSON error: {e}"))
}

/// Advances the timer and checks for completion.
///
/// Should be called periodically (e.g., every 100ms) from the frontend.
/// Returns the timer state plus a "completed" event if the current step finished.
#[tauri::command]
pub fn cmd_timer_tick(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let completed = engine.tick();
    let snapshot = engine.snapshot();
    let mut result = serde_json::to_value(snapshot).map_err(|e| format!("JSON error: {e}"))?;
    if let Some(event) = completed {
        result["completed"] = serde_json::to_value(event).map_err(|e| format!("JSON error: {e}"))?;
    }
    Ok(result)
}

/// Starts the timer, optionally at a specific step.
///
/// # Arguments
/// * `step` - Optional step index to start at (0-based). Must be within schedule bounds.
///
/// # Returns
/// The TimerStarted event or null if already running.
///
/// # Errors
/// Returns an error if the step index is out of bounds.
#[tauri::command]
pub fn cmd_timer_start(
    engine: State<'_, EngineState>,
    step: Option<usize>,
) -> Result<Value, String> {
    let mut engine_guard = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

    // Validate step bounds if provided
    if let Some(s) = step {
        let schedule = engine_guard.schedule();
        if s >= schedule.steps.len() {
            return Err(format!("Step index {s} is out of bounds (max: {})", schedule.steps.len()));
        }
        engine_guard.reset();
        for _ in 0..s {
            engine_guard.skip();
        }
    }

    let event = engine_guard.start();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

/// Pauses the running timer.
///
/// Returns the TimerPaused event or null if not running.
#[tauri::command]
pub fn cmd_timer_pause(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine.pause();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

/// Resumes a paused timer.
///
/// Returns the TimerResumed event or null if not paused.
#[tauri::command]
pub fn cmd_timer_resume(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine.resume();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

/// Skips to the next step in the schedule.
///
/// Returns the TimerSkipped event.
#[tauri::command]
pub fn cmd_timer_skip(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine.skip();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

/// Resets the timer to the initial state.
///
/// Returns the TimerReset event.
#[tauri::command]
pub fn cmd_timer_reset(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine.reset();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

// ── Config commands ────────────────────────────────────────────────────

/// Gets a configuration value by key.
///
/// # Arguments
/// * `key` - Configuration key to retrieve
///
/// # Returns
/// The configuration value as a string
///
/// # Errors
/// Returns an error if the key is unknown.
#[tauri::command]
pub fn cmd_config_get(key: String) -> Result<Value, String> {
    let config = Config::load_or_default();
    match config.get(&key) {
        Some(value) => Ok(Value::String(value)),
        None => Err(format!("unknown key: {key}")),
    }
}

/// Sets a configuration value.
///
/// # Arguments
/// * `key` - Configuration key to set
/// * `value` - Value to set
#[tauri::command]
pub fn cmd_config_set(key: String, value: String) -> Result<(), String> {
    let mut config = Config::load_or_default();
    config.set(&key, &value).map_err(|e| e.to_string())
}

/// Lists all configuration values.
///
/// Returns the complete configuration as JSON.
#[tauri::command]
pub fn cmd_config_list() -> Result<Value, String> {
    let config = Config::load_or_default();
    serde_json::to_value(config).map_err(|e| format!("JSON error: {e}"))
}

// ── Stats commands ─────────────────────────────────────────────────────

/// Gets today's statistics.
///
/// Returns statistics for pomodoro sessions completed today.
#[tauri::command]
pub fn cmd_stats_today(db: State<'_, DbState>) -> Result<Value, String> {
    let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let stats = db_guard.stats_today().map_err(|e| format!("Database error: {e}"))?;
    serde_json::to_value(stats).map_err(|e| format!("JSON error: {e}"))
}

/// Gets all-time statistics.
///
/// Returns statistics for all pomodoro sessions.
#[tauri::command]
pub fn cmd_stats_all(db: State<'_, DbState>) -> Result<Value, String> {
    let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let stats = db_guard.stats_all().map_err(|e| format!("Database error: {e}"))?;
    serde_json::to_value(stats).map_err(|e| format!("JSON error: {e}"))
}

// ── Timeline commands ───────────────────────────────────────────────────

/// Detects time gaps in a list of events.
///
/// # Arguments
/// * `events_json` - Array of events with start_time and end_time (ISO 8601 strings)
///
/// # Returns
/// Array of detected time gaps
#[tauri::command]
pub fn cmd_timeline_detect_gaps(events_json: Value) -> Result<Value, String> {
    // Parse events from JSON
    // Expected format: [{"start_time": "ISO string", "end_time": "ISO string"}, ...]
    let events_array = events_json.as_array()
        .ok_or_else(|| "events must be an array".to_string())?;

    let mut events = Vec::new();
    for event_json in events_array {
        let start_str = event_json.get("start_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing start_time".to_string())?;
        let end_str = event_json.get("end_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing end_time".to_string())?;

        let start_time = chrono::DateTime::parse_from_rfc3339(start_str)
            .map_err(|e| format!("invalid start_time: {e}"))?
            .with_timezone(&chrono::Utc);
        let end_time = chrono::DateTime::parse_from_rfc3339(end_str)
            .map_err(|e| format!("invalid end_time: {e}"))?
            .with_timezone(&chrono::Utc);

        // Validate date bounds
        let start_time = validate_date_bounds(start_time)?;
        let end_time = validate_date_bounds(end_time)?;

        events.push(TimelineEvent::new(start_time, end_time));
    }

    // Get day boundaries from now
    let now = chrono::Utc::now();
    let day_start = now.date_naive().and_hms_opt(0, 0, 0)
        .ok_or_else(|| "invalid day start".to_string())?
        .and_utc();
    let day_end = day_start + chrono::Duration::days(1);

    // Detect gaps
    let gaps = detect_time_gaps(&events, day_start, day_end);
    serde_json::to_value(gaps).map_err(|e| format!("JSON error: {e}"))
}

/// Generates task proposals based on time gaps.
///
/// # Arguments
/// * `gaps_json` - Array of time gaps
/// * `tasks_json` - Array of timeline items (tasks)
///
/// # Returns
/// Array of task proposals mapped to time gaps
#[tauri::command]
pub fn cmd_timeline_generate_proposals(
    gaps_json: Value,
    tasks_json: Value,
) -> Result<Value, String> {
    // Parse gaps
    let gaps: Vec<TimeGap> = serde_json::from_value(gaps_json)
        .map_err(|e| format!("invalid gaps: {e}"))?;

    // Parse tasks
    let tasks: Vec<TimelineItem> = serde_json::from_value(tasks_json)
        .map_err(|e| format!("invalid tasks: {e}"))?;

    // Generate proposals
    let proposals = generate_proposals(&gaps, &tasks, chrono::Utc::now());
    serde_json::to_value(proposals).map_err(|e| format!("JSON error: {e}"))
}

/// Calculates priority score for a single task.
///
/// # Arguments
/// * `task_json` - Timeline item (task) to calculate priority for
///
/// # Returns
/// Priority score (0-100)
#[tauri::command]
pub fn cmd_calculate_priority(task_json: Value) -> Result<Value, String> {
    // Parse task
    let task: TimelineItem = serde_json::from_value(task_json)
        .map_err(|e| format!("invalid task: {e}"))?;

    // Calculate priority
    let priority = calculate_priority(&task);
    serde_json::to_value(priority).map_err(|e| format!("JSON error: {e}"))
}

/// Calculates priority scores for multiple tasks.
///
/// # Arguments
/// * `tasks_json` - Array of timeline items (tasks)
///
/// # Returns
/// Array of objects with task_id and priority score
#[tauri::command]
pub fn cmd_calculate_priorities(tasks_json: Value) -> Result<Value, String> {
    // Parse tasks
    let tasks: Vec<TimelineItem> = serde_json::from_value(tasks_json)
        .map_err(|e| format!("invalid tasks: {e}"))?;

    // Calculate priorities for each task
    let config = PriorityConfig {
        current_time: chrono::Utc::now(),
        ..Default::default()
    };

    let results: Vec<serde_json::Value> = tasks
        .iter()
        .map(|task| {
            let priority = calculate_priority_with_config(task, &config);
            serde_json::json!({
                "task_id": task.id,
                "priority": priority
            })
        })
        .collect();

    serde_json::to_value(results).map_err(|e| format!("JSON error: {e}"))
}
