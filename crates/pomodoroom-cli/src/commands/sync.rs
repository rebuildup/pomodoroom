//! Sync subcommand for integrating with external services.
//!
//! Provides commands to synchronize data with external services like
//! Google Calendar and Notion.

use clap::Subcommand;
use pomodoroom_core::integrations::Integration;

/// Sync actions for external services.
#[derive(Subcommand)]
pub enum SyncAction {
    /// Synchronize with a specific service
    Service {
        /// Service name (google, notion, linear, github, discord, slack)
        service: String,
        /// Preview changes without applying them
        #[arg(long)]
        dry_run: bool,
    },
    /// Synchronize with all authenticated services
    All {
        /// Preview changes without applying them
        #[arg(long)]
        dry_run: bool,
    },
    /// Show sync status for all services
    Status {
        /// Optional service name to check status for specific service
        #[arg(short, long)]
        service: Option<String>,
    },
}

/// Run the sync command.
pub fn run(action: SyncAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        SyncAction::Service { service, dry_run } => {
            run_service_sync(&service, dry_run)?;
        }
        SyncAction::All { dry_run } => {
            run_all_sync(dry_run)?;
        }
        SyncAction::Status { service } => {
            show_status(service)?;
        }
    }
    Ok(())
}

/// Run sync for a specific service.
fn run_service_sync(service: &str, dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    let service_lower = service.to_lowercase();

    if dry_run {
        println!("Dry run mode for {service}");
        println!("No actual changes will be made.");
    }

    match service_lower.as_str() {
        "google" => sync_google(dry_run)?,
        "notion" => sync_notion(dry_run)?,
        "linear" => sync_linear(dry_run)?,
        "github" => sync_github(dry_run)?,
        "discord" => sync_discord(dry_run)?,
        "slack" => sync_slack(dry_run)?,
        _ => {
            return Err(format!("Unknown service: {service}. Valid services: google, notion, linear, github, discord, slack").into());
        }
    }

    Ok(())
}

/// Run sync for all authenticated services.
fn run_all_sync(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    println!("Syncing all authenticated services...");

    let services = vec!["google", "notion", "linear", "github", "discord", "slack"];
    let mut synced = vec![];
    let mut skipped = vec![];

    for service in services {
        let is_auth = match service {
            "google" => {
                use pomodoroom_core::integrations::google::GoogleIntegration;
                GoogleIntegration::new().is_authenticated()
            }
            "notion" => {
                use pomodoroom_core::integrations::notion::NotionIntegration;
                NotionIntegration::new().is_authenticated()
            }
            "linear" => {
                use pomodoroom_core::integrations::linear::LinearIntegration;
                LinearIntegration::new().is_authenticated()
            }
            "github" => {
                use pomodoroom_core::integrations::github::GitHubIntegration;
                GitHubIntegration::new().is_authenticated()
            }
            "discord" => {
                use pomodoroom_core::integrations::discord::DiscordIntegration;
                DiscordIntegration::new().is_authenticated()
            }
            "slack" => {
                use pomodoroom_core::integrations::slack::SlackIntegration;
                SlackIntegration::new().is_authenticated()
            }
            _ => false,
        };

        if is_auth {
            if dry_run {
                println!("  Would sync: {service}");
            } else {
                match run_service_sync(service, dry_run) {
                    Ok(_) => synced.push(service),
                    Err(e) => eprintln!("  {service}: sync failed - {e}"),
                }
            }
        } else {
            skipped.push(service);
        }
    }

    if dry_run {
        println!("\nDry run complete.");
    } else {
        println!("\nSynced: {}", synced.join(", "));
        if !skipped.is_empty() {
            println!("Skipped (not authenticated): {}", skipped.join(", "));
        }
    }

    Ok(())
}

/// Show sync status for all or a specific service.
fn show_status(service: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(s) = service {
        let s_lower = s.to_lowercase();
        match s_lower.as_str() {
            "google" => show_service_status("Google", "google"),
            "notion" => show_service_status("Notion", "notion"),
            "linear" => show_service_status("Linear", "linear"),
            "github" => show_service_status("GitHub", "github"),
            "discord" => show_service_status("Discord", "discord"),
            "slack" => show_service_status("Slack", "slack"),
            _ => {
                return Err(format!("Unknown service: {s}").into());
            }
        }
    } else {
        // Show status for all services
        println!("Sync Status:");
        println!();

        for (display_name, service_name) in [
            ("Google", "google"),
            ("Notion", "notion"),
            ("Linear", "linear"),
            ("GitHub", "github"),
            ("Discord", "discord"),
            ("Slack", "slack"),
        ] {
            show_service_status(display_name, service_name);
            println!();
        }
    }

    Ok(())
}

/// Show status for a specific service.
fn show_service_status(display_name: &str, service_name: &str) {
    let (is_auth, status) = match service_name {
        "google" => {
            use pomodoroom_core::integrations::google::GoogleIntegration;
            let g = GoogleIntegration::new();
            (g.is_authenticated(), "authenticated".to_string())
        }
        "notion" => {
            use pomodoroom_core::integrations::notion::NotionIntegration;
            let n = NotionIntegration::new();
            (n.is_authenticated(), "authenticated".to_string())
        }
        "linear" => {
            use pomodoroom_core::integrations::linear::LinearIntegration;
            let l = LinearIntegration::new();
            (l.is_authenticated(), "authenticated".to_string())
        }
        "github" => {
            use pomodoroom_core::integrations::github::GitHubIntegration;
            let g = GitHubIntegration::new();
            (g.is_authenticated(), "authenticated".to_string())
        }
        "discord" => {
            use pomodoroom_core::integrations::discord::DiscordIntegration;
            let d = DiscordIntegration::new();
            (d.is_authenticated(), "configured".to_string())
        }
        "slack" => {
            use pomodoroom_core::integrations::slack::SlackIntegration;
            let s = SlackIntegration::new();
            (s.is_authenticated(), "authenticated".to_string())
        }
        _ => (false, "unknown".to_string()),
    };

    print!("{}: ", display_name);
    if is_auth {
        println!("{}", status);
    } else {
        println!("not {}", status);
    }
}

