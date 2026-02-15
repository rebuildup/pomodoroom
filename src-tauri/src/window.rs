//! Window management for Pomodoroom desktop application.
//!
//! This module provides PureRef-style window management:
//! - Normal mode: Standard window with decorations
//! - Pinned mode: Always-on-top window with decorations
//! - Float mode: Small always-on-top window without decorations
//!
//! Window mode reference:
//! | Mode          | Decorations | Always-on-top | Size     |
//! |---------------|-------------|---------------|----------|
//! | Normal        | Yes         | No            | 1200x800 |
//! | Pinned        | Yes         | Yes           | 1200x800 |
//! | Float (Timer) | No          | Yes           | 280x280  |

use serde::{Deserialize, Serialize};
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

// ── Window size constants ─────────────────────────────────────────────────

/// Default window size for normal mode
pub const NORMAL_WIDTH: f64 = 1200.0;
pub const NORMAL_HEIGHT: f64 = 800.0;

/// Window size for float mode (mini timer)
pub const FLOAT_WIDTH: f64 = 280.0;
pub const FLOAT_HEIGHT: f64 = 280.0;

/// Window size for action notification popup
pub const NOTIFICATION_WIDTH: f64 = 400.0;
pub const NOTIFICATION_HEIGHT: f64 = 120.0;

/// Maximum dimensions to detect float mode
const FLOAT_MAX_WIDTH: u32 = 400;
const FLOAT_MAX_HEIGHT: u32 = 400;

static LOCKED_WINDOWS: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

fn is_window_locked(label: &str) -> bool {
    LOCKED_WINDOWS
        .lock()
        .map(|set| set.contains(label))
        .unwrap_or(false)
}

fn set_window_locked_state(label: &str, enabled: bool) {
    if let Ok(mut set) = LOCKED_WINDOWS.lock() {
        if enabled {
            set.insert(label.to_string());
        } else {
            set.remove(label);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub always_on_top: bool,
    pub float_mode: bool,
}

/// Gets the main window reference.
///
/// NOTE: This function assumes the main window exists. Use with caution
/// in multi-window contexts. Prefer using the calling window context
/// in command handlers when possible.
#[allow(dead_code)]
fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".into())
}

/// Applies float mode settings to a window.
///
/// This is a shared function used by both the float command and the tray menu.
///
/// # Arguments
/// * `window` - The window to modify
/// * `enabled` - Whether to enable float mode
///
/// Float mode: no decorations, always on top, 280x280 size
/// Normal mode: decorations, not always on top, 1200x800 size, centered
pub fn apply_float_mode(window: &WebviewWindow, enabled: bool) -> Result<(), String> {
    if enabled {
        println!("Enabling float mode for window '{}'", window.label());
        window
            .set_always_on_top(true)
            .map_err(|e| format!("set_always_on_top: {e}"))?;
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: FLOAT_WIDTH,
                height: FLOAT_HEIGHT,
            }))
            .map_err(|e| format!("set_size: {e}"))?;
    } else {
        println!("Disabling float mode for window '{}'", window.label());
        window
            .set_always_on_top(false)
            .map_err(|e| format!("set_always_on_top: {e}"))?;
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: NORMAL_WIDTH,
                height: NORMAL_HEIGHT,
            }))
            .map_err(|e| format!("set_size: {e}"))?;
        window.center().map_err(|e| format!("center: {e}"))?;
    }
    Ok(())
}

// ── Existing window commands ───────────────────────────────────────────────

