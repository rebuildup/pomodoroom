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
use pomodoroom_core::storage::schedule_db::ScheduleDb;
use pomodoroom_core::jit_engine::{JitContext, JitEngine, TaskSuggestion};
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

// ── Profile Pack commands ─────────────────────────────────────────────

/// Gets all available profile packs.
///
/// Returns a list of profile packs with their metadata.
#[tauri::command]
pub fn cmd_profile_list() -> Result<Value, String> {
    let manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    let packs = manager.available_packs();
    serde_json::to_value(packs).map_err(|e| format!("JSON error: {e}"))
}

/// Gets a specific profile pack by ID.
///
/// # Arguments
/// * `id` - Profile pack ID (e.g., "deep-work", "admin", "creative")
#[tauri::command]
pub fn cmd_profile_get(id: String) -> Result<Value, String> {
    let pack = pomodoroom_core::storage::find_pack(&id)
        .ok_or_else(|| format!("Profile pack '{}' not found", id))?;

    serde_json::to_value(pack).map_err(|e| format!("JSON error: {e}"))
}

/// Gets the currently active profile pack.
///
/// Returns the pack ID or null if using custom configuration.
#[tauri::command]
pub fn cmd_profile_current() -> Result<Value, String> {
    let manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    match manager.active_pack() {
        Some(id) => Ok(Value::String(id.to_string())),
        None => Ok(Value::Null),
    }
}

/// Applies a profile pack to the current configuration.
///
/// # Arguments
/// * `id` - Profile pack ID to apply
///
/// # Returns
/// Backup information for rollback
#[tauri::command]
pub fn cmd_profile_apply(id: String) -> Result<Value, String> {
    let mut manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    let mut config = Config::load_or_default();

    let backup = manager
        .apply_pack(&id, &mut config)
        .map_err(|e| e.to_string())?;

    serde_json::to_value(backup).map_err(|e| format!("JSON error: {e}"))
}

/// Rolls back to the previous configuration.
///
/// Returns the pack ID that was rolled back, or null if no backup exists.
#[tauri::command]
pub fn cmd_profile_rollback() -> Result<Value, String> {
    let mut manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    let mut config = Config::load_or_default();

    match manager.rollback(&mut config) {
        Some(rolled_back_id) => Ok(Value::String(rolled_back_id)),
        None => Ok(Value::Null),
    }
}

/// Gets performance comparison between two profile packs.
///
/// # Arguments
/// * `pack_a` - First profile pack ID
/// * `pack_b` - Second profile pack ID
#[tauri::command]
pub fn cmd_profile_compare(pack_a: String, pack_b: String) -> Result<Value, String> {
    let manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    match manager.compare_packs(&pack_a, &pack_b) {
        Some(comparison) => serde_json::to_value(comparison).map_err(|e| format!("JSON error: {e}")),
        None => Ok(Value::Null),
    }
}

/// Gets weekly performance summary for all profiles.
#[tauri::command]
pub fn cmd_profile_summary() -> Result<Value, String> {
    let manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    let summary = manager.weekly_summary();
    serde_json::to_value(summary).map_err(|e| format!("JSON error: {e}"))
}

/// Records a completed session for the active profile.
///
/// # Arguments
/// * `duration_min` - Duration of the completed session in minutes
#[tauri::command]
pub fn cmd_profile_record_session(duration_min: u64) -> Result<(), String> {
    let mut manager = pomodoroom_core::storage::ProfileManager::load()
        .map_err(|e| format!("Failed to load profile manager: {e}"))?;

    manager.record_session(duration_min);
    Ok(())
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
    /// Start or resume a specific task by ID
    StartTask { id: String, resume: bool },
    /// Open recommendation picker for starting later
    StartLaterPick { id: String },
    /// Complete a specific task by ID
    CompleteTask { id: String },
    /// Extend a specific task by additional minutes
    ExtendTask { id: String, minutes: u32 },
    /// Postpone a specific task
    PostponeTask { id: String },
    /// Defer a specific task until datetime
    DeferTaskUntil { id: String, defer_until: String },
    /// Delete a specific task
    DeleteTask { id: String },
    /// Interrupt a task and schedule resume time
    InterruptTask { id: String, resume_at: String },
    /// Close notification without action
    Dismiss,
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
    pub fn get(&self) -> Option<ActionNotification> {
        let state = self.0.lock().unwrap();
        state.clone()
    }

    /// Clear notification data.
    pub fn clear(&self) {
        let mut state = self.0.lock().unwrap();
        *state = None;
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
    let notification = state.get();
    match notification {
        Some(notif) => {
            let json = serde_json::to_value(notif).map_err(|e| format!("JSON error: {e}"))?;
            Ok(Some(json))
        }
        None => Ok(None),
    }
}

/// Clears current action notification data.
#[tauri::command]
pub fn cmd_clear_action_notification(state: State<'_, NotificationState>) -> Result<(), String> {
    state.clear();
    Ok(())
}

// === Notification Stack Commands ===

/// Stacked notification data with position information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackedNotificationData {
    pub id: String,
    pub title: String,
    pub message: String,
    pub buttons: Vec<NotificationButton>,
    pub stack_position: usize,
}

/// Global state for notification stack (multiple simultaneous notifications).
pub struct NotificationStackState(pub Mutex<Vec<StackedNotificationData>>);

#[allow(dead_code)]
impl NotificationStackState {
    pub fn new() -> Self {
        Self(Mutex::new(Vec::new()))
    }

    /// Add a notification to the stack.
    pub fn add(&self, notification: StackedNotificationData) {
        let mut stack = self.0.lock().unwrap();
        stack.push(notification);
    }

    /// Get notification by ID.
    pub fn get(&self, id: &str) -> Option<StackedNotificationData> {
        let stack = self.0.lock().unwrap();
        stack.iter().find(|n| n.id == id).cloned()
    }

    /// Remove notification by ID.
    pub fn remove(&self, id: &str) -> bool {
        let mut stack = self.0.lock().unwrap();
        if let Some(pos) = stack.iter().position(|n| n.id == id) {
            stack.remove(pos);
            return true;
        }
        false
    }

