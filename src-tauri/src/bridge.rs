//! Bridge commands for Tauri IPC.
//!
//! This module provides Tauri command handlers that expose the
//! pomodoroom-core library to the frontend. The bridge handles:
//! - Timer engine state management
//! - Configuration operations
//! - Statistics queries
//! - Timeline operations
//! - OAuth token secure storage (via OS keyring)
//!
//! Schedule commands are in schedule_commands.rs

use chrono::{DateTime, Duration, Utc};
use pomodoroom_core::events::Event;
use pomodoroom_core::storage::Database;
use pomodoroom_core::timeline::{
    calculate_priority, calculate_priority_with_config, detect_time_gaps, generate_proposals,
    PriorityConfig, TimeGap, TimelineEvent, TimelineItem,
};
use pomodoroom_core::timer::{TimerEngine, TimerState};
use pomodoroom_core::Config;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

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
        Err(format!(
            "Date is too far in the past: {}",
            dt.format("%Y-%m-%d")
        ))
    } else if dt > max_date {
        Err(format!(
            "Date is too far in the future: {}",
            dt.format("%Y-%m-%d")
        ))
    } else {
        Ok(dt)
    }
}

// === OAuth Token Secure Storage (OS Keyring) ===
//
// OAuth tokens are stored securely using the OS keyring via the `keyring` crate.
// Each service (e.g., "google", "notion") has its own keyring entry.
// The entry name format is: "pomodoroom-{service}"

/// Keyring service name for Pomodoroom OAuth tokens
/// Suffix is appended based on POMODOROOM_ENV (dev or production)
fn get_keyring_service_name() -> String {
    let env = std::env::var("POMODOROOM_ENV").unwrap_or_else(|_| "production".to_string());
    format!("pomodoroom-{}", env)
}

/// Get a keyring entry for the specified OAuth service.
///
/// Creates an entry with service="pomodoroom-{env}" and user="{service_name}".
/// This allows us to store separate OAuth tokens for dev and production environments.
fn get_keyring_entry(service_name: &str) -> Result<keyring::Entry, String> {
    let service = get_keyring_service_name();
    keyring::Entry::new(&service, service_name)
        .map_err(|e| format!("Failed to create keyring entry for '{service_name}': {e}"))
}

/// Store OAuth tokens securely in the OS keyring.
///
/// # Arguments
/// * `service_name` - OAuth service identifier (e.g., "google", "notion")
/// * `tokens_json` - JSON string containing OAuth tokens
///
/// # Returns
/// Success or error message
///
/// # Errors
/// Returns an error if:
/// - The tokens JSON is invalid
/// - The tokens structure is missing required fields
/// - Keyring storage fails
#[tauri::command]
pub fn cmd_store_oauth_tokens(service_name: String, tokens_json: String) -> Result<(), String> {
    // Validate that the tokens JSON is valid
    let parsed: serde_json::Value =
        serde_json::from_str(&tokens_json).map_err(|e| format!("Invalid tokens JSON: {e}"))?;

    // Ensure tokens structure is valid
    if parsed.get("accessToken").and_then(|v| v.as_str()).is_none() {
        return Err("Missing accessToken in tokens".to_string());
    }

    // Store in OS keyring
    let entry = get_keyring_entry(&service_name)?;
    entry
        .set_password(&tokens_json)
        .map_err(|e| format!("Failed to store tokens in keyring for '{service_name}': {e}"))?;

    Ok(())
}

/// Load OAuth tokens from the OS keyring.
///
/// # Arguments
/// * `service_name` - OAuth service identifier (e.g., "google", "notion")
///
/// # Returns
/// JSON string containing OAuth tokens, or None if not found
///
/// # Errors
/// Returns an error if keyring access fails (excluding "NoEntry" which returns None)
#[tauri::command]
pub fn cmd_load_oauth_tokens(service_name: String) -> Result<Option<String>, String> {
    let entry = get_keyring_entry(&service_name)?;

    match entry.get_password() {
        Ok(tokens) => Ok(Some(tokens)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!(
            "Failed to load tokens from keyring for '{service_name}': {e}"
        )),
    }
}

