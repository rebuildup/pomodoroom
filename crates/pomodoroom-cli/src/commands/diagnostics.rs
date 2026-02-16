//! Diagnostics bundle export CLI commands.
//!
//! This module provides CLI commands for exporting diagnostics bundles
//! that can be used to reproduce issues across different environments.

use clap::Subcommand;
use pomodoroom_core::{
    BundleBuilder, BundleMetadata, DiagnosticsBundle, DiagnosticsData,
};
use std::fs;
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum DiagnosticsAction {
    /// Export a diagnostics bundle to a JSON file
    Export {
        /// Output file path (prints to stdout if not specified)
        #[arg(short, long)]
        output: Option<PathBuf>,
        /// Description of the issue being diagnosed
        #[arg(short, long)]
        description: Option<String>,
        /// Issue reference (e.g., "#123" or "ISSUE-456")
        #[arg(short, long)]
        issue: Option<String>,
        /// Exclude configuration data
        #[arg(long)]
        no_config: bool,
        /// Exclude task data
        #[arg(long)]
        no_tasks: bool,
        /// Exclude schedule data
        #[arg(long)]
        no_schedule: bool,
        /// Exclude timer state
        #[arg(long)]
        no_timer: bool,
        /// Exclude log entries
        #[arg(long)]
        no_logs: bool,
    },
    /// Validate a diagnostics bundle file
    Validate {
        /// Input file path
        file: PathBuf,
    },
    /// Show diagnostics bundle schema version
    Version,
}

pub fn run(action: DiagnosticsAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        DiagnosticsAction::Export {
            output,
            description,
            issue,
            no_config,
            no_tasks,
            no_schedule,
            no_timer,
            no_logs,
        } => export_diagnostics(output, description, issue, no_config, no_tasks, no_schedule, no_timer, no_logs),
        DiagnosticsAction::Validate { file } => validate_diagnostics(file),
        DiagnosticsAction::Version => {
            let metadata = BundleMetadata::new(env!("CARGO_PKG_VERSION"));
            println!("Diagnostics bundle format version: {}", metadata.version);
            Ok(())
        }
    }
}

fn export_diagnostics(
    output: Option<PathBuf>,
    description: Option<String>,
    issue: Option<String>,
    no_config: bool,
    no_tasks: bool,
    no_schedule: bool,
    no_timer: bool,
    no_logs: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let app_version = env!("CARGO_PKG_VERSION");

    // Build the bundle with options
    let mut builder = BundleBuilder::new(app_version);

    if let Some(desc) = description {
        builder = builder.with_description(desc);
    }

    if let Some(ref_id) = issue {
        builder = builder.with_issue_reference(ref_id);
    }

    if no_config {
        builder = builder.exclude_config();
    }
    if no_tasks {
        builder = builder.exclude_tasks();
    }
    if no_schedule {
        builder = builder.exclude_schedule();
    }
    if no_timer {
        builder = builder.exclude_timer();
    }
    if no_logs {
        builder = builder.exclude_logs();
    }

    let bundle = builder.build();
    let json = bundle.to_json()?;

    match output {
        Some(path) => {
            fs::write(&path, &json)?;
            println!("Diagnostics bundle exported to: {}", path.display());
            println!("Bundle version: {}", bundle.metadata.version);
            println!("Created at: {}", bundle.metadata.created_at.format("%Y-%m-%d %H:%M:%S UTC"));
            println!("Data sections included: {}", bundle.data.len());
        }
        None => {
            println!("{}", json);
        }
    }

    Ok(())
}

fn validate_diagnostics(file: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    // Read and parse the bundle
    let json = fs::read_to_string(&file)?;
    let bundle = DiagnosticsBundle::from_json(&json)?;

    println!("Diagnostics Bundle Validation");
    println!("============================");
    println!();
    println!("File: {}", file.display());
    println!("Bundle version: {}", bundle.metadata.version);
    println!("App version: {}", bundle.metadata.app_version);
    println!("Created at: {}", bundle.metadata.created_at.format("%Y-%m-%d %H:%M:%S UTC"));
    println!("Platform: {} / {} ({})", bundle.metadata.platform.os, bundle.metadata.platform.arch, bundle.metadata.platform.rust_version);

    if let Some(ref desc) = bundle.metadata.description {
        println!("Description: {}", desc);
    }

    if let Some(ref issue) = bundle.metadata.issue_reference {
        println!("Issue reference: {}", issue);
    }

    println!();
    println!("Data sections ({} total):", bundle.data.len());
    for data in &bundle.data {
        let type_name = match data {
            DiagnosticsData::Config(_) => "Config",
            DiagnosticsData::Tasks(_) => "Tasks",
            DiagnosticsData::Schedule(_) => "Schedule",
            DiagnosticsData::TimerState(_) => "TimerState",
            DiagnosticsData::Logs(_) => "Logs",
            DiagnosticsData::IntegrationStatus(_) => "IntegrationStatus",
            DiagnosticsData::SystemMetrics(_) => "SystemMetrics",
        };
        println!("  - {}", type_name);
    }

    if !bundle.redacted_fields.is_empty() {
        println!();
        println!("Redacted fields: {}", bundle.redacted_fields.join(", "));
    }

    println!();
    println!("Validation: PASSED");

    Ok(())
}