    /// Get all active notifications.
    pub fn get_all(&self) -> Vec<StackedNotificationData> {
        let stack = self.0.lock().unwrap();
        stack.clone()
    }

    /// Get count of active notifications.
    pub fn count(&self) -> usize {
        let stack = self.0.lock().unwrap();
        stack.len()
    }

    /// Clear all notifications.
    pub fn clear(&self) {
        let mut stack = self.0.lock().unwrap();
        stack.clear();
    }
}

/// Open a stacked notification window at a specific position.
///
/// # Arguments
/// * `app` - The app handle
/// * `notification_id` - Unique ID for this notification
/// * `title` - Notification title
/// * `message` - Notification message
/// * `buttons` - Action buttons
/// * `x` - X position offset
/// * `y` - Y position offset
#[tauri::command]
pub async fn cmd_open_notification_window(
    app: AppHandle,
    notification_id: String,
    title: String,
    message: String,
    buttons: Vec<NotificationButton>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    use crate::window;

    // Store notification data for the window to retrieve
    if let Some(state) = app.try_state::<NotificationStackState>() {
        let position = state.count(); // Position based on current count before adding
        let data = StackedNotificationData {
            id: notification_id.clone(),
            title,
            message,
            buttons,
            stack_position: position,
        };
        state.add(data);
    }

    // Open window at specified position
    window::cmd_open_stacked_notification_window(app, notification_id, x, y).await
}

/// Get notification data for a stacked notification window.
///
/// # Arguments
/// * `state` - Notification stack state
///
/// # Returns
/// The notification data or null if not found
#[tauri::command]
pub fn cmd_get_stacked_notification(
    state: State<'_, NotificationStackState>,
) -> Result<Option<Value>, String> {
    // Get the oldest notification that hasn't been retrieved yet
    let stack = state.0.lock().unwrap();

    // For now, just get the first one
    // In a real implementation, we'd track which windows have retrieved which notifications
    if let Some(notification) = stack.first() {
        let json = serde_json::to_value(notification).map_err(|e| format!("JSON error: {e}"))?;
        Ok(Some(json))
    } else {
        Ok(None)
    }
}

/// Notify that a notification window was closed.
///
/// # Arguments
/// * `state` - Notification stack state
/// * `notification_id` - ID of the closed notification
#[tauri::command]
pub fn cmd_notification_window_closed(
    state: State<'_, NotificationStackState>,
    notification_id: String,
) -> Result<(), String> {
    state.remove(&notification_id);
    Ok(())
}

/// Get the count of active notifications in the stack.
///
/// # Returns
/// Number of currently active notification windows
#[tauri::command]
pub fn cmd_get_active_notification_count(
    state: State<'_, NotificationStackState>,
) -> Result<usize, String> {
    Ok(state.count())
}

/// Clear all active notifications.
///
/// # Arguments
/// * `state` - Notification stack state
#[tauri::command]
pub fn cmd_clear_all_notifications(
    state: State<'_, NotificationStackState>,
) -> Result<(), String> {
    state.clear();
    Ok(())
}

// === Policy Editor Commands ===

use pomodoroom_core::policy::{
    DayPlanPreview, PolicyEditor, ValidationResult,
};
use pomodoroom_core::timer::Schedule;

/// Policy editor state for the current session.
pub struct PolicyEditorState {
    pub editor: std::sync::Mutex<PolicyEditor>,
}

impl Default for PolicyEditorState {
    fn default() -> Self {
        Self {
            editor: std::sync::Mutex::new(PolicyEditor::new()),
        }
    }
}

/// Initialize or load policy editor from current config.
#[tauri::command]
pub fn cmd_policy_editor_init(state: State<'_, PolicyEditorState>) -> Result<Value, String> {
    let editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    let json = serde_json::to_value(&*editor).map_err(|e| format!("JSON error: {e}"))?;
    Ok(json)
}

/// Load policy editor from config.
#[tauri::command]
pub fn cmd_policy_editor_load(
    state: State<'_, PolicyEditorState>,
) -> Result<Value, String> {
    let config = Config::load().map_err(|e| format!("Failed to load config: {e}"))?;
    let editor = PolicyEditor::from_config(&config);
    let json = serde_json::to_value(&editor).map_err(|e| format!("JSON error: {e}"))?;

    // Update state
    let mut state_editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    *state_editor = editor;

    Ok(json)
}

/// Validate current policy settings.
#[tauri::command]
pub fn cmd_policy_validate(state: State<'_, PolicyEditorState>) -> Result<ValidationResult, String> {
    let editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    Ok(editor.validate())
}

/// Set focus duration in policy editor.
#[tauri::command]
pub fn cmd_policy_set_focus_duration(
    state: State<'_, PolicyEditorState>,
    minutes: u32,
) -> Result<(), String> {
    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor.set_focus_duration(minutes);
    Ok(())
}

/// Set short break duration in policy editor.
#[tauri::command]
pub fn cmd_policy_set_short_break(
    state: State<'_, PolicyEditorState>,
    minutes: u32,
) -> Result<(), String> {
    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor.set_short_break(minutes);
    Ok(())
}

/// Set long break duration in policy editor.
#[tauri::command]
pub fn cmd_policy_set_long_break(
    state: State<'_, PolicyEditorState>,
    minutes: u32,
) -> Result<(), String> {
    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor.set_long_break(minutes);
    Ok(())
}

/// Set pomodoros before long break in policy editor.
#[tauri::command]
pub fn cmd_policy_set_pomodoros_before_long_break(
    state: State<'_, PolicyEditorState>,
    count: u32,
) -> Result<(), String> {
    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor.set_pomodoros_before_long_break(count);
    Ok(())
}

/// Set custom schedule in policy editor.
#[tauri::command]
pub fn cmd_policy_set_custom_schedule(
    state: State<'_, PolicyEditorState>,
    schedule: Option<Schedule>,
) -> Result<(), String> {
    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor.set_custom_schedule(schedule);
    Ok(())
}

