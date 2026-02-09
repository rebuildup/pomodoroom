// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod tray;
mod window;
mod bridge;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(bridge::EngineState::new())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                println!("🔧 DEBUG MODE: Opening DevTools...");
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.open_devtools();
                }
            }
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window commands
            window::cmd_set_always_on_top,
            window::cmd_set_float_mode,
            window::cmd_set_decorations,
            window::cmd_get_window_state,
            window::cmd_start_drag,
            window::cmd_open_window,
            window::cmd_close_window,
            window::cmd_get_window_label,
            // Bridge commands (CLI core)
            bridge::cmd_timer_status,
            bridge::cmd_timer_start,
            bridge::cmd_timer_pause,
            bridge::cmd_timer_resume,
            bridge::cmd_timer_skip,
            bridge::cmd_timer_reset,
            bridge::cmd_timer_tick,
            bridge::cmd_config_get,
            bridge::cmd_config_set,
            bridge::cmd_config_list,
            bridge::cmd_stats_today,
            bridge::cmd_stats_all,
            // Timeline commands
            bridge::cmd_timeline_detect_gaps,
            bridge::cmd_timeline_generate_proposals,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Tauri application error: {}", e);
            std::process::exit(1);
        });
}
