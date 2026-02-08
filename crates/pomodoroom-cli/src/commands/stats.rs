use clap::Subcommand;
use pomodoroom_core::storage::Database;

#[derive(Subcommand)]
pub enum StatsAction {
    /// Today's stats
    Today,
    /// All-time stats
    All,
}

pub fn run(action: StatsAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;

    match action {
        StatsAction::Today => {
            let stats = db.stats_today()?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
        }
        StatsAction::All => {
            let stats = db.stats_all()?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
        }
    }
    Ok(())
}
