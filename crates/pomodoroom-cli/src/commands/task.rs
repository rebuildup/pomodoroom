//! Task management commands for CLI.
//!
//! Implements full task CRUD operations with state transitions:
//! - list, get, create, update, delete
//! - start, pause, resume, complete, postpone, extend

use clap::Subcommand;
use pomodoroom_core::task::{Task, TaskState, EnergyLevel};
use pomodoroom_core::storage::schedule_db::ScheduleDb;
use chrono::Utc;

/// Format task state for display
fn format_state(state: TaskState) -> &'static str {
    match state {
        TaskState::Ready => "READY",
        TaskState::Running => "RUNNING",
        TaskState::Paused => "PAUSED",
        TaskState::Done => "DONE",
    }
}

/// Parse task state from string
fn parse_state(s: &str) -> Option<TaskState> {
    match s.to_uppercase().as_str() {
        "READY" => Some(TaskState::Ready),
        "RUNNING" => Some(TaskState::Running),
        "PAUSED" => Some(TaskState::Paused),
        "DONE" => Some(TaskState::Done),
        _ => None,
    }
}

/// Parse energy level from string
fn parse_energy(s: &str) -> Option<EnergyLevel> {
    match s.to_lowercase().as_str() {
        "low" => Some(EnergyLevel::Low),
        "medium" => Some(EnergyLevel::Medium),
        "high" => Some(EnergyLevel::High),
        _ => None,
    }
}

