// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Pomodoroom Desktop Application
//!
//! A Tauri-based desktop application for Pomodoroom timer system.
//! The GUI is a thin React skin over the Rust core (pomodoroom-core).

#[allow(unused_imports)]
use tauri::Manager;

mod bridge;
mod cache_commands;
mod google_calendar;
mod google_tasks;
mod integration_commands;
mod schedule_commands;
mod tray;
mod window;

#[cfg(windows)]
mod windows_helpers;

fn main() {
    // Load .env file for Google OAuth credentials
    dotenv::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(bridge::EngineState::new())
        .manage(bridge::DbState::new().expect("Failed to initialize database"))
        .manage(bridge::NotificationState::new())
        .manage(bridge::PolicyEditorState::default())
        .manage(integration_commands::IntegrationState::new())
        .manage(google_calendar::GoogleCalendarOAuthConfig::new())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                eprintln!("DEBUG MODE: Opening DevTools...");
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
            window::cmd_set_window_shadow,
            window::cmd_set_window_locked,
            window::cmd_get_window_controls_state,
            window::cmd_get_window_state,
            window::cmd_start_drag,
            window::cmd_open_window,
            window::cmd_close_window,
            window::cmd_get_window_label,
            window::cmd_open_reference,
            window::cmd_open_action_notification,
            #[cfg(windows)]
            window::cmd_apply_rounded_corners,
            // Bridge commands (CLI core)
            bridge::cmd_timer_status,
            bridge::cmd_timer_start,
            bridge::cmd_timer_pause,
            bridge::cmd_timer_resume,
            bridge::cmd_timer_skip,
            bridge::cmd_timer_complete,
            bridge::cmd_timer_extend,
            bridge::cmd_timer_reset,
            bridge::cmd_timer_tick,
            bridge::cmd_config_get,
            bridge::cmd_config_set,
            bridge::cmd_config_list,
            bridge::cmd_shortcuts_get,
            bridge::cmd_shortcuts_set,
            // Profile pack commands
            bridge::cmd_profile_list,
            bridge::cmd_profile_get,
            bridge::cmd_profile_current,
            bridge::cmd_profile_apply,
            bridge::cmd_profile_rollback,
            bridge::cmd_profile_compare,
            bridge::cmd_profile_summary,
            bridge::cmd_profile_record_session,
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
            // Action notification commands
            bridge::cmd_show_action_notification,
            bridge::cmd_get_action_notification,
            bridge::cmd_clear_action_notification,
            // Policy editor commands
            bridge::cmd_policy_editor_init,
            bridge::cmd_policy_editor_load,
            bridge::cmd_policy_validate,
            bridge::cmd_policy_set_focus_duration,
            bridge::cmd_policy_set_short_break,
            bridge::cmd_policy_set_long_break,
            bridge::cmd_policy_set_pomodoros_before_long_break,
            bridge::cmd_policy_set_custom_schedule,
            bridge::cmd_policy_preview_day_plan,
            bridge::cmd_policy_apply,
            bridge::cmd_policy_reset,
            bridge::cmd_policy_export,
            bridge::cmd_policy_import,
            // Task reconciliation commands
            bridge::cmd_reconciliation_run,
            bridge::cmd_reconciliation_preview,
            bridge::cmd_reconciliation_config,
            bridge::cmd_reconciliation_quick_resume,
            // Schedule commands
            schedule_commands::cmd_task_create,
            schedule_commands::cmd_task_update,
            schedule_commands::cmd_task_delete,
            schedule_commands::cmd_task_list,
            schedule_commands::cmd_task_get,
            schedule_commands::cmd_task_start,
            schedule_commands::cmd_task_pause,
            schedule_commands::cmd_task_interrupt,
            schedule_commands::cmd_task_resume,
            schedule_commands::cmd_task_complete,
            schedule_commands::cmd_task_postpone,
            schedule_commands::cmd_task_defer_until,
            schedule_commands::cmd_task_extend,
            schedule_commands::cmd_task_available_actions,
            schedule_commands::cmd_project_create,
            schedule_commands::cmd_project_list,
            schedule_commands::cmd_project_update,
            schedule_commands::cmd_project_delete,
            schedule_commands::cmd_group_create,
            schedule_commands::cmd_group_list,
            schedule_commands::cmd_group_update,
            schedule_commands::cmd_group_delete,
            schedule_commands::cmd_data_reset,
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
            // Google Tasks commands
            google_tasks::cmd_google_tasks_auth_get_auth_url,
            google_tasks::cmd_google_tasks_auth_connect,
            google_tasks::cmd_google_tasks_auth_exchange_code,
            google_tasks::cmd_google_tasks_auth_disconnect,
            google_tasks::cmd_google_tasks_list_tasklists,
            google_tasks::cmd_google_tasks_get_selected_tasklist,
            google_tasks::cmd_google_tasks_set_selected_tasklist,
            google_tasks::cmd_google_tasks_get_selected_tasklists,
            google_tasks::cmd_google_tasks_set_selected_tasklists,
            google_tasks::cmd_google_tasks_list_tasks,
            google_tasks::cmd_google_tasks_complete_task,
            google_tasks::cmd_google_tasks_create_task,
            google_tasks::cmd_google_tasks_get_session_task,
            google_tasks::cmd_google_tasks_set_session_task,
            google_tasks::cmd_google_tasks_clear_session_task,
            google_tasks::cmd_google_tasks_complete_session_task,
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