/// Sets the always-on-top property of the calling window.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
/// * `enabled` - Whether to enable always-on-top
#[tauri::command]
pub fn cmd_set_always_on_top(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    println!(
        "Setting always-on-top={} for window '{}'",
        enabled,
        window.label()
    );
    window
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sets float mode for the calling window.
///
/// Float mode makes the window small (280x280), removes decorations,
/// and sets it to always-on-top. Useful for a mini timer overlay.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
/// * `enabled` - Whether to enable float mode
#[tauri::command]
pub fn cmd_set_float_mode(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    apply_float_mode(&window, enabled)?;
    Ok(())
}

/// Sets window decorations (title bar, borders) for the calling window.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
/// * `enabled` - Whether to show decorations
#[tauri::command]
pub fn cmd_set_decorations(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    println!(
        "Setting decorations={} for window '{}'",
        enabled,
        window.label()
    );
    window.set_decorations(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

/// Gets the current window state of the calling window.
///
/// Returns information about always-on-top status and float mode.
/// Float mode is detected when the window is always-on-top and
/// both dimensions are <= 400px.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
#[tauri::command]
pub fn cmd_get_window_state(window: WebviewWindow) -> Result<WindowState, String> {
    let on_top = window.is_always_on_top().unwrap_or(false);
    let outer = window.outer_size().unwrap_or(tauri::PhysicalSize {
        width: NORMAL_WIDTH as u32,
        height: NORMAL_HEIGHT as u32,
    });
    let float = on_top && outer.width <= FLOAT_MAX_WIDTH && outer.height <= FLOAT_MAX_HEIGHT;
    Ok(WindowState {
        always_on_top: on_top,
        float_mode: float,
    })
}

/// Starts dragging the calling window.
///
/// Used for implementing custom title bars or drag handles.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
#[tauri::command]
pub fn cmd_start_drag(window: WebviewWindow) -> Result<(), String> {
    if is_window_locked(window.label()) {
        return Ok(());
    }
    window.start_dragging().map_err(|e| e.to_string())?;
    Ok(())
}

/// Sets window shadow for the calling window.
///
/// On Windows, disabling shadow is important for truly frameless transparent windows.
#[tauri::command]
pub fn cmd_set_window_shadow(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    println!("Setting shadow={} for window '{}'", enabled, window.label());
    window.set_shadow(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowControlsState {
    pub always_on_top: bool,
    pub is_locked: bool,
}

#[tauri::command]
pub fn cmd_set_window_locked(window: WebviewWindow, enabled: bool) -> Result<(), String> {
    set_window_locked_state(window.label(), enabled);
    window.set_resizable(!enabled).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cmd_get_window_controls_state(window: WebviewWindow) -> Result<WindowControlsState, String> {
    Ok(WindowControlsState {
        always_on_top: window.is_always_on_top().unwrap_or(false),
        is_locked: is_window_locked(window.label()),
    })
}

// ── Multi-window commands ───────────────────────────────────────────────────

/// Options for opening a new window.
#[derive(Debug, Clone, Deserialize)]
pub struct OpenWindowOptions {
    pub label: String,
    pub title: String,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default)]
    pub decorations: bool,
    #[serde(default)]
    #[allow(dead_code)]
    pub transparent: bool,
    #[serde(default = "default_true")]
    pub shadow: bool,
    #[serde(default = "default_true")]
    pub resizable: bool,
}

fn default_true() -> bool {
    true
}

/// Opens a new window with the specified options.
///
/// If a window with the same label already exists, it will be
/// focused and brought to the front instead of creating a duplicate.
///
/// # Arguments
/// * `app` - The app handle (automatically provided by Tauri)
/// * `options` - Window configuration options
#[tauri::command]
pub async fn cmd_open_window(app: AppHandle, options: OpenWindowOptions) -> Result<(), String> {
    println!(
        "Opening window: label={}, title={}, size={}x{}",
        options.label, options.title, options.width, options.height
    );

    // If window already exists, focus it
    if let Some(win) = app.get_webview_window(&options.label) {
        println!("Window '{}' already exists, focusing...", options.label);
        win.set_focus().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Use App URL with window label as query parameter for routing
    // This works in both dev and production, and Tauri API will be injected
    let url = WebviewUrl::App(format!("index.html?window={}", options.label).into());
    println!("Creating new window with URL: {}", url);

    let mut builder = WebviewWindowBuilder::new(&app, &options.label, url)
        .title(&options.title)
        .inner_size(options.width, options.height)
        .decorations(options.decorations)
        .always_on_top(options.always_on_top)
        .resizable(options.resizable)
        .shadow(options.shadow)
        .center();

    #[cfg(windows)]
    {
        builder = builder.transparent(options.transparent);
    }

    println!("Building window...");
    let _window = builder.build().map_err(|e| {
        eprintln!("ERROR building window: {}", e);
        e.to_string()
    })?;

    println!("Window '{}' created successfully", options.label);
    Ok(())
}

/// Closes a window by label.
///
/// # Arguments
/// * `app` - The app handle (automatically provided by Tauri)
/// * `label` - The label of the window to close
#[tauri::command]
pub fn cmd_close_window(app: AppHandle, label: String) -> Result<(), String> {
    println!("Closing window: {}", label);
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Gets the label of the calling window.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
///
/// # Returns
/// The window label (e.g., "main", "mini-timer", "stats", etc.)
///
/// NOTE: The frontend can also use `getCurrentWindow().label` directly
/// from the Tauri API. This command is provided for convenience.
#[tauri::command]
pub fn cmd_get_window_label(window: WebviewWindow) -> Result<String, String> {
    Ok(window.label().to_string())
}

/// Opens an external reference target (URL, file path, etc.) using OS defaults.
///
/// # Arguments
/// * `target` - URL or local path to open
#[tauri::command]
pub fn cmd_open_reference(target: String) -> Result<(), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("reference target is empty".into());
    }
    open::that_detached(trimmed).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Windows-specific rounded corners command ─────────────────────────────────────

/// Applies rounded corners preference to the calling window on Windows.
///
/// This command enables rounded corners for custom title bars on Windows 11,
/// which affects snap layout behavior.
///
/// # Arguments
/// * `window` - The calling window (automatically provided by Tauri)
/// * `enable` - Whether to enable rounded corners
///
/// # Platform Availability
/// - Windows 11: Logs preference (DWM integration pending HWND access)
/// - Other platforms: No-op, returns success without effect
#[cfg(windows)]
#[tauri::command]
pub fn cmd_apply_rounded_corners(window: WebviewWindow, enable: bool) -> Result<(), String> {
    println!(
        "Rounded corners={} requested for window '{}'",
        enable,
        window.label()
    );

    // Note: Full DWM integration requires HWND access which is limited in Tauri 2.x
    // For now, we log the preference. The effect is primarily visual on Windows 11
    // when the window manager applies default rounded corner behavior.

    println!(
        "Windows rounded corners preference: {} (visual effect depends on OS defaults)",
        if enable { "enabled" } else { "disabled" }
    );

    Ok(())
}

/// Stub for non-Windows platforms
#[cfg(not(windows))]
#[tauri::command]
pub fn cmd_apply_rounded_corners(_window: WebviewWindow, _enable: bool) -> Result<(), String> {
    println!("Rounded corners command called on non-Windows platform (no-op)");
    Ok(())
}

// ── Action Notification Window ─────────────────────────────────────────────

/// Opens the action notification window.
///
/// This is a modal, always-on-top popup that requires user action.
/// No close button - user must click an action button.
///
/// # Arguments
/// * `app` - The app handle (automatically provided by Tauri)
#[tauri::command]
pub async fn cmd_open_action_notification(app: AppHandle) -> Result<(), String> {
    let label = "action_notification";

    println!("Opening action notification window");

    // If window already exists, close it first (force fresh state)
    if let Some(win) = app.get_webview_window(label) {
        println!("Closing existing notification window");
        win.close().map_err(|e| e.to_string())?;
        // Small delay to ensure clean close
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    // Build URL with window label for routing
    let url = WebviewUrl::App(format!("index.html?window={}", label).into());

    // Create notification window positioned at top-left
    let builder = WebviewWindowBuilder::new(&app, label, url)
        .title("Action")
        .inner_size(NOTIFICATION_WIDTH, NOTIFICATION_HEIGHT)
        .position(20.0, 20.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false);

    println!("Building action notification window...");
    let _window = builder.build().map_err(|e| {
        eprintln!("ERROR building notification window: {}", e);
        e.to_string()
    })?;

    println!("Action notification window opened successfully");
    Ok(())
}
