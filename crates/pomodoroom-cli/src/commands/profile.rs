//! Profile pack management commands.
//!
//! Provides CLI access to the profile pack system for applying,
//! listing, and managing curated policy presets.

use clap::Subcommand;
use pomodoroom_core::storage::{Config, ProfileManager};

#[derive(Subcommand)]
pub enum ProfileAction {
    /// List all available profile packs
    List,

    /// Show details for a specific profile pack
    Show {
        /// Profile pack ID (e.g., "deep-work", "admin", "creative")
        id: String,
    },

    /// Apply a profile pack to the current configuration
    Apply {
        /// Profile pack ID to apply
        id: String,
    },

    /// Rollback to the previous configuration
    Rollback,

    /// Show currently active profile pack
    Current,

    /// Show performance comparison between profiles
    Compare {
        /// First profile pack ID
        pack_a: String,
        /// Second profile pack ID
        pack_b: String,
    },

    /// Show weekly performance summary for all profiles
    Summary,

    /// Clear all performance data
    ClearPerf,
}

pub fn run(action: ProfileAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        ProfileAction::List => list_packs(),
        ProfileAction::Show { id } => show_pack(&id),
        ProfileAction::Apply { id } => apply_pack(&id),
        ProfileAction::Rollback => rollback(),
        ProfileAction::Current => current(),
        ProfileAction::Compare { pack_a, pack_b } => compare(&pack_a, &pack_b),
        ProfileAction::Summary => summary(),
        ProfileAction::ClearPerf => clear_perf(),
    }
}

fn list_packs() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ProfileManager::load()?;
    let packs = manager.available_packs();

    println!("Available Profile Packs:");
    println!();

    for pack in packs {
        let active = if manager.active_pack_id == pack.id {
            " [ACTIVE]"
        } else {
            ""
        };
        println!("  {} - {}{}", pack.id, pack.name, active);
        println!("    {}", pack.description);
        println!();
    }

    Ok(())
}

fn show_pack(id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let manager = ProfileManager::load()?;

    let pack = manager
        .available_packs()
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Profile pack '{}' not found", id))?;

    println!("{} ({})", pack.name, pack.id);
    println!("{}", "=".repeat(pack.name.len() + pack.id.len() + 3));
    println!();
    println!("Description: {}", pack.description);
    println!("Category: {}", pack.category);
    println!();
    println!("Rationale:");
    for line in pack.rationale.lines() {
        println!("  {}", line);
    }
    println!();

    if let Some(ref schedule) = pack.config.schedule {
        println!("Schedule Settings:");
        println!("  Focus Duration: {} min", schedule.focus_duration);
        println!("  Short Break: {} min", schedule.short_break);
        println!("  Long Break: {} min", schedule.long_break);
        println!("  Pomodoros before Long Break: {}", schedule.pomodoros_before_long_break);
        println!();
    }

    if let Some(ref notifications) = pack.config.notifications {
        println!("Notification Settings:");
        println!("  Enabled: {}", notifications.enabled);
        println!("  Volume: {}%", notifications.volume);
        println!("  Vibration: {}", notifications.vibration);
        println!();
    }

    if let Some(ref ui) = pack.config.ui {
        println!("UI Settings:");
        println!("  Dark Mode: {}", ui.dark_mode);
        println!("  Accent Color: {}", ui.highlight_color);
        println!();
    }

    Ok(())
}

fn apply_pack(id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = ProfileManager::load()?;
    let mut config = Config::load()?;

    // Record switch if there was an active pack
    let previous_pack = manager.active_pack_id.clone();
    if !previous_pack.is_empty() && previous_pack != id {
        manager.record_switch(&previous_pack);
    }

    let backup = manager.apply_pack(id, &mut config)?;

    println!("Applied profile pack: {}", id);
    println!("Backup created at: {}", backup.created_at);
    println!();
    println!("Use 'profile rollback' to restore previous configuration.");

    Ok(())
}

fn rollback() -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = ProfileManager::load()?;
    let mut config = Config::load()?;

    match manager.rollback(&mut config) {
        Some(rolled_back) => {
            println!("Rolled back from profile: {}", rolled_back);
            println!("Previous configuration restored.");
        }
        None => {
            println!("No backup available to rollback.");
        }
    }

    Ok(())
}

fn current() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ProfileManager::load()?;

    match manager.active_pack() {
        Some(id) => {
            if let Some(pack) = manager.available_packs().into_iter().find(|p| p.id == id) {
                println!("Active Profile: {} ({})", pack.name, pack.id);
                println!();
                println!("{}", pack.description);
            } else {
                println!("Active Profile: {}", id);
            }
        }
        None => {
            println!("No active profile pack (using custom configuration).");
        }
    }

    if let Some(backup) = manager.latest_backup() {
        println!();
        println!("Backup available from: {} (pack: {})", backup.created_at, backup.pack_id);
    }

    Ok(())
}

fn compare(pack_a: &str, pack_b: &str) -> Result<(), Box<dyn std::error::Error>> {
    let manager = ProfileManager::load()?;

    match manager.compare_packs(pack_a, pack_b) {
        Some(comparison) => {
            println!("Profile Comparison: {} vs {}", comparison.pack_a, comparison.pack_b);
            println!("{}", "=".repeat(50));
            println!();
            println!("Focus Time Difference: {} min", comparison.focus_minutes_diff);
            println!("Pomodoros Difference: {}", comparison.pomodoros_diff);
            println!("Avg Session Difference: {:.1} min", comparison.avg_session_diff);
            println!();
            println!("Recommendation: {}", comparison.recommendation);
        }
        None => {
            println!("Insufficient data to compare these profiles.");
            println!("Use the profiles for a while to collect performance data.");
        }
    }

    Ok(())
}

fn summary() -> Result<(), Box<dyn std::error::Error>> {
    let manager = ProfileManager::load()?;
    let summary = manager.weekly_summary();

    if summary.is_empty() {
        println!("No performance data available for this week.");
        println!("Use 'profile apply <id>' to start tracking profile performance.");
        return Ok(());
    }

    println!("Weekly Performance Summary");
    println!("{}", "=".repeat(40));
    println!();

    for perf in summary {
        println!("{}:", perf.pack_id);
        println!("  Focus Minutes: {}", perf.focus_minutes);
        println!("  Pomodoros: {}", perf.pomodoros_completed);
        println!("  Avg Session: {:.1} min", perf.avg_session_length);
        println!("  Switches: {}", perf.switches);
        if let Some(rating) = perf.rating {
            println!("  Rating: {}/5", rating);
        }
        println!();
    }

    Ok(())
}

fn clear_perf() -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = ProfileManager::load()?;
    manager.clear_performance();
    println!("Performance data cleared.");
    Ok(())
}