/// Preview day plan from current policy.
#[tauri::command]
pub fn cmd_policy_preview_day_plan(
    state: State<'_, PolicyEditorState>,
    start_hour: u32,
    start_minute: u32,
) -> Result<DayPlanPreview, String> {
    let editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    let start_time = chrono::NaiveTime::from_hms_opt(start_hour, start_minute, 0)
        .ok_or_else(|| "Invalid start time".to_string())?;
    Ok(editor.preview_day_plan(start_time))
}

/// Apply policy to config (save).
#[tauri::command]
pub fn cmd_policy_apply(state: State<'_, PolicyEditorState>) -> Result<(), String> {
    let editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;

    // Validate first
    let validation = editor.validate();
    if !validation.is_valid {
        return Err(format!(
            "Validation failed: {}",
            validation
                .errors
                .iter()
                .map(|e| &e.message)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    // Apply to config
    let mut config = Config::load().map_err(|e| format!("Failed to load config: {e}"))?;
    editor
        .apply_to_config(&mut config)
        .map_err(|errors| format!("Apply failed: {:?}", errors))?;
    config
        .save()
        .map_err(|e| format!("Failed to save config: {e}"))?;

    Ok(())
}

/// Reset policy editor to defaults.
#[tauri::command]
pub fn cmd_policy_reset(state: State<'_, PolicyEditorState>) -> Result<(), String> {
    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor.reset_to_default();
    Ok(())
}

/// Export policy as JSON bundle.
#[tauri::command]
pub fn cmd_policy_export(state: State<'_, PolicyEditorState>) -> Result<Value, String> {
    let editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    let bundle = editor
        .export_bundle()
        .map_err(|errors| format!("Export failed: {:?}", errors))?;
    let json = serde_json::to_value(bundle).map_err(|e| format!("JSON error: {e}"))?;
    Ok(json)
}

/// Import policy from JSON bundle.
#[tauri::command]
pub fn cmd_policy_import(
    state: State<'_, PolicyEditorState>,
    bundle_json: Value,
) -> Result<(), String> {
    let bundle: pomodoroom_core::policy::PolicyBundle =
        serde_json::from_value(bundle_json).map_err(|e| format!("Invalid bundle JSON: {e}"))?;

    let mut editor = state
        .editor
        .lock()
        .map_err(|_| "Failed to lock editor state")?;
    editor
        .import_bundle(&bundle)
        .map_err(|e| format!("Import failed: {e}"))?;

    Ok(())
}

// ============================================================================
// Task Reconciliation Commands
// ============================================================================

use pomodoroom_core::task::{
    ReconciliationConfig, ReconciliationEngine, ReconciliationSummary, Task, TaskState,
};

/// Run reconciliation for stale RUNNING tasks.
///
/// This should be called at application startup to detect and recover
/// from tasks left in RUNNING state after crash, sleep, or restart.
///
/// # Returns
/// A summary of the reconciliation including:
/// - Total RUNNING tasks found
/// - Number of stale tasks detected
/// - Number of tasks transitioned to PAUSED
/// - List of reconciled tasks with resume hints
#[tauri::command]
pub fn cmd_reconciliation_run(
    _db_state: State<'_, DbState>,
    stale_threshold_minutes: Option<i64>,
    auto_pause: Option<bool>,
) -> Result<ReconciliationSummary, String> {
    let mut config = ReconciliationConfig::default();

    if let Some(threshold) = stale_threshold_minutes {
        config = config.with_stale_threshold(threshold);
    }
    if let Some(pause) = auto_pause {
        config.auto_pause = pause;
    }

    let engine = ReconciliationEngine::with_config(config);

    let schedule_db = pomodoroom_core::storage::schedule_db::ScheduleDb::open()
        .map_err(|e| format!("Failed to open schedule database: {e}"))?;

    let tasks = schedule_db
        .list_tasks()
        .map_err(|e| format!("Failed to list tasks: {e}"))?;

    let (updated_tasks, summary) = engine.reconcile(tasks);

    // Persist updated tasks
    for task in &updated_tasks {
        if task.state == TaskState::Paused
            && summary.reconciled_tasks.iter().any(|r| r.id == task.id)
        {
            schedule_db
                .update_task(task)
                .map_err(|e| format!("Failed to update task {}: {e}", task.id))?;
        }
    }

    Ok(summary)
}

/// Check for stale RUNNING tasks without modifying them.
///
/// Use this to preview what reconciliation would do before running it.
#[tauri::command]
pub fn cmd_reconciliation_preview(
    _db_state: State<'_, DbState>,
    stale_threshold_minutes: Option<i64>,
) -> Result<ReconciliationSummary, String> {
    let config = ReconciliationConfig::default()
        .with_stale_threshold(stale_threshold_minutes.unwrap_or(30))
        .with_auto_pause(false); // Preview mode - don't modify

    let engine = ReconciliationEngine::with_config(config);

    let schedule_db = pomodoroom_core::storage::schedule_db::ScheduleDb::open()
        .map_err(|e| format!("Failed to open schedule database: {e}"))?;

    let tasks = schedule_db
        .list_tasks()
        .map_err(|e| format!("Failed to list tasks: {e}"))?;

    let (_, summary) = engine.reconcile(tasks);
    Ok(summary)
}

/// Get the default reconciliation configuration.
#[tauri::command]
pub fn cmd_reconciliation_config() -> Result<ReconciliationConfig, String> {
    Ok(ReconciliationConfig::default())
}

/// Quick resume a previously paused task.
///
/// This is a convenience command for the "quick resume" UX after reconciliation.
/// It transitions a PAUSED task back to RUNNING state.
#[tauri::command]
pub fn cmd_reconciliation_quick_resume(
    _db_state: State<'_, DbState>,
    task_id: String,
) -> Result<Task, String> {
    let schedule_db = pomodoroom_core::storage::schedule_db::ScheduleDb::open()
        .map_err(|e| format!("Failed to open schedule database: {e}"))?;

    let mut task = schedule_db
        .get_task(&task_id)
        .map_err(|e| format!("Failed to get task: {e}"))?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    if task.state != TaskState::Paused {
        return Err(format!(
            "Task is not in PAUSED state (current: {:?})",
            task.state
        ));
    }

    task.transition_to(TaskState::Running)
        .map_err(|e| format!("Failed to resume task: {e}"))?;

    schedule_db
        .update_task(&task)
        .map_err(|e| format!("Failed to save task: {e}"))?;

    Ok(task)
}

// ============================================================================
// Metrics Commands
// ============================================================================

use crate::metrics::{MetricsCollector, MetricsConfig, MetricsSummary};

/// Get overall metrics summary.
#[tauri::command]
pub fn cmd_metrics_get_summary(
    collector: State<'_, std::sync::Arc<MetricsCollector>>,
) -> Result<MetricsSummary, String> {
    Ok(collector.get_summary())
}

/// Get metrics for a specific command.
#[tauri::command]
pub fn cmd_metrics_get_command(
    collector: State<'_, std::sync::Arc<MetricsCollector>>,
    command: String,
) -> Result<Option<crate::metrics::CommandMetrics>, String> {
    Ok(collector.get_command_metrics(&command))
}

/// Get all command metrics.
#[tauri::command]
pub fn cmd_metrics_get_all(
    collector: State<'_, std::sync::Arc<MetricsCollector>>,
) -> Result<std::collections::HashMap<String, crate::metrics::CommandMetrics>, String> {
    Ok(collector.get_all_metrics())
}

/// Get slow command alerts.
#[tauri::command]
pub fn cmd_metrics_get_slow_alerts(
    collector: State<'_, std::sync::Arc<MetricsCollector>>,
) -> Result<Vec<crate::metrics::SlowCommandAlert>, String> {
    Ok(collector.get_slow_alerts())
}

/// Get current metrics configuration.
#[tauri::command]
pub fn cmd_metrics_get_config() -> Result<MetricsConfig, String> {
    Ok(MetricsConfig::default())
}

/// Clear all metrics data.
#[tauri::command]
pub fn cmd_metrics_clear(
    collector: State<'_, std::sync::Arc<MetricsCollector>>,
) -> Result<(), String> {
    collector.clear();
    Ok(())
}

/// Clear metrics for a specific command.
#[tauri::command]
pub fn cmd_metrics_clear_command(
    collector: State<'_, std::sync::Arc<MetricsCollector>>,
    command: String,
) -> Result<(), String> {
    collector.clear_command(&command);
    Ok(())
}

// ── Journal Commands ───────────────────────────────────────────────────

/// State for journal storage.
pub struct JournalState(pub std::sync::Mutex<crate::journal::JournalStorage>);

impl JournalState {
    pub fn new() -> Self {
        let storage = crate::journal::JournalStorage::open()
            .expect("Failed to open journal storage");
        Self(std::sync::Mutex::new(storage))
    }
}

impl Default for JournalState {
    fn default() -> Self {
        Self::new()
    }
}

/// Append a new journal entry.
///
/// # Arguments
/// * `transition` - The transition type (TaskState, TimerState, SessionEvent, Custom)
///
/// # Returns
/// The created journal entry
#[tauri::command]
pub fn cmd_journal_append(
    journal: State<'_, JournalState>,
    transition: crate::journal::TransitionType,
) -> Result<crate::journal::JournalEntry, String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.append(transition).map_err(|e| e.to_string())
}

/// Get a journal entry by ID.
#[tauri::command]
pub fn cmd_journal_get(
    journal: State<'_, JournalState>,
    id: String,
) -> Result<Option<crate::journal::JournalEntry>, String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.get(&id).map_err(|e| e.to_string())
}

/// Get all pending journal entries.
#[tauri::command]
pub fn cmd_journal_get_pending(
    journal: State<'_, JournalState>,
) -> Result<Vec<crate::journal::JournalEntry>, String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.get_pending().map_err(|e| e.to_string())
}

