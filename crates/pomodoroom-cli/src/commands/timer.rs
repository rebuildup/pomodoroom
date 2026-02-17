use clap::Subcommand;
use pomodoroom_core::storage::Database;
use pomodoroom_core::timer::TimerEngine;
use pomodoroom_core::Config;
use pomodoroom_core::{RecipeEngine, ActionExecutor, Event};

const ENGINE_KEY: &str = "timer_engine";

#[derive(Subcommand)]
pub enum TimerAction {
    /// Start or resume the timer
    Start {
        /// Start at a specific step (0-indexed)
        #[arg(long)]
        step: Option<usize>,
    },
    /// Pause the timer
    Pause,
    /// Resume a paused timer
    Resume,
    /// Skip the current step
    Skip,
    /// Reset the entire schedule
    Reset,
    /// Print current timer state as JSON
    Status,
}

fn load_engine(db: &Database) -> TimerEngine {
    if let Ok(Some(json)) = db.kv_get(ENGINE_KEY) {
        if let Ok(engine) = serde_json::from_str::<TimerEngine>(&json) {
            return engine;
        }
    }
    let config = Config::load_or_default();
    TimerEngine::new(config.schedule())
}

fn save_engine(db: &Database, engine: &TimerEngine) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string(engine)?;
    db.kv_set(ENGINE_KEY, &json)?;
    Ok(())
}

/// Handle recipe evaluation and execution for a timer event
///
/// Set POMODOROOM_DEBUG_RECIPES=1 environment variable to enable detailed error logging.
/// Recipe errors never interrupt timer operations - they are logged at most.
fn handle_recipes(event: &Event) {
    let debug_mode = std::env::var("POMODOROOM_DEBUG_RECIPES").is_ok();

    if let Err(e) = RecipeEngine::new() {
        if debug_mode {
            eprintln!("Recipe engine error: {}", e);
        }
        return;
    }

    let engine = RecipeEngine::new().unwrap(); // Safe: we just checked

    match engine.evaluate_event(event) {
        Ok(actions) => {
            if !actions.is_empty() {
                let executor = ActionExecutor::new();
                let log = executor.execute_batch(actions);

                eprintln!("Recipe execution: {} success, {} failed, {} skipped",
                    log.success_count(), log.failure_count(), log.skipped_count());
            }
        }
        Err(e) => {
            if debug_mode {
                eprintln!("Recipe evaluation error: {}", e);
            }
        }
    }
}

pub fn run(action: TimerAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = Database::open()?;
    let mut engine = load_engine(&db);

    match action {
        TimerAction::Start { step } => {
            if let Some(s) = step {
                engine.reset();
                for _ in 0..s {
                    engine.skip();
                }
            }
            if let Some(event) = engine.start() {
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            } else {
                eprintln!("timer is already running");
            }
        }
        TimerAction::Pause => {
            if let Some(event) = engine.pause() {
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            } else {
                eprintln!("timer is not running");
            }
        }
        TimerAction::Resume => {
            if let Some(event) = engine.resume() {
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            } else {
                eprintln!("timer is not paused");
            }
        }
        TimerAction::Skip => {
            if let Some(event) = engine.skip() {
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            }
        }
        TimerAction::Reset => {
            if let Some(event) = engine.reset() {
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            }
        }
        TimerAction::Status => {
            // Tick to update elapsed time.
            let completed = engine.tick();
            let snapshot = engine.snapshot();
            println!("{}", serde_json::to_string_pretty(&snapshot)?);
            if let Some(event) = completed {
                // Also output completion event.
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            }
        }
    }

    save_engine(&db, &engine)?;
    Ok(())
}
