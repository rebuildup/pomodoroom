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
            let config = Config::load();
            match config.get(&key) {
                Some(value) => println!("{value}"),
                None => {
                    eprintln!("unknown key: {key}");
                    std::process::exit(1);
                }
            }
        }
        ConfigAction::Set { key, value } => {
            let mut config = Config::load();
            config.set(&key, &value)?;
            println!("ok");
        }
        ConfigAction::List => {
            let config = Config::load();
            let json = serde_json::to_string_pretty(&config)?;
            println!("{json}");
        }
        ConfigAction::Reset => {
            let config = Config::default();
            config.save()?;
            println!("config reset to defaults");
        }
    }
    Ok(())
}
