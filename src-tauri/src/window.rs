use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub always_on_top: bool,
    pub float_mode: bool,
    pub decorations: bool,
    pub transparent: bool,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".into())
}

#[tauri::command]
pub fn cmd_set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    let win = main_window(&app)?;
    win.set_always_on_top(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cmd_set_float_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let win = main_window(&app)?;
    if enabled {
        // Float mode: frameless, always-on-top, transparent background
        win.set_decorations(false).map_err(|e| e.to_string())?;
        win.set_always_on_top(true).map_err(|e| e.to_string())?;
        // Resize to compact timer size
        win.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 280.0,
            height: 280.0,
        }))
        .map_err(|e| e.to_string())?;
    } else {
        // Restore normal mode
        win.set_decorations(true).map_err(|e| e.to_string())?;
        win.set_always_on_top(false).map_err(|e| e.to_string())?;
        win.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 800.0,
            height: 600.0,
        }))
        .map_err(|e| e.to_string())?;
        win.center().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_set_decorations(app: AppHandle, enabled: bool) -> Result<(), String> {
    let win = main_window(&app)?;
    win.set_decorations(enabled).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cmd_get_window_state(app: AppHandle) -> Result<WindowState, String> {
    let win = main_window(&app)?;
    Ok(WindowState {
        always_on_top: win.is_always_on_top().unwrap_or(false),
        float_mode: !win.is_decorated().unwrap_or(true)
            && win.is_always_on_top().unwrap_or(false),
        decorations: win.is_decorated().unwrap_or(true),
        transparent: false, // Tauri 2 does not expose transparent query
    })
}

#[tauri::command]
pub fn cmd_start_drag(app: AppHandle) -> Result<(), String> {
    let win = main_window(&app)?;
    win.start_dragging().map_err(|e| e.to_string())?;
    Ok(())
}
