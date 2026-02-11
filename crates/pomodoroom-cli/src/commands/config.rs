use clap::Subcommand;
use pomodoroom_core::Config;

#[derive(Subcommand)]
pub enum ConfigAction {
    /// Get a config value
    Get {
        /// Config key (e.g. "theme", "notification_volume")
        key: String,
    },
    /// Set a config value
    Set {
        /// Config key
        key: String,
        /// New value
        value: String,
    },
    /// List all config values
    List,
    /// Reset config to defaults
    Reset,
}

pub fn run(action: ConfigAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ConfigAction::Get { key } => {
            let config = Config::load_or_default();
            match config.get(&key) {
                Some(value) => println!("{value}"),
                None => {
                    eprintln!("unknown key: {key}");
                    std::process::exit(1);
                }
            }
        }
        ConfigAction::Set { key, value } => {
            let mut config = Config::load_or_default();
            config.set(&key, &value)?;
            println!("ok");
        }
        ConfigAction::List => {
            let config = Config::load_or_default();
            // Display as key-value pairs using the new nested structure
            println!("ui.dark_mode: {}", config.ui.dark_mode);
            println!("ui.highlight_color: {}", config.ui.highlight_color);
            println!("ui.sticky_widget_size: {}", config.ui.sticky_widget_size);
            println!("ui.youtube_widget_width: {}", config.ui.youtube_widget_width);
            println!("notifications.enabled: {}", config.notifications.enabled);
            println!("notifications.volume: {}", config.notifications.volume);
            println!("notifications.vibration: {}", config.notifications.vibration);
            println!("youtube.autoplay_on_focus: {}", config.youtube.autoplay_on_focus);
            println!("youtube.pause_on_break: {}", config.youtube.pause_on_break);
            println!("youtube.default_volume: {}", config.youtube.default_volume);
            println!("youtube.loop_enabled: {}", config.youtube.loop_enabled);
            println!("schedule.focus_duration: {}", config.schedule.focus_duration);
            println!("schedule.short_break: {}", config.schedule.short_break);
            println!("schedule.long_break: {}", config.schedule.long_break);
            println!("schedule.pomodoros_before_long_break: {}", config.schedule.pomodoros_before_long_break);
            println!("window_pinned: {}", config.window_pinned);
            println!("window_float: {}", config.window_float);
            println!("shortcuts: {} entries", config.shortcuts.bindings.len());
        }
        ConfigAction::Reset => {
            let config = Config::default();
            config.save()?;
            println!("config reset to defaults");
        }
    }
    Ok(())
}