/// Format task as table row
fn format_task_row(task: &Task) -> String {
    let state_str = format_state(task.state);
    let priority = task.priority.map_or("-".to_string(), |p| p.to_string());
    let estimate = task.estimated_minutes.map_or("-".to_string(), |m| format!("{}m", m));
    let elapsed = format!("{}m", task.elapsed_minutes);
    let project = task.project_name.as_ref().or(task.project_id.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("-");
    format!("{:<36} {:<8} {:<6} {:<6} {:<8} {:<20} {}",
        task.id,
        state_str,
        priority,
        estimate,
        elapsed,
        project,
        task.title
    )
}

/// Print task list header
fn print_list_header() {
    println!("{:<36} {:<8} {:<6} {:<6} {:<8} {:<20} {}",
        "ID",
        "STATE",
        "PRIO",
        "EST",
        "ELAPSED",
        "PROJECT",
        "TITLE"
    );
    println!("{}", "-".repeat(100));
}

#[derive(Subcommand)]
pub enum TaskAction {
    /// List tasks with optional filtering
    List {
        /// Filter by state (READY, RUNNING, PAUSED, DONE)
        #[arg(long)]
        state: Option<String>,
        /// Filter by project ID
        #[arg(long)]
        project: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Get task details by ID
    Get {
        /// Task ID
        id: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Create a new task
    Create {
        /// Task title
        title: String,
        /// Task description
        #[arg(long, short = 'd')]
        desc: Option<String>,
        /// Estimated duration in minutes
        #[arg(long, short = 'e')]
        estimate: Option<u32>,
        /// Priority (0-100, default: 50)
        #[arg(long, short = 'p')]
        priority: Option<i32>,
        /// Energy level (low, medium, high)
        #[arg(long)]
        energy: Option<String>,
        /// Project ID to associate with
        #[arg(long)]
        project: Option<String>,
        /// Comma-separated tags
        #[arg(long, short = 't')]
        tags: Option<String>,
    },
    /// Update a task
    Update {
        /// Task ID
        id: String,
        /// New title
        #[arg(long)]
        title: Option<String>,
        /// New description
        #[arg(long, short = 'd')]
        desc: Option<String>,
        /// New priority (0-100)
        #[arg(long, short = 'p')]
        priority: Option<i32>,
        /// New energy level
        #[arg(long)]
        energy: Option<String>,
    },
    /// Delete a task
    Delete {
        /// Task ID
        id: String,
        /// Force delete without confirmation
        #[arg(long, short = 'f')]
        force: bool,
    },
    /// Start a task (READY → RUNNING)
    Start {
        /// Task ID
        id: String,
    },
    /// Pause a task (RUNNING → PAUSED)
    Pause {
        /// Task ID
        id: String,
    },
    /// Resume a task (PAUSED → RUNNING)
    Resume {
        /// Task ID
        id: String,
    },
    /// Complete a task (RUNNING → DONE)
    Complete {
        /// Task ID
        id: String,
    },
    /// Postpone a task (priority -= 20, READY)
    Postpone {
        /// Task ID
        id: String,
    },
    /// Extend a task (add estimated minutes)
    Extend {
        /// Task ID
        id: String,
        /// Minutes to add
        minutes: u32,
    },
}

pub fn run(action: TaskAction) -> Result<(), Box<dyn std::error::Error>> {
    let db = ScheduleDb::open()?;

    match action {
        TaskAction::List { state, project, json } => {
            let mut tasks = db.list_tasks()?;

            // Filter by state
            if let Some(ref state_str) = state {
                if let Some(filter_state) = parse_state(state_str) {
                    tasks.retain(|t| t.state == filter_state);
                } else {
                    return Err(format!("Invalid state: {}. Use READY, RUNNING, PAUSED, or DONE", state_str).into());
                }
            }

            // Filter by project
            if let Some(ref project_id) = project {
                tasks.retain(|t| t.project_id.as_ref() == Some(project_id) || t.project_name.as_ref() == Some(project_id));
            }

            // Sort by priority (descending), then created_at
            tasks.sort_by(|a, b| {
                b.priority.unwrap_or(50).cmp(&a.priority.unwrap_or(50))
                    .then_with(|| a.created_at.cmp(&b.created_at))
            });

            if json {
                println!("{}", serde_json::to_string_pretty(&tasks)?);
            } else {
                if tasks.is_empty() {
                    println!("No tasks found.");
                } else {
                    print_list_header();
                    for task in &tasks {
                        println!("{}", format_task_row(task));
                    }
                }
            }
        }
        TaskAction::Get { id, json } => {
            match db.get_task(&id)? {
                Some(task) => {
                    if json {
                        println!("{}", serde_json::to_string_pretty(&task)?);
                    } else {
                        println!("ID:          {}", task.id);
                        println!("Title:       {}", task.title);
                        if let Some(desc) = &task.description {
                            println!("Description: {}", desc);
                        }
                        println!("State:       {}", format_state(task.state));
                        if let Some(priority) = task.priority {
                            println!("Priority:    {}", priority);
                        }
                        if let Some(estimate) = task.estimated_minutes {
                            println!("Estimate:    {}m", estimate);
                        }
                        println!("Elapsed:     {}m", task.elapsed_minutes);
                        println!("Energy:      {:?}", task.energy);
                        if let Some(project) = &task.project_name {
                            println!("Project:     {}", project);
                        } else if let Some(project_id) = &task.project_id {
                            println!("Project ID:  {}", project_id);
                        }
                        if !task.tags.is_empty() {
                            println!("Tags:        {}", task.tags.join(", "));
                        }
                        println!("Created:     {}", task.created_at.format("%Y-%m-%d %H:%M:%S"));
                    }
                }
                None => return Err(format!("Task not found: {}", id).into()),
            }
        }
        TaskAction::Create { title, desc, estimate, priority, energy, project, tags } => {
            let mut task = Task::new(&title);
            task.description = desc;
            task.estimated_minutes = estimate;
            task.priority = priority;
            if let Some(energy_str) = energy {
                task.energy = parse_energy(&energy_str)
                    .ok_or_else(|| format!("Invalid energy level: {}. Use low, medium, or high", energy_str))?;
            }
            task.project_id = project;
            task.tags = tags.map(|t| t.split(',').map(|s| s.trim().to_string()).collect()).unwrap_or_default();

            db.create_task(&task)?;
            println!("Task created: {}", task.id);
            println!("Title: {}", task.title);
            println!("State: {}", format_state(task.state));
        }
        TaskAction::Update { id, title, desc, priority, energy } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            if let Some(t) = title { task.title = t; }
            if let Some(d) = desc { task.description = Some(d); }
            if let Some(p) = priority { task.priority = Some(p); }
            if let Some(energy_str) = energy {
                task.energy = parse_energy(&energy_str)
                    .ok_or_else(|| format!("Invalid energy level: {}. Use low, medium, or high", energy_str))?;
            }

            task.updated_at = Utc::now();
            db.update_task(&task)?;
            println!("Task updated: {}", task.id);
            println!("Title: {}", task.title);
        }
        TaskAction::Delete { id, force } => {
            // Check task exists
            let task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            if !force {
                println!("Task: {}", task.title);
                println!("State: {}", format_state(task.state));
                print!("Delete this task? [y/N]: ");
                use std::io::Write;
                std::io::stdout().flush()?;
                let mut input = String::new();
                std::io::stdin().read_line(&mut input)?;
                if !input.trim().eq_ignore_ascii_case("y") {
                    println!("Cancelled.");
                    return Ok(());
                }
            }

            db.delete_task(&id)?;
            println!("Task deleted: {}", id);
        }
        TaskAction::Start { id } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            task.transition_to(TaskState::Running)
                .map_err(|e| format!("Cannot start task: {}", e))?;

            db.update_task(&task)?;
            println!("Task started: {}", task.id);
            println!("Title: {}", task.title);
            println!("State: {}", format_state(task.state));
        }
        TaskAction::Pause { id } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            task.transition_to(TaskState::Paused)
                .map_err(|e| format!("Cannot pause task: {}", e))?;

            db.update_task(&task)?;
            println!("Task paused: {}", task.id);
            println!("Title: {}", task.title);
            println!("State: {}", format_state(task.state));
        }
        TaskAction::Resume { id } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            task.transition_to(TaskState::Running)
                .map_err(|e| format!("Cannot resume task: {}", e))?;

            db.update_task(&task)?;
            println!("Task resumed: {}", task.id);
            println!("Title: {}", task.title);
            println!("State: {}", format_state(task.state));
        }
        TaskAction::Complete { id } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            task.transition_to(TaskState::Done)
                .map_err(|e| format!("Cannot complete task: {}", e))?;

            db.update_task(&task)?;
            println!("Task completed: {}", task.id);
            println!("Title: {}", task.title);
            println!("State: {}", format_state(task.state));
            if let Some(completed_at) = task.completed_at {
                println!("Completed at: {}", completed_at.format("%Y-%m-%d %H:%M:%S"));
            }
        }
        TaskAction::Postpone { id } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            // Defer: READY → READY (priority down by 20)
            if task.state != TaskState::Ready {
                return Err(format!("Cannot postpone task in {} state. Only READY tasks can be postponed.",
                    format_state(task.state)).into());
            }

            // Lower priority by 20
            task.priority = Some(task.priority.unwrap_or(50).saturating_sub(20));
            task.updated_at = Utc::now();

            db.update_task(&task)?;
            println!("Task postponed: {}", task.id);
            println!("Title: {}", task.title);
            println!("New priority: {}", task.priority.unwrap_or(0));
        }
        TaskAction::Extend { id, minutes } => {
            let mut task = db.get_task(&id)?.ok_or(format!("Task not found: {}", id))?;

            if task.state == TaskState::Done {
                return Err("Cannot extend a completed task".into());
            }

            // Add to estimated minutes
            task.estimated_minutes = Some(task.estimated_minutes.unwrap_or(0) + minutes);
            task.updated_at = Utc::now();

            db.update_task(&task)?;
            println!("Task extended: {}", task.id);
            println!("Title: {}", task.title);
            println!("New estimate: {}m (+{}m)", task.estimated_minutes.unwrap_or(0), minutes);
        }
    }

    Ok(())
}
