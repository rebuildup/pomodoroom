use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "pomodoroom-cli", version, about = "Pomodoroom CLI")]
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
    };

    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}
