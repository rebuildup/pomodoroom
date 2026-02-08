use pomodoroom_core::storage::Database;
use pomodoroom_core::timer::TimerEngine;
use pomodoroom_core::Config;
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

/// Shared timer engine state, protected by a Mutex.
/// The engine lives in-process for the desktop app (no subprocess needed
/// for the hot path). The CLI binary uses the same core library independently.
pub struct EngineState(pub Mutex<TimerEngine>);

impl EngineState {
    pub fn new() -> Self {
        let config = Config::load();
        Self(Mutex::new(TimerEngine::new(config.schedule())))
    }
}

// We store the DB handle in State too, so we don't re-open per call.
#[allow(dead_code)]
pub struct DbState(pub Mutex<Database>);

impl DbState {
    #[allow(dead_code)]
    pub fn new() -> Result<Self, String> {
        Database::open()
            .map(|db| Self(Mutex::new(db)))
            .map_err(|e| e.to_string())
    }
}

// ── Timer commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_timer_status(engine: State<'_, EngineState>) -> Result<Value, String> {
    let engine = engine.0.lock().map_err(|e| e.to_string())?;
    let snapshot = engine.snapshot();
    serde_json::to_value(snapshot).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_timer_tick(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| e.to_string())?;
    let completed = engine.tick();
    let snapshot = engine.snapshot();
    let mut result = serde_json::to_value(snapshot).map_err(|e| e.to_string())?;
    if let Some(event) = completed {
        result["completed"] = serde_json::to_value(event).map_err(|e| e.to_string())?;
    }
    Ok(result)
}

#[tauri::command]
pub fn cmd_timer_start(
    engine: State<'_, EngineState>,
    step: Option<usize>,
) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| e.to_string())?;
    if let Some(s) = step {
        engine.reset();
        for _ in 0..s {
            engine.skip();
        }
    }
    let event = engine.start();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| e.to_string()),
        None => Ok(Value::Null),
    }
}

#[tauri::command]
pub fn cmd_timer_pause(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| e.to_string())?;
    let event = engine.pause();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| e.to_string()),
        None => Ok(Value::Null),
    }
}

#[tauri::command]
pub fn cmd_timer_resume(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| e.to_string())?;
    let event = engine.resume();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| e.to_string()),
        None => Ok(Value::Null),
    }
}

#[tauri::command]
pub fn cmd_timer_skip(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| e.to_string())?;
    let event = engine.skip();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| e.to_string()),
        None => Ok(Value::Null),
    }
}

#[tauri::command]
pub fn cmd_timer_reset(engine: State<'_, EngineState>) -> Result<Value, String> {
    let mut engine = engine.0.lock().map_err(|e| e.to_string())?;
    let event = engine.reset();
    match event {
        Some(e) => serde_json::to_value(e).map_err(|e| e.to_string()),
        None => Ok(Value::Null),
    }
}

// ── Config commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_config_get(key: String) -> Result<Value, String> {
    let config = Config::load();
    match config.get(&key) {
        Some(value) => Ok(Value::String(value)),
        None => Err(format!("unknown key: {key}")),
    }
}

#[tauri::command]
pub fn cmd_config_set(key: String, value: String) -> Result<(), String> {
    let mut config = Config::load();
    config.set(&key, &value)
}

#[tauri::command]
pub fn cmd_config_list() -> Result<Value, String> {
    let config = Config::load();
    serde_json::to_value(config).map_err(|e| e.to_string())
}

// ── Stats commands ──────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_stats_today() -> Result<Value, String> {
    let db = Database::open().map_err(|e| e.to_string())?;
    let stats = db.stats_today().map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_stats_all() -> Result<Value, String> {
    let db = Database::open().map_err(|e| e.to_string())?;
    let stats = db.stats_all().map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}
