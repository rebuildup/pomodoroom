// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Pomodoroom Desktop Application
//!
//! A Tauri-based desktop application for the Pomodoroom timer system.
//! The GUI is a thin React skin over the Rust core (pomodoroom-core).

use tauri::Manager;

mod bridge;
mod schedule_commands;
mod tray;
mod window;

fn main() {
    // Initialize tracing subscriber for logging
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(bridge::EngineState::new())
        .manage(bridge::DbState::new().expect("Failed to initialize database"))
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                tracing::info!("DEBUG MODE: Opening DevTools...");
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
            bridge::cmd_calculate_priority,
            bridge::cmd_calculate_priorities,
            // OAuth token secure storage commands
            bridge::cmd_store_oauth_tokens,
            bridge::cmd_load_oauth_tokens,
            bridge::cmd_clear_oauth_tokens,
            // Schedule commands
            schedule_commands::cmd_task_create,
            schedule_commands::cmd_task_update,
            schedule_commands::cmd_task_delete,
            schedule_commands::cmd_task_list,
            schedule_commands::cmd_task_get,
            schedule_commands::cmd_project_create,
            schedule_commands::cmd_project_list,
            schedule_commands::cmd_template_get,
            schedule_commands::cmd_template_set,
            schedule_commands::cmd_schedule_generate,
            schedule_commands::cmd_schedule_auto_fill,
            schedule_commands::cmd_schedule_create_block,
            schedule_commands::cmd_schedule_update_block,
            schedule_commands::cmd_schedule_delete_block,
            schedule_commands::cmd_schedule_list_blocks,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Tauri application error: {}", e);
            std::process::exit(1);
        });
}