/// Clear OAuth tokens from the OS keyring.
///
/// # Arguments
/// * `service_name` - OAuth service identifier (e.g., "google", "notion")
///
/// # Returns
/// Success or error message
///
/// # Errors
/// Returns an error if:
/// - Keyring deletion fails (excluding "NoEntry" which is treated as success)
#[tauri::command]
pub fn cmd_clear_oauth_tokens(service_name: String) -> Result<(), String> {
    let entry = get_keyring_entry(&service_name)?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already cleared, treat as success
        Err(e) => Err(format!(
            "Failed to clear tokens from keyring for '{service_name}': {e}"
        )),
    }
}

/// Active session tracking for DB recording.
///
/// Tracks the current focus session metadata to record to database on completion.
/// active session
#[derive(Debug, Default)]
pub struct ActiveSession {
    task_id: Option<String>,
    project_id: Option<String>,
    #[allow(dead_code)]
    started_at: Option<DateTime<Utc>>,
    /// Last time we updated elapsed_minutes for the task
    last_elapsed_update: Option<DateTime<Utc>>,
}

/// Shared timer engine state, protected by a Mutex.
///
/// The engine lives in-process for the desktop app (no subprocess needed
/// for the hot path). The CLI binary uses the same core library independently.
pub struct EngineState {
    pub engine: Mutex<TimerEngine>,
    pub active_session: Mutex<ActiveSession>,
}