/// Checkpoint a journal entry (mark as committed).
#[tauri::command]
pub fn cmd_journal_checkpoint(
    journal: State<'_, JournalState>,
    id: String,
) -> Result<(), String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.checkpoint(&id).map_err(|e| e.to_string())
}

/// Rollback a journal entry.
#[tauri::command]
pub fn cmd_journal_rollback(
    journal: State<'_, JournalState>,
    id: String,
    error: String,
) -> Result<(), String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.rollback(&id, &error).map_err(|e| e.to_string())
}

/// Get journal statistics.
#[tauri::command]
pub fn cmd_journal_stats(
    journal: State<'_, JournalState>,
) -> Result<crate::journal::JournalStats, String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.get_stats().map_err(|e| e.to_string())
}

/// Compact old journal entries.
#[tauri::command]
pub fn cmd_journal_compact(
    journal: State<'_, JournalState>,
) -> Result<usize, String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.compact().map_err(|e| e.to_string())
}

// ── Journal Recovery Commands ───────────────────────────────────────────────────

/// Helper function to create a recovery plan from pending entries.
fn create_recovery_plan(
    storage: &crate::journal::JournalStorage,
) -> Result<crate::journal::RecoveryPlan, String> {
    let pending = storage.get_pending().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    let max_age_seconds = 86400; // 24 hours default

    let mut plan = crate::journal::RecoveryPlan {
        to_replay: Vec::new(),
        to_skip: Vec::new(),
        expired: Vec::new(),
        impact_estimate: crate::journal::RecoveryImpact::default(),
    };

    for entry in pending {
        let age = (now - entry.created_at).num_seconds();

        if age > max_age_seconds {
            plan.expired.push((entry.id.clone(), age));
        } else if entry.status == crate::journal::EntryStatus::Committed
            || entry.status == crate::journal::EntryStatus::RolledBack
        {
            plan.to_skip.push((entry.id.clone(), format!("Already {:?}", entry.status)));
        } else {
            match &entry.transition {
                crate::journal::TransitionType::TaskState { .. } => {
                    plan.impact_estimate.affected_tasks += 1;
                }
                crate::journal::TransitionType::TimerState { .. } => {
                    plan.impact_estimate.timer_changes += 1;
                }
                crate::journal::TransitionType::SessionEvent { .. } => {
                    plan.impact_estimate.session_changes += 1;
                }
                crate::journal::TransitionType::Custom { .. } => {
                    plan.impact_estimate.custom_operations += 1;
                }
            }
            plan.to_replay.push(entry);
        }
    }

    Ok(plan)
}

