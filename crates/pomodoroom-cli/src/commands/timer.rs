use clap::Subcommand;
use pomodoroom_core::storage::Database;
use pomodoroom_core::timer::TimerEngine;
use pomodoroom_core::{RecipeEngine, ActionExecutor, Event};

const ENGINE_KEY: &str = "timer_engine";

#[derive(Subcommand)]
pub enum TimerAction {
    /// Start elapsed time tracking (compat alias)
    Start,
    /// Update session with current task info
    Update {
        /// Task ID to track
        #[arg(long)]
        task_id: Option<String>,
        /// Task title
        #[arg(long)]
        title: Option<String>,
        /// Required minutes for the task
        #[arg(long)]
        required: u32,
        /// Already elapsed minutes
        #[arg(long, default_value = "0")]
        elapsed: u32,
    },
    /// Pause elapsed time tracking
    Pause,
    /// Resume elapsed time tracking
    Resume,
    /// Skip/abandon current session
    Skip,
    /// Reset to idle state
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
    TimerEngine::new()
}

fn save_engine(db: &Database, engine: &TimerEngine) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string(engine)?;
    db.kv_set(ENGINE_KEY, &json)?;
    Ok(())
}

/// Handle recipe evaluation and execution for a timer event
fn handle_recipes(event: &Event) {
    let debug_mode = std::env::var("POMODOROOM_DEBUG_RECIPES").is_ok();

    if let Err(e) = RecipeEngine::new() {
        if debug_mode {
            eprintln!("Recipe engine error: {}", e);
        }
        return;
    }

    let engine = RecipeEngine::new().unwrap();

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
        TimerAction::Start => {
            let snapshot = engine.snapshot();
            println!("{}", serde_json::to_string_pretty(&snapshot)?);
        }
        TimerAction::Update { task_id, title, required, elapsed } => {
            if let Some(event) = engine.update_session(task_id, title, required, elapsed) {
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            } else {
                let snapshot = engine.snapshot();
                println!("{}", serde_json::to_string_pretty(&snapshot)?);
            }
        }
        TimerAction::Pause => {
            // In task-based timer, pause is handled at the application level
            // by stopping elapsed_minutes updates
            let snapshot = engine.snapshot();
            println!("{}", serde_json::to_string_pretty(&snapshot)?);
        }
        TimerAction::Resume => {
            // Resume tracking
            let snapshot = engine.snapshot();
            println!("{}", serde_json::to_string_pretty(&snapshot)?);
        }
        TimerAction::Skip => {
            engine.reset();
            println!("{{\"type\": \"timer_skipped\"}}");
        }
        TimerAction::Reset => {
            engine.reset();
            println!("{{\"type\": \"timer_reset\"}}");
        }
        TimerAction::Status => {
            // Tick to update elapsed time
            let completed = engine.tick();
            let snapshot = engine.snapshot();
            println!("{}", serde_json::to_string_pretty(&snapshot)?);
            if let Some(event) = completed {
                // Also output completion event
                println!("{}", serde_json::to_string_pretty(&event)?);
                handle_recipes(&event);
            }
        }
    }

    save_engine(&db, &engine)?;
    Ok(())
}