impl EngineState {
    /// Creates a new engine state with the default schedule from config.
    pub fn new() -> Self {
        let config = Config::load_or_default();
        Self {
            engine: Mutex::new(TimerEngine::new(config.schedule())),
            active_session: Mutex::new(ActiveSession::default()),
        }
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

/// Internal helper: Start timer without command wrapper.
/// Used by task_start command for automatic timer integration.
pub fn internal_timer_start(
    engine: &EngineState,
    task_id: Option<String>,
    project_id: Option<String>,
) -> Option<Event> {
    let mut engine_guard = engine.engine.lock().ok()?;
    let event = engine_guard.start();
    if event.is_some() {
        let mut session = engine.active_session.lock().ok()?;
        let now = Utc::now();
        *session = ActiveSession {
            task_id,
            project_id,
            started_at: Some(now),
            last_elapsed_update: Some(now),
        };
    }
    event
}

/// Internal helper: Pause timer without command wrapper.
pub fn internal_timer_pause(engine: &EngineState) -> Option<Event> {
    let mut engine_guard = engine.engine.lock().ok()?;
    engine_guard.pause()
}

/// Internal helper: Reset timer without command wrapper.
pub fn internal_timer_reset(engine: &EngineState) -> Option<Event> {
    let mut engine_guard = engine.engine.lock().ok()?;
    let event = engine_guard.reset();
    let mut session = engine.active_session.lock().ok()?;
    *session = ActiveSession::default();
    event
}

/// Gets the current timer state as a JSON snapshot.
///
/// Returns the complete timer state including current step,
/// remaining time, and progress percentage.
#[tauri::command]
pub fn cmd_timer_status(engine: State<'_, EngineState>) -> Result<Value, String> {
    let engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    let snapshot = engine_guard.snapshot();
    serde_json::to_value(snapshot).map_err(|e| format!("JSON error: {e}"))
}

/// Advances the timer and checks for completion.
///
/// Should be called periodically (e.g., every 100ms) from the frontend.
/// Returns the timer state plus a "completed" event if the current step finished.
///
/// Also updates task.elapsed_minutes every 1 minute while timer is running.
#[tauri::command]
pub fn cmd_timer_tick(
    engine: State<'_, EngineState>,
    db: State<'_, DbState>,
) -> Result<Value, String> {
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    let is_running = engine_guard.state() == TimerState::Running;
    let completed = engine_guard.tick();
    let snapshot = engine_guard.snapshot();
    let mut result = serde_json::to_value(snapshot).map_err(|e| format!("JSON error: {e}"))?;

    // Update elapsed_minutes every 1 minute while running
    if is_running {
        let now = Utc::now();
        let (task_id, should_update) = {
            let session = engine
                .active_session
                .lock()
                .map_err(|e| format!("Lock failed: {e}"))?;
            let should = session.task_id.is_some()
                && session
                    .last_elapsed_update
                    .is_some_and(|last| now.signed_duration_since(last).num_seconds() >= 60);
            (session.task_id.clone(), should)
        };

        if should_update {
            if let Some(ref tid) = task_id {
                if let Ok(schedule_db) = pomodoroom_core::storage::ScheduleDb::open() {
                    if let Ok(Some(mut task)) = schedule_db.get_task(tid) {
                        task.elapsed_minutes += 1;
                        let _ = schedule_db.update_task(&task);
                    }
                }
            }
            // Update last_elapsed_update timestamp
            let mut session = engine
                .active_session
                .lock()
                .map_err(|e| format!("Lock failed: {e}"))?;
            session.last_elapsed_update = Some(now);
        }
    }

    if let Some(event) = completed {
        // Record session to database on completion
        if let Event::TimerCompleted { step_type, at, .. } = event {
            let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

            // Get step info from engine for label and duration
            let step_label = engine_guard
                .current_step()
                .map(|s| s.label.clone())
                .unwrap_or_default();
            let duration_min = engine_guard.total_ms() / 60000;

            // Get active session info (task_id, project_id) before clearing
            let (task_id, project_id) = {
                let session = engine
                    .active_session
                    .lock()
                    .map_err(|e| format!("Lock failed: {e}"))?;
                (session.task_id.clone(), session.project_id.clone())
            };

            // Record the completed session
            if let Err(e) = db_guard.record_session(
                step_type,
                &step_label,
                duration_min as u64,
                at - chrono::Duration::minutes(duration_min as i64),
                at,
                task_id.as_deref(),
                project_id.as_deref(),
            ) {
                eprintln!("Failed to record session: {e}");
            }

            // Increment task's completed_pomodoros if task_id is set
            if let Some(ref tid) = task_id {
                if let Ok(schedule_db) = pomodoroom_core::storage::ScheduleDb::open() {
                    if let Ok(Some(mut task)) = schedule_db.get_task(tid) {
                        task.completed_pomodoros += 1;
                        let _ = schedule_db.update_task(&task);
                    }
                }
            }

            // Clear active session on completion
            let mut session = engine
                .active_session
                .lock()
                .map_err(|e| format!("Lock failed: {e}"))?;
            *session = ActiveSession::default();
        }

        result["completed"] =
            serde_json::to_value(event).map_err(|e| format!("JSON error: {e}"))?;
    }
    Ok(result)
}

/// Starts the timer, optionally at a specific step.
///
/// # Arguments
/// * `step` - Optional step index to start at (0-based). Must be within schedule bounds.
/// * `task_id` - Optional task ID to link this focus session with.
/// * `project_id` - Optional project ID to link this focus session with.
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
    task_id: Option<String>,
    project_id: Option<String>,
) -> Result<Value, String> {
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;

    // Validate step bounds if provided
    if let Some(s) = step {
        let schedule = engine_guard.schedule();
        if s >= schedule.steps.len() {
            return Err(format!(
                "Step index {s} is out of bounds (max: {})",
                schedule.steps.len()
            ));
        }
        engine_guard.reset();
        for _ in 0..s {
            engine_guard.skip();
        }
    }

    let event = engine_guard.start();

    // Record active session info if timer started
    if event.is_some() {
        let mut session = engine
            .active_session
            .lock()
            .map_err(|e| format!("Lock failed: {e}"))?;
        let now = Utc::now();
        *session = ActiveSession {
            task_id,
            project_id,
            started_at: Some(now),
            last_elapsed_update: Some(now),
        };
    }

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
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine_guard.pause();
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
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine_guard.resume();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

/// Completes current timer session.
///
/// Returns the TimerCompleted event or null if not running.
#[tauri::command]
pub fn cmd_timer_complete(
    engine: State<'_, EngineState>,
    db: State<'_, DbState>,
) -> Result<Value, String> {
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;

    // Force completion by fast-forwarding
    let remaining_ms = engine_guard.remaining_ms();

    if remaining_ms > 0 {
        // Fast-forward to completion
        for _ in 0..(remaining_ms / 100 + 1) {
            let _ = engine_guard.tick();
        }
    }

    // Get event (should be Some if timer completed)
    let event_opt = engine_guard.tick();

    if let Some(event) = event_opt {
        // Record session to database on completion
        if let Event::TimerCompleted { step_type, at, .. } = event {
            let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

            // Get step info from engine for label and duration
            let step_label = engine_guard
                .current_step()
                .map(|s| s.label.clone())
                .unwrap_or_default();
            let duration_min = engine_guard.total_ms() / 60000;

            // Get active session info (task_id, project_id) before clearing
            let (task_id, project_id) = {
                let session = engine
                    .active_session
                    .lock()
                    .map_err(|e| format!("Lock failed: {e}"))?;
                (session.task_id.clone(), session.project_id.clone())
            };

            // Record completed session
            if let Err(e) = db_guard.record_session(
                step_type,
                &step_label,
                duration_min as u64,
                at - chrono::Duration::minutes(duration_min as i64),
                at,
                task_id.as_deref(),
                project_id.as_deref(),
            ) {
                eprintln!("Failed to record session: {}", e);
            }

            // Increment task's completed_pomodoros if task_id is set
            if let Some(ref tid) = task_id {
                if let Ok(schedule_db) = pomodoroom_core::storage::ScheduleDb::open() {
                    if let Ok(Some(mut task)) = schedule_db.get_task(tid) {
                        task.completed_pomodoros += 1;
                        let _ = schedule_db.update_task(&task);
                    }
                }
            }

            // Clear active session on completion
            let mut session = engine
                .active_session
                .lock()
                .map_err(|e| format!("Lock failed: {e}"))?;
            *session = ActiveSession::default();
        }

        serde_json::to_value(event).map_err(|e| format!("JSON error: {e}"))
    } else {
        Ok(Value::Null)
    }
}

/// Extends current timer session by adding minutes.
///
/// # Arguments
/// * `minutes` - Number of minutes to add to current session
///
/// # Returns
/// Event data with extension info
#[tauri::command]
pub fn cmd_timer_extend(engine: State<'_, EngineState>, minutes: u32) -> Result<Value, String> {
    let engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;

    // Create a synthetic event for extension
    let current_ms = engine_guard.remaining_ms();
    let additional_ms = minutes as u64 * 60 * 1000;

    let event_json = serde_json::json!({
        "type": "timer_extended",
        "minutes_added": minutes,
        "new_remaining_ms": current_ms + additional_ms
    });

    Ok(event_json)
}

/// Skips to the next step in the schedule.
///
/// Returns the TimerSkipped event.
/// Records the skipped session to database with completed=false.
#[tauri::command]
pub fn cmd_timer_skip(
    engine: State<'_, EngineState>,
    db: State<'_, DbState>,
) -> Result<Value, String> {
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;

    // Capture step info before skip
    let step_type = engine_guard.current_step().map(|s| s.step_type);
    let step_label = engine_guard
        .current_step()
        .map(|s| s.label.clone())
        .unwrap_or_default();
    let now = Utc::now();

    // Get active session info before clearing
    let (task_id, project_id) = {
        let session = engine
            .active_session
            .lock()
            .map_err(|e| format!("Lock failed: {e}"))?;
        (session.task_id.clone(), session.project_id.clone())
    };

    let event = engine_guard.skip();

    // Clear active session on skip
    let mut session = engine
        .active_session
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    *session = ActiveSession::default();
    drop(session);

    // Record skipped session to database
    if let Some(st) = step_type {
        let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

        if let Err(e) = db_guard.record_session(
            st,
            &step_label,
            0, // Skipped sessions have 0 duration
            now,
            now,
            task_id.as_deref(),
            project_id.as_deref(),
        ) {
            eprintln!("Failed to record skipped session: {e}");
        }
    }

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
    let mut engine_guard = engine
        .engine
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    let event = engine_guard.reset();

    // Clear active session on reset
    let mut session = engine
        .active_session
        .lock()
        .map_err(|e| format!("Lock failed: {e}"))?;
    *session = ActiveSession::default();

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

/// Gets shortcuts bindings from config.
#[tauri::command]
pub fn cmd_shortcuts_get() -> Result<Value, String> {
    let config = Config::load_or_default();
    serde_json::to_value(config.shortcuts.bindings).map_err(|e| format!("JSON error: {e}"))
}

/// Sets shortcuts bindings in config.
///
/// # Arguments
/// * `bindings_json` - JSON object with command -> keybinding mapping
#[tauri::command]
pub fn cmd_shortcuts_set(bindings_json: Value) -> Result<(), String> {
    use std::collections::HashMap;
    let mut config = Config::load_or_default();

    // Parse bindings from JSON
    let bindings: HashMap<String, String> =
        serde_json::from_value(bindings_json).map_err(|e| format!("Invalid bindings JSON: {e}"))?;

    config.shortcuts.bindings = bindings;
    config
        .save()
        .map_err(|e| format!("Failed to save config: {e}"))
}

// ── Stats commands ─────────────────────────────────────────────────────

/// Gets today's statistics.
///
/// Returns statistics for pomodoro sessions completed today.
#[tauri::command]
pub fn cmd_stats_today(db: State<'_, DbState>) -> Result<Value, String> {
    let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let stats = db_guard
        .stats_today()
        .map_err(|e| format!("Database error: {e}"))?;
    serde_json::to_value(stats).map_err(|e| format!("JSON error: {e}"))
}

/// Gets all-time statistics.
///
/// Returns statistics for all pomodoro sessions.
#[tauri::command]
pub fn cmd_stats_all(db: State<'_, DbState>) -> Result<Value, String> {
    let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let stats = db_guard
        .stats_all()
        .map_err(|e| format!("Database error: {e}"))?;
    serde_json::to_value(stats).map_err(|e| format!("JSON error: {e}"))
}

// ── Session commands ───────────────────────────────────────────────────

/// Gets sessions within a date range.
///
/// # Arguments
/// * `start_date` - Start date in ISO format (YYYY-MM-DD)
/// * `end_date` - Optional end date in ISO format. If not provided, uses start_date only
///
/// # Returns
/// Array of sessions with completed_at, step_type, duration_min, task_id, project_name
#[tauri::command]
pub fn cmd_sessions_get_by_date_range(
    db: State<'_, DbState>,
    start_date: String,
    end_date: Option<String>,
) -> Result<Value, String> {
    let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

    // Build query with date range
    let sessions = if let Some(end) = end_date {
        db_guard
            .get_sessions_by_range(&start_date, &end)
            .map_err(|e| format!("Database error: {e}"))?
    } else {
        db_guard
            .get_sessions_by_date(&start_date)
            .map_err(|e| format!("Database error: {e}"))?
    };

    serde_json::to_value(sessions).map_err(|e| format!("JSON error: {e}"))
}

/// Gets all sessions, optionally limited.
///
/// # Arguments
/// * `limit` - Optional maximum number of sessions to return
///
/// # Returns
/// Array of all sessions, most recent first
#[tauri::command]
pub fn cmd_sessions_get_all(db: State<'_, DbState>, limit: Option<usize>) -> Result<Value, String> {
    let db_guard = db.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

    let sessions = db_guard
        .get_all_sessions(limit.unwrap_or(1000))
        .map_err(|e| format!("Database error: {e}"))?;

    serde_json::to_value(sessions).map_err(|e| format!("JSON error: {e}"))
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
    let events_array = events_json
        .as_array()
        .ok_or_else(|| "events must be an array".to_string())?;

    let mut events = Vec::new();
    for event_json in events_array {
        let start_str = event_json
            .get("start_time")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "missing start_time".to_string())?;
        let end_str = event_json
            .get("end_time")
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
    let day_start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
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
    let gaps: Vec<TimeGap> =
        serde_json::from_value(gaps_json).map_err(|e| format!("invalid gaps: {e}"))?;

    // Parse tasks
    let tasks: Vec<TimelineItem> =
        serde_json::from_value(tasks_json).map_err(|e| format!("invalid tasks: {e}"))?;

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
    let task: TimelineItem =
        serde_json::from_value(task_json).map_err(|e| format!("invalid task: {e}"))?;

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
    let tasks: Vec<TimelineItem> =
        serde_json::from_value(tasks_json).map_err(|e| format!("invalid tasks: {e}"))?;

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

// === Logging Command ===

/// Receive log entries from frontend and write to backend logs.
///
/// This command provides a unified logging interface for the frontend.
/// Log entries are written to the console using the tracing crate.
///
/// # Arguments
/// * `entry` - Log entry with level, message, context, metadata, and timestamp
///
/// # Returns
/// Success or error message
#[tauri::command]
pub fn cmd_log(entry: Value) -> Result<(), String> {
    let level = entry
        .get("level")
        .and_then(|v| v.as_str())
        .unwrap_or("info");

    let message = entry.get("message").and_then(|v| v.as_str()).unwrap_or("");

    let context = entry.get("context").and_then(|v| v.as_str());

    let _metadata = entry.get("metadata");

    // Build formatted message
    let prefix = context.map(|c| format!("[{}]", c)).unwrap_or_default();
    let formatted = format!("{}{}", prefix, message);

    // Log with appropriate level (simplified - no metadata support)
    match level {
        "debug" => println!("{}", formatted),
        "info" => println!("{}", formatted),
        "warn" => eprintln!("{}", formatted),
        "error" => eprintln!("{}", formatted),
        _ => println!("{}", formatted),
    }

    Ok(())
}

// ── Action Notification Commands ───────────────────────────────────────────

/// Action type for notification buttons.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationAction {
    /// Mark current session as complete
    Complete,
    /// Extend timer with additional minutes
    Extend { minutes: u32 },
    /// Pause current session
    Pause,
    /// Resume from paused state
    Resume,
    /// Skip to next session
    Skip,
    /// Start next task/session
    StartNext,
}

/// Action button displayed in notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationButton {
    pub label: String,
    pub action: NotificationAction,
}

/// Action notification data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionNotification {
    pub title: String,
    pub message: String,
    pub buttons: Vec<NotificationButton>,
}

/// Global state for current action notification.
///
/// Stores notification data to be retrieved by React frontend.
pub struct NotificationState(pub Mutex<Option<ActionNotification>>);

impl NotificationState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    /// Set notification data.
    pub fn set(&self, notification: ActionNotification) {
        let mut state = self.0.lock().unwrap();
        *state = Some(notification);
    }