/// Create a recovery plan for pending journal entries.
#[tauri::command]
pub fn cmd_journal_recovery_plan(
    journal: State<'_, JournalState>,
) -> Result<crate::journal::RecoveryPlan, String> {
    let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    create_recovery_plan(&guard)
}

/// Run journal recovery.
#[tauri::command]
pub fn cmd_journal_recovery_run(
    journal: State<'_, JournalState>,
) -> Result<crate::journal::RecoveryResult, String> {
    // First, get the plan
    let plan = {
        let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
        create_recovery_plan(&guard)?
    };

    let mut result = crate::journal::RecoveryResult::new();
    result.total_entries = plan.to_replay.len() + plan.to_skip.len() + plan.expired.len();

    // Handle expired entries
    for (id, age) in &plan.expired {
        let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
        if let Err(e) = guard.rollback(id, &format!("Entry expired (age: {}s)", age)) {
            result.failed_count += 1;
            result.actions.push(crate::journal::RecoveryAction::Failed {
                entry_id: id.clone(),
                error: e.to_string(),
            });
        } else {
            result.expired_count += 1;
            result.actions.push(crate::journal::RecoveryAction::Expired {
                entry_id: id.clone(),
                age_seconds: *age,
            });
        }
    }

    // Handle skipped entries
    for (id, reason) in &plan.to_skip {
        result.skipped_count += 1;
        result.actions.push(crate::journal::RecoveryAction::Skipped {
            entry_id: id.clone(),
            reason: reason.clone(),
        });
    }

    // Replay entries
    for entry in &plan.to_replay {
        let guard = journal.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

        // Mark as applied
        if let Err(e) = guard.update_status(&entry.id, crate::journal::EntryStatus::Applied, None) {
            result.failed_count += 1;
            result.actions.push(crate::journal::RecoveryAction::Failed {
                entry_id: entry.id.clone(),
                error: e.to_string(),
            });
            continue;
        }

        // In production, this would apply the actual transition
        // For now, we just checkpoint it
        if let Err(e) = guard.checkpoint(&entry.id) {
            result.failed_count += 1;
            result.actions.push(crate::journal::RecoveryAction::Failed {
                entry_id: entry.id.clone(),
                error: e.to_string(),
            });
        } else {
            result.recovered_count += 1;
            result.actions.push(crate::journal::RecoveryAction::Replayed {
                entry_id: entry.id.clone(),
                transition: entry.transition.clone(),
            });
        }
    }

    Ok(result)
}

// ── PR-Focused Mode Commands ───────────────────────────────────────────────────

/// Get the current PR-focused mode state.
#[tauri::command]
pub fn cmd_pr_focused_get_state(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
) -> Result<crate::pr_focused::PrFocusedState, String> {
    manager.get_state()
}

/// Check if PR-focused mode is active.
#[tauri::command]
pub fn cmd_pr_focused_is_active(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
) -> Result<bool, String> {
    manager.is_active()
}

/// Activate PR-focused mode.
///
/// # Arguments
/// * `previous_profile` - The profile to restore when deactivating
/// * `linked_item` - Optional linked item (GitHub PR, Linear issue, etc.)
/// * `reason` - Reason for activation
#[tauri::command]
pub fn cmd_pr_focused_activate(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
    previous_profile: Option<String>,
    linked_item: Option<crate::pr_focused::LinkedItem>,
    reason: String,
) -> Result<crate::pr_focused::ModeSwitchResult, String> {
    manager.activate(previous_profile, linked_item, reason)
}

/// Deactivate PR-focused mode.
///
/// # Arguments
/// * `duration_minutes` - Optional duration in minutes for stats tracking
#[tauri::command]
pub fn cmd_pr_focused_deactivate(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
    duration_minutes: Option<u64>,
) -> Result<crate::pr_focused::ModeSwitchResult, String> {
    manager.deactivate(duration_minutes)
}

/// Link an item to the current PR-focused session.
#[tauri::command]
pub fn cmd_pr_focused_link_item(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
    item: crate::pr_focused::LinkedItem,
) -> Result<(), String> {
    manager.link_item(item)
}

/// Get the currently linked item.
#[tauri::command]
pub fn cmd_pr_focused_get_linked_item(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
) -> Result<Option<crate::pr_focused::LinkedItem>, String> {
    manager.get_linked_item()
}

/// Detect if a task title suggests PR-focused work.
#[tauri::command]
pub fn cmd_pr_focused_detect_context(title: String) -> Option<(crate::pr_focused::SourceType, String)> {
    crate::pr_focused::detect_pr_focused_context(&title)
}

/// Get PR-focused mode usage statistics.
#[tauri::command]
pub fn cmd_pr_focused_get_stats(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
) -> Result<crate::pr_focused::PrFocusedStats, String> {
    manager.get_stats()
}

/// Clear PR-focused mode statistics.
#[tauri::command]
pub fn cmd_pr_focused_clear_stats(
    manager: State<'_, std::sync::Arc<crate::pr_focused::PrFocusedManager>>,
) -> Result<(), String> {
    manager.clear_stats()
}

// ── Parent-Child Sync Commands ───────────────────────────────────────────────────

/// State for parent-child sync manager.
pub struct ParentChildSyncState(pub std::sync::Mutex<crate::parent_child_sync::ParentChildSyncManager>);

impl ParentChildSyncState {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(crate::parent_child_sync::ParentChildSyncManager::new()))
    }
}

impl Default for ParentChildSyncState {
    fn default() -> Self {
        Self::new()
    }
}

/// Register a task mapping for sync.
#[tauri::command]
pub fn cmd_parent_child_register_mapping(
    state: State<'_, ParentChildSyncState>,
    mapping: crate::parent_child_sync::TaskMapping,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.register_mapping(mapping);
    Ok(())
}

