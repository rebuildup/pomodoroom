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
            // Display as key-value pairs instead of JSON (Config contains non-serializable fields)
            println!("theme: {}", config.theme);
            println!("accent_color: {}", config.accent_color);
            println!("notification_sound: {}", config.notification_sound);
            println!("notification_volume: {}", config.notification_volume);
            println!("vibration: {}", config.vibration);
            println!("auto_advance: {}", config.auto_advance);
            println!("window_pinned: {}", config.window_pinned);
            println!("window_float: {}", config.window_float);
            println!("tray_enabled: {}", config.tray_enabled);
            println!("schedule: {:?}", config.schedule);
        }
        ConfigAction::Reset => {
            let config = Config::default();
            config.save()?;
            println!("config reset to defaults");
        }
    }
    Ok(())
}
