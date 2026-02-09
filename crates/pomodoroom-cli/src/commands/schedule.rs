use clap::Subcommand;
use pomodoroom_core::timer::Schedule;
use pomodoroom_core::Config;

#[derive(Subcommand)]
pub enum ScheduleAction {
    /// Show current schedule
    List,
    /// Set schedule from JSON string
    Set {
        /// JSON schedule (array of steps)
        json: String,
    },
    /// Reset to default progressive schedule
    Reset,
}

pub fn run(action: ScheduleAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ScheduleAction::List => {
            let config = Config::load_or_default();
            let schedule = config.schedule();
            println!("{}", serde_json::to_string_pretty(&schedule)?);
        }
        ScheduleAction::Set { json } => {
            let schedule: Schedule = serde_json::from_str(&json)?;
            let mut config = Config::load_or_default();
            config.schedule = Some(schedule);
            config.save()?;
            println!("schedule updated");
        }
        ScheduleAction::Reset => {
            let mut config = Config::load_or_default();
            config.schedule = None;
            config.save()?;
            println!("schedule reset to default progressive");
        }
    }
    Ok(())
}