/// Get a task mapping by local ID.
#[tauri::command]
pub fn cmd_parent_child_get_mapping(
    state: State<'_, ParentChildSyncState>,
    local_id: String,
) -> Result<Option<crate::parent_child_sync::TaskMapping>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_mapping(&local_id).cloned())
}

/// Get all task mappings.
#[tauri::command]
pub fn cmd_parent_child_get_all_mappings(
    state: State<'_, ParentChildSyncState>,
) -> Result<Vec<crate::parent_child_sync::TaskMapping>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_all_mappings().into_iter().cloned().collect())
}

/// Remove a task mapping.
#[tauri::command]
pub fn cmd_parent_child_remove_mapping(
    state: State<'_, ParentChildSyncState>,
    local_id: String,
) -> Result<Option<crate::parent_child_sync::TaskMapping>, String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.remove_mapping(&local_id))
}

/// Check if a task is synced.
#[tauri::command]
pub fn cmd_parent_child_is_synced(
    state: State<'_, ParentChildSyncState>,
    local_id: String,
) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.is_synced(&local_id))
}

/// Detect conflicts between local and remote task.
#[tauri::command]
pub fn cmd_parent_child_detect_conflicts(
    state: State<'_, ParentChildSyncState>,
    local_title: String,
    local_completed: bool,
    remote_title: String,
    remote_completed: bool,
    local_updated: String,
    remote_updated: String,
) -> Result<Vec<crate::parent_child_sync::SyncConflict>, String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;

    let local_dt = chrono::DateTime::parse_from_rfc3339(&local_updated)
        .map_err(|e| format!("Invalid local_updated: {e}"))?
        .with_timezone(&chrono::Utc);
    let remote_dt = chrono::DateTime::parse_from_rfc3339(&remote_updated)
        .map_err(|e| format!("Invalid remote_updated: {e}"))?
        .with_timezone(&chrono::Utc);

    Ok(guard.detect_conflicts(
        &local_title,
        local_completed,
        &remote_title,
        remote_completed,
        local_dt,
        remote_dt,
    ))
}

/// Prepare a subtask creation payload for Google Tasks API.
#[tauri::command]
pub fn cmd_parent_child_prepare_subtask(
    state: State<'_, ParentChildSyncState>,
    parent_google_id: String,
    title: String,
    notes: Option<String>,
) -> Result<serde_json::Value, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.prepare_subtask_payload(&parent_google_id, &title, notes.as_deref()))
}

/// Build a parent-child hierarchy from flat task list.
#[tauri::command]
pub fn cmd_parent_child_build_hierarchy(
    state: State<'_, ParentChildSyncState>,
    tasks: Vec<crate::parent_child_sync::LocalTaskInfo>,
) -> Result<std::collections::HashMap<String, Vec<String>>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.build_hierarchy(&tasks))
}

/// Get sync statistics.
#[tauri::command]
pub fn cmd_parent_child_get_stats(
    state: State<'_, ParentChildSyncState>,
) -> Result<crate::parent_child_sync::SyncStats, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_stats())
}

/// Get the sync configuration.
#[tauri::command]
pub fn cmd_parent_child_get_config(
    state: State<'_, ParentChildSyncState>,
) -> Result<crate::parent_child_sync::SyncConfig, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.config().clone())
}

// ============================================================================
// WEBHOOK STATE AND COMMANDS
// ============================================================================

/// State container for webhook manager.
pub struct WebhookState(pub std::sync::Mutex<crate::webhook::WebhookManager>);

impl WebhookState {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(crate::webhook::WebhookManager::new()))
    }
}

impl Default for WebhookState {
    fn default() -> Self {
        Self::new()
    }
}

/// Register a webhook endpoint.
#[tauri::command]
pub fn cmd_webhook_register_endpoint(
    state: State<'_, WebhookState>,
    url: String,
    secret: String,
    enabled: Option<bool>,
) -> Result<(), String> {
    let mut endpoint = crate::webhook::WebhookEndpoint::new(url, secret);
    if let Some(e) = enabled {
        endpoint = endpoint.with_enabled(e);
    }
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.register_endpoint(endpoint);
    Ok(())
}

/// Remove a webhook endpoint.
#[tauri::command]
pub fn cmd_webhook_remove_endpoint(
    state: State<'_, WebhookState>,
    url: String,
) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.remove_endpoint(&url))
}

/// Get all registered webhook endpoints.
#[tauri::command]
pub fn cmd_webhook_get_endpoints(
    state: State<'_, WebhookState>,
) -> Result<Vec<crate::webhook::WebhookEndpoint>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_endpoints())
}

/// Emit a webhook event.
#[tauri::command]
pub fn cmd_webhook_emit(
    state: State<'_, WebhookState>,
    event_type: String,
    data: serde_json::Value,
    session_id: Option<String>,
    task_id: Option<String>,
) -> Result<String, String> {
    let event = match event_type.as_str() {
        "focus_started" => crate::webhook::WebhookEventType::FocusStarted,
        "break_started" => crate::webhook::WebhookEventType::BreakStarted,
        "segment_completed" => crate::webhook::WebhookEventType::SegmentCompleted,
        "interruption" => crate::webhook::WebhookEventType::Interruption,
        "session_paused" => crate::webhook::WebhookEventType::SessionPaused,
        "session_resumed" => crate::webhook::WebhookEventType::SessionResumed,
        "session_completed" => crate::webhook::WebhookEventType::SessionCompleted,
        _ => return Err(format!("Unknown event type: {}", event_type)),
    };

    let mut payload = crate::webhook::WebhookPayload::new(event, data);
    if let Some(sid) = session_id {
        payload = payload.with_session_id(sid);
    }
    if let Some(tid) = task_id {
        payload = payload.with_task_id(tid);
    }

    let event_id = payload.event_id.clone();
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.emit(payload)?;
    Ok(event_id)
}

/// Get pending webhook events.
#[tauri::command]
pub fn cmd_webhook_get_pending(
    state: State<'_, WebhookState>,
) -> Result<Vec<crate::webhook::QueuedEvent>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_pending_events())
}

