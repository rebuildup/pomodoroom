use clap::{CommandFactory, Parser, Subcommand};
use clap_complete::{generate, Shell};

mod commands;

#[derive(Parser)]
#[command(name = "pomodoroom-cli", version)]
#[command(about = "CLI-first Pomodoro timer with task and schedule management", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Timer control
    Timer {
        #[command(subcommand)]
        action: commands::timer::TimerAction,
    },
    /// Configuration management
    Config {
        #[command(subcommand)]
        action: commands::config::ConfigAction,
    },
    /// Session statistics
    Stats {
        #[command(subcommand)]
        action: commands::stats::StatsAction,
    },
    /// Schedule management
    Schedule {
        #[command(subcommand)]
        action: commands::schedule::ScheduleAction,
    },
    /// Authentication management for integrations
    Auth {
        #[command(subcommand)]
        action: commands::auth::AuthAction,
    },
    /// Task management
    Task {
        #[command(subcommand)]
        action: commands::task::TaskAction,
    },
    /// Project management
    Project {
        #[command(subcommand)]
        action: commands::project::ProjectAction,
    },
    /// Daily template management
    Template {
        #[command(subcommand)]
        action: commands::template::TemplateAction,
    },
    /// Sync with external services (Google, Notion, Linear, etc.)
    Sync {
        #[command(subcommand)]
        action: commands::sync::SyncAction,
    },
    /// Policy import/export management
    Policy {
        #[command(subcommand)]
        action: commands::policy::PolicyAction,
    },
    /// Profile pack management (curated policy presets)
    Profile {
        #[command(subcommand)]
        action: commands::profile::ProfileAction,
    },
    /// Diagnostics bundle export for reproducible debugging
    Diagnostics {
        #[command(subcommand)]
        action: commands::diagnostics::DiagnosticsAction,
    },
    /// Generate shell completion script
    Complete {
        /// Shell type (bash, zsh, fish, elvish, powershell)
        shell: Shell,
    },
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Commands::Timer { action } => commands::timer::run(action),
        Commands::Config { action } => commands::config::run(action),
        Commands::Stats { action } => commands::stats::run(action),
        Commands::Schedule { action } => commands::schedule::run(action),
        Commands::Auth { action } => commands::auth::run(action),
        Commands::Task { action } => commands::task::run(action),
        Commands::Project { action } => commands::project::run(action),
        Commands::Template { action } => commands::template::run(action),
        Commands::Sync { action } => commands::sync::run(action),
        Commands::Policy { action } => commands::policy::run(action),
        Commands::Profile { action } => commands::profile::run(action),
        Commands::Diagnostics { action } => commands::diagnostics::run(action),
        Commands::Complete { shell } => {
            print_completions(shell);
            Ok(())
        }
    };

    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

/// Generate shell completion script
fn print_completions(shell: Shell) {
    let mut cmd = Cli::command();
    let name = "pomodoroom-cli";
    generate(shell, &mut cmd, name, &mut std::io::stdout());
}
