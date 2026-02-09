use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder, WebviewUrl};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub always_on_top: bool,
    pub float_mode: bool,
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".into())
}

// ── Existing window commands ────────────────────────────────────────────────

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
        win.set_always_on_top(true).map_err(|e| e.to_string())?;
        win.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: 320.0,
            height: 320.0,
        }))
        .map_err(|e| e.to_string())?;
    } else {
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
    let on_top = win.is_always_on_top().unwrap_or(false);
    let outer = win
        .outer_size()
        .unwrap_or(tauri::PhysicalSize {
            width: 800,
            height: 600,
        });
    let float = on_top && outer.width <= 400 && outer.height <= 400;
    Ok(WindowState {
        always_on_top: on_top,
        float_mode: float,
    })
}

#[tauri::command]
pub fn cmd_start_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    // Use the calling window instead of always using main window
    window.start_dragging().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Multi-window commands ───────────────────────────────────────────────────

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
    pub transparent: bool,
    #[serde(default = "default_true")]
    pub shadow: bool,
    #[serde(default = "default_true")]
    pub resizable: bool,
}

fn default_true() -> bool {
    true
}

#[tauri::command]
pub async fn cmd_open_window(app: AppHandle, options: OpenWindowOptions) -> Result<(), String> {
    println!("[cmd_open_window] Opening window: label={}, title={}, size={}x{}",
             options.label, options.title, options.width, options.height);

    // If window already exists, focus it
    if let Some(win) = app.get_webview_window(&options.label) {
        println!("[cmd_open_window] Window already exists, focusing...");
        win.set_focus().map_err(|e| e.to_string())?;
        win.unminimize().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Use App URL with window label as query parameter for routing
    // This works in both dev and production, and Tauri API will be injected
    let url = WebviewUrl::App(format!("index.html?window={}", options.label).into());
    println!("[cmd_open_window] Creating new window with URL: {}", url);

    let builder = WebviewWindowBuilder::new(&app, &options.label, url)
        .title(&options.title)
        .inner_size(options.width, options.height)
        .decorations(options.decorations)
        .transparent(options.transparent)
        .always_on_top(options.always_on_top)
        .resizable(options.resizable)
        .shadow(options.shadow)
        .center();

    println!("[cmd_open_window] Building window...");
    let _window = builder.build().map_err(|e| {
        println!("[cmd_open_window] ERROR building window: {}", e);
        e.to_string()
    })?;

    println!("[cmd_open_window] Window created successfully");
    Ok(())
}

#[tauri::command]
pub fn cmd_close_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_get_window_label(_app: AppHandle) -> Result<String, String> {
    // Returns the label of the calling window
    // This is a fallback; frontend should use getCurrentWindow().label directly
    Ok("main".to_string())
}