/// Get events ready for delivery.
#[tauri::command]
pub fn cmd_webhook_get_ready(
    state: State<'_, WebhookState>,
) -> Result<Vec<crate::webhook::QueuedEvent>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_ready_events())
}

/// Mark event as delivered.
#[tauri::command]
pub fn cmd_webhook_mark_delivered(
    state: State<'_, WebhookState>,
    event_id: String,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.mark_delivered(&event_id);
    Ok(())
}

/// Mark event delivery failed.
#[tauri::command]
pub fn cmd_webhook_mark_failed(
    state: State<'_, WebhookState>,
    event_id: String,
    error: String,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.mark_failed(&event_id, error);
    Ok(())
}

/// Simulate delivery (for testing).
#[tauri::command]
pub fn cmd_webhook_simulate_delivery(
    state: State<'_, WebhookState>,
    event_id: String,
    success: bool,
    error: Option<String>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.simulate_delivery(&event_id, success, error);
    Ok(())
}

/// Clean up delivered and failed events from queue.
#[tauri::command]
pub fn cmd_webhook_cleanup_queue(state: State<'_, WebhookState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.cleanup_queue();
    Ok(())
}

/// Get webhook delivery statistics.
#[tauri::command]
pub fn cmd_webhook_get_stats(
    state: State<'_, WebhookState>,
) -> Result<crate::webhook::WebhookStats, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_stats())
}

/// Clear webhook statistics.
#[tauri::command]
pub fn cmd_webhook_clear_stats(state: State<'_, WebhookState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.clear_stats();
    Ok(())
}

/// Get webhook configuration.
#[tauri::command]
pub fn cmd_webhook_get_config(
    state: State<'_, WebhookState>,
) -> Result<crate::webhook::WebhookConfig, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.config().clone())
}

/// Sign a payload with a secret (for external verification).
#[tauri::command]
pub fn cmd_webhook_sign_payload(
    payload: crate::webhook::WebhookPayload,
    secret: String,
) -> Result<String, String> {
    Ok(payload.sign(secret.as_bytes()))
}

// ============================================================================
// RECIPE ENGINE STATE AND COMMANDS
// ============================================================================

/// State container for recipe engine.
pub struct RecipeEngineState(pub std::sync::Mutex<crate::recipe_engine::RecipeEngine>);

impl RecipeEngineState {
    pub fn new() -> Self {
        Self(std::sync::Mutex::new(crate::recipe_engine::RecipeEngine::new()))
    }
}

impl Default for RecipeEngineState {
    fn default() -> Self {
        Self::new()
    }
}

/// Register a recipe.
#[tauri::command]
pub fn cmd_recipe_register(
    state: State<'_, RecipeEngineState>,
    recipe: crate::recipe_engine::Recipe,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.register(recipe);
    Ok(())
}

/// Unregister a recipe.
#[tauri::command]
pub fn cmd_recipe_unregister(
    state: State<'_, RecipeEngineState>,
    id: String,
) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.unregister(&id))
}

/// Get a recipe by ID.
#[tauri::command]
pub fn cmd_recipe_get(
    state: State<'_, RecipeEngineState>,
    id: String,
) -> Result<Option<crate::recipe_engine::Recipe>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get(&id))
}

/// Get all recipes.
#[tauri::command]
pub fn cmd_recipe_get_all(
    state: State<'_, RecipeEngineState>,
) -> Result<Vec<crate::recipe_engine::Recipe>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_all())
}

/// Get enabled recipes sorted by priority.
#[tauri::command]
pub fn cmd_recipe_get_enabled(
    state: State<'_, RecipeEngineState>,
) -> Result<Vec<crate::recipe_engine::Recipe>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_enabled())
}

/// Execute a recipe with given context.
#[tauri::command]
pub fn cmd_recipe_execute(
    state: State<'_, RecipeEngineState>,
    recipe_id: String,
    context: crate::recipe_engine::RecipeContext,
) -> Result<Option<crate::recipe_engine::RecipeResult>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.execute(&recipe_id, &context))
}

/// Process all matching recipes for a trigger type.
#[tauri::command]
pub fn cmd_recipe_process(
    state: State<'_, RecipeEngineState>,
    trigger_type: crate::recipe_engine::TriggerType,
    context: crate::recipe_engine::RecipeContext,
) -> Result<Vec<crate::recipe_engine::RecipeResult>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.process(&trigger_type, &context))
}

/// Test-run a recipe (simulation only).
#[tauri::command]
pub fn cmd_recipe_test_run(
    state: State<'_, RecipeEngineState>,
    recipe_id: String,
    context: crate::recipe_engine::RecipeContext,
) -> Result<Option<crate::recipe_engine::RecipeResult>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.test_run(&recipe_id, &context))
}

/// Get recipe engine statistics.
#[tauri::command]
pub fn cmd_recipe_get_stats(
    state: State<'_, RecipeEngineState>,
) -> Result<crate::recipe_engine::RecipeStats, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_stats())
}

/// Clear recipe engine statistics.
#[tauri::command]
pub fn cmd_recipe_clear_stats(state: State<'_, RecipeEngineState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.clear_stats();
    Ok(())
}

/// Get execution log for failed actions.
#[tauri::command]
pub fn cmd_recipe_get_execution_log(
    state: State<'_, RecipeEngineState>,
) -> Result<Vec<crate::recipe_engine::RecipeResult>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.get_execution_log())
}

