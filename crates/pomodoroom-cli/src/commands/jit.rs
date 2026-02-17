//! JIT (Just-In-Time) task engine command.

use clap::Subcommand;
use chrono::Utc;

use pomodoroom_core::{JitContext, JitEngine};
use pomodoroom_core::storage::schedule_db::ScheduleDb;

#[derive(Subcommand)]
pub enum JitAction {
    /// Suggest next tasks based on current context
    Suggest {
        /// Current energy level (0-100)
        #[arg(long)]
        energy: Option<u8>,
        /// Time since last break in minutes
        #[arg(long)]
        time_since_break: Option<u64>,
        /// Number of completed sessions today
        #[arg(long)]
        completed: Option<u32>,
    },
    /// Suggest optimal break duration
    SuggestBreak {
        /// Current energy level (0-100)
        #[arg(long)]
        energy: Option<u8>,
        /// Number of completed sessions today
        #[arg(long)]
        completed: Option<u32>,
    },
    /// Check if you should take a break
    ShouldBreak {
        /// Current energy level (0-100)
        #[arg(long)]
        energy: Option<u8>,
        /// Time since last break in minutes
        #[arg(long)]
        time_since_break: Option<u64>,
        /// Number of completed sessions today
        #[arg(long)]
        completed: Option<u32>,
    },
}

pub fn run(action: JitAction) -> Result<(), Box<dyn std::error::Error>> {
    match action {
        JitAction::Suggest { energy, time_since_break, completed } => {
            suggest_tasks(energy, time_since_break, completed);
        }
        JitAction::SuggestBreak { energy, completed } => {
            suggest_break(energy, completed);
        }
        JitAction::ShouldBreak { energy, time_since_break, completed } => {
            check_should_break(energy, time_since_break, completed);
        }
    }
    Ok(())
}

fn build_context(
    energy: Option<u8>,
    time_since_break: Option<u64>,
    completed: Option<u32>,
) -> JitContext {
    JitContext {
        energy: energy.unwrap_or(50),
        time_since_last_break_min: time_since_break.unwrap_or(0),
        current_task: None,
        completed_sessions: completed.unwrap_or(0),
        now: Utc::now(),
    }
}

fn suggest_tasks(
    energy: Option<u8>,
    time_since_break: Option<u64>,
    completed: Option<u32>,
) {
    let db = match ScheduleDb::open() {
        Ok(db) => db,
        Err(e) => {
            eprintln!("Error: Could not open database: {}", e);
            return;
        }
    };

    let tasks = match db.list_tasks() {
        Ok(tasks) => tasks,
        Err(e) => {
            eprintln!("Error: Could not list tasks: {}", e);
            return;
        }
    };

    let context = build_context(energy, time_since_break, completed);
    let engine = JitEngine::new();
    let suggestions = engine.suggest_next_tasks(&context, &tasks);

    if suggestions.is_empty() {
        println!("No task suggestions available.");
        println!("  Make sure you have READY tasks in your Active list.");
        return;
    }

    println!("=== Task Suggestions ===\n");
    for (i, suggestion) in suggestions.iter().enumerate() {
        println!("{}. {} (Score: {})",
            i + 1,
            suggestion.task.title,
            suggestion.score
        );
        println!("   Reason: {:?}", suggestion.reason);
        if let Some(duration) = suggestion.task.required_minutes {
            println!("   Duration: {} min", duration);
        }
        println!("   Priority: {}", suggestion.task.priority);
        println!();
    }

    // Show context summary
    println!("Context:");
    println!("  Energy: {}/100", context.energy);
    println!("  Time since break: {} min", context.time_since_last_break_min);
    println!("  Completed sessions: {}", context.completed_sessions);
}

fn suggest_break(energy: Option<u8>, completed: Option<u32>) {
    let context = build_context(energy, None, completed);
    let engine = JitEngine::new();
    let duration = engine.suggest_break_duration(&context);

    println!("=== Break Suggestion ===");
    println!("  Recommended duration: {} minutes", duration);
    println!("  Current energy: {}/100", context.energy);
    println!("  Completed sessions: {}", context.completed_sessions);

    if duration >= 15 {
        println!("\n  Tip: This is a long break. Consider stepping away from the screen.");
    }
}

fn check_should_break(
    energy: Option<u8>,
    time_since_break: Option<u64>,
    completed: Option<u32>,
) {
    let context = build_context(energy, time_since_break, completed);
    let engine = JitEngine::new();
    let should_break = engine.should_take_break(&context);

    println!("=== Break Check ===");
    if should_break {
        println!("  ⚠️  Yes, you should take a break!");
        println!("  Current energy: {}/100", context.energy);
        println!("  Time since break: {} min", context.time_since_last_break_min);

        let duration = engine.suggest_break_duration(&context);
        println!("  Suggested duration: {} min", duration);
    } else {
        println!("  ✓ No, keep going!");
        println!("  Your energy is still good ({}/100)", context.energy);
    }
}
