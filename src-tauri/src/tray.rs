use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Manager,
};

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Menu items
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let pin = MenuItem::with_id(app, "pin", "Always on Top", true, None::<&str>)?;
    let float = MenuItem::with_id(app, "float", "Float Timer", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &pin, &float, &quit])?;

    let _tray = TrayIconBuilder::new()
        .tooltip("Pomodoroom")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "show" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "pin" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let current = win.is_always_on_top().unwrap_or(false);
                        let _ = win.set_always_on_top(!current);
                        // Notify frontend of state change
                        let _ = win.emit("window-state-changed", serde_json::json!({
                            "always_on_top": !current,
                        }));
                    }
                }
                "float" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let is_float = !win.is_decorated().unwrap_or(true)
                            && win.is_always_on_top().unwrap_or(false);
                        if is_float {
                            // Exit float
                            let _ = win.set_decorations(true);
                            let _ = win.set_always_on_top(false);
                            let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                                width: 800.0,
                                height: 600.0,
                            }));
                            let _ = win.center();
                        } else {
                            // Enter float
                            let _ = win.set_decorations(false);
                            let _ = win.set_always_on_top(true);
                            let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                                width: 280.0,
                                height: 280.0,
                            }));
                        }
                        let _ = win.emit("window-state-changed", serde_json::json!({
                            "float_mode": !is_float,
                        }));
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click: show/focus the window
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.unminimize();
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
