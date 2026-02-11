// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Pomodoroom Desktop Application
//!
//! A Tauri-based desktop application for the Pomodoroom timer system.
//! The GUI is a thin React skin over the Rust core (pomodoroom-core).

use tauri::Manager;

mod bridge;
mod cache_commands;
mod google_calendar;
mod integration_commands;
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
        .plugin(tauri_plugin_notification::init())
        .manage(bridge::EngineState::new())
        .manage(bridge::DbState::new().expect("Failed to initialize database"))
        .manage(integration_commands::IntegrationState::new())
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
            bridge::cmd_shortcuts_get,
            bridge::cmd_shortcuts_set,
            bridge::cmd_stats_today,
            bridge::cmd_stats_all,
            bridge::cmd_log,
            // Session commands
            bridge::cmd_sessions_get_by_date_range,
            bridge::cmd_sessions_get_all,
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
            schedule_commands::cmd_task_start,
            schedule_commands::cmd_task_pause,
            schedule_commands::cmd_task_resume,
            schedule_commands::cmd_task_complete,
            schedule_commands::cmd_task_postpone,
            schedule_commands::cmd_task_extend,
            schedule_commands::cmd_task_available_actions,
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
            // Integration commands
            integration_commands::cmd_integration_list,
            integration_commands::cmd_integration_get_status,
            integration_commands::cmd_integration_disconnect,
            integration_commands::cmd_integration_sync,
            integration_commands::cmd_integration_calculate_priority,
            // Google Calendar commands
            google_calendar::cmd_google_auth_get_auth_url,
            google_calendar::cmd_google_auth_connect,
            google_calendar::cmd_google_auth_exchange_code,
            google_calendar::cmd_google_calendar_list_events,
            google_calendar::cmd_google_calendar_create_event,
            google_calendar::cmd_google_calendar_delete_event,
            google_calendar::cmd_google_calendar_list_calendars,
            google_calendar::cmd_google_calendar_get_selected_calendars,
            google_calendar::cmd_google_calendar_set_selected_calendars,
            // Cache commands
            cache_commands::cmd_cache_get,
            cache_commands::cmd_cache_set,
            cache_commands::cmd_cache_delete,
            cache_commands::cmd_cache_clear_prefix,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Tauri application error: {}", e);
            std::process::exit(1);
        });
}
