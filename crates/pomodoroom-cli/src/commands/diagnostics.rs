//! Diagnostics export command for bug reports.

use clap::Subcommand;
use std::path::PathBuf;

use pomodoroom_core::{Database, DiagnosticsGenerator, SchedulingEvent};
use pomodoroom_core::storage::data_dir;

#[derive(Subcommand)]
pub enum DiagnosticsAction {
    /// Export diagnostics bundle for bug reports
    Export {
        /// Output file path (default: ~/.pomodoroom/diagnostics.json)
        #[arg(long)]
        output: Option<PathBuf>,
        /// Include extended event history
        #[arg(long)]
        full: bool,
    },
    /// Show bundle hash only
    Hash,
}

pub fn run(action: DiagnosticsAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        DiagnosticsAction::Export { output, full } => export_diagnostics(output, full),
        DiagnosticsAction::Hash => show_hash(),
    }
}

fn export_diagnostics(
    output: Option<PathBuf>,
    full: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;

    // Get sessions
    let sessions = db.get_all_session_records()?;

    // Get config as JSON
    let config = pomodoroom_core::Config::load()?;
    let config_json = serde_json::to_string(&config)?;
    let config_value: serde_json::Value = serde_json::from_str(&config_json)?;

    // Get events (placeholder - real implementation would query event log)
    let events = get_recent_events(&db, if full { 1000 } else { 100 })?;

    // Generate bundle
    let generator = DiagnosticsGenerator::new();
    let app_version = env!("CARGO_PKG_VERSION");
    let bundle = generator.generate(sessions, config_value, events, app_version);

    // Determine output path
    let output_path = output.unwrap_or_else(|| {
        data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("diagnostics.json")
    });

    // Ensure parent directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Export
    let json = DiagnosticsGenerator::export(&bundle)?;
    std::fs::write(&output_path, json)?;

    println!("Diagnostics bundle exported to: {}", output_path.display());
    println!("Bundle hash: {}", bundle.hash);
    println!("Total sessions: {}", bundle.timeline.total_sessions);
    println!("Redacted fields: {}", bundle.config.redacted_fields.len());

    Ok(())
}

fn show_hash() -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;
    let sessions = db.get_all_session_records()?;

    let config = pomodoroom_core::Config::load()?;
    let config_json = serde_json::to_string(&config)?;
    let config_value: serde_json::Value = serde_json::from_str(&config_json)?;

    let events = get_recent_events(&db, 100)?;

    let generator = DiagnosticsGenerator::new();
    let bundle = generator.generate(sessions, config_value, events, env!("CARGO_PKG_VERSION"));

    println!("{}", bundle.hash);
    Ok(())
}

fn get_recent_events(_db: &Database, _limit: usize) -> Result<Vec<SchedulingEvent>, Box<dyn std::error::Error>> {
    // Placeholder: In a full implementation, this would query an event log table
    // For now, return empty vector
    Ok(Vec::new())
}