    /// Get and clear notification data.
    pub fn take(&self) -> Option<ActionNotification> {
        let mut state = self.0.lock().unwrap();
        state.take()
    }
}

/// Shows action notification window with specified data.
///
/// # Arguments
/// * `app` - The app handle (automatically provided by Tauri)
/// * `notification` - Notification data containing title, message, and buttons
///
/// # Returns
/// Success or error message
#[tauri::command]
pub async fn cmd_show_action_notification(
    app: AppHandle,
    notification: ActionNotification,
) -> Result<(), String> {
    println!(
        "Showing action notification: title={}, buttons={}",
        notification.title,
        notification.buttons.len()
    );

    // Store notification data for React to retrieve
    if let Some(state) = app.try_state::<NotificationState>() {
        state.set(notification);
    }

    // Open notification window
    crate::window::cmd_open_action_notification(app).await
}

/// Gets current action notification data and clears it.
///
/// Called by React frontend on notification window load.
///
/// # Returns
/// The notification data or null if no notification is pending
#[tauri::command]
pub fn cmd_get_action_notification(
    state: State<'_, NotificationState>,
) -> Result<Option<Value>, String> {
    let notification = state.take();
    match notification {
        Some(notif) => {
            let json = serde_json::to_value(notif).map_err(|e| format!("JSON error: {e}"))?;
            Ok(Some(json))
        }
        None => Ok(None),
    }
}