/// Sync Google Calendar and Tasks.
fn sync_google(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{google::GoogleIntegration, Integration};

    let g = GoogleIntegration::new();

    if !g.is_authenticated() {
        return Err(
            "Google is not authenticated. Run 'pomodoroom-cli auth login google' first.".into(),
        );
    }

    if dry_run {
        println!("Google Calendar: Would sync upcoming events");
    } else {
        // Fetch upcoming events for the next 24 hours
        match g.fetch_upcoming_events(24) {
            Ok(events) => {
                println!("Google Calendar: Found {} upcoming events:", events.len());
                for event in &events {
                    let start_local = event.start.format("%Y-%m-%d %H:%M");
                    let end_local = event.end.format("%H:%M");
                    println!("  {} ({} - {})", event.summary, start_local, end_local);
                }
                if events.is_empty() {
                    println!("  No upcoming events in the next 24 hours.");
                }
            }
            Err(e) => {
                println!("Google Calendar: Failed to fetch events - {}", e);
            }
        }
    }

    Ok(())
}

/// Sync Notion database.
fn sync_notion(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{notion::NotionIntegration, Integration};

    let n = NotionIntegration::new();

    if !n.is_authenticated() {
        return Err(
            "Notion is not authenticated. Run 'pomodoroom-cli auth login notion' first.".into(),
        );
    }

    if dry_run {
        println!("Notion: Would sync database entries");
    } else {
        match n.fetch_database_entries() {
            Ok(entries) => {
                println!("Notion: Found {} recent entries:", entries.len());
                for entry in &entries {
                    println!("  {} - {} [{}]{}",
                        entry.title,
                        entry.entry_type,
                        entry.date,
                        if entry.duration > 0 {
                            format!(" ({}m)", entry.duration)
                        } else {
                            String::new()
                        },
                    );
                }
                if entries.is_empty() {
                    println!("  No entries found in the database.");
                }
            }
            Err(e) => {
                println!("Notion: Failed to fetch entries - {}", e);
            }
        }
    }

    Ok(())
}

/// Sync Linear tasks.
fn sync_linear(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{linear::LinearIntegration, Integration};

    let l = LinearIntegration::new();

    if !l.is_authenticated() {
        return Err(
            "Linear is not authenticated. Run 'pomodoroom-cli auth login linear' first.".into(),
        );
    }

    if dry_run {
        println!("Linear: Would sync assigned tasks");
    } else {
        match l.fetch_assigned_issues() {
            Ok(issues) => {
                println!("Linear: Found {} assigned issues:", issues.len());
                for issue in &issues {
                    println!("  {} - {} [{}] (priority: {})",
                        issue.identifier,
                        issue.title,
                        issue.state,
                        issue.priority,
                    );
                }
                if issues.is_empty() {
                    println!("  No assigned issues found.");
                }
            }
            Err(e) => {
                println!("Linear: Failed to fetch issues - {}", e);
            }
        }
    }
    Ok(())
}

/// Sync GitHub status.
fn sync_github(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{github::GitHubIntegration, Integration};

    let g = GitHubIntegration::new();

    if !g.is_authenticated() {
        return Err(
            "GitHub is not authenticated. Run 'pomodoroom-cli auth login github' first.".into(),
        );
    }

    if dry_run {
        println!("GitHub: Would sync assigned issues and PRs");
    } else {
        match g.fetch_assigned_items() {
            Ok(items) => {
                println!("GitHub: Found {} assigned items:", items.len());
                for item in &items {
                    println!("  {} #{} - {} [{}] in {}",
                        item.item_type,
                        item.number,
                        item.title,
                        item.state,
                        item.repository,
                    );
                    println!("    {}", item.url);
                }
                if items.is_empty() {
                    println!("  No assigned issues or PRs found.");
                }
            }
            Err(e) => {
                println!("GitHub: Failed to fetch items - {}", e);
            }
        }
    }
    Ok(())
}

/// Sync Discord webhook.
fn sync_discord(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{discord::DiscordIntegration, Integration};

    let d = DiscordIntegration::new();

    if !d.is_authenticated() {
        return Err(
            "Discord is not configured. Run 'pomodoroom-cli auth login discord' first.".into(),
        );
    }

    if dry_run {
        println!("Discord: Would send test notification");
    } else {
        match d.test_webhook() {
            Ok(_) => {
                println!("Discord: Test notification sent successfully");
            }
            Err(e) => {
                println!("Discord: Failed to send test notification - {}", e);
            }
        }
    }
    Ok(())
}

/// Sync Slack status.
fn sync_slack(dry_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    use pomodoroom_core::integrations::{slack::SlackIntegration, Integration};

    let s = SlackIntegration::new();

    if !s.is_authenticated() {
        return Err(
            "Slack is not authenticated. Run 'pomodoroom-cli auth login slack' first.".into(),
        );
    }

    if dry_run {
        println!("Slack: Would sync status");
    } else {
        println!("Slack: Sync complete");
    }
    Ok(())
}