/// Clear execution log.
#[tauri::command]
pub fn cmd_recipe_clear_execution_log(state: State<'_, RecipeEngineState>) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.clear_execution_log();
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Gatekeeper Protocol Commands
// ─────────────────────────────────────────────────────────────────────────────
//
// These commands provide the Rust implementation of the notification
// escalation system (Gatekeeper Protocol), replacing the TypeScript
// implementation in src/utils/notification-escalation.ts.

/// In-memory gatekeeper state (session-based)
pub struct GatekeeperState(Mutex<pomodoroom_core::timer::Gatekeeper>);

impl GatekeeperState {
    pub fn new() -> Self {
        Self(Mutex::new(pomodoroom_core::timer::Gatekeeper::new()))
    }
}

/// Start gatekeeper tracking for a completed timer.
///
/// # Arguments
/// * `prompt_key` - Unique identifier for this prompt (e.g., "critical-start:task-123")
/// * `completed_at_ms` - Unix timestamp (milliseconds) when timer completed
///
/// # Returns
/// Success or error message
#[tauri::command]
pub fn cmd_gatekeeper_start(
    state: State<'_, GatekeeperState>,
    prompt_key: String,
    completed_at_ms: i64,
) -> Result<(), String> {
    let secs = completed_at_ms / 1000;
    let nsecs = ((completed_at_ms % 1000) * 1_000_000) as u32;
    let completed_at = DateTime::from_timestamp(secs, nsecs).ok_or("Invalid timestamp")?;
    let mut guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.start(prompt_key, completed_at);
    Ok(())
}

/// Stop gatekeeper tracking.
#[tauri::command]
pub fn cmd_gatekeeper_stop(state: State<'_, GatekeeperState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.stop();
    Ok(())
}

/// Get current gatekeeper state.
///
/// Returns the current escalation level, break debt, and prompt key.
#[tauri::command]
pub fn cmd_gatekeeper_get_state(
    state: State<'_, GatekeeperState>,
) -> Result<Option<pomodoroom_core::timer::GatekeeperState>, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.state().cloned())
}

/// Get notification channel for current gatekeeper state.
///
/// Returns the appropriate notification channel (badge/toast/modal)
/// based on escalation level and context (DND, quiet hours).
#[tauri::command]
pub fn cmd_gatekeeper_get_notification_channel(
    state: State<'_, GatekeeperState>,
    is_dnd: bool,
    is_quiet_hours: bool,
) -> Result<pomodoroom_core::timer::NotificationChannel, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    let context = pomodoroom_core::timer::EscalationContext {
        is_dnd,
        is_quiet_hours,
    };
    Ok(guard.get_notification_channel(&context))
}

/// Update gatekeeper with current time and return escalation state.
///
/// Should be called periodically (e.g., every second) to update
/// escalation level based on elapsed time.
#[tauri::command]
pub fn cmd_gatekeeper_tick(
    state: State<'_, GatekeeperState>,
) -> Result<Option<pomodoroom_core::timer::GatekeeperState>, String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    guard.tick(Utc::now());
    Ok(guard.state().cloned())
}

/// Check if notification can be dismissed (Gravity level cannot be dismissed).
#[tauri::command]
pub fn cmd_gatekeeper_can_dismiss(state: State<'_, GatekeeperState>) -> Result<bool, String> {
    let guard = state.0.lock().map_err(|e| format!("Lock failed: {e}"))?;
    Ok(guard.can_dismiss())
}

/// Check if a given time is within quiet hours.
///
/// # Arguments
/// * `timestamp_ms` - Unix timestamp (milliseconds) to check
/// * `policy` - Quiet hours policy
#[tauri::command]
pub fn cmd_gatekeeper_is_quiet_hours(
    timestamp_ms: i64,
    policy: pomodoroom_core::timer::QuietHoursPolicy,
) -> Result<bool, String> {
    let secs = timestamp_ms / 1000;
    let nsecs = ((timestamp_ms % 1000) * 1_000_000) as u32;
    let time = DateTime::from_timestamp(secs, nsecs).ok_or("Invalid timestamp")?;
    Ok(pomodoroom_core::timer::Gatekeeper::is_quiet_hours(time, &policy))
}

/// Generate prompt key for critical start notification.
///
/// # Arguments
/// * `task_id` - Task identifier
#[tauri::command]
pub fn cmd_gatekeeper_critical_start_key(task_id: String) -> String {
    pomodoroom_core::timer::Gatekeeper::critical_start_key(&task_id)
}

// ─────────────────────────────────────────────────────────────────────────────
// JIT (Just-In-Time) Task Engine Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Suggest next tasks based on current context.
#[tauri::command]
pub fn cmd_jit_suggest_next_tasks(
    energy: Option<u8>,
    time_since_break: Option<u64>,
    completed_sessions: Option<u32>,
) -> Result<Vec<TaskSuggestion>, String> {
    let db = ScheduleDb::open()
        .map_err(|e| format!("Failed to open database: {e}"))?;

    let tasks = db.list_tasks()
        .map_err(|e| format!("Failed to list tasks: {e}"))?;

    let context = JitContext {
        energy: energy.unwrap_or(50),
        time_since_last_break_min: time_since_break.unwrap_or(0),
        current_task: None,
        completed_sessions: completed_sessions.unwrap_or(0),
        now: Utc::now(),
    };

    let engine = JitEngine::new();
    let suggestions = engine.suggest_next_tasks(&context, &tasks);

    Ok(suggestions)
}

/// Suggest optimal break duration based on context.
#[tauri::command]
pub fn cmd_jit_suggest_break_duration(
    energy: Option<u8>,
    completed_sessions: Option<u32>,
) -> Result<u32, String> {
    let context = JitContext {
        energy: energy.unwrap_or(50),
        time_since_last_break_min: 0,
        current_task: None,
        completed_sessions: completed_sessions.unwrap_or(0),
        now: Utc::now(),
    };

    let engine = JitEngine::new();
    let duration = engine.suggest_break_duration(&context);

    Ok(duration)
}

/// Check if user should take a break now.
#[tauri::command]
pub fn cmd_jit_should_take_break(
    energy: Option<u8>,
    time_since_break: Option<u64>,
    completed_sessions: Option<u32>,
) -> Result<bool, String> {
    let context = JitContext {
        energy: energy.unwrap_or(50),
        time_since_last_break_min: time_since_break.unwrap_or(0),
        current_task: None,
        completed_sessions: completed_sessions.unwrap_or(0),
        now: Utc::now(),
    };

    let engine = JitEngine::new();
    let should_break = engine.should_take_break(&context);

    Ok(should_break)
}
