//! Policy import/export CLI commands.
//!
//! This module provides CLI commands for exporting and importing timer policies
//! (schedules, break settings, etc.) with semantic versioning compatibility checks.

use clap::Subcommand;
use pomodoroom_core::policy::{check_compatibility, Compatibility, PolicyBundle, PolicyMetadata, POLICY_VERSION};
use pomodoroom_core::Config;
use std::fs;
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum PolicyAction {
    /// Export current policy to a JSON file
    Export {
        /// Output file path (prints to stdout if not specified)
        #[arg(short, long)]
        output: Option<PathBuf>,
        /// Policy name
        #[arg(long)]
        name: Option<String>,
        /// Author identifier
        #[arg(long)]
        author: Option<String>,
        /// Intended use case
        #[arg(long)]
        intent: Option<String>,
        /// Additional notes
        #[arg(long)]
        notes: Option<String>,
    },
    /// Import policy from a JSON file
    Import {
        /// Input file path
        file: PathBuf,
        /// Validate without applying changes
        #[arg(long)]
        dry_run: bool,
        /// Skip compatibility checks
        #[arg(long)]
        force: bool,
    },
    /// Show current policy schema version
    Version,
}

pub fn run(action: PolicyAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        PolicyAction::Export {
            output,
            name,
            author,
            intent,
            notes,
        } => export_policy(output, name, author, intent, notes),
        PolicyAction::Import {
            file,
            dry_run,
            force,
        } => import_policy(file, dry_run, force),
        PolicyAction::Version => {
            println!("Policy schema version: {}", POLICY_VERSION);
            Ok(())
        }
    }
}

fn export_policy(
    output: Option<PathBuf>,
    name: Option<String>,
    author: Option<String>,
    intent: Option<String>,
    notes: Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Load current config
    let config = Config::load_or_default();

    // Build metadata with overrides
    let metadata = PolicyMetadata {
        name: name.unwrap_or_else(|| "Exported Policy".to_string()),
        author: author.unwrap_or_default(),
        intent: intent.unwrap_or_default(),
        notes: notes.unwrap_or_default(),
        created_at: chrono::Utc::now(),
    };

    // Create bundle from current config
    let bundle = PolicyBundle::with_metadata(
        metadata,
        config.schedule.focus_duration,
        config.schedule.short_break,
        config.schedule.long_break,
        config.schedule.pomodoros_before_long_break,
        config.custom_schedule.clone(),
    );

    let json = bundle.to_json()?;

    match output {
        Some(path) => {
            fs::write(&path, &json)?;
            println!("Policy exported to: {}", path.display());
        }
        None => {
            println!("{}", json);
        }
    }

    Ok(())
}

fn import_policy(
    file: PathBuf,
    dry_run: bool,
    force: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Read the policy file
    let json = fs::read_to_string(&file)?;

    // Parse the bundle
    let bundle = PolicyBundle::from_json(&json)?;

    println!("Policy: {}", bundle.metadata.name);
    println!("Version: {}", bundle.version);
    println!("Author: {}", bundle.metadata.author);
    println!(
        "Created: {}",
        bundle.metadata.created_at.format("%Y-%m-%d %H:%M:%S UTC")
    );

    if !bundle.metadata.intent.is_empty() {
        println!("Intent: {}", bundle.metadata.intent);
    }
    if !bundle.metadata.notes.is_empty() {
        println!("Notes: {}", bundle.metadata.notes);
    }

    // Check compatibility
    let compatibility = check_compatibility(POLICY_VERSION, &bundle.version);

    match &compatibility {
        Compatibility::Compatible => {
            println!("\nCompatibility: OK");
        }
        Compatibility::MinorNewer { current, import } => {
            println!("\nWarning: {}", compatibility);
            println!("Current version: {}, Import version: {}", current, import);
        }
        Compatibility::Incompatible {
            current,
            import,
            hints,
        } => {
            println!("\nError: {}", compatibility);
            println!("Current version: {}, Import version: {}", current, import);
            for hint in hints {
                println!("  - {}", hint);
            }

            if !force {
                return Err("Incompatible policy version. Use --force to override.".into());
            }
            println!("\nProceeding due to --force flag.");
        }
    }

    // Print policy details
    println!("\nPolicy Settings:");
    println!("  Focus duration: {} min", bundle.policy.focus_duration);
    println!("  Short break: {} min", bundle.policy.short_break);
    println!("  Long break: {} min", bundle.policy.long_break);
    println!(
        "  Pomodoros before long break: {}",
        bundle.policy.pomodoros_before_long_break
    );
    if bundle.policy.custom_schedule.is_some() {
        println!("  Custom schedule: (included)");
    }

    if dry_run {
        println!("\nDry run complete. No changes applied.");
        return Ok(());
    }

    // Apply the policy
    let mut config = Config::load_or_default();
    bundle.apply_to_config(&mut config);
    config.save()?;

    println!("\nPolicy applied successfully.");

    Ok(())
}
